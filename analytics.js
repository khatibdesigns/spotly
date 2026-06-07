/* Spotly — meetspotly.com analytics bootstrap.
 *
 * One place to configure GA4 for the whole marketing site. Every page loads
 * this with <script defer src="/analytics.js"></script>, so to turn analytics
 * on you only paste the Measurement ID ONCE, right below.
 *
 * Where to get the ID:
 *   GA4 → Admin → Data streams → Add stream → Web → site URL https://meetspotly.com
 *   → copy the "Measurement ID" (looks like G-XXXXXXXXXX) and paste it here.
 *
 * Until a real ID is set, this is a harmless no-op (nothing loads, no errors).
 */
(function () {
  var MEASUREMENT_ID = 'G-XXXXXXXXXX'; // <-- paste the meetspotly.com GA4 Web Measurement ID here

  if (!MEASUREMENT_ID || MEASUREMENT_ID.indexOf('XXXX') !== -1) return; // not configured yet → no-op

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', MEASUREMENT_ID, { anonymize_ip: true });
})();
