# MoveRestore - Product & Design Review

*October 2026. Senior product, senior design and head-of-design pass over
every area: the public site, booking, all four dashboards, sessions,
health profile, recommendations, money, discounts and the back office.*

How this was done: every flow below was walked in the running app on staging
(the Playwright specs written this month drive most of them end to end), the
code behind each screen was read, and every page was swept by the layout
audit (`e2e/layout-audit.spec.ts`) at the nine screen shapes you named. Where
a point rests on reading code rather than watching a real person use it, it
says so.

Priority: **P0** blocks trust or money, fix before launch. **P1** costs
conversion, retention or staff time every day. **P2** polish.
Effort: **S** under a day, **M** a few days, **L** a sprint or more.
**Done** means it was fixed in this pass and is on the branch.

---

## The ten that matter most

| # | Finding | Area | P | Effort |
|---|---|---|---|---|
| 1 | Remove the pre-launch debug bar and its server-side clock override before real patients arrive | Platform | P0 | S |
| 2 | The scheduler opens with every slot pre-filled, so a patient can't pick their own time without first deleting one | Programmes | P1 | S |
| 3 | Apart from Google's calendar invite, nothing reaches a patient outside the app: a recommendation, a proposed time or an approval waits for them to open the dashboard | All | P1 | L |
| 4 | Recommendations wait in a clinic approval queue with no SLA, no alert and no ageing nudge to the clinic | Recommendations | P1 | M |
| 5 | Per-session pricing removed the clinic's ability to discount a course; no "course discount" exists any more | Money / Recs | P1 | S |
| 6 | Four discount mechanisms (first-session, promo, invite, goodwill) have no single report of what was given away and why | Money | P1 | M |
| 7 | The admin back office is 9 sections and ~45 tabs; daily work is spread across Today, Sessions and People | Admin | P1 | L |
| 8 | Home visits have no cancellation cut-off and no "therapist on the way" state; the patient has no visibility on the day | Home visit | P1 | M |
| 9 | The Pain Map was required to finish *every* session, including neuro and paediatric patients who have no Pain Map | Sessions | P0 | S - **Done** |
| 10 | A started-but-unfinished session dropped into "Past", hiding its Done/Join button | Sessions | P1 | S - **Done** |

---

## 1. Public site and acquisition

- **The menu button ran off a 360px phone** (the brand name and tagline never
  wrapped). P0, **Done** - the brand now truncates and the button holds its
  place. Every other layout finding is in section 12.
- **Two entry points to the same decision.** `/book` (video) and
  `/book-home-visit` are separate wizards with separate first steps. A
  patient who doesn't yet know whether they need a home visit has to choose a
  product before describing their problem. *Recommend:* one "What's wrong?"
  first step that routes to video or home visit, with the home-visit area
  check offered as soon as they pick "I can't travel". P1, M.
- **Prices are on the condition cards** ("₹499 / 60 min session") - good.
  The home page hero doesn't say a price at all; add "Sessions from ₹499"
  under the main call to action. P2, S.
- **Trust signals lean on stock photography.** The team page does carry
  credentials, years of experience and ratings per therapist; the rest of
  the site is licence-free stock. In healthcare real faces are the
  conversion lever. *Recommend:* real therapist photos on the home page and
  condition pages, the council registration number on each profile, and two
  or three patient outcomes with consent. P1, M (content, not code).
- **Splash screen on first visit** adds a beat before anything is usable.
  Keep it for brand, but cap it at 1.2s and never show it to a returning
  visitor in the same week (it already respects `splash_revisit_minutes` -
  set that to 7 days). P2, S.

## 2. Booking (online and home visit)

- **The confirmation screens promised "the video call link by email or
  WhatsApp".** Nothing in the app sends WhatsApp; the email is Google's
  calendar invite. P0 (a broken promise at the moment of payment), **Done** -
  both screens now say a calendar invite is emailed and the link also shows
  on the dashboard.
- **Booking flow is solid after this month's fixes** (draft replacement,
  payment-try counting, locked accounts, lead time, timezone). Nothing
  blocking.
- **The 12-hour lead time is invisible until it bites.** The picker greys
  out today's slots with no sentence saying why. *Recommend:* "Bookings open
  12 hours ahead - the earliest is tomorrow 9:00 AM" above the calendar. P2, S.
- **No way to book with a specific therapist from the dashboard.** `/team`
  lets a patient *request* one; a returning patient who liked their last
  therapist has to remember that. *Recommend:* "Book again with Dr X" on a
  completed session card. P1, S.
- **Cash at the door for home visits** relies on the therapist pressing
  "Collect payment". There is no receipt to the patient at that moment.
  *Recommend:* show the patient a receipt in their Payments tab the instant
  cash is recorded, and a "paid in cash" chip on the session. P1, S.

## 3. Patient dashboard

- **Overview said "Nothing booked yet" to a patient holding paid, unbooked
  sessions** - the headline only knew about the next booked session. P1,
  **Done**: it now reads "You have N paid sessions still to book".
- **The feed stacked identical items** - three "5 sessions still to book"
  rows for three programmes of the same condition. P1, **Done**: several
  programmes merge into one "13 sessions still to book across 3 programmes".
- **Two pointers to Suggested Sessions on Overview** (the page's own card and
  the new shell bar). P2, **Done**: one implementation, the richer bar.

- **Overview tries to be a feed and a home page at once.** The rotating
  hero, the feed and the cards compete. *Recommend:* one "Next" card at the
  top (your next session with its join time, or the one thing waiting on
  you), then the feed. The new "Suggested for you" bar is the right pattern -
  extend it into that single "Next" card. P1, M.
- **Nine sidebar entries** for a patient (Overview, Book, Suggested,
  Sessions, Programmes, Payments, Health Profile, Profile, plus Home Visits
  when they have them). On a phone that drawer is long. *Recommend:* merge
  Programmes into Sessions as a tab ("Sessions / Programmes"), and Payments
  into Profile as "Payments & receipts". Six entries. P2, M.
- **Suggested teaser now on every page** (**Done** this month) - keep it to
  one line; resist adding a second.
- **Cancel is a red text link** with a prompt dialog. Fine on desktop, small
  target on a phone (under 44px). *Recommend:* a secondary button with a
  44px hit area. P2, S.

## 4. Health profile

- **The progress line now keeps every exam** (**Done**). It plots overall
  pain; a patient with one bad knee and a recovered back sees an average that
  hides the knee. *Recommend:* tap a region on the body map to see that
  region's own line; keep the overall line as the default. P1, M.
- **Neuro and paediatric profiles chart a self-reported headline only.**
  There is no clinician-measured layer for them, so "Are you getting
  better?" is the patient grading themselves. *Recommend:* a short clinician
  scale per specialty (e.g. Berg balance for neuro, a milestone check for
  paediatrics) recorded in the session note, charted like the Pain Map.
  P1, L.
- **Intake completion ring** is clear. The "answered with your therapist"
  counter is good. No change.

## 5. Sessions and delivery (therapist)

- **The therapist feed repeats per session**: "Session note needed - QA
  Patient B" three times, "Onboarding needed" once per patient. On a phone
  that is a long scroll of the same sentence. *Recommend:* group by kind
  ("3 session notes to write"), the same pattern now used for the
  patient's unbooked sessions. P1, S - **Done** for session notes; the
  onboarding items still list one per patient, which is right while each
  is a different person to call.

- **Done now opens the note with the Pain Map** (**Done**). Two corrections
  made in this review:
  - The Pain Map is required only for **orthopaedic** patients - only their
    chart has one. Requiring it for neuro/paediatric patients would have had
    therapists invent pain scores nobody reads. P0, **Done**.
  - A started session stays under **Upcoming** until it is finished (up to a
    day), so the Done and Join buttons are where the therapist is looking.
    P1, **Done**.
- **The note dialog is long on a phone** - Pain Map, five fields, then the
  recommendation. Therapists finish sessions on phones. *Recommend:* make it
  a three-step sheet (Pain Map → Note → Recommend) with a progress dot row,
  each step one screen. P1, M.
- **Availability is set hour by hour.** A therapist with a fixed weekly
  pattern sets it once, but a holiday week is many taps. *Recommend:* "Block
  these dates" range picker. P2, S.
- **Earnings screen** shows what is owed but not *when* it will be paid.
  *Recommend:* "Next payout: Friday, ₹X" line, from the payout schedule.
  P1, S.

## 6. Recommendations and programmes

- **The new model** (condition × number of sessions at the per-session
  price, hands-on = home visits, condition photo, count in bold for admin) is
  live. Three follow-ups:
  - **Course discount.** Programmes used to carry a bundle price; per-session
    pricing removed that lever. *Recommend:* an admin setting "Discount for a
    course of N+ sessions" (percentage, by tier) applied in
    `buildCourseSnapshot`, shown on the card as "8 sessions, 10% course
    discount". P1, S.
  - **Approval latency.** With `care_plan_requires_approval` on, the patient
    hears nothing until an admin acts. The queue shows age but nobody is
    told. *Recommend:* notify the admin (email/WhatsApp) on submission, and
    show the therapist "Approved - your patient can see it now". P1, M.
  - **"Not right now" is a dead end.** A declined recommendation should
    prompt the therapist with the reason and offer "revise". P2, S.
- **The scheduler opens with every slot pre-filled by its proposal**, so new
  times are disabled until the patient deletes one - most people read that
  as broken. *Recommend:* tapping a new time replaces the latest proposed
  one; add "Clear suggestions". P1, S.
- **Unscheduled credits** are nudged on Overview. Add an expiry countdown
  ("4 sessions left, expires in 23 days") on the Programmes card, which
  exists - also put it in the Suggested bar when under 14 days. P2, S.

## 7. Money

- **The same amount printed three ways.** Thirty components each formatted
  rupees themselves: ₹3,118.8 on the therapist's Overview, ₹3,118.80 on
  their Earnings, ₹3,119 elsewhere. P1, **Done**: one formatter
  (`src/lib/formatMoney.ts`) - whole rupees print with no decimals (₹499),
  anything with paise always prints two (₹3,118.80). Deliberate whole-rupee
  rounding (promo minimums, risk alerts) is kept and labelled.

- **The money model is unusually rigorous** (paise, settlement ledger,
  frozen therapist rates, refund window). The gaps are presentational.
- **Admin Money has eight tabs** (Summary, Business Health, Transactions,
  Payouts, Owing, Costs, Breakdown, Inputs). Owners ask three questions:
  *did we make money, who do we owe, where did it go.* *Recommend:* make
  Summary answer all three with links into the detail tabs, and merge
  Breakdown into Summary. P1, M.
- **Refunds** are an admin action with a reason; the patient sees
  "Refunded" but not when the money lands. *Recommend:* "Refunds take 5-7
  working days to reach your bank" under every refund chip. P1, S.
- **Pay later** is well built. The patient-facing word "Owed" can read as
  debt-collection; *recommend* "To settle". P2, S.

## 8. Discounts, promo codes, invites and goodwill

- Four mechanisms, each correctly server-side and audited. What's missing is
  the owner's view:
  - **One "Discounts given" report**: by type, by campaign, by admin (for
    goodwill), with the revenue effect, over a date range. Today it is spread
    across Costs, the audit log and the session drawer. P1, M.
  - **Goodwill has no cap.** Any money-scope admin can discount any unpaid
    session by any amount with a ten-character reason. *Recommend:* a
    per-admin monthly goodwill budget in Settings, and a second-admin
    approval above a threshold. P1, M.
  - **Promo codes can't be limited to a condition or delivery mode.** A
    "back pain week" campaign can't be expressed. *Recommend:* optional
    condition and mode filters on a code. P2, M.
  - **Invites share by copying a link.** Add the phone's native share sheet
    (`navigator.share`) with a pre-written message, which reaches WhatsApp
    in one tap. P2, S.

## 9. Admin back office

- **Information architecture.** 9 sections, ~45 tabs, each with a blurb and
  an example - well documented, but a new admin can't find things.
  *Recommend:* a command palette (⌘K / search) over people, sessions and
  screens; and a role-based Today that only shows queues the admin's scope
  can act on (it partly does). P1, M.
- **Tables on a phone** are horizontally scrolled. Admins do use phones for
  approvals. *Recommend:* card layouts for Approvals and Recommendations
  below 640px. P2, M.
- **The activity timeline** (new this month) should be reachable from every
  person and session in one tap - it is; keep it.

## 10. Hospital partners

- The partner dashboard shows referrals and revenue share. Missing:
  **outcome feedback** - a partner wants to know the patient got better,
  which is what keeps them referring. *Recommend:* a consented
  "Discharge summary" (sessions attended, pain change) per referral. P1, M.

## 11. Cross-cutting design system

- **The "Live updates paused" pill wrapped into a six-line bubble on phones**
  and covered the content it was warning about - it was centred with
  `left: 50%`, which leaves it half the screen to wrap in. P1, **Done**.
- **The "Live updates paused" pill appears on every screen in this staging
  sandbox**, where the browser cannot reach Supabase realtime. That is the
  environment, not the app - but it is worth confirming it does not appear in
  production within the first minute of a session; if it does, it should wait
  a few seconds of failed reconnection before showing.

- **Typography and colour are consistent** (display face for headings,
  slate/teal system). Two inconsistencies: some screens use `text-[10px]`
  and `text-[11px]` for body copy - below 12px is hard to read on a phone
  for an older patient population. *Recommend:* a 12px floor for anything a
  patient reads. P1, S (sweep).
- **Buttons**: primary teal is consistent; secondary styles vary (outline,
  slate fill, text link). *Recommend:* three button variants as one
  component. P2, M.
- **Empty states** are well written everywhere. Keep that standard.
- **Motion** respects reduced-motion. Good.

## 12. Responsive - the nine screen shapes

Swept by `e2e/layout-audit.spec.ts` at 17 viewports:

| Ratio | Viewports checked |
|---|---|
| 20:9 | 360×800, 412×915 (portrait phones) |
| 19.5:9 | 390×844, 430×932 |
| 22:9 | 393×960 (tall phone), 2200×900 (ultrawide) |
| 16:9 | 1280×720, 1366×768, 1920×1080 |
| 16:10 | 1280×800, 1440×900, 1920×1200 |
| 5:3 | 800×480, 1280×768 |
| 7:5 | 1120×800 |
| 22.5:18 (5:4) | 1280×1024 |
| 2048×2732 | iPad Pro 12.9" portrait (1024×1366 CSS) |

Each page is checked for sideways scroll, elements running off the edge,
silently clipped text, and text or controls drawn over each other. Results
and fixes are in the section below, updated as the sweep is driven to zero.

**Result: zero findings.** The final sweep ran 81 pages (every public page,
all 8 patient screens, all 7 therapist screens, all 5 hospital screens, all
45 admin tabs and the patient, therapist and condition detail views) and 7
interactive states (public menu, patient and admin drawers, booking step 2,
the programme scheduler, the therapist's finish dialog with a recommendation
open, the admin session drawer) at all 17 viewports - 1,496 page-by-size
checks - and found no sideways scroll, nothing off the edge, no clipped text
and no overlapping text or controls.

What it found on the way, all fixed:

| Where | Problem | Fix |
|---|---|---|
| Public navbar, 360px | Brand name and tagline never wrapped; the menu button ran off the screen and the page scrolled sideways | Brand block shrinks and truncates; button keeps its place |
| Patient and therapist Sessions, phones | The Upcoming / Past / Cancelled / All tabs with their counts ran off a 360px screen, then overlapped once squeezed | Tabs fill the row equally on phones, each count under its label |
| Admin Settings → System Health, phones | A Google app ID with no spaces widened the page by 40px | Evidence and fix steps wrap anywhere |
| Admin therapist and patient detail, 360px | Name, code and status chips ran 15px off as one unbreakable row | The row wraps and the text column may shrink |
| Every dashboard, phones | The "Live updates paused" pill wrapped into a six-line bubble over the content | Sized to the screen, not half of it |

The probe also had two blind spots that were closed before trusting its
answer: a dashboard's own scrolling panel overflowing sideways (it treated
anything inside a scroll container as fine), and text inside a collapsed
`<details>` (which the browser still reports as displayed).

**Not yet in the sweep:** the rest of the dialogs (session note on a
completed session, pain exam, refund and goodwill forms, the admin
recommendation editor) and wizard steps after step 2. Add them to
`e2e/layout-states.spec.ts` the same way.
