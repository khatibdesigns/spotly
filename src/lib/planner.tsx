// Spotly — global AI-planner job. Generation runs here (not in the screen), so
// closing the planner screen doesn't cancel it. Fires a local notification with
// sound when the plan is ready (or fails). expo-notifications is lazy-required.
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateItinerary, resumeItinerary, Itinerary, PlanInput } from './aiPlan';
import { getCurrentFcmToken } from './push';
import { maybeAskForReview } from './review';

// Persisted in-flight job so a plan can be resumed after the app is fully
// closed and reopened (the EC2 job keeps running and pushes a notification; on
// reopen we re-fetch its result by jobId).
const PENDING_KEY = 'spotly.planner.pending.v1';
const PENDING_MAX_AGE_MS = 30 * 60 * 1000; // EC2 keeps results in memory ~ this long
function persistPending(jobId: string, input: PlanInput) {
  AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ jobId, input, startedAt: Date.now() })).catch(() => {});
}
function clearPending() {
  AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
}

function getNotifs(): any {
  try { return require('expo-notifications'); } catch { return null; }
}

export async function ensureNotifPermission(): Promise<void> {
  const N = getNotifs();
  if (!N) return;
  try {
    const perm = await N.getPermissionsAsync();
    if (!perm.granted) await N.requestPermissionsAsync();
  } catch {}
}

async function notify(title: string, body: string) {
  const N = getNotifs();
  if (!N) return;
  try {
    const perm = await N.getPermissionsAsync();
    if (!perm.granted && !(await N.requestPermissionsAsync()).granted) return;
    await N.scheduleNotificationAsync({ content: { title, body, sound: true, data: { type: 'aiPlan' } }, trigger: null });
  } catch {}
}

export type PlannerStatus = 'idle' | 'generating' | 'ready' | 'error';

type PlannerState = {
  status: PlannerStatus;
  result: Itinerary | null;
  error: string | null;
  startedAt: number | null;
  lastInput: PlanInput | null;
  generate: (input: PlanInput) => void;
  retry: () => void;
  reset: () => void;
};

const Ctx = createContext<PlannerState | null>(null);

export function PlannerProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<PlannerStatus>('idle');
  const [result, setResult] = useState<Itinerary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [lastInput, setLastInput] = useState<PlanInput | null>(null);

  const run = useCallback((input: PlanInput) => {
    setStatus('generating');
    setResult(null);
    setError(null);
    setStartedAt(Date.now());
    setLastInput(input);
    ensureNotifPermission();
    // Fire-and-forget: this promise is owned by the provider, so it keeps
    // running even after the planner screen unmounts.
    (async () => {
      // Hand the device's push token to the proxy so it can notify us when the
      // plan is ready even if the app is fully closed by then.
      const fcmToken = await getCurrentFcmToken().catch(() => null);
      const fullInput: PlanInput = { ...input, fcmToken: fcmToken || undefined };
      setLastInput(fullInput);
      generateItinerary(fullInput, (jobId) => persistPending(jobId, fullInput))
        .then((it) => {
          setResult(it);
          setStatus('ready');
          clearPending();
          notify('Your trip plan is ready ✨', it.title);
          maybeAskForReview(); // a finished plan is a great moment to ask for a rating
        })
        .catch((e) => {
          setError(e?.message || 'Could not build the plan.');
          setStatus('error');
          clearPending();
          notify('Couldn’t build your plan', e?.message || 'Tap to try again.');
        });
    })();
  }, []);

  // On mount, resume an in-flight plan that was started before the app closed.
  // The EC2 job kept running; fetch its result by the persisted jobId. No
  // notification is fired here (the proxy already pushed one on completion).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PENDING_KEY);
        if (!raw) return;
        const p = JSON.parse(raw);
        if (!p?.jobId || !p?.input || Date.now() - (p.startedAt || 0) > PENDING_MAX_AGE_MS) { clearPending(); return; }
        if (cancelled) return;
        setStatus('generating');
        setStartedAt(p.startedAt || Date.now());
        setLastInput(p.input);
        resumeItinerary(p.jobId, p.input)
          .then((it) => { if (cancelled) return; setResult(it); setStatus('ready'); clearPending(); })
          .catch((e) => { if (cancelled) return; setError(e?.message || 'Could not build the plan.'); setStatus('error'); clearPending(); });
      } catch { clearPending(); }
    })();
    return () => { cancelled = true; };
  }, []);

  const retry = useCallback(() => { if (lastInput) run(lastInput); }, [lastInput, run]);
  const reset = useCallback(() => { clearPending(); setStatus('idle'); setResult(null); setError(null); setStartedAt(null); }, []);

  return (
    <Ctx.Provider value={{ status, result, error, startedAt, lastInput, generate: run, retry, reset }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePlanner(): PlannerState {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlanner must be used within PlannerProvider');
  return v;
}
