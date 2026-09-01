# Spotly — 90-Day Content / SEO / Onboarding Calendar (Kuwait)

Three workstreams run in parallel: **(A) Web SEO** (programmatic + guides on meetspotly.com), **(B) Social/community demand**, **(C) Merchant onboarding** (the revenue path). ASO review-prompting underpins all of it.

> **Compliance guardrail (applies to every web page):** Google Places terms allow persisting only the `place_id` + Spotly's own verdict — **NOT** Google's names, photos, ratings or reviews. Every programmatic page must render from **Spotly's own curation/copy** (or live, client-side API calls), never cached Google content. Write original blurbs; they rank better anyway.

---

## A. Programmatic SEO — page templates

These target high-intent local searches parents already make. Bilingual (EN + `/ar/`). Generate from the screened dataset (areas × categories), but with original Spotly curation per page.

### Template 1 — Area × "kid-friendly places"
- **URL:** `/kuwait/[area]/kid-friendly-places` (+ `/ar/...`)
- **Title:** `Best Kid-Friendly Places in {Area}, Kuwait (2026) | Spotly`
- **Meta:** `A parent-tested guide to the best things to do with kids in {Area}, Kuwait — play areas, parks, family dining and more. Curated by Spotly.`
- **H1:** `Kid-friendly places in {Area}`
- **Blocks:** intro (original, 60–100 words) → curated list (Spotly blurb + "Open in app" deep link per place) → "Plan a day in {Area}" CTA (→ AI planner) → FAQ (schema.org FAQPage) → internal links to nearby areas + categories.
- **Areas (seed set):** Salmiya, Hawally, Kuwait City, Jabriya, Mishref, Fintas, Mangaf, Mahboula, Farwaniya, Jahra, Sabah Al-Salem, Bayan, Salwa, Avenues/Rai.

### Template 2 — Category × city
- **URL:** `/kuwait/[category]` → e.g. `/kuwait/indoor-play`, `/kuwait/waterparks`, `/kuwait/family-restaurants`, `/kuwait/birthday-venues`, `/kuwait/parks`, `/kuwait/halal-family-restaurants`
- **Title:** `{Category} in Kuwait — Family Guide (2026) | Spotly`
- **Meta:** `The best {category} for families in Kuwait, curated and kid-screened by Spotly. Plan your visit in the app.`

### Template 3 — Intent / occasion
- **URL:** `/kuwait/[intent]` → `/kuwait/things-to-do-with-kids`, `/kuwait/rainy-day` (or hot-day), `/kuwait/weekend-with-kids`, `/kuwait/toddler-activities`, `/kuwait/free-things-to-do-with-kids`
- Ties to the **weather-aware planner** angle (hot-day = indoor picks).

### Template 4 — Partner pages (merchant SEO)
- **URL:** `/partners` (hub) + `/partners/[brand]` for onboarded brands.
- Doubles as merchant-acquisition proof: "list on Spotly and rank on Google."

**Tech checklist:** server-rendered or pre-rendered HTML (not client-only) so it's crawlable; hreflang EN/AR; canonical tags; FAQPage + ItemList schema (only on your own data); fast LCP; sitemap.xml; "Open in app" smart banner + deep links.

---

## B. Cornerstone guides (write these first — earn links + rank long-tail)

1. The ultimate weekend guide for families in Kuwait
2. 20 indoor places to take kids when it's too hot
3. Best birthday party venues in Kuwait (by age)
4. Halal family restaurants with play areas
5. Free (and nearly-free) things to do with kids in Kuwait
6. New to Kuwait with kids? Start here
7. Toddler-friendly outings (0–3) in Kuwait
8. Rainy/dusty day? Indoor activities for kids
9. Best parks and outdoor spaces for families
10. A parent's guide to malls with the best kids' zones

---

## C. The 90-day calendar

### Days 0–30 — Foundation (build the engine; don't spend on ads yet)
| Week | A · SEO/Web | B · Social/Community | C · Merchant onboarding |
|---|---|---|---|
| **1** | Finalise bilingual **ASO** listings + screenshots; set up GA4 events + Search Console; sitemap | Stand up IG/TikTok/Snap accounts; define content pillars | Build the **founding-partner list** (multi-branch brands + malls + top-viewed venues) |
| **2** | Ship **Template 1** for top 6 areas; cornerstone guides #1–#3 | Join/seed 10–15 mom WhatsApp + IG communities; recruit beta families | First **anchor-brand** meetings; demo the analytics |
| **3** | Template 2 (indoor-play, waterparks, family-restaurants, birthday-venues); guides #4–#6 | Recruit 10–15 micro-influencers (brief + free album offer) | Sign 2–4 anchor brands; **done-for-you voucher setup** |
| **4** | Template 3 (intent pages); guides #7–#8; internal-linking pass | Tease launch; build waitlist; referral mechanics live | Onboard 1 mall conversation; ship **birthday push worker** |

### Days 30–60 — Soft launch (turn on loops; small paid test)
| Week | A · SEO/Web | B · Social/Community | C · Merchant onboarding |
|---|---|---|---|
| **5** | Guides #9–#10; first backlink outreach (schools, parenting sites) | **Launch** to waitlist + beta; memory-share + referral incentives on | Onboard the **most-viewed venues** (analytics-led) for commerce density |
| **6** | Monitor Search Console; fix thin/low-CTR pages; add FAQs | Influencer posts go live (the AI plan + album as content) | Promoted-placement trials → social shout-outs (reverse-acquire families) |
| **7** | Expand Template 1 to remaining areas | **Small paid test**: Snap/IG/TikTok creative variants; ASA | Founding-partner cohort to ~15–25 venues |
| **8** | Publish a "Kuwait family report" data piece (PR + links) | Review-prompt push at "wow" moments; collect testimonials | Multi-branch brand goes fully live (all branches) |

### Days 60–90 — Scale what works
| Week | A · SEO/Web | B · Social/Community | C · Merchant onboarding |
|---|---|---|---|
| **9** | Double down on top-ranking templates; build category×area combos | Pour budget into the 1–2 best CAC/activation channels | Self-serve claims open + promoted; weekly onboarding cadence |
| **10** | Backlink push (mall sites, press, nurseries) | **PR moment / launch event** at an anchor venue | Event = bulk merchant + family acquisition |
| **11** | Programmatic AR pages parity; schema audit | Birthday + weekend **lifecycle campaigns** (FCM) | Push albums/Plus; upsell promoted placement |
| **12** | Prep **Saudi** programmatic templates | Recap metrics; plan P3 creative | Run **Saudi AI sweep** to pre-seed expansion |

---

## D. Backlink / partnership targets (sourced via the same outreach as onboarding)
- Nurseries, KGs & international schools (resource pages, newsletters)
- Mall websites & directories (tenant listings)
- Kuwait parenting blogs / IG mom-pages / community sites
- Local press & "best apps / things to do" roundups
- Pediatric clinics & family-service businesses

## E. Measurement (review weekly)
- **SEO:** indexed pages, impressions, clicks, avg. position (Search Console); page→install rate via smart banner.
- **Social:** CAC + activation by channel; follower→install; UGC/shares.
- **Merchant:** claims, onboarded-with-vouchers count (density per area), GMV, take-rate revenue.
- **App:** activation %, D7/D30 retention, K-factor (invites + album shares), album attach-rate, Plus conversion.
- **North Star:** weekly active families taking a meaningful action.

## F. Content production cadence (sustainable)
- 2 cornerstone guides/week in P0, then 1/week.
- Programmatic pages in batches (areas → categories → intents).
- 3–4 social posts/week per platform; repurpose influencer UGC.
- Refresh ASO keywords + top guides monthly based on data.
