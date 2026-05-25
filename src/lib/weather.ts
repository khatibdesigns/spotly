// Spotly — current weather for the homepage, via Open-Meteo (free, no API key).
// Returns a temperature + an emoji/label derived from the WMO weather code.
export type Weather = { tempC: number; emoji: string; label: string };

// WMO weather interpretation codes → emoji + short label.
function describe(code: number): { emoji: string; label: string } {
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

export async function getWeather(lat: number, lng: number): Promise<Weather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code`;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(to);
    const data = await res.json();
    const c = data?.current;
    if (c?.temperature_2m == null) return null;
    const d = describe(c.weather_code ?? -1);
    return { tempC: Math.round(c.temperature_2m), emoji: d.emoji, label: d.label };
  } catch {
    return null;
  }
}
