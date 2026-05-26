// Spotly — booking confirmation email. Posts to a small /email endpoint on the
// EC2 box, which renders a Spotly-branded HTML email and sends it via the
// configured mail provider. Fire-and-forget: never blocks or breaks a booking.
const API_URL = (process.env.EXPO_PUBLIC_PLAN_API_URL || 'http://16.16.79.251:8090').replace(/\/$/, '');

export type BookingEmail = {
  to: string;
  placeName: string;
  date: string;
  time: string;
  adults: number;
  kids: number;
  code?: string;
  bookingId: string;
};

export function sendBookingEmail(payload: BookingEmail) {
  if (!payload.to) return;
  postEmail({ type: 'booking', ...payload });
}

export type VoucherEmail = {
  to: string;
  placeName: string;
  label?: string;
  price: number;
  value: number;
  currencyCode: string;
  code: string;
  orderId: string;
};

// Branded voucher receipt + the QR to redeem the card at the venue.
export function sendVoucherEmail(payload: VoucherEmail) {
  if (!payload.to) return;
  postEmail({ type: 'voucher', ...payload });
}

// Fire-and-forget POST to the EC2 /email endpoint — never blocks or throws.
function postEmail(body: Record<string, any>) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15000);
  fetch(`${API_URL}/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: ctrl.signal,
  })
    .catch(() => {}) // endpoint may not be deployed yet — ignore
    .finally(() => clearTimeout(to));
}
