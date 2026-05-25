// Spotly — global AI-planner job. Generation runs here (not in the screen), so
// closing the planner screen doesn't cancel it. Fires a local notification with
// sound when the plan is ready (or fails). expo-notifications is lazy-required.
import React, { createContext, useContext, useState, useCallback } from 'react';
import { generateItinerary, Itinerary, PlanInput } from './aiPlan';

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
    generateItinerary(input)
      .then((it) => {
        setResult(it);
        setStatus('ready');
        notify('Your trip plan is ready ✨', it.title);
      })
      .catch((e) => {
        setError(e?.message || 'Could not build the plan.');
        setStatus('error');
        notify('Couldn’t build your plan', e?.message || 'Tap to try again.');
      });
  }, []);

  const retry = useCallback(() => { if (lastInput) run(lastInput); }, [lastInput, run]);
  const reset = useCallback(() => { setStatus('idle'); setResult(null); setError(null); setStartedAt(null); }, []);

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
