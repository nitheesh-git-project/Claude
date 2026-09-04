---

## 19. UX, responsive and accessibility test plan

### 19.1 Viewports to test

| Device class | Viewport | Coverage |
| --- | --- | --- |
| Desktop | 1440 × 900 | Everything |
| Tablet | 820 × 1180 | Booking, patient dashboard, admin All Sessions |
| **Mobile** | **390 × 844** | **The full patient booking + payment flow, mandatory** |

### 19.2 Mobile booking flow

#### `UX-MOB-001` — The critical path at 390 × 844 · P0

**Steps.** At 390 × 844, execute `PAT-BOOK-002` → `PAT-BOOK-003` end to end, including Razorpay checkout.

**Expected Result — check every one of these:**

* **No horizontal scrolling on any screen.** The page body never scrolls sideways. Wide content (tables, the calendar) scrolls **inside its own container**, not by moving the page.
* The Step 1 **calendar is legible and its day cells are tappable** — this is the control most at risk, because the calendar is a 7-column grid squeezed directly by the card's padding. Padding is deliberately reduced on phones for exactly this reason; each day cell must remain a comfortable tap target (≈44 px).
* Hour chips and language chips wrap rather than overflow.
* All text is readable without zooming; nothing is clipped mid-word.
* **The on-screen keyboard does not hide the field being typed into, nor the primary button.** Tap each Step 2 field in turn and confirm you can still see what you are typing and can reach **Review Booking →**.
* The Step 3 summary rows do not collide; the fee is fully visible.
* The **Razorpay checkout renders and completes** at this width.
* The **Payment Confirmed** panel and its **Go to Dashboard** button are fully visible.

#### `UX-MOB-002` — Dashboards on mobile · P1
**Steps.** At 390 × 844, open each of the four dashboards.
#### `UX-BUSY-001` — The app says it is working · P1

**Steps.** Tap anything that saves, creates or navigates — a Save on a settings form, **Done** on a session, a payout, a sidebar entry — and watch the very top of the viewport.
**Expected Result.** A thin teal bar appears across the top for the whole time between the tap and the page answering, then completes and fades. It covers the part a button cannot: after `router.refresh()` the button is idle (and often unmounted with its row), while the server is still re-rendering — the gap that reads as a freeze.
**Details that are the design, not decoration:**
* **No percentage.** The bar eases toward a ceiling and only completes when the work lands. A bar sitting at 90% is a defect, not a slow server.
* **It waits ~220ms before drawing.** An action that finishes faster must show **nothing at all** — a flash on every tap is the failure this delay prevents.
* **Reduced motion** (`prefers-reduced-motion: reduce`) keeps the bar and drops the travel: a static full-width band that fades. It must not disappear entirely — that setting means less movement, not less information.
* **Two overlapping actions**: start a second before the first finishes; the bar must stay up until **both** are done, not vanish with the first.
* The five money buttons (**Done**, **Collect ₹…**, **Request Payout**, **Confirm … Payment**, **Assign & Confirm**) show a spinning ring beside their busy label rather than only swapping the text.

#### `UX-BUSY-002` — The admin dashboard's second batch · P2
**Steps.** Load **/admin/dashboard**, then tap any button that saves.
**Expected Result.** Noticeably quicker than before: eleven migration-dependent reads that used to run one after another (accounting health, the suggestion and recommendation switches, discounts, the first-session offer, promo and invite settings, category covers and condition types, testimonial avatars, hospital notes) now run as one parallel batch, and both ledger-balance passes run together.
**Critical check — the isolation is unchanged:** drop one of those columns (see `admin-degraded-schema.spec.ts`) and only that panel degrades. If the whole dashboard blanks, the batch has lost a `guard()` and that is a P0.

**Expected Result.** Each shell offers a **mobile drawer** for the sidebar. **Back to Home is present in all three renders** — expanded sidebar, collapsed rail, and mobile drawer. On all four shells it sits at the **foot of the nav, directly above Collapse** (above the profile/Log Out footer in the mobile drawer, which has no Collapse). Without it the only exit from a dashboard is Log Out, which also ends the session. It is a plain link, not a client-side transition, because transitions into a differently-chromed route were silently not completing.

#### `UX-MOB-003` — Modals and drawers fit · P1
**Steps.** At 390 × 844 open: a catalog detail dialog, the admin session drawer, the intake wizard, the pain-exam dialog, the confirm dialog.
**Expected Result.** Each fits the viewport, scrolls internally if it must, and its close control is reachable without scrolling.

#### `UX-MOB-004` — The body map on a phone · P1
**Expected Result.** Front and back views **stack** rather than shrinking each tap target below a fingertip. Every region is tappable.

#### `UX-MOB-005` — Admin tables on mobile · P2
**Expected Result.** Wide tables scroll inside an `overflow-x` container. The page itself never scrolls horizontally. The pager remains usable.

### 19.3 Accessibility pass

#### `UX-A11Y-001` — Keyboard navigation of the booking flow · P1
**Steps.** With the mouse untouched, complete Step 1 and Step 2 using only Tab, Shift+Tab, arrows, Space and Enter.
**Expected Result.** Every interactive control is reachable in a sensible order. **A visible focus ring is present on every focused control.** The calendar and the chip groups are operable from the keyboard. No control is reachable only by pointer.

#### `UX-A11Y-002` — Accessible names · P1
**Steps.** With a screen reader or the accessibility inspector, walk the booking wizard, the roster editor and the admin sidebar.
**Expected Result.** Every button has a name that says what it does (not "button" or an icon name). The roster's controls are labelled per day and per period (e.g. "Remove Monday period 1", "Set Monday to …"). Photo `alt` text **describes the picture**, not the page — the blurb already says what the page is for, and a screen reader announcing the same sentence twice tells someone nothing about the image.

#### `UX-A11Y-003` — Dialog focus · P1
**Expected Result.** Opening a dialog moves focus into it; Tab is trapped inside; Escape closes it; focus returns to the control that opened it.

#### `UX-A11Y-004` — Form errors are announced and visible · P1
**Expected Result.** A validation failure moves focus to or announces the message, and the message is visible without scrolling on a 390-wide screen.

#### `UX-A11Y-005` — Two tablists must not share a name · P2
**Expected Result.** The care-area picker is "Areas of practice"; the walkthrough is "How the process works". **Two tablists sharing a name makes both unfindable.**

#### `UX-A11Y-006` — Reduced motion · P1
**Steps.** Enable "reduce motion" in the OS, then load `/`.
**Expected Result.** The splash is **skipped outright** — it is decoration over content that is already rendered, so the honest answer to "don't animate" is not to show it. The walkthrough does not auto-rotate distractingly.

#### `UX-THEME-001` — No hydration warnings · P1
**Steps.** With the console open, load `/`, `/book`, and each dashboard.
**Expected Result.** **No hydration mismatch warnings.** The splash's visibility is an attribute on `<html>` read by CSS, not React state, precisely to avoid this. `suppressHydrationWarning` covers that one element only — if you see it on a descendant, raise it.

---

## 20. Error, loading and empty-state testing

**The rule that applies to every case in this section:** an internal database error, a column name, a row id or a stack trace **must never reach the screen**. Every route tree has an error boundary, and only the framework's opaque `digest` is shown — because an error message can carry a column name or a row id, and **patients see these screens**.

#### `ERR-BOUNDARY-001` — Route error boundaries · P0
**Steps.** Force an error in each dashboard (block the Supabase host in DevTools, then navigate).
**Expected Result.** A friendly error screen with a retry affordance and **only** an opaque digest. **No message, no column name, no id, no stack.** Repeat for a root-layout failure — the global error page **inlines its styles and supplies its own document shell**, because at that point nothing else has rendered.

#### `ERR-LOAD-001` — Loading states keep the chrome · P1
**Steps.** Throttle the network to Slow 3G and navigate between dashboard sections.
**Expected Result.** A skeleton appears. **The sidebar is not blanked** — the patient, therapist and hospital dashboards render their sidebar per page rather than in a layout, so a loading screen that forgot the sidebar would blank the chrome on every navigation.

#### `ERR-NET-001` — Network failure mid-action · P0
**Steps.** Set the network to Offline, then: submit the booking; accept a suggestion; save a roster; settle a payout.
**Expected Result.** Each shows a readable connection message (e.g. `Could not reach the server. Please check your connection and try again.`). **Nothing clears optimistically** — the person is left exactly where they were and can retry. When the network returns, a retry succeeds and **does not duplicate** the action.

#### `ERR-API-001` — API failure is readable · P1
**Steps.** Force a 500 from a route (stop Supabase mid-request).
**Expected Result.** A human message. Never the raw error text.

#### `ERR-STALE-001` — Stale URLs · P1
**Steps.** Open `/admin/dashboard?section=today&tab=requests` and `?section=today&tab=sync` (tab keys that never existed). Open `/admin/dashboard/patients/<deleted id>`. Open `/book?category=<deleted id>`.
**Expected Result.** The admin links **fall back to that section's first screen** — so they *look* like they work. **That is exactly why links must be built with the typed helper rather than hand-written.** A deleted patient id shows a not-found state, not a crash. A deleted category id simply leaves the concern unselected.

#### `ERR-404-001` — Not found · P2
**Expected Result.** `/no-such-page` renders the 404 page. `/home-visit` with the master switch off renders 404. Neither leaks internals.

#### `ERR-EMPTY-001` — Empty states everywhere · P2
**Steps.** Immediately after `SETUP-RESET-001`, open every admin screen, then each role's dashboard for a brand-new account.
**Expected Result.** Every screen shows a **purposeful empty state**, never a blank panel, a zero-filled table, or a spinner that never resolves. **Filter chips are hidden unless at least two of them would have rows behind them** — a filter nobody can act on is noise. A **screen that can only ever be empty is not in the sidebar at all.**

#### `ERR-DUP-001` — Duplicate submission of every form · P1
**Steps.** Double-tap the primary button on: the booking wizard, the register form, the roster save, the care-plan submit, the suggestion send, the payout settle, the refund, the expense create.
**Expected Result.** Exactly one record in every case. Buttons disable synchronously, not a render later.

---

## 21. Cross-role consistency tests

**Why these exist.** Most defects in a multi-role application are not "the feature is broken" but "two roles disagree about the same fact". Each case below drives **one business event** and then checks **every** role's view of it.

#### `XR-BOOK-001` — One booking, five views · P0

**Event.** Patient A books and pays for a session (`PAT-BOOK-003`), and an admin assigns Therapist A.

| Role | Where | Must show |
| --- | --- | --- |
| Patient | `/patient/dashboard/sessions` → Upcoming | The session, `Confirmed`, with Therapist A's name and the Meet link |
| Therapist | `/therapist/dashboard/sessions` | The same session, same slot, patient's name, **masked phone**, no email |
| Admin | Sessions → All Sessions **and** Sessions → Schedule | The same session, in both, opening the **same drawer** |
| Finance | Money → Transactions | One payment row of ₹1,999 with its order and payment ids |
| Hospital | Your Referrals | **Nothing** — Patient A was not referred |

**Expected Result.** The slot time is identical everywhere (allowing for the timezone label each screen states). The status is identical. **No screen shows a therapist the others do not.**

#### `XR-BOOK-002` — A referred patient's booking adds a sixth view · P0
Repeat with Patient C (Hospital A). **Additional expectation:** the hospital sees the referral as **Registered**, and once the session is completed, `₹249.90` appears on their Earnings and in Money → Breakdown's partner share — **the same number in both places**.

#### `XR-PAY-001` — One payment, one figure everywhere · P0
**Event.** The payment from `XR-BOOK-001`.
**Expected Result.** Patient's Payments screen, Money → Transactions, Money → Summary's Gross, and the appointment's own paid state all describe **one** payment of ₹1,999. **No screen shows it twice and no screen shows a different amount.**

#### `XR-REFUND-001` — One refund, four views · P0
**Event.** Patient A cancels S3 outside the window.
**Expected Result.** Patient: cancelled, refund shown. Therapist: the session leaves Upcoming; **their earnings do not change** (it never earned a share). Admin Money: Gross unchanged, Refunds +₹1,999, Net −₹1,999. Hospital (if referred): partner share **reduced**. Activity Log: the cancellation, attributed.

#### `XR-COMPLETE-001` — One completed session, five views · P0
**Event.** Therapist A completes S1.
**Expected Result.** Therapist: Earnings +₹1,199.40, and a "Notes to write" nudge. Patient: the session moves to Past and a rating control appears. Admin Sessions: status `completed`, `completed_at` stamped. Money: the therapist share now **includes** this session (it did not while it was merely paid). Delivery: the completed count and the no-show rate update.

#### `XR-CUTOFF-001` — The Session Completed cutoff reads the same on every surface · P0
**Event.** A confirmed session passes the cutoff (default 60 minutes after the slot).
**Steps.** Simulate 90 minutes after the slot in **each** role's browser and look at every surface that lists that session: the patient's card and calendar, the therapist's card, the admin's All Sessions row, the admin's Schedule day panel, and the admin's session drawer.
**Expected Result.** **Every one reads "Session Completed"** — including the admin's own. A session an hour past its start must read the same way on every screen it appears on. Changing the cutoff setting must move **all** of them together.

#### `XR-CARE-001` — One recommendation, three views · P0
**Event.** `THR-CARE-001`.
**Expected Result.** Therapist's chart, patient's Suggested Sessions **and** patient's Health Profile all render **the same rows** — one record, two readers, branching only on whose voice the copy is written in. Admin → Sessions → Recommendations lists it. **All four agree on the package, the session count and the price.**

#### `XR-CARE-002` — One purchase, five views · P0
**Event.** `PAT-CARE-002`.
**Expected Result.** Patient: Your Packages, `6 sessions · 0 used · 6 remaining`. Therapist: the programme appears in the Programmes view of My Patients with the same balance. Admin: Catalog → Purchases with the same balance and a frozen snapshot. Money: the purchase's cash appears as **Package cash collected** and is recognised session by session as **Recognised revenue** — these are **two different words for two different things and must not be conflated**. Activity Log: nothing (a patient purchase is not an admin action).

#### `XR-CREDIT-001` — One credit consumed, four views · P0
**Event.** The patient books one package session.
**Expected Result.** Patient widget: `1 used · 5 remaining`. Therapist: the session appears, auto-assigned and auto-confirmed with its own Meet link. Admin Purchases: the same balance. **[SQL]** the ledger holds exactly one `reserve:<appointment_id>` row. Flipping the ledger-authority switch must not change any of these four figures while the ledger and the counters agree.

#### `XR-PAYOUT-001` — One settlement, four views · P0
**Event.** `FIN-PAY-002`.
**Expected Result.** Therapist Earnings: paid-out increases, owed decreases by the same amount. Admin Payouts: the row settles. Money → Summary: the therapist share is unchanged (settling moves money, it does not create a new share). Activity Log: a **`payout.settle`** row with the actor, target and amount.

#### `XR-CASH-001` — One cash collection, four views · P0
**Event.** `THR-SESS-007`.
**Expected Result.** Therapist: the visit shows cash recorded, and their next payout figure **drops by the cash held**. Admin Cash Ledger: the collection appears as un-remitted. Money → Payouts: the Pay button shows the netted figure. After settling: the Cash Ledger stops listing it, and a second payout does **not** deduct it again.

#### `XR-HP-001` — One health-profile update, three views · P0
**Event.** `THR-HP-002` then `PAT-HP-004`.
**Expected Result.** Patient: their own answers, correctly attributed — **the counter must not claim the patient answered questions a clinician wrote**, and the banner must not say "Your therapist has your answers" about a record the patient never sent. Therapist: the same answers on the chart. Admin: the change request in the review queue and, after approval, in Review History. **Nobody is told they did something they did not do.**

#### `XR-SUGG-001` — One suggestion, two views · P1
**Event.** `THR-SUGG-001` → `PAT-SUGG-002`.
**Expected Result.** While pending: therapist sees **Waiting on the patient**, patient sees the card. After acceptance: therapist sees the booked session, patient sees it under Upcoming, and exactly one credit has moved.

#### `XCFG-ROSTER-001` — A roster change moves nothing · P0

**Purpose.** This is the guard on the deliberate separation between the roster and the booking picker. It is the single most likely place for a well-intentioned "fix" to break the design.

**Steps**
1. Note exactly which dates and hours `/book` offers under simulated time TIME-A. Screenshot it.
2. As an admin, blank Therapist A's **entire** weekly schedule (mark every day unavailable) and save.
3. Put Therapist A on leave for the next fortnight.
4. Add a date exception that closes a day entirely.
5. Reload `/book` under the same simulated time and compare with the screenshot.
6. Check the patient's existing confirmed session with Therapist A.

**Expected Result.** Step 5: **the picker is byte-for-byte identical.** The roster is the clinic's planning record — who can be *offered* — and it deliberately does **not** filter the patient's picker, which applies the lead-time rule alone. Step 6: **the appointment is unchanged** — not cancelled, not moved, not flagged.
**If the picker changed, do not "fix" the roster — raise it.** Connecting the two is a product decision with a deploy-sized blast radius, not a refactor.
