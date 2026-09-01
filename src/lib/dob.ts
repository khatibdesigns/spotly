// Spotly — child date-of-birth helpers. We store each kid's DOB as an ISO
// `yyyy-mm-dd` string and derive their age from it (so age stays correct over
// time) and a `MM-DD` birthday key used for birthday-offer targeting.

// Current age in whole years from an ISO date of birth. null if missing/invalid.
export function ageFromDob(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return Math.max(0, age);
}

// "12 Mar 2021" — locale-aware display of a DOB.
export function formatDob(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// "MM-DD" — used server-side to find today's birthdays.
export function monthDayKey(iso?: string | null): string {
  if (!iso || iso.length < 10) return '';
  return iso.slice(5, 10);
}

// Compose an ISO yyyy-mm-dd from numeric parts (month is 1-based here).
export function isoFromYMD(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// A kid's effective age — prefers a live computation from DOB, else the stored
// manual age. Use this everywhere age is displayed or fed to the planner.
export function kidAge(kid: { dob?: string; age?: number } | null | undefined): number {
  if (!kid) return 0;
  const fromDob = ageFromDob(kid.dob);
  return fromDob != null ? fromDob : kid.age ?? 0;
}
