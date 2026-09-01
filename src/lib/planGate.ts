// Spotly — free-tier gate for the AI planner. Free families get FREE_AI_PLANS
// AI itineraries; after that the paywall opens. Count is kept per-user in
// AsyncStorage (offline-friendly). Spotly Plus members are never gated.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = (uid: string) => `spotly.aiplans.${uid}`;

export async function aiPlansUsed(uid: string): Promise<number> {
  try { return parseInt((await AsyncStorage.getItem(KEY(uid))) || '0', 10) || 0; }
  catch { return 0; }
}

export async function bumpAiPlansUsed(uid: string): Promise<void> {
  try {
    const n = await aiPlansUsed(uid);
    await AsyncStorage.setItem(KEY(uid), String(n + 1));
  } catch {}
}
