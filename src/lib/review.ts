// Spotly — in-app rating prompt (App Store / Play in-app review).
//
// Reviews are the #1 ASO lever, so we ask for one right after a "wow" moment
// (a finished AI plan, a saved memory) — but only occasionally and never on a
// cold launch. Gated: at least a few positive moments, and at most once every
// ~90 days. expo-store-review is lazy-required so a JS-only/sim run never breaks.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'spotly.review.v1';
const MIN_MOMENTS = 3; // wait for a few good moments before ever asking
const COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000; // ~90 days between prompts

function getStoreReview(): any {
  try { return require('expo-store-review'); } catch { return null; }
}

// Record a positive moment and, if the gates pass, request a native review.
export async function maybeAskForReview(): Promise<void> {
  const SR = getStoreReview();
  if (!SR) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const s: { count: number; lastTs: number } = raw ? JSON.parse(raw) : { count: 0, lastTs: 0 };
    s.count = (s.count || 0) + 1;
    const now = Date.now();
    const enoughMoments = s.count >= MIN_MOMENTS;
    const cooledDown = now - (s.lastTs || 0) > COOLDOWN_MS;
    let available = false;
    try { available = await SR.hasAction(); } catch {}
    if (enoughMoments && cooledDown && available) {
      try { await SR.requestReview(); } catch {}
      s.lastTs = now;
      s.count = 0; // reset the moment counter after asking
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
