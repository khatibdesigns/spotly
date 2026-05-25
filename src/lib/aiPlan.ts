// Spotly — AI itinerary planner. Sends a prompt to the Claude-CLI proxy on EC2
// (/plan endpoint), parses a strict-JSON itinerary, and enriches each stop with
// real coordinates + a photo via Google Places.
import { findPlace } from './places';

const API_URL = (process.env.EXPO_PUBLIC_PLAN_API_URL || 'http://16.16.79.251:8090').replace(/\/$/, '');
const PLAN_START_ENDPOINT = `${API_URL}/plan/start`;
const PLAN_RESULT_ENDPOINT = `${API_URL}/plan/result`;
const PLAN_ENDPOINT = `${API_URL}/plan`; // legacy fallback (single long request)

// Async job tuning: the planner can take ~90-120s for a full multi-day plan.
// We start a job (instant), then poll short requests so the phone never has to
// hold a long-lived connection (which mobile networks/OS kill ~30-60s).
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 270000; // ~4.5 min overall ceiling
const REQ_TIMEOUT_MS = 15000; // per individual request

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(to);
  }
}

const TONES = ['sun', 'sage', 'sky', 'plum', 'warm', 'coral'];

export type ItStop = {
  name: string;
  category?: string;
  time?: string;
  note?: string;
  estCost?: string;
  lat?: number;
  lng?: number;
  photoUrl?: string;
  tone?: string;
};
export type ItDay = { day: number; label: string; stops: ItStop[] };
export type Itinerary = { title: string; destination: string; summary?: string; days: ItDay[]; tips?: string[] };

export type PlanInput = {
  destination: string;
  days: number;
  budget?: string;
  kids?: { name?: string; age: number }[];
  notes?: string;
  favFoods?: string[]; // foods the kids love — bias restaurant picks toward these
  avoidFoods?: string[]; // foods to avoid (allergies / not allowed) — never suggest
};

export class AiPlanError extends Error {}

function buildPrompt(input: PlanInput): string {
  const kids = input.kids?.length ? input.kids.map((k) => `${k.name || 'child'} (${k.age})`).join(', ') : 'young kids';
  const likes = (input.favFoods || []).filter(Boolean);
  const avoid = (input.avoidFoods || []).filter(Boolean);
  return [
    `You are Spotly's family trip planner. Plan a kid-friendly itinerary.`,
    `Destination: ${input.destination}.`,
    `Duration: ${input.days} day(s).`,
    `Children: ${kids}.`,
    input.budget ? `Budget: ${input.budget}.` : '',
    likes.length ? `The kids love these foods: ${likes.join(', ')}. Favor restaurants/cafés that serve them.` : '',
    avoid.length ? `IMPORTANT — never suggest places centered on these foods (allergies / not allowed): ${avoid.join(', ')}.` : '',
    input.notes ? `Notes from the family: ${input.notes}.` : '',
    ``,
    `Return STRICT JSON ONLY — no prose, no markdown fences — matching exactly:`,
    `{"title":"string","destination":"string","summary":"one warm sentence","days":[{"day":1,"label":"Day 1 — theme","stops":[{"name":"REAL place name","category":"e.g. Park / Museum / Café","time":"e.g. 10:00","note":"why it's great for these ages + a quick tip","estCost":"approx per family"}]}],"tips":["short practical tip"]}`,
    ``,
    `Rules: use REAL, well-known, currently-operating kid-friendly places in ${input.destination}. 3-4 stops per day, age-appropriate for ${kids}, sequenced sensibly (morning→evening), mindful of the budget. Include at least one meal stop per day that fits the family's food preferences above. Keep notes under 20 words. Output JSON only.`,
  ]
    .filter(Boolean)
    .join('\n');
}

function extractJson(text: string): any {
  let t = text.trim();
  // strip ```json ... ``` fences if present
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // otherwise grab the first {...} block
  if (t[0] !== '{') {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) t = t.slice(start, end + 1);
  }
  return JSON.parse(t);
}

async function enrich(it: Itinerary): Promise<Itinerary> {
  let idx = 0;
  const all: Promise<void>[] = [];
  for (const day of it.days || []) {
    for (const stop of day.stops || []) {
      stop.tone = TONES[idx % TONES.length];
      idx++;
      all.push(
        findPlace(stop.name, it.destination)
          .then((f) => {
            if (f) {
              stop.lat = f.lat;
              stop.lng = f.lng;
              stop.photoUrl = f.photoUrl;
              if (!stop.category && f.category) stop.category = f.category;
            }
          })
          .catch(() => {})
      );
    }
  }
  await Promise.all(all);
  return it;
}

// Start an async planner job → returns the text once the job completes.
// Falls back to the legacy single-request /plan endpoint if /plan/start isn't
// available (e.g. an older proxy), so the app keeps working either way.
async function runPlanJob(prompt: string): Promise<string> {
  // 1) Start the job.
  let startRes: Response;
  try {
    startRes = await fetchWithTimeout(
      PLAN_START_ENDPOINT,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) },
      REQ_TIMEOUT_MS
    );
  } catch {
    throw new AiPlanError('Couldn’t reach the planner. Check your connection and try again.');
  }

  // Older proxy without async support → fall back to the legacy long request.
  if (startRes.status === 404) {
    return runPlanLegacy(prompt);
  }
  let startData: any;
  try {
    startData = await startRes.json();
  } catch {
    throw new AiPlanError('The planner returned an unreadable response. Please try again.');
  }
  if (!startRes.ok) {
    throw new AiPlanError(typeof startData?.error === 'string' ? startData.error : `Planner error (HTTP ${startRes.status}).`);
  }
  const jobId: string = startData?.jobId || '';
  if (!jobId) throw new AiPlanError('The planner didn’t start. Please try again.');

  // 2) Poll for the result.
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    let pollRes: Response;
    try {
      pollRes = await fetchWithTimeout(`${PLAN_RESULT_ENDPOINT}?id=${encodeURIComponent(jobId)}`, { method: 'GET' }, REQ_TIMEOUT_MS);
    } catch {
      continue; // transient network blip — keep polling until the deadline
    }
    if (pollRes.status === 404) throw new AiPlanError('The planner lost track of this request. Please try again.');
    let job: any;
    try {
      job = await pollRes.json();
    } catch {
      continue;
    }
    if (job?.status === 'done') {
      return job?.text ?? '';
    }
    if (job?.status === 'error') {
      throw new AiPlanError(typeof job?.error === 'string' ? job.error : 'The planner hit an error. Please try again.');
    }
    // status === 'pending' → keep polling
  }
  throw new AiPlanError('The planner is taking longer than expected. Please try again in a moment.');
}

// Legacy single long-held request (kept as a fallback only).
async function runPlanLegacy(prompt: string): Promise<string> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      PLAN_ENDPOINT,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) },
      170000
    );
  } catch {
    throw new AiPlanError('The planner is taking too long — please try again.');
  }
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new AiPlanError('The planner returned an unreadable response. Please try again.');
  }
  if (!res.ok) {
    throw new AiPlanError(typeof data?.error === 'string' ? data.error : `Planner error (HTTP ${res.status}).`);
  }
  return data?.text ?? data?.completion ?? data?.result ?? '';
}

export async function generateItinerary(input: PlanInput): Promise<Itinerary> {
  const text: string = await runPlanJob(buildPrompt(input));
  if (!text) throw new AiPlanError('The planner didn’t return a plan. Please try again.');

  let parsed: Itinerary;
  try {
    parsed = extractJson(text);
  } catch {
    throw new AiPlanError('Couldn’t read the generated plan. Please try again.');
  }
  if (!parsed?.days?.length) throw new AiPlanError('The plan came back empty. Try adding a few more details.');
  parsed.destination = parsed.destination || input.destination;
  parsed.title = parsed.title || `${input.destination} · ${input.days} days`;
  return enrich(parsed);
}
