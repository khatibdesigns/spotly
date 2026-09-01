// Spotly — add plans/bookings to the device calendar.
// expo-calendar SDK 56 uses an OBJECT-ORIENTED API (the old *Async functional
// helpers were removed): requestCalendarPermissions() → getCalendars() returns
// ExpoCalendar objects → calendar.createEvent({...}). Lazy-required so the JS
// bundle still loads before a native rebuild.

function getCal(): any {
  try { return require('expo-calendar'); } catch { return null; }
}

// Returns a writable ExpoCalendar object (the one you call .createEvent on).
async function writableCalendar(): Promise<any> {
  const Calendar = getCal();
  if (!Calendar) throw new Error('Calendar isn’t available on this build yet.');

  const perm = await Calendar.requestCalendarPermissions(); // full access (NSCalendarsFullAccessUsageDescription)
  if (!(perm?.granted || perm?.status === 'granted')) {
    throw new Error('Calendar access was denied — enable it in Settings → Spotly → Calendars.');
  }

  const cals: any[] = (await Calendar.getCalendars(Calendar.EntityTypes?.EVENT)) || [];
  // Prefer the device's default calendar when it's writable, else any writable one.
  let defaultId: string | undefined;
  try { defaultId = Calendar.getDefaultCalendarSync?.()?.id; } catch {}
  const writable = cals.filter((c) => c?.allowsModifications !== false && typeof c?.createEvent === 'function');
  const cal =
    writable.find((c) => c.id === defaultId) ||
    writable[0] ||
    cals.find((c) => typeof c?.createEvent === 'function');

  if (cal && typeof cal.createEvent === 'function') return cal;

  // Last resort: create a dedicated Spotly calendar.
  if (typeof Calendar.createCalendar === 'function') {
    const created = await Calendar.createCalendar({ title: 'Spotly', color: '#fa7959', name: 'Spotly' });
    if (created && typeof created.createEvent === 'function') return created;
  }
  throw new Error('No writable calendar found on this device.');
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
  const cal = await writableCalendar();
  const start = nextSaturday();
  const stops = plan.stops || [];
  const days = Math.max(1, new Set(stops.map((s) => s.day ?? 1)).size);
  const end = new Date(start);
  if (plan.multiDay && days > 1) end.setDate(end.getDate() + (days - 1));
  end.setHours(18, 0, 0, 0);
  const notes = stops.map((s) => `• ${s.time ? s.time + ' ' : ''}${s.name}${s.note ? ' — ' + s.note : ''}`).join('\n');
  await cal.createEvent({
    title: `Spotly · ${plan.title}`,
    startDate: start,
    endDate: end,
    notes,
    allDay: !!plan.multiDay,
  });
}

export async function addBookingToCalendar(b: { placeName: string; date?: string; time?: string; address?: string }): Promise<void> {
  const cal = await writableCalendar();
  const start = nextSaturday();
  if (b.time) {
    const m = b.time.match(/(\d+):(\d+)/);
    if (m) start.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  }
  const end = new Date(start);
  end.setHours(start.getHours() + 2);
  await cal.createEvent({
    title: `Spotly · ${b.placeName}`,
    startDate: start,
    endDate: end,
    notes: `Booking request via Spotly${b.date ? ' (' + b.date + ')' : ''}.`,
    location: b.address || undefined,
  });
}
