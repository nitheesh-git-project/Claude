---

## 5. Test environment requirements

### 5.1 What you need before you start

| Requirement | Value / note |
| --- | --- |
| A **throwaway Supabase project** | Never a project holding real data. The reset in Step 0 truncates every table. |
| `supabase/schema.sql` applied to it | `node scripts/run-schema.mjs`, or push to `main` and let `.github/workflows/schema-apply.yml` run it. Re-apply twice to confirm it is re-runnable. |
| **Supabase Auth → Confirm email = OFF** | The application assumes this. With it on, every sign-up path fails. |
| **Razorpay test-mode keys** | `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` from the Razorpay dashboard in **Test Mode**. Never live keys. |
| `RAZORPAY_WEBHOOK_SECRET` set | Without it `/api/razorpay/webhook` answers `503 {"error":"Webhook not configured"}` and a patient who pays and closes the tab leaves a paid order against an unpaid booking. Webhook tests need it. |
| `ALLOW_DEBUG_DATA_RESET=true` | **Server-side only.** Arms the Reset data button. Never set on a live site. |
| `NEXT_PUBLIC_SHOW_DEBUG_NAV` | Leave unset. The Debug Bar must be visible. |
| Google Calendar credentials | Optional. Without them Meet sync fails and is recorded — which is itself a test (`ADM-SET-031`). |
| The app running with **`npm run dev`** | Not `next start`. The public pages are ISR-cached for 300s, so a production build serves HTML that predates your fixtures. |
| At least one **Master Admin** (`admin_scope = 'full'`) in `profiles` | The reset keeps admin logins and refuses to run if it would leave none. |
| Browsers | Chrome/Edge desktop at 1440×900, plus a mobile viewport at **390 × 844**. |
| Supabase SQL editor access | Only needed for the handful of tests marked **[SQL]**. |

### 5.2 Environments

| Environment | May be reset? | Notes |
| --- | --- | --- |
| Local `npm run dev` against a throwaway Supabase project | **Yes** | The default target for this plan. |
| Staging/preview deployment against a throwaway project | **Yes**, if `ALLOW_DEBUG_DATA_RESET=true` is set there | Public pages are cached; expect ISR delays. |
| **Production / any project with real patients** | **NEVER** | `ALLOW_DEBUG_DATA_RESET` must be unset there, which makes the reset route answer `404`. |

---

## 6. STEP 0 — Reset the test environment

**Run this first, before anything else in this plan.** Every numbered section after this assumes a clean database plus the setup in Section 12 (Execution Order).

### 6.1 Why the database must be reset

Testing this application means filling it with throwaway patients, bookings, purchases and payouts. Several rules in the product are **one-per-thing** rules — one open care plan per patient (published or awaiting the clinic), one pending suggestion per purchase, one open risk signal per rule+subject, a unique Razorpay order id — so leftover rows from a previous run make a correct application look broken. Two known examples:

* A booking test that books a fixed slot leaves the appointment behind; the next run's identical booking is refused as a clash. That refusal is **correct behaviour**, not a defect.
* An audit-log count assertion picks up the previous run's writes.

**If a test fails on a second consecutive run but passes on a fresh one, suspect leftover state before suspecting the application.**

### 6.2 What the reset removes and keeps

The Reset data button calls `/api/admin/debug-reset`, which calls the database function `debug_reset_all_data()`. It is **one atomic `TRUNCATE`**, not a list of deletes.

**Removed:** every appointment, package purchase, home-visit purchase, payment, payment webhook event, payment failure log, entitlement and credit ledger row, session note and revision, pain assessment, condition profile, condition change request and access grant, patient address, medical-document metadata row, admin notes, profile change request, availability template and override, referral, B2B lead, home-visit waitlist, service area, the home-visit package catalog, testimonials, FAQs, intake question templates, payout requests and batches, business expenses, session suggestions, care plans, their versions and the clinic's reviews of them, risk signals and reviews, communication flags, contact reveal log, and the admin activity log. `site_settings` is put back to its defaults. **Every non-admin account is deleted.**

**Kept:**
* **Admin logins** — the function refuses to run if it would leave no admin behind.
* **Detector thresholds** (`risk_rules`) — configuration, like `site_settings`, so it is **reset to its seeded defaults** rather than emptied. Emptying it would silently disable every detector instead of restoring it.
* **The conditions catalogue** — `treatment_categories` and their `treatment_category_packages`. They are the one part of the list an admin builds by hand rather than generates by testing, so emptying them meant retyping the catalogue after every reset and left the public pages showing nothing, which reads as the clinic having shut rather than as test data being cleared. Home-visit packages, service areas, FAQs and testimonials are **not** kept.
* **Objects in the private `medical-reports` Storage bucket.** The metadata rows go; the files do not. Storage is not reachable from SQL. Clear that bucket from the Supabase dashboard if you need the space back.

> **Regression worth knowing about.** An earlier version of this function predated the care-plan, evidence and risk tables and cleared none of them; three were saved by CASCADE, but `communication_flags`, `risk_signals` and `risk_reviews` survived a "delete everything". The one that actually bit a tester was `risk_signals`: it carries a partial unique index allowing at most one **open or reviewing** signal per `(rule, subject)`, so a leftover open signal held the slot and the same rule firing again wrote nothing — an empty Risk queue on a supposedly clean database, which reads exactly like a broken detector. All three are now named in the TRUNCATE list. `SETUP-RESET-001` asserts it.

### 6.3 The four gates (all must pass)

1. `ALLOW_DEBUG_DATA_RESET=true` in the **server** environment. Unset, the route answers **`404`, not `403`** — deliberately, so the route's existence is not confirmed.
2. A signed-in admin.
3. That admin's scope must be `full`.
4. The exact phrase `RESET ALL DATA`, typed by hand.

---

### TEST: `SETUP-RESET-001` — Reset the test environment

| | |
| --- | --- |
| **Feature** | Pre-launch data reset |
| **Role** | Admin (full scope) |
| **Priority** | P0 |

**Purpose.** Bring the database to a known-empty state, and prove all four gates behave.

**Preconditions.** `ALLOW_DEBUG_DATA_RESET=true` in the server environment. A Master Admin account exists.

**Test Data.** Admin: `qa.admin@example.test` / `QaTest!2024pass`. Confirmation phrase: `RESET ALL DATA`.

**Steps**

1. Open `http://localhost:3000/admin/login`.
2. Tap the **Email Address** field. Enter `qa.admin@example.test`.
3. Tap the **Password** field. Enter `QaTest!2024pass`.
4. Tap **Sign In**.
5. Confirm the black **Debug** bar is pinned across the top of the page.
6. In the Debug bar, tap **Reset data**.
7. Read the red warning that appears: *"Deletes people, sessions, purchases, money and settings. Admin logins and your **conditions** (with their programmes) survive — the rest of the catalog does not. No undo."*
8. Tap the confirmation text field (its placeholder reads `RESET ALL DATA`). Enter `reset all data` (lower case, deliberately wrong).
9. Observe the **Reset** button.
10. Clear the field. Enter `RESET ALL DATA` exactly.
11. Tap **Reset**.
12. Wait for the button to stop reading **Resetting…**.

**Expected Result**

* Step 7: the warning text is present and names both survivals explicitly — admin logins and the conditions catalogue.
* Step 9: the **Reset** button is **disabled** (visibly faded) while the typed phrase does not match exactly. A wrong-case phrase never arms the button.
* Step 12: the button returns to normal and a teal confirmation message appears in the bar. No error message. **It states real figures** — *"N accounts deleted, M admins kept"* with N and M non-zero where accounts existed. Two zeroes on a wipe that emptied the database is the bug where the route read `accounts_deleted` for a function returning `deleted_accounts`; it reads as a reset that did nothing.
* **Open `/conditions` afterwards.** Every condition you created is still there, at its price, in its order. The public site must not come back empty.
* The page refreshes. The admin remains signed in — the session is not destroyed.
* Navigating to **People → Patients** shows an empty-state message, not a table of rows.
* Navigating to **Catalog → Conditions** shows no treatment categories.
* Navigating to **Sessions → All Sessions** shows no sessions.
* Navigating to **Settings → Activity Log** shows an empty log (the reset itself truncates it).
* Navigating to **Settings → User Access** still lists at least one admin, and your own row is there. **If this list is empty, stop immediately and restore from backup — the reset must never leave the clinic without an admin.**
* Navigating to **Today → Risk** shows an **empty** queue. **[SQL]** confirm with `select count(*) from communication_flags;` and `select count(*) from risk_signals;` — both must return `0`. A non-zero count here is the regression described above, and it will silently suppress the detector tests later in this plan.
* **[SQL]** `select rule_key, enabled from risk_rules;` still returns the eight rules, with `plan_conversion_low` and `post_consultation_dropout` back to **disabled** — thresholds are restored to their seeded defaults, not wiped.

**Cleanup.** None. This is the starting state for the whole plan.

---

### TEST: `SETUP-RESET-002` — The reset is refused for a non-full admin

| | |
| --- | --- |
| **Feature** | Pre-launch data reset — gate 3 |
| **Role** | Admin (operations scope) |
| **Priority** | P1 |

**Purpose.** Prove that scope, not merely being an admin, gates the wipe.

**Preconditions.** `ADM-SET-026` has created `qa.admin.ops@example.test` with scope **Operations**.

**Steps**

1. Sign out of the full admin account.
2. Sign in at `/admin/login` as `qa.admin.ops@example.test` / `QaTest!2024pass`.
3. In the Debug bar, tap **Reset data**.
4. Enter `RESET ALL DATA` in the confirmation field.
5. Tap **Reset**.

**Expected Result**

* A red error appears in the bar reading exactly: `Only a Master Admin can reset data.`
* No data is deleted. **People → Patients** still lists the same rows as before step 5.
* No `admin_activity_log` row is written for a reset.

**Cleanup.** Sign back in as the full admin.

---

### TEST: `SETUP-RESET-003` — The reset route is invisible when disarmed **[server config]**

| | |
| --- | --- |
| **Feature** | Pre-launch data reset — gate 1 |
| **Role** | Admin (full scope) |
| **Priority** | P1 |

**Purpose.** Prove the route answers `404` (not `403`) when `ALLOW_DEBUG_DATA_RESET` is unset, so its existence is not confirmed to a caller.

**Steps**

1. Stop the dev server. Remove `ALLOW_DEBUG_DATA_RESET` from the environment. Start the dev server again.
2. Sign in at `/admin/login` as the full admin.
3. In the Debug bar, tap **Reset data**, enter `RESET ALL DATA`, tap **Reset**.

**Expected Result**

* The bar shows an error. The browser **Network** tab shows `POST /api/admin/debug-reset` returning **HTTP 404** with body `{"error":"Not found"}`.
* **It must not return 403.** A 403 would confirm the route exists.
* No data is deleted.

**Cleanup.** Restore `ALLOW_DEBUG_DATA_RESET=true` and restart the dev server before continuing.

---

## 7. The Debug Bar and time simulation

### 7.1 What the Debug Bar is

A black bar pinned to the top of **every** page, in **every** environment. It exists because this application is pre-launch. It carries three tools:

| Control | What it does |
| --- | --- |
| **Jump to page** dropdown | Navigates to any of the app's main routes, including the four protected dashboards. Entries 1–8 are the public pages; 9–15b are Get Started, both booking wizards, and each role's login and dashboard. |
| **Simulate now** (`datetime-local` input) + **Set** | Sets a simulated clock. |
| **Reset to Real Time** | Appears only while a simulation is active. Clears it. |
| **Reset data** | The wipe covered in Step 0. |

The right-hand label reads *"Remove this bar before real launch"*. That is the intended end state: the bar is **deleted**, not switched off, because `NEXT_PUBLIC_SHOW_DEBUG_NAV` is a public flag and the bar names `/admin/login` and `/admin/dashboard`.

### 7.2 How the simulated clock actually works — read this before writing a defect

This is the single most misunderstood part of the application, and mis-reading it produces false defects.

**The simulated clock is stored as an OFFSET, not as a fixed target.** When you set "12 September 2026, 18:00", the app stores `target − Date.now()` in `localStorage` under `debugNowOffsetMs`. The simulated clock then keeps **ticking forward at normal speed**. It never freezes.

**It is client-side only.** It affects only client-rendered advisory gates that call `debugNow()` instead of `Date.now()`. It is **deliberately never wired into any server-side or API-route time check.**

| Affected by the simulated clock | NOT affected (uses the server's real clock) |
| --- | --- |
| The `/book` wizard's date calendar and hour list (which dates/times are offered) | `/api/appointments/create`'s lead-time validation |
| The `/book-home-visit` wizard's date/time picker | `/api/home-visit/*` lead-time validation |
| **Tap to Join** / **Session Completed** button states on every dashboard | `/api/appointments/complete-session`'s join-window gate |
| Session card greying and Upcoming/Past bucketing in the browser | Refund-eligibility maths in `/api/appointments/cancel` |
| The therapist's own suggestion picker | `/api/therapist/suggest-session`'s lead-time check |
| | Payout maths, `completed_at` stamping, audit timestamps, `paid_at` |

**The practical consequence, stated plainly:** you can use the simulated clock to make the *UI offer* a slot or a button. You cannot use it to make the *server accept* a time-gated write. If you simulate a date far in the future and then try to complete a session, the client will show you the **Tap to Join** control and the server will still answer `409` with *"You can mark this done once the session's join window has opened."* **That is correct behaviour, not a defect.** Tests that need a server-side time gate to pass say so explicitly and tell you to use a real near-future slot instead.

Because the storage key is `localStorage`, the simulation is **per browser profile**, and it survives navigation and reload until you reset it. Applying it triggers a **full page reload** — soft re-renders would not pick it up, because every consumer reads the clock once in a lazy initializer.

### 7.3 How to use it

**To set a simulated time**

1. Tap the **Simulate now** field in the Debug bar.
2. Type or pick the date and time **in your browser's local timezone** (the field is `datetime-local`, so it is not UTC).
3. Tap **Set**.
4. The page reloads. A **Reset to Real Time** button appears beside the field.

**To verify the app is using simulated time** (do this before every time-dependent test)

1. After Step 4 above, navigate to `/book`.
2. Look at the Step 1 calendar. The month shown and the highlighted "today" cell must match your simulated date, not the real date.
3. Alternatively, open the browser console and run `localStorage.getItem('debugNowOffsetMs')`. A non-zero number means a simulation is active. `null` means real time.

**To reset**

1. Tap **Reset to Real Time**. The page reloads and the button disappears.
2. Confirm `localStorage.getItem('debugNowOffsetMs')` returns `null`.

> **Always reset to real time at the end of a time-simulation test.** A left-over offset silently changes every later test's calendar and every join-button state, and the failures it produces look like product bugs.

### 7.4 Standard simulated-time scenarios

These are referenced by ID throughout the plan.

| Scenario | Simulate | What it is for | Related tests |
| --- | --- | --- | --- |
| **TIME-A** | `2026-09-10 10:00` | Baseline booking. Online lead time is 12h, so the earliest offered slot is 10 September 22:00. | `PAT-BOOK-002`, `PAT-BOOK-003` |
| **TIME-B** | `2026-09-12 18:00` | Same rules, different day-of-week and a later hour, so the boundary lands on the *next* day. Proves the boundary is computed, not hardcoded. | `PAT-BOOK-004` |
| **TIME-C** | `2026-09-10 23:30` | Late-night boundary: no slot remains today, so the calendar's earliest bookable date must roll to 11 September. | `PAT-BOOK-005` |
| **TIME-D** | Real clock + 24h ahead of a home-visit slot | Home-visit lead time defaults to 24h — longer than online. Proves the two lead times are separate settings. | `PAT-HV-003` |
| **TIME-E** | 10 minutes **before** a confirmed session's slot | The join window opens `join_window_minutes` (default 15) before the slot. **Tap to Join** must be live. | `THR-SESS-004`, `PAT-SESS-005` |
| **TIME-F** | 90 minutes **after** a confirmed session's slot | Past `session_completed_after_minutes` (default 60). Every join control on every surface must read **Session Completed**. | `XR-CUTOFF-001` |
| **TIME-G** | 30 hours before a paid session's slot | Outside the 24h cancellation window → full refund path. | `PAT-CANCEL-001` |
| **TIME-H** | 2 hours before a paid session's slot | Inside the 24h window → no refund, and the confirm dialog must say so. | `PAT-CANCEL-002` |

---

### TEST: `DBG-TIME-001` — The simulated clock changes what the booking picker offers

| | |
| --- | --- |
| **Feature** | Debug Bar — time simulation |
| **Role** | Public (no sign-in needed) |
| **Priority** | P1 |

**Purpose.** Prove the simulation is applied, is an offset (not a freeze), and is reversible.

**Steps**

1. Open `/book` with no simulation active. Note the earliest date highlighted in the Step 1 calendar and the first hour offered. Write both down.
2. In the Debug bar, set **Simulate now** to `2026-09-10T10:00` (scenario TIME-A). Tap **Set**.
3. After the reload, open `/book`.
4. Note the calendar month, the "today" cell, and the first hour offered.
5. Open the browser console and run `localStorage.getItem('debugNowOffsetMs')`.
6. Wait 60 seconds. Reload `/book`. Note the first offered hour again.
7. Tap **Reset to Real Time**.
8. Open `/book` again.

**Expected Result**

* Step 4: the calendar shows **September 2026**, the "today" cell is **10**, dates before 10 September are not selectable, and the earliest selectable slot is **10 September 2026 at 22:00** — twelve hours after the simulated now, matching the 12-hour online booking lead time.
* Step 5: returns a non-zero numeric string.
* Step 6: the offering is **not frozen**. The clock advanced by roughly a minute, so the picker's boundary has moved forward too (at a minute's granularity you will usually see the same 22:00 hour offered, but the *underlying* now has advanced — confirm by re-reading the "today" cell and by the fact that at a 23:00+ simulated time the day rolls over, per TIME-C).
* Step 8: the calendar returns to the real current month and the values you wrote down in step 1.
* At no point does any figure change on an **admin** money screen or an appointment's stored `slot_time` — the simulation is display/advisory only.

**Cleanup.** Confirm `localStorage.getItem('debugNowOffsetMs')` is `null`.

---

### TEST: `DBG-NAV-001` — Jump to page reaches every listed route

| | |
| --- | --- |
| **Feature** | Debug Bar — route jump |
| **Role** | Any |
| **Priority** | P2 |

**Purpose.** Smoke-test that every route in the dropdown renders without a crash, and that the protected ones enforce their gate.

**Steps**

1. Sign out completely (clear cookies or use a private window).
2. Open `/`.
3. Tap the **Jump to page** dropdown. Select each entry in turn, from `1. Home` to `15b. Partner Dashboard (protected)`.
4. After each, note the resulting URL and whether the page renders content or an error screen.

**Expected Result**

* Entries 1–8 (the eight public marketing pages) render normally — **except** `4. Home visit`, which shows a **404** page while the admin master switch `home_visit_enabled` is off. That 404 is correct and is the point of including the entry.
* `9. Get Started Hub`, `10. Booking Enquiry`, `10b. Home Visit Booking`, `11/12/14/15` login pages all render.
* Every entry ending in `b` (the four protected dashboards) redirects a signed-out visitor to that role's own login page: `/patient/login`, `/therapist/login`, `/admin/login`, `/hospital/login`.
* No entry produces a blank page, an unhandled error screen, or a stack trace.

**Cleanup.** None.
