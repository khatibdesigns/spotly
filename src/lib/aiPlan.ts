// Spotly — AI itinerary planner. Sends a prompt to the Claude-CLI proxy on EC2
// (/plan endpoint), parses a strict-JSON itinerary, and enriches each stop with
// real coordinates + a photo via Google Places.
import { findPlace } from './places';
import { getWeather } from './weather';

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
  placeId?: string; // Google place_id (for reviews/details on the Place screen)
  rating?: number;
  reviews?: number;
};
export type ItDay = { day: number; label: string; stops: ItStop[] };
export type Itinerary = { title: string; destination: string; summary?: string; days: ItDay[]; tips?: string[]; startDate?: string };

export type PlanInput = {
  destination: string;
  days: number;
  budget?: string;
  kids?: { name?: string; age: number }[];
  notes?: string;
  favFoods?: string[]; // foods the kids love — bias restaurant picks toward these
  avoidFoods?: string[]; // foods to avoid (allergies / not allowed) — never suggest
  constraints?: string[]; // hard preferences (e.g. "halal food only", "no alcohol") — must respect
  startDate?: string; // ISO yyyy-mm-dd — used to label each day with a real date
  lat?: number; // user/destination coords — used for weather-aware planning
  lng?: number;
  fcmToken?: string; // device push token — EC2 pushes a notification when done
};

export class AiPlanError extends Error {}

// "Mon 26 May" for day N of an itinerary, given the ISO start date of day 1.
export function dayDateLabel(startDateISO: string | undefined | null, dayNumber: number): string {
  if (!startDateISO) return '';
  const d = new Date(`${startDateISO}T00:00:00`);
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + (dayNumber - 1));
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

// Current weather at the destination → guidance the model uses so it doesn't
// schedule outdoor activities during peak heat (the #1 complaint: an outdoor
// walk at 3:30pm in 45°C). Uses the named destination's coords when we can
// geocode it, else the user's current coords. Best-effort: returns '' on any
// failure so the planner always runs.
async function buildWeatherNote(input: PlanInput): Promise<string> {
  try {
    const dest = (input.destination || '').trim();
    const generic = !dest || /^(near me|your area|nearby)$/i.test(dest);
    let lat = input.lat;
    let lng = input.lng;
    if (!generic) {
      const f = await findPlace(dest);
      if (f?.lat != null && f?.lng != null) { lat = f.lat; lng = f.lng; }
    }
    if (lat == null || lng == null) return '';
    const w = await getWeather(lat, lng);
    if (!w) return '';
    const t = Math.round(w.tempC);
    const cond = w.label || 'current conditions';
    let guide: string;
    if (t >= 36) {
      guide = `CRITICAL: it is dangerously hot. Do NOT place outdoor activities (parks, walks, beaches, zoos, outdoor playgrounds) between 11:00 and 16:30. Use indoor, air-conditioned venues (malls, indoor play, museums, aquariums) for midday, and put any outdoor stops before 10:00 or after 17:30. Mention shade, water and sun protection in the notes.`;
    } else if (t >= 30) {
      guide = `It is hot around midday. Prefer indoor or shaded venues from 12:00–16:00 and schedule outdoor stops earlier or later; remind the family to bring water.`;
    } else if (t <= 8) {
      guide = `It is cold. Favour indoor, warm venues, keep outdoor time short, and remind the family to dress warmly.`;
    } else if (/(rain|storm|drizzle|shower|thunder)/i.test(cond)) {
      guide = `Expect wet weather. Prefer indoor venues and give an indoor backup for any outdoor stop.`;
    } else {
      guide = `Weather is pleasant — a balanced mix of outdoor and indoor stops is fine.`;
    }
    return `Current weather at the destination is about ${t}°C (${cond}). ${guide}`;
  } catch {
    return '';
  }
}

function buildPrompt(input: PlanInput, weatherNote?: string): string {
  const kids = input.kids?.length ? input.kids.map((k) => `${k.name || 'child'} (${k.age})`).join(', ') : 'young kids';
  const likes = (input.favFoods || []).filter(Boolean);
  const avoid = (input.avoidFoods || []).filter(Boolean);
  const constraints = (input.constraints || []).filter(Boolean);
  return [
    `You are Spotly's family trip planner. Plan a kid-friendly itinerary.`,
    `Destination: ${input.destination}.`,
    `Duration: ${input.days} day(s).`,
    `Children: ${kids}.`,
    input.budget ? `Budget: ${input.budget}.` : '',
    likes.length ? `The kids love these foods: ${likes.join(', ')}. Favor restaurants/cafés that serve them.` : '',
    avoid.length ? `IMPORTANT — never suggest places centered on these foods (allergies / not allowed): ${avoid.join(', ')}.` : '',
    constraints.length ? `HARD CONSTRAINTS — must respect, never suggest anything that violates these: ${constraints.join('; ')}.` : '',
    input.notes ? `Notes from the family: ${input.notes}.` : '',
    weatherNote ? `WEATHER (be time-aware): ${weatherNote}` : '',
    ``,
    `The "title" MUST name the destination (${input.destination}) — e.g. "${input.destination} family trip", not a generic "Family Adventure".`,
    `Return STRICT JSON ONLY — no prose, no markdown fences — matching exactly:`,
    `{"title":"string","destination":"string","summary":"one warm sentence","days":[{"day":1,"label":"Day 1 — theme","stops":[{"name":"REAL place name","category":"e.g. Park / Museum / Café","time":"e.g. 10:00","note":"why it's great for these ages + a quick tip","estCost":"approx per family"}]}],"tips":["short practical tip"]}`,
    ``,
    `Rules: use REAL, well-known, currently-operating kid-friendly places in ${input.destination}. 3-4 stops per day, age-appropriate for ${kids}, sequenced sensibly (morning→evening), mindful of the budget${weatherNote ? ', and respect the WEATHER guidance above when choosing each stop and its time' : ''}. Include at least one meal stop per day that fits the family's food preferences above. Keep notes under 20 words. Output JSON only.`,
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
              stop.placeId = f.id;
              stop.rating = f.rating;
              stop.reviews = f.reviews;
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
async function runPlanJob(prompt: string, fcmToken?: string, onJobStarted?: (jobId: string) => void): Promise<string> {
  // 1) Start the job. We hand the device's FCM token to the proxy so it can push
  // a "your plan is ready" notification even if the app is fully closed by the
  // time generation finishes (the in-app local notification only fires while the
  // app is alive). The proxy ignores it if push isn't configured.
  let startRes: Response;
  try {
    startRes = await fetchWithTimeout(
      PLAN_START_ENDPOINT,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fcmToken ? { prompt, fcmToken } : { prompt }) },
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
  // Surface the jobId so the caller can persist it and resume after the app is
  // closed/reopened (the EC2 job keeps running regardless of the app's state).
  try { onJobStarted?.(jobId); } catch {}

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

// Parse the raw model text into an enriched Itinerary (shared by a fresh run
// and a resumed job).
async function finalize(text: string, input: PlanInput): Promise<Itinerary> {
  if (!text) throw new AiPlanError('The planner didn’t return a plan. Please try again.');
  let parsed: Itinerary;
  try {
    parsed = extractJson(text);
  } catch {
    throw new AiPlanError('Couldn’t read the generated plan. Please try again.');
  }
  if (!parsed?.days?.length) throw new AiPlanError('The plan came back empty. Try adding a few more details.');
  const dest = (input.destination || '').trim();
  const genericDest = !dest || /^(near me|your area|nearby)$/i.test(dest);
  parsed.destination = parsed.destination || dest;
  const aiTitle = (parsed.title || '').trim();
  // Force the destination into the title when the user named one (e.g. a trip
  // to France should read "France trip", not "Family Adventure").
  if (!genericDest && (!aiTitle || !aiTitle.toLowerCase().includes(dest.toLowerCase()))) {
    parsed.title = `${input.days > 1 ? `${input.days}-day ` : ''}${dest} trip`;
  } else {
    parsed.title = aiTitle || `${dest} · ${input.days} days`;
  }
  if (input.startDate) parsed.startDate = input.startDate;
  return enrich(parsed);
}

// Poll an already-started job until it finishes — used to resume a plan after
// the app was closed and reopened (the jobId was persisted; the EC2 job kept
// running and its result is fetched here). No notification is fired here: the
// proxy already pushed one when the job completed.
async function pollJobResult(jobId: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    let pollRes: Response;
    try {
      pollRes = await fetchWithTimeout(`${PLAN_RESULT_ENDPOINT}?id=${encodeURIComponent(jobId)}`, { method: 'GET' }, REQ_TIMEOUT_MS);
    } catch {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    if (pollRes.status === 404) throw new AiPlanError('The planner lost track of this request. Please try again.');
    let job: any;
    try {
      job = await pollRes.json();
    } catch {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    if (job?.status === 'done') return job?.text ?? '';
    if (job?.status === 'error') throw new AiPlanError(typeof job?.error === 'string' ? job.error : 'The planner hit an error. Please try again.');
    await sleep(POLL_INTERVAL_MS);
  }
  throw new AiPlanError('The planner is taking longer than expected. Please try again in a moment.');
}

export async function generateItinerary(input: PlanInput, onJobStarted?: (jobId: string) => void): Promise<Itinerary> {
  const weatherNote = await buildWeatherNote(input);
  const text: string = await runPlanJob(buildPrompt(input, weatherNote), input.fcmToken, onJobStarted);
  return finalize(text, input);
}

// Resume a plan whose job was started before the app was closed.
export async function resumeItinerary(jobId: string, input: PlanInput): Promise<Itinerary> {
  const text: string = await pollJobResult(jobId);
  return finalize(text, input);
}
