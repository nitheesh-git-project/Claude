---

## 22. Full regression journeys

Each journey is an end-to-end run through the product, executed in one sitting. Run all four before a release.

### `REG-J1` — The core money journey · P0

```
SETUP-RESET-001
  → SETUP-CAT-001 (three conditions)  → SETUP-PKG-001 (P1, P2, P3)
  → ADM-SET-026 (scoped admins)       → ADM-PEOP-006 (revenue shares)
  → THR-AUTH-001 → ADM-APPR-002 → THR-AVAIL-001
  → PAT-BOOK-002 → PAT-BOOK-003 (book + pay)
  → ADM-SESS-002 (assign)             → XR-BOOK-001 (five views agree)
  → THR-SESS-005 (complete)           → XR-COMPLETE-001
  → THR-CARE-001 (recommend)          → ADM-CARE-004 (clinic approves) → XR-CARE-001
  → PAT-CARE-002 (accept + pay)       → XR-CARE-002
  → PAT-PKG-001 (spend 3 credits)     → XR-CREDIT-001
  → THR-SESS-005 ×3 (deliver them)
  → FIN-SUM-001 (identities hold)     → FIN-PAY-002 (settle) → XR-PAYOUT-001
  → ADM-SET-033 (every action is in the Activity Log)
```

**Pass criterion.** Both money identities hold at the end, every cross-role check agrees, and the Activity Log contains every mutating action including `payout.settle`.

### `REG-J2` — The home-visit and cash journey · P0

```
ADM-SET-013 (home visits on) → SETUP-AREA-001 → SETUP-HVPKG-001
  → PAT-HV-002 (prepaid, serviceable)   → PAT-HV-003 (unserviceable → waitlist)
  → PAT-HV-006 (cash on visit)
  → ADM-SESS-002 (assign)               → THR-SESS-007 (record cash)
  → THR-SESS-005 (complete)             → XR-CASH-001
  → FIN-PAY-003 (cash nets off the payout, and is marked remitted)
  → FIN-PAY-004 (cash > owed → floors at zero, stays on the ledger)
  → FIN-REF-003 (cash refund → manual pending)
  → PAT-CARE-003 (a recommended home programme quotes travel per visit)
  → ADM-SET-013 again (switch off → the recommendation stops being purchasable)
```

### `REG-J3` — The partner journey · P0

```
HOS-LEAD-001 → HOS-AUTH-002 (provision) → HOS-AUTH-001
  → HOS-REF-001 (refer) → HOS-REF-004 (the whole status pipeline)
  → HOS-REF-006 (patient registers with the code)
  → PAT-BOOK-003 as Patient C → ADM-SESS-002 → THR-SESS-005
  → HOS-MONEY-001 (commission on net) → XR-BOOK-002
  → PAT-CANCEL-001 on a second referred session (refund reverses the commission)
  → HOS-MONEY-002 (a therapist with no share ⇒ excluded, not guessed)
  → HOS-SEC-001..004 (isolation)
```

### `REG-J4` — The clinical journey · P0

```
THR-HP-001 (triage, ortho) → THR-HP-002 (first fill, live)
  → PAT-HP-001 then PAT-HP-002 (locked → unlocked)
  → PAT-HP-003 (one question at a time) → PAT-HP-004 (change → review)
  → PAT-DOC-001..003 (upload, limits, delete)
  → THR-HP-005 (Pain Map on ortho; refused on neuro)
  → THR-HP-004 (re-triage to neuro MERGES, never replaces)
  → ADM-SET-020 (edit questions; disable paediatrics; ortho cannot be disabled)
  → THR-SESS-008 (session notes; invisible to the patient and to the PDF)
  → PAT-HP-005 (export as PDF, including a non-Latin name)
  → THR-LEAK-001..007 (the scanner, both tiers, and the evidence tables)
  → XR-HP-001
```

### `REG-J5` — Security sweep · P0
Run **all** of §18 in one pass, then `ADM-SET-027`'s full table.

### `REG-J6` — Payment integrity sweep · P0
Run **all** of §16.3 in one pass.

---

## 23. Test dependency map and recommended execution order

### 23.1 The main dependency chain

```
SETUP-RESET-001
   └─ SETUP-CAT-001 ─┬─ SETUP-PKG-001 ─┐
                     └─ PAT-BOOK-002 ──┤
THR-AUTH-001 → ADM-APPR-002 → THR-AVAIL-001
                                       │
                     PAT-BOOK-003 ◄────┘
                          │
                          ├─ PAT-PAY-001..005      (payment outcomes)
                          └─ ADM-SESS-002          (assign)
                                  │
                                  ├─ THR-SESS-003/004  (masking, reveal)
                                  └─ THR-SESS-005      (complete)
                                          │
                            ┌─────────────┴──────────────┐
                    THR-HP-001/002                 THR-CARE-001
                            │                            │
                      PAT-HP-002                   PAT-CARE-002
                            │                            │
                      PAT-HP-003/004               PAT-PKG-001
                                                         │
                                                   THR-SUGG-001
                                                         │
                                                   PAT-SUGG-002
                                                         │
                                            FIN-SUM-001 → FIN-PAY-002
                                                         │
                                                   ADM-SET-033
```

### 23.2 Recommended execution order

| # | Phase | Tests | Notes |
| --- | --- | --- | --- |
| 1 | **Reset** | `SETUP-RESET-001..003` | Must be first. Confirm an admin survives. |
| 2 | **Admin & catalog setup** | `ADM-CAT-001`, `ADM-CAT-005`, `ADM-CAT-010`, `SETUP-HVPKG-001`, `ADM-SET-026` | Nothing downstream works without a catalog. |
| 3 | **Create users** | `PAT-AUTH-002`, `THR-AUTH-001`, `HOS-LEAD-001` → `HOS-AUTH-002` | Patient A is created *inside* `PAT-BOOK-003`, deliberately — that is the guest path. |
| 4 | **Approve users** | `ADM-APPR-001..004` | |
| 5 | **Configure availability** | `THR-AVAIL-001..007`, `ADM-ROST-001..005` | |
| 6 | **Booking** | `PAT-BOOK-001..017`, `PAT-HV-001..007` | Time-simulation scenarios TIME-A…D. |
| 7 | **Payment** | `PAT-PAY-001..005`, §16.3 | Needs Razorpay test keys **and** the webhook secret. |
| 8 | **Therapist session** | `ADM-SESS-002..004`, `THR-SESS-001..008` | |
| 9 | **Care plan** | `THR-CARE-001..008`, `ADM-CARE-001..008` | |
| 10 | **Purchase** | `PAT-CARE-001..004` | |
| 11 | **Credits** | `PAT-PKG-001..004`, `THR-SUGG-*`, `PAT-SUGG-*` | |
| 12 | **Clinical** | `THR-HP-*`, `PAT-HP-*`, `PAT-DOC-*`, `THR-LEAK-*` | |
| 13 | **Finance** | §16.1–16.2 | Build the reference dataset first. |
| 14 | **Configuration dependencies** | §15.4, all 46 rows | Restore every setting afterwards. |
| 15 | **Security** | §18 in full | |
| 16 | **UX / mobile / a11y** | §19 | |
| 17 | **Error / loading / empty** | §20 | Empty states are easiest right after a reset — consider running `ERR-EMPTY-001` in phase 1. |
| 18 | **Cross-role** | §21 | |
| 19 | **Final regression** | `REG-J1..J6` | |

### 23.3 Tests that must be run on a fresh database

`SETUP-RESET-001`, `ERR-EMPTY-001`, `PAT-EMPTY-001`, and any test that books a **fixed** future slot. A rerun on a dirty database will refuse the booking as a clash — **that refusal is correct behaviour**.

### 23.4 Tests that change global state — restore afterwards

| Test | Restore |
| --- | --- |
| Every `ADM-SET-*` | Put the setting back to its documented default |
| `DBG-TIME-*`, and every TIME scenario | **Reset to Real Time** |
| `SETUP-RESET-003` | Re-arm `ALLOW_DEBUG_DATA_RESET=true` |
| `PAY-WH-004` | Restore `RAZORPAY_WEBHOOK_SECRET` |
| `ADM-PEOP-007`, `SEC-AUTH-006` | Re-activate the suspended accounts |
| `ADM-CAT-002` (deactivate) | Re-activate the category |
| `ADM-SET-020` (disable paediatrics) | Re-enable it |

---

## 24. Coverage audit

### 24.1 Area × dimension matrix

| Area | Patient | Therapist | Hospital | Admin | Finance | Security | Mobile |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Registration / login | `PAT-AUTH-001..006` | `THR-AUTH-001..003` | `HOS-AUTH-001..003` | `SETUP-RESET-001` | — | `SEC-AUTH-004..007` | `UX-MOB-002` |
| Approval gates | `PAT-AUTH-003` | `THR-AUTH-002` | `HOS-AUTH-003` | `ADM-APPR-001..004` | — | `SEC-AUTH-006` | — |
| Booking (video) | `PAT-BOOK-001..017` | `THR-SESS-001` | — | `ADM-NEWB-001`, `ADM-SESS-002` | `FIN-SUM-002` | `PAT-BOOK-012`, `SEC-TAMPER-001` | `UX-MOB-001` |
| Booking (home visit) | `PAT-HV-001..007` | `THR-SESS-007` | `HOS-REF-002` | `ADM-CAT-010`, `ADM-SET-014` | `FIN-PAY-003` | `PAT-HV-005` | `UX-MOB-001` |
| Payment | `PAT-PAY-001..005` | — | — | `FIN-TXN-001` | §16.3 in full | `PAY-AMT-001/002` | `UX-MOB-001` |
| Refunds | `PAT-CANCEL-001..003` | — | `HOS-MONEY-001` | `ADM-SESS-004` | `FIN-REF-001..004` | — | — |
| Sessions lifecycle | `PAT-SESS-001..006` | `THR-SESS-001..008` | — | `ADM-SESS-001..004`, `ADM-SCHED-001` | `FIN-SUM-002` | `THR-SEC-002` | `UX-MOB-002` |
| Availability / roster | — | `THR-AVAIL-001..008` | — | `ADM-ROST-001..005` | — | `THR-SEC-001`, `ADM-ROST-005` | — |
| Health profile | `PAT-HP-001..005` | `THR-HP-001..006` | `HOS-SEC-002` | `ADM-PEOP-004`, `ADM-SET-020` | — | `SEC-DATA-001` | `UX-MOB-004` |
| Documents | `PAT-DOC-001..003` | (read) | `HOS-SEC-002` | (read) | — | `SEC-DATA-004` | `UX-MOB-003` |
| Care plans | `PAT-CARE-001..004`, `PAT-SCHED-001..003` | `THR-CARE-001..008` | — | `ADM-CARE-001..008` | `PAY-AMT-002` | `THR-CARE-002` | — |
| Suggested sessions | `PAT-SUGG-001..005` | `THR-SUGG-001..002` | — | `ADM-SET-018` | — | `PAT-SUGG-004` | — |
| Session credits | `PAT-PKG-001..004` | (view) | — | `ADM-CAT-014/015`, `ADM-SET-019` | `FIN-REF-004` | `SEC-TAMPER-003`, `PAY-CONC-001` | — |
| Referrals | `HOS-REF-006` | — | `HOS-REF-001..007` | `ADM-PEOP-008` | `HOS-MONEY-001..003` | `HOS-SEC-001` | — |
| Earnings / payouts | — | `THR-EARN-001..004` | `HOS-MONEY-001..003` | `FIN-PAY-001..006` | `FIN-PAY-001..006` | `SEC-ADMIN-001` | — |
| Catalog | (reads) | (reads) | — | `ADM-CAT-001..015` | `ADM-CAT-006` | `ADM-SET-028` | `UX-MOB-005` |
| Settings | — | — | — | `ADM-SET-001..035` | `FIN-COST-002` | `ADM-SET-025..028` | — |
| Contact controls | `THR-LEAK-005` | `THR-LEAK-001..007`, `THR-SESS-003/004` | — | `ADM-SET-029` | — | `SEC-DATA-005` | — |
| Risk | — | — | — | `ADM-RISK-001..003` | — | `ADM-RISK-003` | — |
| Audit log | — | — | — | `ADM-SET-033` | `XR-PAYOUT-001` | `ADM-SET-033` | — |
| Public site | `PUB-*` | — | `HOS-LEAD-001` | `ADM-SET-004..008` | — | `SEC-ROUTE-004` | `UX-MOB-001` |
| Debug bar | `DBG-TIME-001` | — | — | `SETUP-RESET-001..003`, `DBG-NAV-001` | — | `SETUP-RESET-002/003` | — |

### 24.2 Route coverage

Every route in §3 is mapped to at least one test in its own table's rightmost column. **All 9 public pages, 2 booking routes, 10 patient routes, 8 therapist routes, 6 hospital routes, 2 admin routes + 31 admin screens + 3 admin detail routes, and 4 system routes are covered.** API routes are covered by the tests that drive them plus §18's direct calls.

### 24.3 Admin screen coverage

All **31** screens have at least one dedicated test — see the §3.6 table. Every screen with a mutating control also has a negative and an authorization test.

### 24.4 Configuration coverage

All **46** configuration→dependent-feature pairs in §15.4 have a verification test. Every one names the screen where the change must be *proved*, not merely saved.

### 24.5 Payment coverage

Success (`PAT-BOOK-003`), failure (`PAT-PAY-001`), cancellation/dismissal (`PAT-PAY-002`), abandonment (`PAT-PAY-004`), retry (`PAT-PAY-001`, `PAT-PAY-005`), refund (`FIN-REF-001..004`), refund failure (`FIN-REF-002`), duplicate click (`PAT-BOOK-017`), duplicate callback (`PAY-WH-002`), duplicate webhook (`PAY-DUP-004`), signature tampering (`PAY-WH-001`), amount tampering (`PAY-AMT-001/002`), concurrency (`PAY-CONC-001/002`), and the seven "must never happen" duplications (`PAY-DUP-001..007`).

### 24.6 Role coverage

Every protected action has both an authorized case and an unauthorized one. The unauthorized case is always tested **at the route**, not only in the UI.

### 24.7 State coverage

| Entity | Transitions covered |
| --- | --- |
| Appointment | requested → confirmed → completed; → cancelled (+refund / no refund); completed → reopened; cancelled/no-show → restored; unpaid → paid |
| Package purchase | active → expired; active → refunded; credits reserved → consumed → released/voided |
| Care plan | active → accepted (purchased, closed); active → withdrawn; active → declined; superseded |
| Suggestion | pending → accepted; pending → declined; pending → lapsed (computed, never written) |
| Referral | pending_review → therapist_assigned → invite_sent → converted; → declined; → withdrawn |
| Payout request | pending → reviewing → completed |
| Risk signal | open → reviewing → dismissed / actioned; reopened as a fresh signal |
| Account | unapproved → approved; active → suspended → active; patient auto-approved by payment attempt |
| Cash | collected → (corrected) → remitted; refund → manual_pending → returned |

### 24.8 What is not testable in this environment, and why

| Item | Why | What to do instead |
| --- | --- | --- |
| Real email delivery | All fixtures use the reserved `.test` TLD, and the product sends no transactional email of its own (the Google Calendar invite is the only outbound notification) | Verify the request succeeded and the reset landing page renders |
| Google Calendar/Meet against a real calendar | Needs live Google credentials and a real calendar | Test the **failure and retry** path instead (`ADM-SESS-003`) — that is the behaviour that matters |
| Live Razorpay settlement, chargebacks, real bank refunds | Test mode does not settle | Verify the local state transitions and the gateway's own test dashboard |
| Server-clock-dependent gates under simulation | The simulated clock is client-side only, by design | Use real near-future slots (§7.2) |
| `next start` ISR behaviour matching fixtures | Public pages cache for 300 s | Run against `next dev`; if you must use `next start`, wait out or trigger revalidation |
| Browser-side Supabase reads in a network-isolated sandbox | Chromium needs egress for `?therapist=` resolution | Check egress first (`PAT-BOOK-007`'s note) before filing a defect |
| Multi-region / timezone-shifted testing | The app records the browser's detected timezone | Change the OS timezone and re-run `PAT-BOOK-002`; the calendar and the stored `timezone` must agree |
| Load and performance | Out of scope for a manual plan | Note any screen that feels slow, especially the admin dashboard's ~40 queries |

---

## 25. Questions and clarifications before execution

These are **product decisions**, not gaps in the inspection. In each case the code's current behaviour is established and stated, and the test asserts exactly that behaviour — but whether it is the *intended* behaviour is a call only the product owner can make. Confirm each before executing the affected tests; if a decision changes the answer, the named test changes with it. **Nothing here is invented behaviour.**

1. **Duplicate referral prevention (affects `HOS-REF-003`).** Established from the schema: `patient_referrals` carries **no uniqueness constraint** on hospital + patient name, so a hospital that genuinely re-types the same referral creates a **second row**. Only the double-tap case is defended, by the form's own submit guard. **Decision needed:** is a genuine re-submission meant to be blocked at the database, de-duplicated on the admin's side, or simply left visible in the queue for a human to decline? The test currently asserts the last of these, because that is what the code does today.

2. **Therapist timezone (affects `THR-AVAIL-001`).** Established from the code: the roster editor reads **`profiles.timezone`** and prints it as a label, falling back to `Asia/Kolkata`; there is **no field anywhere in the therapist's Edit Profile that sets it**, and the admin's Roster only displays it. So today it is per-therapist in the schema and un-editable in the product. **Decision needed:** should a therapist (or an admin) be able to set it, or is the fallback the intended behaviour for a clinic operating in one timezone? Until that is decided, `THR-AVAIL-001` asserts only that the header states a timezone.

3. **Tablet support (affects §19).** The plan tests 820 × 1180 as a courtesy. **Question:** is tablet a supported breakpoint with its own expectations, or simply "desktop layout, narrower"?

4. **Paediatric fixture depth (affects §8.6).** Patient D's paediatric data is supplied so the third specialty can be exercised, but no journey in this plan requires a paediatric patient end to end. **Question:** should paediatrics get its own full journey, or is `ADM-SET-020`'s enable/disable coverage sufficient for this release?

5. **`plan_conversion_low` and `post_consultation_dropout` (affects `ADM-RISK-001`).** Both ship **disabled** because a threshold invented before the clinic has a baseline fires on everyone or on nobody. **Question:** should this release enable them with a provisional threshold, or leave them off? The tests currently assert they are off.

6. **Refund of a partially delivered home-visit package (affects `FIN-REF-004`).** The session-package rule ("void what is available, never what is consumed") is explicit. The equivalent for a **cash** home-visit package, where no online payment exists to reverse, resolves to `manual_pending`. **Question:** confirm the intended split when a cash home-visit package is partly delivered — how much is expected back at the door?

7. **Reassigning a programme's therapist mid-course (affects `ADM-CAT-014`).** Reassignment touches **future** sessions only. **Question:** should the patient be notified, and if so through which surface? The plan currently asserts only the data outcome.

8. **Expected UI copy for a handful of validation messages.** The API messages quoted throughout this document are taken verbatim from the route handlers. Where a component *re-words* a route's error before showing it, the test asserts the API string. **Question:** for any case where the on-screen wording differs from the quoted API string, confirm which is authoritative so the test can assert the right one.

---

## 26. Defect reporting template

Paste this, filled in, when reporting a failure. The **Test ID plus the actual result** is what makes a report diagnosable.

```
Test ID:
Role:
Feature:
Environment:                 (local dev / staging; Supabase project ref; app URL)
Server:                      (next dev / next start)
Simulated Date/Time:         (the value set in the Debug bar, or "real time")
Browser / viewport:
Step that failed:            (the numbered step)
Expected Result:             (quote it from the test case)
Actual Result:               (exactly what happened, including the exact on-screen text)
Test Data:                   (the values entered)
Screenshot / video:
Console error:
Network / API error:         (route, HTTP status, response body)
Payment ID / Order ID:       (if applicable)
Appointment ID:              (if applicable)
Purchase / Entitlement ID:   (if applicable)
Reproducible?:               (always / intermittently / once)
First or second consecutive run on this database?
Additional notes:
```

**Before filing, rule out these five known-correct behaviours:**

1. A booking refused as a clash on a **second consecutive run** — leftover state, not a bug.
2. A **server-side** time gate refusing an action under a simulated clock — the simulation is client-side by design.
3. A fixture missing from a **public page under `next start`** — ISR caches for 300 seconds.
4. A `?therapist=` chip missing in a **network-isolated sandbox** — the browser needs egress.
5. `/home-visit` returning **404** while the master switch is off — that is the feature.

---

## 27. Final release checklist

Sign off each line before release.

**Data and environment**
- [ ] `ALLOW_DEBUG_DATA_RESET` is **unset** in production, and `debug_reset_all_data()` is dropped
- [ ] `.env.production` does not exist in the repository
- [ ] The hosting dashboard's own environment variables have been checked (a deleted file cannot clear those)
- [ ] `RAZORPAY_WEBHOOK_SECRET` is set in production
- [ ] Razorpay is in **live** mode with live keys; no test key remains
- [ ] `supabase/schema.sql` has been applied, and applies **twice** cleanly
- [ ] Supabase Auth → **Confirm email is OFF**
- [ ] The `medical-reports` bucket is **private**; `avatars` is public
- [ ] At least two `full`-scope admins exist

**Pre-launch removals**
- [ ] **The Debug Bar is deleted** — not merely switched off. It is a public flag, and the bar names `/admin/login` and `/admin/dashboard`
- [ ] The five seeded testimonials are replaced with real, consented ones, or removed
- [ ] Stock photography under `public/photos/` is replaced with the clinic's own, keeping the aspect ratios

**Functional sign-off**
- [ ] `REG-J1` … `REG-J6` all pass on a fresh database
- [ ] Both money identities hold on the reference dataset
- [ ] Settings → System Health reports **no** accounting disagreements and **no** unresolved sync issues
- [ ] Every action in the audit vocabulary has been observed in the Activity Log, `payout.settle` included
- [ ] No generated password appears anywhere in the Activity Log
- [ ] `npm run verify` (lint + unit tests + build) passes
- [ ] `npm run lint` passes, including the Realtime publication coverage check
- [ ] The Playwright suite passes against a test project (`workers: 1`, against `next dev`)

**Security sign-off**
- [ ] Every §18 case passes, each at the route level as well as in the UI
- [ ] No admin path appears in any public client bundle (once the debug bar is deleted)
- [ ] No stack trace, column name or row id is reachable on any error screen
- [ ] Append-only tables (`session_credit_ledger`, `care_plan_versions`, `communication_flags`, `contact_reveal_log`, `admin_activity_log`, `risk_reviews`, `session_note_revisions`) all refuse update and delete

**UX sign-off**
- [ ] The full booking + payment flow passes at 390 × 844 with no horizontal scrolling
- [ ] Keyboard-only completion of the booking wizard succeeds
- [ ] No hydration warnings in the console on any page
- [ ] Every dashboard offers **Back to Home** in all three sidebar renders

**Documentation**
- [ ] `README.md`, `AGENTS.md` and `CLAUDE.md` describe the shipped behaviour — routes, roles, environment variables, npm scripts, and every documented rule (booking lead time, refund window, payment verification, Meet sync, payout maths)
