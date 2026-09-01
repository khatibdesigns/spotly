# Graph Report - .  (2026-06-14)

## Corpus Check
- 64 files · ~71,941 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 532 nodes · 1554 edges · 20 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Shared UI & i18n|Shared UI & i18n]]
- [[_COMMUNITY_Icon Set & Glyphs|Icon Set & Glyphs]]
- [[_COMMUNITY_Currency & Merchant Insights|Currency & Merchant Insights]]
- [[_COMMUNITY_AI Itinerary Engine|AI Itinerary Engine]]
- [[_COMMUNITY_Context Providers & Hooks|Context Providers & Hooks]]
- [[_COMMUNITY_Bookings & Email|Bookings & Email]]
- [[_COMMUNITY_Child DOB & Age|Child DOB & Age]]
- [[_COMMUNITY_Places Discovery (Google)|Places Discovery (Google)]]
- [[_COMMUNITY_Discover & Saved Places|Discover & Saved Places]]
- [[_COMMUNITY_Plan Screen & Calendar|Plan Screen & Calendar]]
- [[_COMMUNITY_Profile & Photo Picker|Profile & Photo Picker]]
- [[_COMMUNITY_Memories & Gallery|Memories & Gallery]]
- [[_COMMUNITY_Analytics & Voucher Cart|Analytics & Voucher Cart]]
- [[_COMMUNITY_Place Screening Store|Place Screening Store]]
- [[_COMMUNITY_Family Sharing & Firebase|Family Sharing & Firebase]]
- [[_COMMUNITY_Auth (GoogleApple)|Auth (Google/Apple)]]
- [[_COMMUNITY_Weather Service|Weather Service]]
- [[_COMMUNITY_Map & Feature Flags|Map & Feature Flags]]
- [[_COMMUNITY_RevenueCat Purchases|RevenueCat Purchases]]
- [[_COMMUNITY_Merchant Setup & Search|Merchant Setup & Search]]

## God Nodes (most connected - your core abstractions)
1. `useI18n()` - 78 edges
2. `useStore()` - 58 edges
3. `useAuth()` - 39 edges
4. `C` - 33 edges
5. `F` - 32 edges
6. `R` - 30 edges
7. `Icons` - 29 edges
8. `SH` - 28 edges
9. `Btn()` - 26 edges
10. `useProfile()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `FamilyProvider()` --calls--> `useAuth()`  [EXTRACTED]
  src/lib/family.tsx → src/lib/auth.tsx
- `MerchantProvider()` --calls--> `useAuth()`  [EXTRACTED]
  src/lib/merchant.tsx → src/lib/auth.tsx
- `ErrorState()` --calls--> `useI18n()`  [EXTRACTED]
  src/screens/AiPlanScreen.tsx → src/lib/i18n.tsx
- `Generating()` --calls--> `useI18n()`  [EXTRACTED]
  src/screens/AiPlanScreen.tsx → src/lib/i18n.tsx
- `Idle()` --calls--> `useI18n()`  [EXTRACTED]
  src/screens/AiPlanScreen.tsx → src/lib/i18n.tsx

## Import Cycles
- None detected.

## Communities (20 total, 0 thin omitted)

### Community 0 - "Shared UI & i18n"
Cohesion: 0.08
Nodes (40): Icons, ALL_TABS, TABS, Btn(), BtnKind, BtnSize, Chip(), CircBtn() (+32 more)

### Community 1 - "Icon Set & Glyphs"
Cohesion: 0.03
Nodes (48): ac, accessible, age03, age47, age812, animals, arrowL, arrowR (+40 more)

### Community 2 - "Currency & Merchant Insights"
Cohesion: 0.06
Nodes (45): CURRENCIES, Currency, currencyFor(), formatMoney(), THREE_DECIMAL, Voucher, BranchTotal, buildSeries() (+37 more)

### Community 3 - "AI Itinerary Engine"
Cohesion: 0.06
Nodes (47): AiPlanError, API_URL, buildPrompt(), buildWeatherNote(), dayDateLabel(), enrich(), extractJson(), fetchWithTimeout() (+39 more)

### Community 4 - "Context Providers & Hooks"
Cohesion: 0.12
Nodes (50): TabBar(), useAuth(), BookingsProvider(), useBookings(), useFamily(), useI18n(), MemoriesProvider(), useMerchant() (+42 more)

### Community 5 - "Bookings & Email"
Cohesion: 0.07
Nodes (23): AlbumOrderInput, Booking, BookingInput, BookingsState, createAlbumOrder(), Ctx, API_URL, BookingEmail (+15 more)

### Community 6 - "Child DOB & Age"
Cohesion: 0.10
Nodes (19): colBox, colLbl, DobPicker(), MONTHS, Switch(), ageFromDob(), formatDob(), isoFromYMD() (+11 more)

### Community 7 - "Places Discovery (Google)"
Cohesion: 0.10
Nodes (26): amenitiesFromTypes(), DINING_TYPES, DINING_TYPESET, distKm(), EXCLUDE_PRIMARY_TYPES, fetchCurated(), FoundPlace, getSpots() (+18 more)

### Community 8 - "Discover & Saved Places"
Cohesion: 0.13
Nodes (18): Stars(), formatDistance(), getPlaceDetails(), PlaceDetails, Spot, familyFood(), kidNames(), myFirstName() (+10 more)

### Community 9 - "Plan Screen & Calendar"
Cohesion: 0.20
Nodes (10): TitleHeader(), addBookingToCalendar(), addPlanToCalendar(), getCal(), nextSaturday(), writableCalendar(), AiBanner(), groupByDay() (+2 more)

### Community 10 - "Profile & Photo Picker"
Cohesion: 0.15
Nodes (6): SectionLabel(), choosePhoto(), choosePhotos(), Labels, initial(), KID_COLORS

### Community 11 - "Memories & Gallery"
Cohesion: 0.20
Nodes (10): AddMemoryInput, Ctx, MemoriesState, Memory, memoryPhotos(), useMemories(), VisitedPlace, getStoreReview() (+2 more)

### Community 12 - "Analytics & Voucher Cart"
Cohesion: 0.24
Nodes (8): analytics(), logEvent(), logScreen(), AddArg, CartItem, Ctx, VoucherOrder, VouchersState

### Community 13 - "Place Screening Store"
Cohesion: 0.18
Nodes (10): getScreenVerdicts(), KUWAIT_CITY, requestScreen(), UserLoc, Ctx, KIND_OF, PlacesProvider(), PlacesState (+2 more)

### Community 14 - "Family Sharing & Firebase"
Cohesion: 0.22
Nodes (5): buildInviteUrl(), Ctx, FamilyProvider(), FamilyState, cfg

### Community 15 - "Auth (Google/Apple)"
Cohesion: 0.29
Nodes (4): AuthState, configureGoogle(), Ctx, getGoogle()

### Community 16 - "Weather Service"
Cohesion: 0.46
Nodes (7): describeWMO(), emojiForGoogle(), fetchWithTimeout(), fromGoogle(), fromOpenMeteo(), getWeather(), Weather

### Community 17 - "Map & Feature Flags"
Cohesion: 0.29
Nodes (4): getEvents(), SpotEvent, Pin, Toggle()

### Community 18 - "RevenueCat Purchases"
Cohesion: 0.33
Nodes (5): Ctx, getRC(), Pkg, PurchasesProvider(), PurchasesState

### Community 19 - "Merchant Setup & Search"
Cohesion: 0.33
Nodes (3): getUserLocation(), PlaceSearchResult, searchPlaces()

## Knowledge Gaps
- **173 isolated node(s):** `OVERLAYS`, `MONTHS`, `colLbl`, `colBox`, `ALL_TABS` (+168 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useI18n()` connect `Context Providers & Hooks` to `Shared UI & i18n`, `Currency & Merchant Insights`, `AI Itinerary Engine`, `Bookings & Email`, `Child DOB & Age`, `Discover & Saved Places`, `Plan Screen & Calendar`, `Profile & Photo Picker`, `Memories & Gallery`, `Map & Feature Flags`, `Merchant Setup & Search`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `useAuth()` connect `Context Providers & Hooks` to `Shared UI & i18n`, `Currency & Merchant Insights`, `AI Itinerary Engine`, `Bookings & Email`, `Child DOB & Age`, `Discover & Saved Places`, `Profile & Photo Picker`, `Memories & Gallery`, `Analytics & Voucher Cart`, `Family Sharing & Firebase`, `Auth (Google/Apple)`, `RevenueCat Purchases`, `Merchant Setup & Search`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `useStore()` connect `Context Providers & Hooks` to `Shared UI & i18n`, `Currency & Merchant Insights`, `AI Itinerary Engine`, `Bookings & Email`, `Child DOB & Age`, `Discover & Saved Places`, `Plan Screen & Calendar`, `Profile & Photo Picker`, `Memories & Gallery`, `Map & Feature Flags`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `OVERLAYS`, `MONTHS`, `colLbl` to the rest of the system?**
  _173 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Shared UI & i18n` be split into smaller, more focused modules?**
  _Cohesion score 0.07723855092276145 - nodes in this community are weakly interconnected._
- **Should `Icon Set & Glyphs` be split into smaller, more focused modules?**
  _Cohesion score 0.03278688524590164 - nodes in this community are weakly interconnected._
- **Should `Currency & Merchant Insights` be split into smaller, more focused modules?**
  _Cohesion score 0.055523085914669784 - nodes in this community are weakly interconnected._