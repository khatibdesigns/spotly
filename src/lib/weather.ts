// Spotly — current weather for the homepage.
//
// PRIMARY: Google Maps Platform Weather API (so the displayed temp matches
// what Google shows in search/maps). Uses the same key as the rest of the
// Google HTTP APIs (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY). Enable the
// "Weather API" on that GCP project (APIs & Services → Library) and make
// sure the key's API restrictions allow it. Pricing is per-call but each
// session does <100 calls/day → well within the Maps Platform free credit.
//
// FALLBACK: Open-Meteo (free, no key). Used if Google fails or the API
// isn't enabled yet, so the app degrades gracefully instead of going blank.
export type Weather = { tempC: number; emoji: string; label: string };

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

// Map Google Weather's `weatherCondition.type` to an emoji + short label.
// We collapse the long enum (CLEAR, MOSTLY_CLEAR, …, RAIN_PERIODICALLY_HEAVY)
// into the broad weather families the homepage actually distinguishes.
function emojiForGoogle(type: string | undefined, isDaytime: boolean): { emoji: string; label: string } {
  const T = (type || '').toUpperCase();
  if (T.includes('THUNDERSTORM') || T.includes('THUNDERSHOWER')) return { emoji: '⛈️', label: 'Storm' };
  if (T.includes('HAIL')) return { emoji: '🌨️', label: 'Hail' };
  if (T.includes('SNOW') || T === 'BLOWING_SNOW') return { emoji: '🌨️', label: 'Snow' };
  if (T.includes('RAIN') || T.includes('SHOWERS') || T.includes('DRIZZLE')) return { emoji: '🌧️', label: 'Rain' };
  if (T === 'WINDY' || T.includes('WIND')) return { emoji: '💨', label: 'Windy' };
  if (T === 'CLOUDY') return { emoji: '☁️', label: 'Cloudy' };
  if (T === 'MOSTLY_CLOUDY' || T === 'PARTLY_CLOUDY' || T === 'MOSTLY_CLEAR') return { emoji: '⛅', label: 'Partly cloudy' };
  if (T === 'CLEAR') return { emoji: isDaytime ? '☀️' : '🌙', label: 'Clear' };
  if (T === 'FOG' || T === 'HAZE' || T === 'SMOKE') return { emoji: '🌫️', label: 'Foggy' };
  return { emoji: '🌡️', label: 'Weather' };
}

// WMO interpretation codes used by the Open-Meteo fallback.
function describeWMO(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: '☀️', label: 'Clear' };
  if (code === 1 || code === 2) return { emoji: '⛅', label: 'Partly cloudy' };
  if (code === 3) return { emoji: '☁️', label: 'Cloudy' };
  if (code === 45 || code === 48) return { emoji: '🌫️', label: 'Fog' };
  if (code >= 51 && code <= 57) return { emoji: '🌦️', label: 'Drizzle' };
  if (code >= 61 && code <= 67) return { emoji: '🌧️', label: 'Rain' };
  if (code >= 71 && code <= 77) return { emoji: '🌨️', label: 'Snow' };
  if (code >= 80 && code <= 82) return { emoji: '🌦️', label: 'Showers' };
  if (code >= 85 && code <= 86) return { emoji: '🌨️', label: 'Snow showers' };
  if (code >= 95) return { emoji: '⛈️', label: 'Storm' };
  return { emoji: '🌡️', label: 'Weather' };
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(to);
  }
}

async function fromGoogle(lat: number, lng: number): Promise<Weather | null> {
  if (!KEY) return null;
  const url =
    `https://weather.googleapis.com/v1/currentConditions:lookup` +
    `?key=${KEY}` +
    `&location.latitude=${lat}` +
    `&location.longitude=${lng}` +
    `&unitsSystem=METRIC` +
    `&languageCode=en`;
  const res = await fetchWithTimeout(url, 8000);
  if (!res.ok) return null;
  const data = await res.json();
  const t = data?.temperature?.degrees;
  if (t == null) return null;
  const cond = data?.weatherCondition;
  const isDaytime = data?.isDaytime !== false;
  const d = emojiForGoogle(cond?.type, isDaytime);
  return {
    tempC: Math.round(t),
    emoji: d.emoji,
    label: cond?.description?.text || d.label,
  };
}

async function fromOpenMeteo(lat: number, lng: number): Promise<Weather | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code`;
  const res = await fetchWithTimeout(url, 8000);
  if (!res.ok) return null;
  const data = await res.json();
  const c = data?.current;
  if (c?.temperature_2m == null) return null;
  const d = describeWMO(c.weather_code ?? -1);
  return { tempC: Math.round(c.temperature_2m), emoji: d.emoji, label: d.label };
}

export async function getWeather(lat: number, lng: number): Promise<Weather | null> {
  // Try Google first; fall back to Open-Meteo on any failure (API not enabled,
  // network blip, key restriction mismatch, etc.) so weather always shows.
  try {
    const g = await fromGoogle(lat, lng);
    if (g) return g;
  } catch {}
  try {
    return await fromOpenMeteo(lat, lng);
  } catch {
    return null;
  }
}
