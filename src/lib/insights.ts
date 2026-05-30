// Spotly — merchant analytics: build daily time series, a simple forecast, and
// per-branch breakdowns from data already loaded in MerchantProvider (bookings,
// voucher sales, and placeStats daily buckets). All pure functions.
import { MerchantBooking, MerchantVoucherSale, MerchantPlace } from './merchant';
import { PlaceStat } from './stats';

export type Metric = 'views' | 'clicks' | 'bookings' | 'vouchers' | 'revenue';
export type Point = { date: string; value: number; forecast?: boolean };

const toMillis = (ts: any): number => (ts?.toMillis ? ts.toMillis() : typeof ts === 'number' ? ts : (ts?.seconds ? ts.seconds * 1000 : 0));
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function lastDays(days: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) { const d = new Date(now); d.setDate(now.getDate() - i); out.push(dayKey(d)); }
  return out;
}

export type SeriesOpts = {
  days: number;
  placeIds: string[];
  bookings: MerchantBooking[];
  vouchers: MerchantVoucherSale[];
  stats: Record<string, PlaceStat>;
};

// Daily series for a metric over `days`, scoped to placeIds (oldest → newest).
export function buildSeries(metric: Metric, opts: SeriesOpts): Point[] {
  const { days, placeIds, bookings, vouchers, stats } = opts;
  const idset = new Set(placeIds);
  const keys = lastDays(days);
  const map: Record<string, number> = {};
  keys.forEach((k) => (map[k] = 0));
  const inScope = (pid?: string) => !pid || idset.has(pid);
  if (metric === 'bookings') {
    bookings.forEach((b) => { if (!inScope(b.placeId)) return; const k = dayKey(new Date(toMillis(b.createdAt))); if (k in map) map[k] += 1; });
  } else if (metric === 'vouchers') {
    vouchers.forEach((v) => { if (!inScope(v.placeId)) return; const k = dayKey(new Date(toMillis(v.createdAt))); if (k in map) map[k] += 1; });
  } else if (metric === 'revenue') {
    vouchers.forEach((v) => { if (!inScope(v.placeId)) return; const k = dayKey(new Date(toMillis(v.createdAt))); if (k in map) map[k] += v.price || 0; });
  } else {
    // views | clicks — from placeStats daily buckets.
    placeIds.forEach((pid) => { const daily = stats[pid]?.daily || {}; for (const k of keys) { const dv = (daily[k] as any)?.[metric] || 0; map[k] += dv; } });
  }
  return keys.map((k) => ({ date: k, value: map[k] }));
}

export const sumSeries = (s: Point[]): number => s.reduce((a, p) => a + p.value, 0);

// % change of the most recent half-window vs the half before it.
export function trendPct(series: Point[]): number {
  const n = series.length; const half = Math.floor(n / 2); if (half < 1) return 0;
  const recent = series.slice(n - half).reduce((a, p) => a + p.value, 0);
  const prior = series.slice(n - 2 * half, n - half).reduce((a, p) => a + p.value, 0);
  if (prior === 0) return recent > 0 ? 100 : 0;
  return Math.round(((recent - prior) / prior) * 100);
}

// Simple forecast: least-squares slope blended with the 7-day average so a short
// or flat series doesn't over-project. Clamped at 0.
export function forecast(series: Point[], ahead: number): Point[] {
  const n = series.length; if (n < 2 || ahead <= 0) return [];
  const xs = series.map((_, i) => i); const ys = series.map((p) => p.value);
  const mx = xs.reduce((a, b) => a + b, 0) / n; const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den === 0 ? 0 : num / den; const intercept = my - slope * mx;
  const recent = ys.slice(-7); const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const out: Point[] = []; const lastDate = new Date(series[n - 1].date);
  for (let j = 1; j <= ahead; j++) {
    const lin = slope * (n - 1 + j) + intercept;
    const val = Math.max(0, (lin + avg) / 2);
    const d = new Date(lastDate); d.setDate(lastDate.getDate() + j);
    out.push({ date: dayKey(d), value: Math.round(val * 10) / 10, forecast: true });
  }
  return out;
}

export type BranchTotal = { place: MerchantPlace; total: number };
export function perBranch(metric: Metric, opts: { days: number; places: MerchantPlace[] } & Omit<SeriesOpts, 'placeIds'>): BranchTotal[] {
  return opts.places
    .map((p) => ({ place: p, total: sumSeries(buildSeries(metric, { days: opts.days, placeIds: [p.id], bookings: opts.bookings, vouchers: opts.vouchers, stats: opts.stats })) }))
    .sort((a, b) => b.total - a.total);
}
