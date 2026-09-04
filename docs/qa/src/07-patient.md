---

## 11. Patient test plan

### 11.0 Feature guide — the patient's world

A patient's journey is: **register → get approved (or auto-approve by paying) → book a consultation → pay → attend → receive a recommendation → accept and pay for a programme → spend its credits session by session**, with a **Health Profile** running alongside that the therapist opens first and the patient then maintains.

Two rules shape almost everything on the patient's screens:

1. **A screen that can only ever be empty is not in the sidebar.** Your Sessions, Your Packages, Payments and Suggested Sessions appear only once the patient actually has one. **Book a Session is the deliberate exception** — always shown, because that is how a patient gets their first of anything.
2. **The patient is read-only on their own Health Profile until a therapist writes the first record.** While locked, the "answer your questions" call to action and the answered counter are **absent, not disabled**; the dashboard banner is dropped rather than recoloured; the overview cell reads `—` on slate rather than `0%` on amber. The **reports uploader stays open**, because it is the one useful thing a patient can do beforehand.

---

### 11.1 Registration, login, approval

#### `PAT-AUTH-001` — Sign in as an existing patient · P0

**Feature.** Patient authentication. **Role.** Patient.
**Purpose.** Confirm the login form authenticates and lands on the dashboard.
**Preconditions.** Patient A exists and is approved and active (created by `PAT-BOOK-003` or `PAT-AUTH-002`).
**Test Data.** `qa.patient.a@example.test` / `QaTest!2024pass`.

**Steps**
1. Open `/patient/login`.
2. Confirm the two tabs **Sign In** and **Register Account** are visible, with **Sign In** active.
3. Tap the **Email Address** field. Enter `qa.patient.a@example.test`.
4. Tap the **Password** field. Enter `QaTest!2024pass`.
5. Tap **Sign In**.

**Expected Result.** The button reads `Signing in...` while working. The browser navigates to `/patient/dashboard`. The sidebar shows **Overview**, **Book a Session**, **Health Profile** and **Edit Profile** at minimum, with **Back to Home** at the **foot of the nav, directly above Collapse** (above the profile footer in the mobile drawer, which has no Collapse). The public `Navbar` is **not** rendered on the dashboard. No error banner.
**Cleanup.** Stay signed in for `PAT-DASH-001`.

#### `PAT-AUTH-002` — Register a patient account from `/patient/register` · P0

**Purpose.** Prove standalone registration always waits for a human admin — the payment-attempt auto-approval does **not** apply here.
**Test Data.** Patient B from §8.3.

**Steps**
1. Open `/patient/login`. Tap **Register Account**.
2. Tap **Full Name**. Enter `QA Patient B`.
3. Tap **Email Address**. Enter `qa.patient.b@example.test`.
4. Tap the phone field. Enter `+91 98765 43211`.
5. Tap **Password**. Enter `QaTest!2024pass`.
6. Tap **Confirm Password**. Enter `QaTest!2024pass`.
7. Leave **Referral Code** blank.
8. Tap **Create Account**.

**Expected Result.** The button reads `Creating account...`, then the browser lands on **`/pending-approval`** — **not** the dashboard, and **not** any "check your email" screen. The page explains the account is waiting for approval. In Supabase, the `profiles` row exists with `role='patient'`, `approved=false`, `active=true`, and a `patient_code` of the form `PT####`.
**Cleanup.** Leave. `ADM-APPR-001` approves this account.

#### `PAT-AUTH-003` — An unapproved patient cannot reach the dashboard · P0

**Preconditions.** `PAT-AUTH-002` complete; Patient B not yet approved.
**Steps**
1. Signed in as Patient B, type `/patient/dashboard` directly in the address bar and press Enter.
2. Then call the API directly. In a terminal, with Patient B's session cookie: `curl -i -X POST http://localhost:3000/api/appointments/create -H 'Content-Type: application/json' -b '<patient B cookie>' -d '{"slotTime":"2026-12-01T10:00:00.000Z"}'`

**Expected Result.** Step 1 redirects to **`/pending-approval`**. Step 2 returns **HTTP 200** and creates a `requested`/`unpaid` appointment — this is correct: `/api/appointments/create` gates on `isProfileActive`, **not** approval, because an unapproved self-signup patient must be able to hold the row they are about to pay for. It grants nothing on its own. **What must be refused is a suspended account** — see `SEC-AUTH-006`.
**Cleanup.** Delete the stray appointment from Sessions → All Sessions, or leave it as a fixture for `ADM-SESS-002`.

#### `PAT-AUTH-004` — Registration validation (negative) · P1

**Steps.** On `/patient/login` → **Register Account**, attempt **Create Account** once for each row, resetting the form between attempts:

| Attempt | Field changed | Value | Expected message |
| --- | --- | --- | --- |
| 1 | Email | `not-an-email` | An invalid-email message; the account is not created |
| 2 | Password | `abc12` | A minimum-length message; not created |
| 3 | Confirm Password | `QaTest!2024pas` | A passwords-do-not-match message; not created |
| 4 | Phone | `12345` | An invalid-phone message; not created |
| 5 | Referral Code | `ZZZZZZ` | `Code not recognized — double-check it or leave blank` in red |
| 6 | Email | `qa.patient.a@example.test` (already registered) | A "user already registered" style error from Supabase; **no second profile row is created** |

**Expected Result.** In every case the form stays on screen with the entered values intact, the message is human-readable, and **no stack trace, database column name or row id appears anywhere on screen**.

#### `PAT-AUTH-005` — Sign out · P2

**Steps.** From `/patient/dashboard`, tap the sign-out control in the sidebar/header. **Expected Result.** The session ends, the browser lands on a public page, and a farewell banner shows for the admin-configured number of seconds (`farewell_banner_seconds`, default 6; `0` means until dismissed). Navigating back to `/patient/dashboard` now redirects to `/patient/login`.

#### `PAT-AUTH-006` — Forgot password · P2

**Steps.** On `/patient/login` tap **Forgot password**, enter `qa.patient.a@example.test`, tap **Send Reset Link**. **Expected Result.** The button reads `Sending...`, then a confirmation appears. A **← Back to Sign In** link returns to the form. (Delivery cannot be checked with a `.test` address — verify the request succeeded and that the reset landing page `/reset-password` renders.)

---

### 11.1a The dashboard landing screens

The patient portal's Overview is the screen a patient lands on after every sign-in, and the one that answers "how am I doing / what needs me / what do I do next" in that order — a strip of four figures, the activity feed, then quick actions. It is assembled by `loadPatientDashboard()`, so every figure on it is derived from rows the same loader already read: none of it can disagree with the screen it links to. The booking hub under **Book a Session** is the portal's own front door to the two things a patient may buy directly — **one** video consultation, or **one** visit at home.

#### `PAT-DASH-001` — The patient Overview · P1

**Feature.** Patient dashboard Overview (`/patient/dashboard`). **Role.** Patient.
**Purpose.** Confirm the four figures, the feed, the quick actions and the conditional banners render, that every figure links to rows that agree with it, and that the first-visit tour appears exactly once.
**Preconditions.** Signed in as Patient A (`PAT-AUTH-001`). Run this **twice**: once immediately after `PAT-AUTH-002`/`PAT-BOOK-003` (nothing completed yet) and once after `THR-SESS-005` has completed a session, so both the empty and the populated shapes are seen.
**Test Data.** None entered.

**Steps**
1. Open `/patient/dashboard`.
2. On a brand-new account only: read the welcome tour that opens over the screen. Confirm it reads `1 of N`, has **Skip**, **Next** and (from step 2) **Back**, and that the highlighted ring sits over the sidebar entry each step names.
3. Tap **Next** until the last step, then tap **Done**.
4. Reload the page.
5. Read the header: `Welcome back, QA Patient A` with `Your virtual physical therapy dashboard` under it.
6. Read the four figures across the strip, left to right.
7. Tap the **Next session** figure.
8. Tap the browser's Back button, then tap the **Package sessions left** figure.
9. Tap Back again. Read the activity feed under the strip.
10. Read the four quick actions at the foot: **Book a session**, the health-profile action, **Your sessions**, **Your payments**.

**Expected Result.**
* The tour appears **only on the first visit**. Step 3 writes `profiles.onboarding_seen_at` through `/api/patient/dismiss-onboarding`, so the reload at step 4 shows no tour, and it never returns. **Skip** does the same thing as **Done** — both dismiss it permanently.
* The strip reads: **Next session** (date + time and the therapist's name, or `—` with `Nothing booked yet`), **Sessions done** (count, `Your history builds up here` at zero), **Package sessions left** (count, `You don't own a package yet` when there are none), and **Health profile**.
* **Health profile before the therapist's first record reads `—` on a slate accent** with `Your therapist fills this in at your first session` — **not** `0%` on amber. An amber zero here is the `PAT-HP-001` defect: it asserts the patient is behind on something nobody has asked them for.
* Step 7 navigates to `/patient/dashboard/sessions`; step 8 to `/patient/dashboard/packages`. Every figure is a link and lands on the rows it counted.
* With no history the feed reads `Bookings, payments and health-profile updates show up here as they happen.` Once there is history, items still waiting on the patient (`needsYou`) are **pinned above** everything else regardless of date, and no single title repeats more than the cap allows.
* The health-profile quick action changes wording with state: `See your health profile` / `Your therapist fills this in at your first session` while locked, `Finish your health profile` / `N questions left, about 2 minutes` while partly answered, `Review your health profile` while complete.
* **Conditional banners.** While the profile is the patient's to write and unfinished, an amber banner reads `You're N of M questions into your health profile.` (or the `Add to your health profile…` wording at zero) with a progress bar and `Finish it →`. While a recommendation or a proposed time is waiting, a teal card reads `Your therapist has recommended a programme` or `Your therapist has proposed a time` and links to `/patient/dashboard/suggested` — the cards themselves live there, never duplicated here.
* If invites are enabled (`ADM-SET-023`'s neighbour, `invite_rewards_enabled`), the invite card renders **below** the overview, never as a banner over it, and its claim field is gone once any session has been paid for.
* No console error. No horizontal scroll at 390 × 844.
**Cleanup.** None. Stay signed in.

#### `PAT-DASH-002` — The booking hub inside the portal · P1

**Feature.** `/patient/dashboard/book`. **Role.** Patient.
**Purpose.** Prove the portal's booking hub offers exactly the two things a patient may buy directly, and nothing that must come from a recommendation.
**Preconditions.** `SETUP-CAT-001` has created the three categories. For the home-visit half: `ADM-SET-013` on, `SETUP-AREA-001` and `SETUP-HVPKG-001` done (HV1 = 1 visit, HV2 = 4 visits).
**Test Data.** None entered.

**Steps**
1. In the sidebar tap **Book a Session**.
2. Read the two group headings and their blurbs.
3. Read every card under **Single online consultation**.
4. Read every card under **Home visits**.
5. Tap the card titled `QA Back & Spine Care`.
6. Tap the browser's Back button, then tap the HV1 card.
7. Return to `/patient/dashboard/book`. Ask an admin to switch **Home Visit** off (`ADM-SET-013`), then reload this screen.

**Expected Result.**
* Heading **Book a Session**, subtitle `Video consultations and home visits, in one place.`
* Group 1 is `Single online consultation` — `One video session with a therapist, booked for a specific concern.` One card per **active** treatment category, each showing its title, description, `N min · online` and its consultation price.
* Group 2 is `Home visits` — `A therapist comes to you. We'll check your pincode before anything is charged.` **HV1 (1 visit) appears. HV2 (4 visits) does not.** A multi-visit home package is a programme and comes from a care plan; if HV2 is on this screen that is the P0 `PAT-HV-005` defect. Each card carries `Single visit · N min at home` and either `Travel included` or `Travel charged separately, by area`.
* **No session package (programme) appears anywhere on this screen**, at any price, with or without a Buy control.
* Step 5 navigates to `/book?category=<id>` with that category preselected. Step 6 navigates to `/book-home-visit?package=<id>`.
* After step 7 the **Home visits** group is **absent** entirely and the sidebar's home-visit affordances go with it. With no categories **and** no home-visit packages the whole card reads `Nothing is available to book right now — please check back shortly.`
**Cleanup.** Switch **Home Visit** back on if later home-visit tests follow.

---

### 11.2 The booking wizard — happy paths

#### `PAT-BOOK-001` — Reach the wizard from the public site · P1

**Steps**
1. Open `/`.
2. Tap **Book a session** in the header (or the **Book now** card in the connector grid at the foot of the page).
3. Observe the URL and the wizard header.

**Expected Result.** The URL is `/book`. The dark header reads **Step 1 of 3** and **Book Virtual Physical Therapy Session**. Because no concern is chosen yet, the subtitle reads *"HD Video Call & Custom Rehab Plan — pricing shown once you pick a concern"*.

#### `PAT-BOOK-002` — Step 1 auto-picks and the lead-time boundary (scenario TIME-A) · P0

**Preconditions.** `SETUP-CAT-001` has created the three treatment categories. Online lead time is the default 12 hours.
**Test Data.** Simulate `2026-09-10T10:00`.

**Steps**
1. In the Debug bar set **Simulate now** to `2026-09-10T10:00` and tap **Set**.
2. After the reload, open `/book`.
3. Read the calendar: note the month heading, which day is marked as today, and which day cells are greyed.
4. Read the hour chips: note the first one offered.
5. Read the language chips: note which one is selected.
6. Tap the day cell **11**.
7. Read the hour chips again.
8. Tap the hour chip **09:00**.
9. Tap **Continue**.

**Expected Result**
* Step 3: heading `September 2026`; **10** is today; every cell before 10 is greyed and not tappable.
* Step 4: the earliest offered hour on 10 September is **22:00** (10:00 + 12h). Hours before 22:00 are absent or disabled. A "we picked this for you" hint marks the auto-chosen date, hour and language.
* Step 5: the first admin-configured booking language is selected — `English` by default.
* Step 7: after moving to 11 September, the **full** hour list is offered (every hour on 11 September clears a 12h lead time from 10:00 on the 10th), and the hour has been **re-preselected to that day's earliest**, not carried over from 22:00.
* Step 9: the wizard advances to **Step 2 of 3**. **No appointment exists yet, no account is created, and nothing is charged.**

**Cleanup.** Stay in the wizard for `PAT-BOOK-003`.

#### `PAT-BOOK-003` — Guest books and pays successfully (the main journey) · P0

**Purpose.** The single most important path in the application: a brand-new visitor becomes a paying patient with a booked session.
**Preconditions.** `PAT-BOOK-002` left the wizard on Step 2 with 11 September 2026 09:00 and `English` selected. Razorpay test keys configured.
**Test Data.** Patient A from §8.3. Payment: UPI `success@razorpay`.

**Steps**
1. Tap **Full Name**. Enter `QA Patient A`.
2. Tap **Email**. Enter `qa.patient.a@example.test`.
3. Tap **Create Password**. Enter `QaTest!2024pass`.
4. Tap the phone field. Enter `+91 98765 43210`.
5. Tap **Confirm Password**. Enter `QaTest!2024pass`.
6. Leave **Referral Code** blank.
7. Tap the **What would you like help with?** dropdown. Select `QA Back & Spine Care — ₹1,999 / 60 min`.
8. Tap the **Anything else we should know?** box. Enter `Desk job, pain worse after sitting all day. Goal: sit through a full workday.`
9. Tap the telehealth consent checkbox.
10. Tap **Review Booking →**.
11. On Step 3, read every summary row.
12. Tap **Request Booking**.
13. When the Razorpay checkout opens, choose **UPI**. Enter `success@razorpay`. Submit and complete the simulated approval.
14. Wait for the checkout to close.

**Expected Result**
* Step 10: the wizard advances to **Step 3 of 3**. The dark header subtitle now reads `₹1,999 INR • 60-Min HD Video Call & Custom Rehab Plan`.
* Step 11: **Name** `QA Patient A`; **Email** `qa.patient.a@example.test`; **Preferred Time** 11 September 2026, 09:00, in local format; **Language** `English`; **Concern** `QA Back & Spine Care`; **Session Fee** `₹1,999 INR`. Two notices are present: the Razorpay/secure line and *"Free cancellation up to 24 hours before your slot. Cancelling within 24 hours of the slot isn't eligible for a refund."*
* Step 12: the button shows `Please wait...`; the Supabase account is created and signed in **with no email-confirmation step**; the appointment is created; Razorpay checkout opens.
* Step 14: Step 3 is replaced by a green tick, **Payment Confirmed**, the sentence about confirming the slot and sending the link, and a **Go to Dashboard** button.
* **Data state:** exactly **one** appointment for Patient A — `status='requested'`, `payment_status='paid'`, `therapist_id=null`, `visit_mode='online'`, `duration_minutes=60`, `concern='QA Back & Spine Care'`, `preferred_language='English'`, timezone recorded. Exactly **one** `payments` row for that Razorpay order. Patient A's `approved` is now **true** (flipped by `create-order`).
* **Cross-role:** Admin → Sessions → All Sessions lists it as unassigned and raises the badge; Admin → Money → Transactions lists the ₹1,999 payment; **no therapist sees it yet**.

**Cleanup.** Leave everything. This is the root fixture for most of the plan.

#### `PAT-BOOK-004` — The lead-time boundary is computed, not hardcoded (scenario TIME-B) · P1

**Steps.** Simulate `2026-09-12T18:00`, tap **Set**, open `/book`.
**Expected Result.** Today is **12** September. The earliest bookable slot is **13 September at 06:00** — 18:00 + 12h is 06:00 the next day, and no hour remains on the 12th. The 12th is either fully greyed or offers no hour chips; the 13th is preselected.
**Cleanup.** Reset to real time.

#### `PAT-BOOK-005` — Late-night rollover (scenario TIME-C) · P1

**Steps.** Simulate `2026-09-10T23:30`, open `/book`.
**Expected Result.** The earliest bookable date is **11 September** (23:30 + 12h = 11:30 on the 11th, so the 11th's later hours qualify while the 10th has none left). The 10th is greyed. The auto-picked hour is the 11th's earliest hour at or after 12:00.
**Cleanup.** Reset to real time.

#### `PAT-BOOK-006` — A signed-in patient books again · P1

**Preconditions.** Patient A signed in, with at least one completed session so a previous therapist exists.
**Steps.** Open `/book`, complete Step 1, and read Step 2.
**Expected Result.** Step 2 shows a teal strip *"Booking as **QA Patient A** (qa.patient.a@example.test)"* and **no** name/email/password/phone/referral fields. A **"Continue with the same therapist?"** dropdown appears, defaulting to `No preference — any available specialist` and listing `QA Therapist A`. The consent checkbox and concern dropdown are still required.

#### `PAT-BOOK-007` — Booking a named specialist from `/team` · P1

**Steps**
1. Open `/team`.
2. Tap the card for `QA Therapist A`.
3. In the popup, tap the **Book with …** action.
4. Read the URL, then advance to Step 2.

**Expected Result.** The URL is `/book?therapist=<uuid>`. On Step 2 a teal panel reads **Requested: QA Therapist A**, their credentials beneath, and the sentence *"We'll book you with them if they're free at your chosen time. If not, another specialist takes the session and you'll see who before it starts."* It has a **Remove** button. The "Continue with the same therapist?" dropdown is **hidden** while this panel is shown.
It must **never** be worded as a confirmed booking with that therapist.

> **Environment note.** This resolution happens **in the browser** against `public_therapist_profiles`, because `/book` is ISR-cached. In a sandbox whose Chromium has no outbound network, the chip never renders and this test fails on a working feature. Check first: run `fetch(location.origin)` and then a direct fetch of `<SUPABASE_URL>/rest/v1/` from the page console. "Failed to fetch" there, with the same call succeeding from Node, means the environment — not the feature.

#### `PAT-BOOK-008` — A hidden or suspended therapist link degrades silently · P2

**Preconditions.** An admin has switched `QA Therapist C`'s **Show on team** off (or suspended them).
**Steps.** Open `/book?therapist=<Therapist C uuid>`, advance to Step 2.
**Expected Result.** **No** requested-therapist panel appears; the booking proceeds normally with no preference attached. No error is shown. A hand-typed or stale link must never fail a booking.

---

### 11.3 The booking wizard — negative, boundary and duplicate

#### `PAT-BOOK-010` — Step 1 validation · P1

| Attempt | Action | Expected message |
| --- | --- | --- |
| 1 | Deselect the language (if the UI allows) and tap **Continue** | `Please select a preferred language.` |
| 2 | Hand-edit the URL/state to an in-the-past slot and tap **Continue** | `Please choose a time at least 12 hours from now.` |

**Expected Result.** In both cases the wizard stays on Step 1 and no appointment exists.

#### `PAT-BOOK-011` — Step 2 validation, in order · P1

Attempt **Review Booking →** once per row, as a guest:

| # | Missing/invalid | Expected message |
| --- | --- | --- |
| 1 | Name blank | `Please fill in your name, email, and a password (min 6 characters).` |
| 2 | Password `abc12` | same as above |
| 3 | Email `not-an-email` | `Please enter a valid email address.` |
| 4 | Phone `12345` | `Please enter a valid phone number.` |
| 5 | Confirm password mismatched | `Passwords do not match. Please re-enter them.` |
| 6 | Referral code `ZZZZZZ` (blurred, shown invalid) | `That referral code isn't recognized. Please double-check it or clear the field to continue without one.` |
| 7 | No concern selected | `Please select what you'd like help with.` |
| 8 | Consent unticked | `Please agree to the telehealth consent terms to continue.` |

**Expected Result.** Each message appears in the red banner at the top of the card, the entered values survive, and the wizard does not advance. **No account and no appointment is created by any failed attempt.**

#### `PAT-BOOK-012` — Overlapping booking is refused (client and server) · P0

**Preconditions.** Patient A already has a `requested` or `confirmed` session at 11 September 2026 09:00, 60 minutes.
**Steps.** Signed in as Patient A, book the **same** slot again through `/book` and tap **Request Booking**. Then repeat the attempt directly against the API with Patient A's cookie and the same `slotTime`.
**Expected Result.** Both refuse with: `You already have a session scheduled around this time. Please pick a different slot, or check your dashboard for existing bookings.` The API returns **409**. **No second appointment row is created.** (The client check exists for fast feedback; the server check is the one that binds.)

#### `PAT-BOOK-013` — An inactive category is refused server-side · P1

**Steps**
1. Load `/book` and select `QA Knee & Joint Care` on Step 2, but do **not** submit.
2. In a second browser as Admin Full, open Catalog → Conditions and set `QA Knee & Joint Care` to inactive.
3. Return to the wizard and tap **Request Booking**.

**Expected Result.** The booking is refused with `That concern isn't available any more. Please pick another one.` (HTTP 409). No appointment is created. This proves the route re-derives the category rather than trusting the ISR-cached page.
**Cleanup.** Re-activate the category.

#### `PAT-BOOK-014` — A stale `?package=` link is answered, not ignored · P0

**Steps.** Open `/book?package=00000000-0000-0000-0000-000000000000`.
**Expected Result.** Instead of the wizard, a panel headed **"Programmes come from your therapist now"** with the explanation *"A course of treatment is arranged by your therapist after they've seen you… Book a first session and they'll recommend the right programme."* and a **Book a first session** link to `/book`. **The wizard must not silently sell one session to somebody who came to buy six.**

#### `PAT-BOOK-015` — Refresh mid-wizard loses no money and creates nothing · P2

**Steps.** Complete Steps 1 and 2, reach Step 3, then press **F5**.
**Expected Result.** The wizard restarts at Step 1 with fresh auto-picks. No appointment exists (none was created — creation happens on **Request Booking**). No charge.

#### `PAT-BOOK-016` — Back from Step 3 abandons the draft cleanly · P2

**Steps.** Reach Step 3, tap **Request Booking**, dismiss the Razorpay modal, then tap **Back**.
**Expected Result.** The wizard returns to Step 2. The primary button on Step 3 reads **Request Booking** again (not "Pay … Now"), and the failed-attempt counter is reset. The unpaid appointment created by the first attempt **remains** in the patient's dashboard with a **Pay ₹1,999 Now** button — it is not deleted, and a second **Request Booking** creates a *second* appointment only if the slot does not overlap the first (it will overlap, so it is refused — see `PAT-BOOK-012`).

#### `PAT-BOOK-017` — Double-tap on Request Booking · P0

**Steps.** On Step 3, tap **Request Booking** twice in rapid succession (double-click).
**Expected Result.** The button disables on the first tap (`Please wait...`). Exactly **one** appointment row exists afterwards. Exactly **one** Razorpay order is minted.

---

### 11.4 Payment outcomes from the patient's side

#### `PAT-PAY-001` — Payment fails, then retries successfully · P0

**Steps**
1. Book a fresh consultation as Patient A for 12 September 2026 10:00, `QA Knee & Joint Care`.
2. On Step 3 tap **Request Booking**.
3. In the checkout choose **UPI**, enter `failure@razorpay`, submit.
4. Read the wizard.
5. Tap **Pay ₹1,799 Now**.
6. This time enter `success@razorpay` and complete.

**Expected Result**
* Step 4: an error banner appears; the primary button now reads **Pay ₹1,799 Now**; the appointment already exists as `requested`/`unpaid`.
* Step 6: **Payment Confirmed** panel. **Still exactly one appointment.** The `payments` table has one row for the successful order. A failed attempt is logged (`payment_failure_log`) and appears nowhere on a patient screen.
* Money → Transactions shows **₹1,799 once**, not twice.

#### `PAT-PAY-002` — Dismissing the checkout · P1

**Steps.** Tap **Request Booking**, then close the Razorpay modal with its ✕.
**Expected Result.** `Payment was not completed. You can try again below.` The button reads **Pay … Now**. The unpaid appointment is visible at `/patient/dashboard/sessions` under Upcoming with a **Pay … Now** button.

#### `PAT-PAY-003` — Reassurance on the first failure, escape hatch on the third · P1

**Steps.** Fail or dismiss the payment **once** and read the card. Then fail it twice more.
**Expected Result.** After the **first** failure a slate panel reads *"Nothing was lost — your booking is saved and still held as unpaid. You can try again above, or pay later from your dashboard."* A patient whose card was declined has no other way of knowing the booking survived, and the likeliest next action is closing the tab.
After the third, that line is replaced by an amber panel: *"Having trouble paying? Your booking is saved as pending — you can come back and pay any time from your dashboard."* with a **Go to Dashboard →** link. Following it lands on `/patient/dashboard` with the session listed as unpaid. **The patient is not bounced to `/pending-approval`** — the first genuine attempt already approved them.

#### `PAT-PAY-004` — Abandon then pay from the dashboard · P0

**Steps.** Create an unpaid booking, close the tab, sign in again, go to **Your Sessions**, tap **Pay ₹… Now** on that row, and complete with `success@razorpay`.
**Expected Result.** The same appointment becomes paid. No second appointment. The dashboard row's **Pay** button is replaced by the session's normal state. One `payments` row.

#### `PAT-PAY-005` — Retry after the order was already captured · P1

**Purpose.** Prove `create-order` re-checks a prior order rather than minting a second one.
**Steps.** Pay successfully, then (before the page updates) tap **Pay … Now** again, or reload and tap it.
**Expected Result.** The route finds the prior order already `paid` at Razorpay, claims the appointment as paid, and returns a message saying the booking is already paid rather than opening a second checkout. **No second Razorpay order id is written to the appointment.**

---

### 11.5 Home visit (patient)

> **Preconditions for this whole sub-section:** `ADM-SET-013` has switched **Home Visit enabled** on, `SETUP-AREA-001` has created Area 1 (`560038`, ₹150/visit), and `SETUP-HVPKG-001` has created HV1 (1 visit) and HV2 (4 visits).

#### `PAT-HV-001` — The public home-visit page appears only when enabled · P1

**Steps.** With the master switch **off**, open `/home-visit`. Then switch it on in Settings → Programmes & Home Visits → Home Visit and reload.
**Expected Result.** Off: a **404** page, and the **Home visit** entry is absent from the header nav, the footer Explore column, the home page connector grid and every "Where to go next" strip. On: the page renders with the admin-configured heading and subheading, and the entry reappears everywhere.

#### `PAT-HV-002` — Serviceable pincode → address → book and pay · P0

**Test Data.** Pincode `560038`; address from Patient A §8.3.

**Steps**
1. Open `/book-home-visit`. Confirm the header reads **Step 1 of 4**.
2. Tap the **Pincode** field. Enter `560038`.
3. Tap **Check**.
4. Read the confirmation line.
5. Fill the address form: Address line 1 `12, 3rd Cross, Indiranagar`; line 2 `Near Metro Station`; City `Bengaluru`; State `Karnataka`; PIN `560038`.
6. Tap **Continue**.
7. On **When suits you?** pick a date at least 24 hours out and an arrival time.
8. Tap **Continue**.
9. On **About you**, choose the package `QA Home Visit — Single — 1 visit` and complete the identity fields (or confirm the "booking as" strip if signed in).
10. Tap **Continue**.
11. On **Review and pay**, read every line of the price breakdown.
12. Choose **Pay online**, tap the pay button, and complete with `success@razorpay`.

**Expected Result**
* Step 4: a teal line — *"Yes — we visit Indiranagar, Bengaluru. Travel to this area is ₹150 per visit."*
* Step 7: the copy states home visits need at least **24 hours'** notice (the `home_visit_lead_time_hours` setting, deliberately longer than the online 12).
* Step 11: the breakdown shows **programme price**, **travel**, and **total** as three separate figures — `₹2,499` + `₹150` = `₹2,649`. **The button must charge exactly the total shown.** Quoting one figure and charging another is a P0 defect.
* Step 12: a confirmation screen. A `home_visit_package_purchases` row exists with `payment_mode='online'`, `payment_status='paid'`, `travel_fee_paise=15000`, a `default_address_id`, and a **snapshot** of the package.
* The visit's address is **snapshotted onto the appointment** (`visit_address_*`), not referenced live — editing the saved address later must not rewrite a delivered visit.

#### `PAT-HV-003` — Unserviceable pincode → waitlist · P1

**Steps.** Open `/book-home-visit`, enter `560025`, tap **Check**. Then enter `QA Patient B` and `+91 98765 43211` and tap **Tell me when you do**.
**Expected Result.** An amber panel: *"We don't visit 560025 yet."* plus *"Leave your number and we'll tell you the moment we do. Nothing has been charged."* No address form appears and no package can be chosen. After submitting: *"Thanks — we'll be in touch."* The panel also offers a link to an **online consultation**, which is available anywhere. Admin → Catalog → Service Areas shows the waitlist entry, and its badge count increases.

#### `PAT-HV-004` — Pincode validation · P2

| Value | Expected |
| --- | --- |
| `56003` | `Enter a valid 6-digit pincode.` |
| `0560038` | `Enter a valid 6-digit pincode.` (must not start with 0) |
| `abcdef` | `Enter a valid 6-digit pincode.` |
| *(blank)* | The **Check** button does nothing harmful; a validation message appears |

#### `PAT-HV-005` — A multi-visit home package cannot be bought directly · P0

**Steps.** In the Step 3 package picker, attempt to select `QA Home Visit Recovery — 4 Visits`. If the UI offers it, proceed and attempt payment. Also call the API directly: `POST /api/home-visit/create-order` with HV2's id.
**Expected Result.** The multi-visit package is **not offered** for direct purchase, and the API refuses it. Only a **one-visit** home package is directly purchasable — that is the patient's home consultation. HV2 can only reach a patient through a therapist's care plan.

#### `PAT-HV-006` — Cash on visit · P1

**Preconditions.** **Allow cash on visit** is on.
**Steps.** Repeat `PAT-HV-002` but choose **Pay at the visit** on Step 4.
**Expected Result.** The booking completes with **no Razorpay checkout**. The purchase row has `payment_mode='cash'` and `payment_status='unpaid'` — **for its whole life**, with a real confirmed visit hanging off it. The patient's Payments screen must not describe this as an outstanding failure. Admin → Money → Payouts → Cash Ledger will show the collection once the therapist records it.

#### `PAT-HV-007` — Cash refused when the switch is off · P2

**Steps.** Admin turns **Allow cash on visit** off. Patient repeats the flow.
**Expected Result.** The cash option is absent. Calling `/api/home-visit/book-cash` directly returns `Paying at the door isn't available right now — please pay online instead.`

---

### 11.6 Sessions, joining and cancellation

#### `PAT-SESS-001` — The Sessions screen, its filters and its view switch · P1

**Preconditions.** Patient A has at least one upcoming, one past and one cancelled session, and at least one home visit.
**Steps.** Open `/patient/dashboard/sessions`. Tap **Upcoming**, **Past**, **Cancelled** in turn. Then tap the **Video** and **Home visit** filters. Then switch **List** → **Calendar** and back.
**Expected Result.** One list, not two. The Video/Home visit filter appears **only** because this patient has both kinds; a patient with only video sessions must not see it. The Calendar view renders **the same server-rendered cards**, so the two views can never disagree about a session. Filter chips are hidden entirely when only one of them would have rows behind it. The list ends with a pager showing "x–y of n", a per-page control, and Previous/Next that grey out at the ends.

#### `PAT-SESS-002` — An unassigned session reads as Requested · P2

**Expected Result.** A paid but unassigned session shows a `Requested` status pill and **no therapist name**. It must not claim a therapist it does not have.

#### `PAT-SESS-003` — Tap to Join appears only inside the join window (scenario TIME-E) · P1

**Preconditions.** A `confirmed` session with an assigned therapist and a Meet link. Join window before/after default to 15 minutes.
**Steps.** With the real clock well before the slot, look at the session card. Then simulate a time 10 minutes before the slot and reload.
**Expected Result.** Before the window: the control is inert and does not offer a call. Inside the window: **Tap to Join** is live and opens the Meet link. **Reminder:** this control reads the *simulated* clock; the server's own gates do not.

#### `PAT-SESS-004` — After the cutoff every surface says Session Completed (scenario TIME-F) · P1
See `XR-CUTOFF-001` for the cross-role version. Simulate 90 minutes after the slot (past the default 60-minute `session_completed_after_minutes`). **Expected Result.** The control reads **Session Completed** on the patient's card — and on the therapist's and the admin's, identically.

#### `PAT-CANCEL-001` — Cancel outside the refund window → full refund (scenario TIME-G) · P0

**Preconditions.** A **paid**, `confirmed` session whose slot is more than 24 hours away in **real** time (the refund maths runs server-side, so a simulated clock will not move it).
**Steps.** Open the session card, tap **Cancel Session**, read the dialog, optionally enter a reason, confirm.
**Expected Result.** The dialog reads *"Cancel this session and refund the payment? You can add a reason (optional):"*. After confirming, the card shows `Cancelling...` then a cancelled state. The appointment becomes `cancelled` with `refund_status='processed'` and the refund amount recorded. Admin → Money → Summary shows the refund reducing **Net Revenue** while **Gross Revenue** is unchanged. **No therapist cut is reversed** — a cancelled session never earned one. If the patient was hospital-referred, the **partner commission is reduced**, because it is taken on net.

#### `PAT-CANCEL-002` — Cancel inside the window → no refund, and the dialog says so (scenario TIME-H) · P0

**Preconditions.** A paid session whose slot is **less than 24 hours** away in real time.
**Steps.** Tap **Cancel Session** and read the dialog **before** confirming.
**Expected Result.** The dialog reads *"Cancel this session? It's within 24 hours of your slot, so this won't be refunded. You can add a reason (optional):"*. After confirming, the appointment is `cancelled` with **no refund**. Money → Summary is unchanged for refunds. This forfeited amount stays in the clinic's share — it must not deduct a therapist cut, because the session was never completed.

#### `PAT-CANCEL-003` — Home visits use their own refund window · P1
Repeat `PAT-CANCEL-001`/`002` against a home visit. **Expected Result.** The window used is `home_visit_cancellation_refund_hours` (default 24, independently configurable). Changing the online window in Settings must **not** change the home-visit dialog, and vice versa.

#### `PAT-SESS-006` — Rate a completed session · P2
**Steps.** After a therapist marks a session complete, open the patient's card and submit a rating of `5` with feedback `Very clear explanation, the exercises helped.`
**Expected Result.** The rating is stored once. A second attempt returns `You've already rated this session.` A rating of `0` or `6` is refused with `Rating must be between 1 and 5`. A no-show session refuses rating entirely: `This session was marked as a no-show — there's nothing to rate.`

---

### 11.7 Health Profile (patient side)

#### `PAT-HP-001` — Before the therapist's first record, the patient is read-only · P0

**Preconditions.** Patient A exists with **no** condition profile yet.
**Steps.** Open `/patient/dashboard/health-profile`. Then return to `/patient/dashboard` and look at the overview.
**Expected Result**
* On the Health Profile screen: **no** "answer your questions" call to action and **no** answered counter — they are **absent, not greyed out**.
* The **reports uploader is present and usable** — it is the one useful thing the patient can do beforehand.
* On the dashboard overview: the health-profile cell reads **`—` on a slate background**, never `0%` on amber, and there is **no amber banner**.
* The waiting panel **names the session it is waiting on**, by date — *"Your session on 11/09/2026 is when this gets filled in"* before the session, and *"Expected at your session on 11/09/2026. If it still isn't here in a day or two, tell us and we'll chase it."* after it. A locked screen with no date on it leaves the patient unable to tell whether the wait is normal or whether they have been forgotten. A patient with no session yet simply sees no date line — never a placeholder.
* Attempting the API directly (`POST /api/patient/condition-profile/save-draft` with the patient's cookie) is **refused** — the lock is enforced in `submit`, in `save-draft`, and by an insert policy on `condition_change_requests`. A UI-only lock would be cosmetic.

#### `PAT-HP-002` — After the therapist's first fill, the wizard unlocks · P0

**Preconditions.** `THR-HP-002` has triaged Patient A as Orthopaedic and written the first record.
**Steps.** Open `/patient/dashboard/health-profile`.
**Expected Result.** The seven orthopaedic answers are shown **as answers, not as inputs**. The severity gauge, the pain-area chips and the progress line render. The answered counter appears. Attribution is correct: the counter must **not** claim the patient answered questions the clinician wrote — answers written by the therapist are attributed to the therapist.

#### `PAT-HP-003` — The intake wizard is one question at a time · P1

**Steps.** Tap the call to action to review/update answers.
**Expected Result.** A **pop-up wizard showing one question at a time**, never a seven-field form rendered on the dashboard. Each question shows its `helpText` in the patient's own words. Progress through all seven with the §8.4 answers.

#### `PAT-HP-004` — Submitting a change goes to review · P1

**Steps.** Change `severity` from `6` to `4` and submit.
**Expected Result.** A confirmation that the clinic will review it. The word used for the reviewer on a **patient** screen is **"the clinic"** — never "admin", never "us". A second submission while one is pending is refused: `Your last change to your health profile is still being checked by the clinic.`

#### `PAT-HP-005` — The record exports as a PDF, not JSON · P1

**Steps.** Tap the export/download control on the Health Profile.
**Expected Result.** A typeset **PDF** downloads, named `QA Patient A_PT####.pdf` (name + patient code). It contains the intake answers and the Pain Map data. **Session notes are excluded from every format.** `?format=json` still serves raw JSON for portability but is not linked anywhere in the UI.
**Boundary.** A patient whose name contains non-Latin characters (set the name to `पूजा शर्मा` temporarily) must still export successfully — the PDF encoder transliterates rather than throwing a 500.

#### `PAT-DOC-001` — Upload a report · P0

**Steps.** On the Health Profile, open the reports panel. Tap the upload control. Choose `Spine_Report_E2E.pdf`. Pick the type `Scan or X-ray`. Submit.
**Expected Result.** The file appears in the list with its type label and upload date. Only **metadata** is stored in the database — the file itself is in the private `medical-reports` bucket. Tapping the file opens it through `/api/medical-documents/view`, which mints a **120-second signed URL**. Copying that URL and opening it after two minutes must **fail** — the link is deliberately short-lived.

#### `PAT-DOC-002` — Upload limits · P1

| Attempt | Expected |
| --- | --- |
| `Oversize_Report_E2E.pdf` (>10 MB) | Refused before or during upload with a size message; nothing is stored |
| `Not_Allowed_E2E.txt` | The file picker does not accept it (`accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif"`); a forced API call is refused with `Upload a PDF or a photo (JPG, PNG, WEBP or HEIC).` |
| No type selected | `Pick what kind of report this is.` |
| No file chosen | `Choose a file to upload.` |
| A 21st file | Refused — the cap is **20 files per patient**, enforced in the upload route |

#### `PAT-DOC-003` — Deleting and re-uploading is the only correction path · P2

**Steps.** Delete `Posture_Assessment_E2E.pdf`, then upload it again.
**Expected Result.** Deletion succeeds and the row disappears. **There is deliberately no edit/update path** — correcting a report means delete + re-upload, so the row and the stored object can never describe different things.

---

### 11.8 Suggested Sessions, care plans and credits

#### `PAT-SUGG-001` — The Suggested Sessions entry appears only when something waits · P1

**Steps.** Before any therapist has suggested anything, check the sidebar. Then have `THR-SUGG-001` send a suggestion, and reload.
**Expected Result.** Before: **no** Suggested Sessions entry. After: the entry appears **above** Your Sessions — something waiting on the patient's answer outranks a list of what is settled.

#### `PAT-SUGG-002` — Accept a therapist-proposed time · P0

**Preconditions.** `THR-SUGG-001` has proposed a slot on an active programme with credits remaining.
**Steps.** Open `/patient/dashboard/suggested`. Read the card. Tap **Accept this time**.
**Expected Result.** The card resolves to a booked state. An appointment is created via the package-session path: **auto-assigned to the locked therapist, auto-confirmed, and given its own Meet link**. `sessions_used` on the purchase increases by exactly **one**. A `reserve`/`consume` ledger entry is written with an idempotency key derived from the appointment id. The therapist's dashboard shows the new session. **A declined suggestion would have claimed nothing** — a suggestion is its own row, never an appointment in a new status.

#### `PAT-SUGG-003` — Decline · P2
**Steps.** Tap **Decline** on a pending suggestion. **Expected Result.** The card shows `Declined`. No appointment. No credit moves. The therapist's control shows the declined state.

#### `PAT-SUGG-004` — Button spam and a dropped connection · P0
**Steps.** Tap **Accept this time** three times rapidly. Then, on a second suggestion, throttle the network to Offline and tap **Accept**.
**Expected Result.** Spam: exactly **one** appointment and **one** credit consumed. The control guards with a synchronous ref, so the second tap never reaches the server. Offline: the card **does not clear optimistically** — the patient is left exactly where they were, with an error, and can retry. The partial unique index allows at most one pending suggestion per purchase, so a double tap cannot create two.

#### `PAT-SUGG-005` — A lapsed suggestion cannot be accepted · P1
**Preconditions.** A pending suggestion whose slot is now inside the booking lead time.
**Expected Result.** The card reads **Suggestion lapsed** and offers no Accept. **Nothing writes an "expired" status** — `status` records explicit human actions only; lapse is computed at read time. Attempting acceptance via the API is refused.

#### `PAT-CARE-001` — Read a therapist's recommendation · P0

**Preconditions.** `THR-CARE-001` has written a care plan recommending Package P1, **and `ADM-CARE-004` has approved it.** Until the clinic approves, the patient must see nothing — check that first: an unapproved recommendation absent from this screen is the feature working, not a missing fixture.
**Steps.** Open `/patient/dashboard/suggested` (and `/patient/dashboard/health-profile`).
**Expected Result.** An offer card showing the programme name, **session count**, **price**, validity, the therapist's *"Why this, for this patient"* text written **to** the patient, and their instructions. The same rows render on the therapist's chart and on the patient's Health Profile — one record, two readers. **There is no price field the therapist could have set**: the price comes from the admin's catalog row.

#### `PAT-CARE-002` — Accept and pay for a recommended programme · P0

**Steps.** Tap the buy/accept action on the offer card. Complete Razorpay with `success@razorpay`.
**Expected Result**
* The price charged is **re-derived server-side** from the live catalog row. It must equal the amount shown on the card.
* A `patient_package_purchases` row is created with a **frozen `package_snapshot`** and `sessions_granted = 6`.
* **Session credits are granted: exactly 6.** Not 5, not 12.
* The care plan's status becomes `accepted`. **The thread is now closed** — a later recommendation opens a *new* plan with `supersedes_id` set.
* The payment does **not** refresh into an empty screen. In place of the offer card the patient reads *"Payment received — N sessions are yours"*, who will run them, and one next step. **If the screen goes blank after paying, that is a P0 defect** — it is the highest-intent moment in the product.
* **Your Programmes** appears in the sidebar (not "Your Packages") and lists the programme with `6 sessions`, `0 used`, `6 remaining`.
* A second attempt to buy the same plan is refused: `You've already bought this plan.`

#### `PAT-CARE-003` — A recommended home-visit programme quotes travel correctly · P0

**Preconditions.** A care plan recommending HV2 (4 visits), patient address in a ₹150 area.
**Expected Result.** The offer card shows **programme + travel + total** as three figures, with travel charged **per visit**: `₹8,999 + (₹150 × 4) = ₹9,599`. A card that printed `₹8,999` on a button that charged `₹9,599` would be a P0 defect — travel is per visit, not per purchase.
Additionally: if an admin switches **Home Visit enabled** off, `/api/care-plan/create-order` must refuse the purchase with `Home visits aren't available right now. Please talk to your therapist.` A recommendation written before the service stopped must not stay purchasable.

#### `PAT-SCHED-001` — The scheduler opens answered, not empty · P0

**Feature.** Everything needed to lay out the run is already known — how many sessions, how often the clinician recommended, the programme's gap and weekly rules, the lead time, the validity. Handing the patient a blank calendar asks them to redo arithmetic somebody has already done, immediately after paying.

**Preconditions.** A paid 6-session programme recommended at **2 a week**, with `min_gap_hours` 48 and `max_sessions_per_week` 2.

**Steps.** Tap **Choose my times** (straight after payment) or **Schedule sessions** (from Your Programmes). Read what is already selected. Change one date. Read the panel again.

**Expected Result**
* Dates are **already chosen** — as many as the bulk limit allows — spaced roughly 3 days apart, none inside the 12-hour lead time, none past the programme's expiry, and no more than 2 in any calendar week.
* Every proposed session is at the **same time of day**. A course at one hour is one thing to remember rather than six.
* The panel says *"We've picked N times for you — spaced 2 a week, the way your therapist recommended."*
* After an edit the heading becomes **Your times** and a **Put the suggested times back** link appears. The suggestion must **not** silently reapply itself — that is the calendar overruling the person using it.
* Nothing is booked until Confirm. The proposal is a suggestion; the server re-checks every rule on submit.

#### `PAT-SCHED-002` — A clashing slot can be fixed without starting over · P1
**Steps.** Deliberately pick two sessions 24 hours apart on a programme with a 48-hour minimum gap, and confirm.
**Expected Result.** *"N of M sessions scheduled"*, with the too-close one marked and the reason naming the gap. An amber line confirms the others **are** booked and nothing was charged twice. A **Pick another time** button returns to the calendar with only what is still unspent — the booked ones are gone from the selection, since re-offering them would invite booking the same slot twice.

#### `PAT-SCHED-003` — Unbooked sessions keep asking · P0
**Feature.** The one thing a patient can buy and then receive nothing for. Paying is the hard part and it is done; what is left is a calendar step on a screen they have to think to visit.
**Steps.** Pay for a programme and tap **I'll do it later**. Open `/patient/dashboard`.
**Expected Result.** The activity feed carries a **needsYou** item — *"N sessions still to book"* — naming the programme and linking to Your Programmes. It stays until the balance is spent and disappears when it is. The figure must agree with the Your Programmes card exactly; a feed claiming a balance that screen disagrees with is a P0.

#### `PAT-CARE-004` — A declined or withdrawn recommendation · P2
**Steps.** Decline a recommendation from the offer card. Separately, have an admin withdraw one (`ADM-CARE-002`). **Expected Result.** Declining closes it for the patient; withdrawing removes it from the patient's offers with the plan marked withdrawn. **A purchased plan can never be withdrawn** — the honest lane is a refund.

#### `PAT-PKG-001` — Spend credits by booking package sessions · P0

**Preconditions.** `PAT-CARE-002` complete: 6 credits, therapist locked.
**Steps.** Open `/patient/dashboard/packages`. Use the bulk scheduler to book **3** sessions, respecting the package's rules (min gap 24h, max 3/week).
**Expected Result.** Three appointments are created, each **auto-assigned to the locked therapist, auto-confirmed, each with its own Meet link** — never through the admin's per-session assign flow. The widget reads `6 sessions · 3 used · 3 remaining`. Three `reserve` ledger entries exist, each keyed `reserve:<appointment_id>`.
**Boundary.** Attempting a 4th session in the same week is refused by the package's max-per-week rule. Attempting more than `package_bulk_schedule_max` (default 8) slots in one request is refused with `Too many slots in one request.` Two slots less than 24h apart are refused by the minimum-gap rule.

#### `PAT-PKG-002` — Credits cannot be overdrawn · P0 **[SQL]**
**Steps.** Book all 6 sessions, then attempt a 7th.
**Expected Result.** Refused with `Every session in this programme is already used.` In the database, a ledger row that would overdraw fails the CHECK constraint and takes its transaction with it — **an impossible balance is impossible, not merely unwritten**.

#### `PAT-PKG-003` — A locked therapist's clash never fails the booking · P1
**Preconditions.** The locked therapist already has a session at the requested time.
**Expected Result.** The booking still succeeds, but the session lands **`requested` and unassigned** in the admin queue rather than failing. The patient is not told to pick another time.

#### `PAT-PKG-004` — An expired programme · P2
**Preconditions.** A purchase whose `expires_at` has passed.
**Steps.** Load `/patient/dashboard` (the expiry sweep runs at the top of that render).
**Expected Result.** The purchase's status moves `active → expired` on that page load — **there is no cron**; the sweep is lazy and idempotent. The widget stops offering booking. A ledger `expiry` entry records the balance that lapsed.

---

### 11.9 Payments screen, profile and addresses

#### `PAT-PAY-010` — Receipts · P2
**Steps.** Open `/patient/dashboard/payments`. **Expected Result.** Every paid session and purchase is listed once, with amount, date and what it was for. A cash-on-visit home purchase appears with its cash status and is **not** presented as a failed payment. Amounts match Money → Transactions exactly.

#### `PAT-PROF-001` — Edit Profile sections · P2
**Steps.** Open `/patient/dashboard/profile`. Walk the five sub-sections: **Photo**, **Personal Details**, **Contact Details**, **My Addresses**, **Account Security**.
**Expected Result.** Each is reachable from the sidebar's child list. Instant fields (photo, some details) save immediately; **gated** fields (the ones an admin must approve) submit a profile change request instead of writing directly, and say so. The request appears in Admin → Today → Approvals.

#### `PAT-ADDR-001` — Address book · P2
**Steps.** In **My Addresses**, add the Patient A address, then add a second, then remove the second.
**Expected Result.** Both are saved and selectable at home-visit checkout. Removing one does **not** alter any visit already booked — a visit's address is snapshotted onto the appointment at purchase.

#### `PAT-EMPTY-001` — Empty states across the patient portal · P2
**Preconditions.** A freshly approved patient with nothing at all.
**Expected Result.** The sidebar shows only **Overview**, **Book a Session**, **Health Profile**, **Edit Profile**, plus **Back to Home** at the foot of the nav. Sessions, Packages, Payments and Suggested Sessions are **absent**. The Overview shows a friendly empty feed and quick actions, not a blank panel or a zero-filled table.
