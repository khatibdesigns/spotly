// Spotly — add plans/bookings to the device calendar. expo-calendar is native,
// so it's lazy-required (the JS bundle still loads before a native rebuild).
import { Platform } from 'react-native';

function getCal(): any {
  try { return require('expo-calendar'); } catch { return null; }
}

async function writableCalendarId(): Promise<string> {
  const Calendar = getCal();
  if (!Calendar) throw new Error('Calendar isn’t available on this build yet.');
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') throw new Error('Calendar access was denied — enable it in Settings.');
  if (Platform.OS === 'ios') {
    const def = await Calendar.getDefaultCalendarAsync().catch(() => null);
    if (def?.id) return def.id;
  }
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const w = cals.find((c: any) => c.allowsModifications) || cals[0];
  if (!w) throw new Error('No calendar available on this device.');
  return w.id;
}

// Next Saturday at 10:00 (families plan weekends).
function nextSaturday(): Date {
  const d = new Date();
  d.setHours(10, 0, 0, 0);
  const add = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + add);
  return d;
}

export async function addPlanToCalendar(plan: { title: string; stops?: any[]; multiDay?: boolean }): Promise<void> {
  const Calendar = getCal();
  const calId = await writableCalendarId();
  const start = nextSaturday();
  const stops = plan.stops || [];
  const days = Math.max(1, new Set(stops.map((s) => s.day ?? 1)).size);
  const end = new Date(start);
  if (plan.multiDay && days > 1) end.setDate(end.getDate() + (days - 1));
  end.setHours(18, 0, 0, 0);
  const notes = stops.map((s) => `• ${s.time ? s.time + ' ' : ''}${s.name}${s.note ? ' — ' + s.note : ''}`).join('\n');
  await Calendar.createEventAsync(calId, {
    title: `Spotly · ${plan.title}`,
    startDate: start,
    endDate: end,
    notes,
    allDay: !!plan.multiDay,
  });
}

export async function addBookingToCalendar(b: { placeName: string; date?: string; time?: string; address?: string }): Promise<void> {
  const Calendar = getCal();
  const calId = await writableCalendarId();
  const start = nextSaturday();
  if (b.time) {
    const m = b.time.match(/(\d+):(\d+)/);
    if (m) start.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  }
  const end = new Date(start);
  end.setHours(start.getHours() + 2);
  await Calendar.createEventAsync(calId, {
    title: `Spotly · ${b.placeName}`,
    startDate: start,
    endDate: end,
    notes: `Booking request via Spotly${b.date ? ' (' + b.date + ')' : ''}.`,
    location: b.address || undefined,
  });
}
