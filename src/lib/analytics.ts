// Spotly — Google Analytics (GA4) via Firebase Analytics
// (@react-native-firebase/analytics). DEFENSIVE: lazy-requires the native
// module and no-ops until it ships in a rebuild, so it's safe to call anywhere.
import { NativeModules } from 'react-native';

function analytics(): any | null {
  // No-op until the RNFirebase native module is linked (next rebuild).
  if (!NativeModules.RNFBAppModule) return null;
  try {
    return require('@react-native-firebase/analytics').default();
  } catch {
    return null;
  }
}

export function logEvent(name: string, params?: Record<string, any>): void {
  try { analytics()?.logEvent(name, params || {}); } catch {}
}

export function logScreen(screen: string): void {
  try { analytics()?.logScreenView({ screen_name: screen, screen_class: screen }); } catch {}
}
