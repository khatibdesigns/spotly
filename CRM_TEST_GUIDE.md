# Spotly Partners CRM — Hierarchy Test Guide

Tests the multi-tier merchant setup: **Super-admin → Owner → Country manager → Branch manager**, where each role sees and manages only its slice, and a brand always owns its branches.

---

## 0. Setup

- **URL:** https://meetspotly.com/partners  (the old `/admin` now redirects here)
- **Hard-refresh** the page first (Cmd-Shift-R) so you get the new build. If `/partners` 404s for a minute, GitHub Pages is still rebuilding — wait, or use `/partners.html`.
- **Demo logins** (password for all: `Spotly123!`):

| Role | Email | Scope |
|---|---|---|
| Owner (brand HQ) | `funzone.owner@spotly.test` | All FunZone branches |
| Country manager | `funzone.kw@spotly.test` | Kuwait branches |
| Branch manager | `funzone.avenues@spotly.test` | The Avenues only |
| Branch manager | `funzone.360@spotly.test` | 360 Mall only |
| Branch manager | `funzone.marina@spotly.test` | Marina — **pending approval** |
| Super-admin | *your own admin login* | Everything, all brands |

> Sign out between roles (top-right **Sign out**), then sign in as the next account.

## What was seeded (the "FunZone" brand)
- **2 live branches** — *The Avenues* (Avenues manager) and *360 Mall* (360 manager), each with vouchers, **2 voucher sales**, and **1 booking**.
- **1 pending branch** — *Marina*, which the Marina manager "claimed" and is **waiting for approval**.
- A country manager for **Kuwait**.

---

## Test 1 — Super-admin (you)
Sign in with your own admin account.
- [ ] Header shows **Super admin**. You see the full admin nav (Orders, Campaigns, Hotspots, Reports).
- [ ] **Places** lists FunZone branches **plus** all other curated/Kuwait places.
- [ ] **Team** shows every business member (across brands).
- ✅ *Look for:* you can see and do everything.

## Test 2 — Owner  (`funzone.owner@spotly.test`)
- [ ] Header shows **FunZone · Owner**. No admin-only tabs (no Orders/Campaigns/Hotspots/Reports).
- [ ] **Dashboard** KPIs say *Your places / Vouchers sold / Voucher revenue* — counts the **whole brand** (both live branches; revenue ≈ 30 KD across the paid sales).
- [ ] **Places** shows **The Avenues**, **360 Mall**, and **Marina (pending)** — all tagged country **Kuwait**, each with a branch label.
- [ ] **Bookings** shows both branches' bookings; **Vouchers** shows all 4 sales.
- [ ] **Team** shows the country manager + 3 branch managers, with their scope.
- ✅ *Look for:* the owner sees the entire brand and can manage everything except other brands.

## Test 3 — Country manager  (`funzone.kw@spotly.test`)
- [ ] Header shows **FunZone · Country manager**.
- [ ] **Places** shows the Kuwait branches (Avenues, 360, Marina-pending) — because they're tagged Kuwait.
- [ ] **Team** lets them invite **branch managers** (no "country manager" option — that's owner-only).
- [ ] In **✎ Branch**, the country field is **read-only** (only the owner can move a branch between countries).
- ✅ *Look for:* same as owner but limited to their country; can add/approve branch managers in Kuwait.

## Test 4 — Branch manager  (`funzone.avenues@spotly.test`)  ← the key isolation test
- [ ] Header shows **FunZone · Branch manager**. **No Team tab.**
- [ ] **Places** shows **only The Avenues** — *not* 360 Mall, *not* Marina.
- [ ] **Bookings** shows only The Avenues' 1 booking; **Vouchers** shows only its 2 sales.
- [ ] They can open **🎟 Offers** and edit vouchers, and handle their booking/redeem — but there's **no ✎ Branch** (can't change country or managers) and **no promotion toggle**.
- [ ] Now sign in as `funzone.360@spotly.test` → they see **only 360 Mall** and its sales.
- ✅ *Look for:* **a branch manager cannot see another branch's bookings or revenue at all.** This is enforced in the database rules, not just hidden — that's the whole point.

## Test 5 — Approval flow (self-onboarding)
1. Sign in as **owner** (or country manager).
2. **Places** → on **Marina** you'll see **"Branch claim awaiting approval → ✓ Approve / Reject."**
3. Click **✓ Approve**.
   - [ ] Marina flips to **Live** and the Marina manager is now assigned.
4. Sign in as `funzone.marina@spotly.test`.
   - [ ] Before approval they saw *"Awaiting approval"*; after approval they now see **Marina** as their managed branch.
- ✅ *Look for:* a branch manager self-claims a branch → it's **pending** until an owner/country manager approves → then it goes live and they manage it. The brand (FunZone) stays the owner the whole time.

## Test 6 — Invite a brand-new manager (full self-serve loop)
1. As **owner**: **Team → + Invite a manager** → role *Branch manager* → enter an email **you can sign into** (e.g. a spare Gmail) → Send.
2. Open `/partners` in a private window, sign up/in with that exact email.
   - [ ] They're auto-linked as a FunZone branch manager and see the empty **"Claim your branch"** state.
3. Click **🔎 Claim your branch** → pick a country → search Google (e.g. "FunZone Kuwait" or any real place) → **Claim**.
   - [ ] It submits as **pending**.
4. Back as owner → **Approve** the pending claim.
- ✅ *Look for:* the full loop works without the owner ever touching that branch's `place_id` — the manager onboarded it themselves, and the brand owns it.

## Test 7 — Try to break the isolation (security spot-check)
- [ ] As a branch manager, there's no UI path to another branch — and even the data layer refuses: their browser can't query another branch's bookings/sales (the rules deny it). Nothing to do here except confirm there's no leak in the lists above.

---

## When you're done — clean up
The 2 live demo branches (Avenues, 360) appear in the **customer app** near Kuwait while seeded. To remove all demo data:

```
cd ~/spotly && node scripts/seed-demo-merchants.mjs --remove
```

This deletes the demo branches, sales, bookings, and team docs. (The demo *logins* stay in Firebase Auth — delete them in the Firebase console if you want them gone.) Re-seed anytime with `node scripts/seed-demo-merchants.mjs`.

## Known caveats
- An invited manager must sign in with the **exact** invited email (lowercase).
- Managers **self-claim NEW branches**; a branch already in the brand is assigned by the owner via **✎ Branch**, not self-claimed.
- The mobile-app side of this (roles/self-claim/approvals in the merchant screens) is the **next step** once you're happy with the CRM.
