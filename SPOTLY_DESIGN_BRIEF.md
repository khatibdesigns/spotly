# Spotly — Design Brief

> **App name:** Spotly · **Tagline / App Store subtitle:** *All about the family* · **iOS bundle ID:** `com.khd.spotly`
>
> Upload this file to **Claude Design** to generate the app design. It describes the product, the screens, the visual language, component states, and the freemium model. The goal is a clean, warm, modern mobile app design (iOS + Android, built later in React Native / Expo).

---

## 1. One-liner

**Spotly helps families decide where to take their kids — this weekend and every weekend — then remembers every place you've been and turns those memories into a beautiful, growing map and printable photo albums.**

Two jobs in one app:
1. **Helper (now):** Discover great kid-friendly places around you so you never default to the same 3 spots again.
2. **Keepsake (the growth engine):** Every outing becomes a memory — photos, pins on a world map, and one day a printed album titled *"Our France Trip."*

---

## 2. Who it's for

- Parents with kids (roughly ages 0–12) who want easy, trustworthy ideas for outings.
- Works for the spontaneous weekday afternoon *and* the planned weekend.
- **International from day one** — Kuwait/GCC, Europe (EU), USA and beyond. Multi-country, multi-currency, multi-language ready (English first). No region-specific slang in the UI.

---

## 3. The core idea, in the user's words

- "I don't know where to take my kids, or I keep going to the same places."
  → A **curated, location-aware feed** of places with a **kids play area** (restaurants, cafés, parks, indoor play, farms, museums, etc.) and a **"What to do this week"** plan.
- "Let me book if I need to."
  → **In-app booking / reservation** with partner places.
- "Follow up and remember it."
  → After an outing, a gentle **follow-up** ("How was it?") that **saves it to history**.
- "We upload a family photo as a memory."
  → A **family gallery** tied to each place.
- "Over time, build a history and a map of everywhere we've been — Kuwait, Bulgaria, USA…"
  → A **memory map / passport** of all visited places worldwide.
- **Growth potential:** turn that history into **custom printed photo albums** ("Our France Trip"), prints, and keepsakes.

---

## 4. Information architecture (bottom tab bar — 5 tabs)

1. **Discover** — the curated feed + search/filters + "This week near you."
2. **Plan** — build & follow weekend/weekday plans (itineraries, reminders).
3. **Map** — the family memory map (places visited, pinned with photos) + nearby discovery toggle.
4. **Gallery** — family photo memories, organized by place & trip; entry point to **printed albums**.
5. **Profile** — family members & kids' ages, saved places, subscription, settings.

> A prominent **search/location** control lives at the top of Discover and Map.

---

## 5. Screen-by-screen requirements

### 5.1 Onboarding (first run)
- Warm, friendly 3–4 screen intro showing the 3 pillars: **Find places → Make the day happen → Keep the memories**.
- **Set up your family:** add kids (name optional, **age/age-range required** — drives recommendations), home city/location permission.
- Pick a few **interests** (outdoors, indoor play, food with play area, animals/farms, museums, water/beach, sports, arts & crafts).
- Soft sign-in (email / Apple / Google), with a "skip for now / browse first" option.

### 5.2 Discover (home)
- **Hero strip: "This week near you"** — a curated, swipeable set of 3–5 hand-picked ideas tuned to the user's location, kids' ages, weather, and season.
- **Filter bar** (horizontally scrollable chips): *Has play area · Indoor · Outdoor · Free · Food on site · Stroller-friendly · Age 0–3 / 4–7 / 8–12 · Open now · Nearby · Top rated · Bookable*.
- **Place cards** in the feed: cover photo, name, category, distance, a few **amenity icons** (play area, parking, changing room, food, age suitability), price level, rating, and a **Save (bookmark)** action. A **"Book"** badge when reservations are supported.
- **Categories row** (icon tiles): Parks, Indoor play, Cafés/Restaurants, Museums, Farms/Animals, Water/Beach, Events this week.
- Pull-to-refresh; infinite scroll; graceful **empty state** ("No spots match — loosen a filter") and **location-off state**.

### 5.3 Place detail
- Full-width **photo gallery** (user + partner photos).
- Name, category, rating & reviews count, distance, price level.
- **Amenities grid** with clear icons: play area (indoor/outdoor), age suitability, food, parking, stroller/pram access, changing facilities, shade/AC, accessibility, restrooms.
- **Hours** (with "Open now" state), address with mini-map, **Directions** button.
- **Primary CTA:** **Book / Reserve** (if partner) — otherwise **Call** / **Add to Plan**.
- Secondary actions: **Save**, **Share**, **Add a memory** (jump to photo upload tied to this place).
- "Good to know" tips, best times, age recommendations.
- Related/nearby spots strip at the bottom.

### 5.4 Booking flow (partner places)
- Date & time picker, party size (adults + kids), special requests.
- Clear price / free, confirmation screen, **booking saved to Plan + History**.
- States: available, limited, fully booked, confirmation, and a **booking confirmed** screen with calendar add + reminder.

### 5.5 Plan
- **"Make a plan"**: pick a date → add one or more spots → optional times → it becomes an **itinerary card** (timeline view with travel hints between stops).
- Upcoming plans at top; **reminders / notifications** before the outing.
- **Follow-up after the date:** a friendly prompt — *"How was [place]?"* with quick rating + **"Add photos"** → converts the plan into a **History** entry and seeds the **Gallery**.
- Empty state encourages building this week's plan from Discover.

### 5.6 Map (the memory map / "passport")
- A beautiful **world map** with **pins for every place visited**, clustered by city/country, color-coded or stamped.
- Toggle between **"Places I've been"** and **"Discover nearby."**
- Tapping a pin opens a mini-card: place name, date(s) visited, thumbnail of the family photo, link to the memory.
- **Stats / passport feel:** countries visited, cities, total spots, "streak" of weekends out. Make this feel collectible and rewarding.
- Filter by year, country, or kid.

### 5.7 Gallery (memories — the growth engine)
- Photos organized into **auto-grouped collections by place and by trip** (e.g. *"France · Summer 2026"*).
- A **timeline view** (chronological) and a **by-place view**.
- Each memory: photos, the place, date, optional note, who was there (family members).
- **Create / order a printed album** — the headline premium/transactional feature:
  - Auto-suggested albums from a trip or a date range ("We noticed 24 photos from your France trip — make an album?").
  - Editable **title** ("Our France Trip"), cover photo, page layouts, captions.
  - Preview the printed book; choose size/cover; checkout & ship.
- Also offer **individual prints**, framed photos, and digital shareable recaps as future add-ons.
- Strong, aspirational empty state showing a mock printed album.

### 5.8 Profile
- Family setup: parents + kids (ages editable), home location, languages/units.
- **Saved spots**, **History** (list form mirroring the map).
- **Subscription management** (Free vs Premium — see §6), restore purchases.
- Notifications, privacy (photos are private by default), help, about.

---

## 6. Freemium model (design must surface tiers clearly)

**Free**
- Browse Discover feed with **basic filters** (Open now · Nearby · Has play area · Free).
- Save up to **20 spots**.
- **1 active plan** at a time, with follow-ups.
- Full memory map (pins), but storage capped at **30 memory photos** total (soft cap with a friendly "upgrade for unlimited" nudge).
- **1 digital collection/album draft.**
- Booking is available to everyone (revenue comes from partner commission, not a paywall).
- Contains light, tasteful promotion of Plus (no third-party ads).

**Spotly Plus (subscription)**
- **Unlimited photo storage** + full memory map & passport stats.
- **Advanced curation:** personalized "This week" picks, all filters (age-tuned, indoor/outdoor combos, weather-aware ideas).
- **Unlimited saves**, **unlimited named plans/itineraries**, unlimited digital collections.
- Early access to curated city guides, ad-free, priority new-city content.

**Suggested pricing (confirm before launch):** ~**$4.99/month** or **$29.99/year** (annual ≈ 50% off, the anchor), with **7-day free trial** and Apple/Google regional/local-currency pricing. Consider a **Family plan** later.

**À la carte (transactional — available to all, even free users)**
- **Printed photo albums** ("Our France Trip"), prints, framed keepsakes — the marquee revenue driver and the long-term growth story. (Indicative: softcover album from ~**$24.99**, hardcover from ~**$39.99**, priced on page count.)
- **Bookings** (commission from partner places).
- Future: gift cards, ticketed experiences/events.

> Design needs: a clean **paywall / upgrade screen** (show the annual-as-default toggle + free-trial badge), subtle **"Plus" badges** on gated features, soft-cap states (e.g. "You've saved 20/20 spots"), and a **non-naggy** upsell style. The album checkout should feel like a premium e-commerce flow, not a generic upsell.

---

## 7. Visual & brand direction

- **Mood:** warm, friendly, optimistic, family-safe — but **modern and uncluttered**, not childish or cartoonish. Think "trusted travel/lifestyle app the whole family enjoys," not a toy.
- **Logo/wordmark:** the name **Spotly** — playful but clean. A pin/dot motif works naturally (a "spot" = a pin on the map = a place = a moment); the dot can live in the wordmark (e.g. the "o" as a map pin).
- **Color:** a friendly, energetic primary (suggest a warm coral/orange or a fresh teal/green) with soft neutrals and plenty of white space; accent colors for map pins/categories. Provide a light theme as default; dark theme optional.
- **Imagery:** real, joyful family-and-place photography; rounded cards; soft shadows; generous corner radius.
- **Typography:** clean, highly legible sans-serif; clear hierarchy; large, tappable touch targets (kid-parents use this one-handed, on the go).
- **Iconography:** a consistent custom amenity icon set (play area, food, parking, stroller, age, etc.) — this is core to scannability.
- **Motion:** gentle, delightful micro-interactions, especially when a new pin/stamp lands on the map (reward the memory-keeping).
- **Accessibility:** WCAG AA contrast, large text support, clear focus states.

## 8. Deliverables requested from Claude Design

- A cohesive **design system**: color tokens, typography scale, spacing, the amenity icon set, button/chip/card components with states.
- **High-fidelity screens** for: Onboarding, Discover (feed + filters + empty/location-off states), Place detail, Booking flow, Plan (with follow-up), Map (memory map + nearby toggle), Gallery (timeline + by-place + album creation/checkout), Profile, and the **Paywall/Upgrade** screen.
- Light theme primary; show **key component states** (default, pressed, disabled, loading, empty, error).
- **Tab bar** and global navigation.
- A few **marketing/hero frames** for the album feature (since it's the growth story).

## 9. Out of scope for v1 (note, don't design yet)

- Friend/social graph & following other families.
- User-generated public reviews moderation tooling.
- Web/desktop app.
- Multi-language UI beyond English (design with text-expansion headroom so it's ready later).

---

### Notes for the designer
- **Two emotional beats** must come through: the *relief* of "finally, somewhere new to go," and the *warmth* of "look at everywhere we've been together." The Map and Gallery should feel like a treasure you're building.
- Keep the discovery flow **fast and low-friction** (parents are busy). Keep the memory flow **emotional and rewarding**.
- Design the album feature to feel **premium and giftable** — it's the long-term business.
