// Spotly — phase feature flags.
//
// PHASE 1 (store launch): the company + a payment gateway aren't registered yet,
// so NOTHING purchasable ships. Discovery, the AI planner, bookings, AND the
// memory gallery all stay ON — families can still snap photos after a plan.
// Only the things that take money are hidden. Flip a flag to `true` to re-enable
// in a later phase (all the code stays intact).
//
// COMMERCE_ENABLED gates: prepaid vouchers (buy), the cart, the paywall / Spotly
//   Plus, and "My Purchases". Voucher DISPLAY also stays data-gated, so even
//   when this is true a place only shows offers once vouchers exist on its doc.
// ALBUMS_ENABLED gates ONLY the printed-album flow (the "Make album" CTA +
//   editor/preview/checkout) — a physical-product purchase. The Gallery tab and
//   family memories remain available regardless.
// GALLERY_ENABLED gates the whole Gallery tab + memories (kept ON for Phase 1).
export const COMMERCE_ENABLED = false;
export const ALBUMS_ENABLED = false;
export const GALLERY_ENABLED = true;

// PLUS_ENABLED gates the Spotly Plus auto-renewable subscription (the reachable
// paywall + the free-tier limits it unlocks). This is a DIGITAL subscription via
// the App Store / Google Play — independent of COMMERCE_ENABLED (vouchers/cart,
// which stay off). Free users get FREE_AI_PLANS AI itineraries; Spotly Plus =
// unlimited plans + full memory map + unlimited photo storage.
export const PLUS_ENABLED = true;
export const FREE_AI_PLANS = 2;
