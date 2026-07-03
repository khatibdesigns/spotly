/* Spotly — meetspotly.com analytics + conversion tracking.
 *
 * ONE file, loaded by every page (<script defer src="/analytics.js"></script>).
 * It does three jobs:
 *   1. GA4 pageviews          (property 538818604 / stream G-4E9H9NJZHY)
 *   2. Conversion events      (install-intent, get-app, email signup, invites)
 *   3. Google Ads readiness   (UTM/gclid capture + conversion pings, gated)
 *
 * ── To turn Google Ads conversions on (later, ONE paste) ─────────────────────
 *   GA4 → Admin → Google Ads Links → link your Ads account, THEN:
 *   Google Ads → Tools → Conversions → create action → it gives you a tag like
 *   "AW-1234567890" and per-action labels like "AbCdEf…".  Paste the AW id in
 *   ADS_ID below and the labels in ADS_LABELS. Until then those pings are no-ops
 *   (GA4 keeps working regardless).
 * ---------------------------------------------------------------------------- */
(function () {
  var GA_ID   = 'G-4E9H9NJZHY';   // GA4 Web data stream (meetspotly.com)
  var ADS_ID  = '';               // e.g. 'AW-1234567890'  ← paste when Ads is set up
  var ADS_LABELS = {              // Conversions → action → "tag setup" gives these
    store_click:   '',            // install intent (App Store tap)  ← primary
    get_app_click: '',            // /get/ CTA
    notify_signup: '',            // Android waitlist email
    join_open:     ''             // family invite opened
  };

  if (!GA_ID || GA_ID.indexOf('XXXX') !== -1) return; // not configured → no-op

  // ── gtag bootstrap ─────────────────────────────────────────────────────────
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());

  // ── First-touch UTM / click-id capture (survives the whole session) ──────────
  // So every event — and any form submit — is attributable to the ad that drove
  // the visit, even after the visitor clicks around the site.
  var UTM_KEYS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid'];
  var attribution = {};
  try {
    var qs = new URLSearchParams(location.search);
    var stored = JSON.parse(sessionStorage.getItem('sp_attr') || '{}');
    UTM_KEYS.forEach(function (k) {
      var v = qs.get(k);
      if (v) stored[k] = v;                 // new value from URL wins
      if (stored[k]) attribution[k] = stored[k];
    });
    sessionStorage.setItem('sp_attr', JSON.stringify(stored));
  } catch (e) { /* private mode / no storage → just skip persistence */ }
  window.spAttribution = attribution;       // forms can read this and post it along

  // Feed attribution into GA4 config so it rides on every hit.
  var cfg = { anonymize_ip: true };
  if (attribution.utm_campaign) cfg.campaign_name   = attribution.utm_campaign;
  if (attribution.utm_source)   cfg.campaign_source = attribution.utm_source;
  if (attribution.utm_medium)   cfg.campaign_medium = attribution.utm_medium;
  gtag('config', GA_ID, cfg);
  if (ADS_ID) gtag('config', ADS_ID);       // Google Ads global tag (only if set)

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);

  // ── Helpers other scripts / pages can call ───────────────────────────────────
  // spTrack('event_name', {..}) → GA4 event, auto-tagged with attribution.
  window.spTrack = function (name, params) {
    var p = params || {};
    UTM_KEYS.forEach(function (k) { if (attribution[k] && !p[k]) p[k] = attribution[k]; });
    gtag('event', name, p);
    var label = ADS_LABELS[name];
    if (ADS_ID && label) gtag('event', 'conversion', { send_to: ADS_ID + '/' + label });
  };

  // ── Delegated conversion tracking (no per-page markup needed) ─────────────────
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    // App Store tap — the macro conversion for paid app-install search ads.
    var store = t.closest('a[href*="apps.apple.com"], a[href*="play.google.com"]');
    if (store) {
      var storeName = store.href.indexOf('play.google.com') !== -1 ? 'play' : 'app_store';
      window.spTrack('store_click', { store: storeName, link_url: store.href, transport_type: 'beacon' });
      return;
    }
    // "Get the app" CTA that routes to /get/
    var get = t.closest('a[href*="/get"], [data-cta="get-app"]');
    if (get) { window.spTrack('get_app_click', { link_url: get.href || '' }); return; }
    // Family-invite "Open in Spotly"
    var join = t.closest('#openBtn, [data-cta="join-open"]');
    if (join) { window.spTrack('join_open', {}); return; }
    // Partner / merchant CTAs (WhatsApp)
    var wa = t.closest('a[href*="wa.me"]');
    if (wa) { window.spTrack('whatsapp_click', { link_url: wa.href }); return; }
  }, true);

  // Any successful email-capture form (get/ waitlist, contact, partners) should
  // call  window.spTrack('notify_signup', {source:'get'})  once it returns OK.
})();
