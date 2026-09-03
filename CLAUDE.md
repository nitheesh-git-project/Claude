# Dr. Pooja's Physio

Production Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 app
for a physical therapy practice: public marketing site, patient booking and
Razorpay payments across two delivery modes (video consultation and in-home
visits), therapist scheduling and payouts, hospital (B2B) referrals, and an
admin back office. Data, auth, storage, and realtime come from Supabase;
session video links come from Google Calendar/Meet. The admin back office is
organised into six sections — Today, Sessions, People, Money, Catalog,
Settings — defined once in `src/lib/adminNav.ts`.

The public marketing site is eight pages — `/`, `/conditions`,
`/how-it-works`, `/home-visit`, `/team`, `/mission`, `/faq`, `/hospitals` —
defined once
in `src/lib/marketingNav.ts` and assembled from one shared, photo-led design
system in `src/components/marketing/`. The home page scrolls down into a
connector grid linking every other page plus booking; the other six end in
the same grid minus themselves. Photographs are static imports registered in
`src/lib/marketingPhotos.ts` and live under `public/photos/`. Catalog
covers (programmes and packages) are admin-supplied `image_url` values
instead, falling back to `CatalogImage`'s shared placeholder.

- `README.md` — product overview, setup, environment variables, routes, and
  how each flow works.
- `AGENTS.md` — the working rules for editing this codebase (imported below;
  follow it in full).
- `supabase/schema.sql` — the entire database schema, RLS policies, views,
  and triggers. Single source of truth, re-runnable, append-only.

**The debug bar stays switched on, in every environment, until launch.**
This app has no real patients yet. `isDebugNavVisible()`
(`src/lib/debugNavVisible.ts`) is the single source of that rule: on unless
`NEXT_PUBLIC_SHOW_DEBUG_NAV` is exactly `"false"`, so `next dev`,
`next build` + `next start` and the deployed site all show it. Do not gate
it back behind `NODE_ENV`, do not hide it "because production", and do not
re-inline that expression at a call site. The owner removes it by hand
before going live — and removal means deleting the bar, since the flag is
public and the bar names `/admin/login` and `/admin/dashboard`. The
database-wipe flag (`ALLOW_DEBUG_DATA_RESET`) is a separate, server-only
thing and stays unset.

The health profile is **per specialty**: a condition profile carries
`specialty` (`ortho`, `neuro`, `pediatrics`), and that decides its seven
questions, its summary card, its snapshot figures and its progress line.
A therapist triages the patient at first contact and writes the first
record — needing only assignment, and going live with no review — and that
fill is what unlocks the patient's own access to it. The Pain Map is an
orthopaedic layer and stays one; the other two exam layers are explicitly
deferred. See the "Patient Care Intake and Pain Map" rule in `AGENTS.md`.

Patient files (avatars, and the test reports and scans patients upload to
their health profile) live in Supabase Storage, never in a table column —
`patient_medical_documents` holds metadata only, and its bucket is private.
The patient's own record leaves the app as a PDF named
`Name_PatientCode.pdf` (`src/lib/healthProfilePdf.ts`), not as JSON.

Before writing code: read the relevant guide in `node_modules/next/dist/docs/`
— this Next.js version differs from training data.

Therapist availability is three things and reads as three things: a
**weekly schedule** (what someone normally works, as working periods rather
than hourly cells), **exceptions** (a date that differs), and **time off**
(off the roster entirely, `profiles.on_leave`). One editor serves the
therapist's own screen and the admin's Roster, which opens on a list of
therapists rather than a calendar date and an eighteen-column grid. The
storage model behind it is unchanged -- `src/lib/availabilityRanges.ts`
converts between periods and the hour rows the tables have always held. The
roster is the clinic's planning record; it does not filter the patient's
booking picker, and availability never touches an appointment. See the
"Nobody edits an hour" rule in `AGENTS.md`.

Nobody is admitted to a session by hand. Meet's default access admits only
signed-in Google users who are on the invite and makes everyone else knock,
which for patients registering with whatever email they have meant both
parties waiting for the clinic's own Gmail account to let them in. Each new
session's meeting is switched to open access right after its Calendar event
is created (`src/lib/googleMeetSpace.ts`, the Meet REST API's
`meetings.space.settings` scope). A failure never invalidates the session --
the link works, the meeting just keeps its waiting room -- and lands on
Settings -> System Health -> Waiting Room with a Fix button and a bounded
automatic retry. Open access removes the knock, not the sign-in: a meeting
organised by a personal Gmail account still requires a Google account to
join, and only moving the organiser to Workspace changes that. One switch,
`meet_open_access_enabled`, on by default.

A paid session is assigned automatically when **exactly one** therapist is
unambiguously free for it -- rostered that hour, approved, not on leave and
with no clashing session -- or when the patient's own requested therapist is
among the free ones (`src/lib/autoAssignTherapist.ts`, called from both
payment-confirmation paths). Anything less certain leaves the session in the
admin's queue exactly as before. It is one switch
(`auto_assign_therapist_enabled`, off for its first release) and it does not
change what times a patient is offered: the roster still does not filter the
booking picker.

Session credits live in an append-only ledger (`session_credit_ledger`)
over `session_entitlements`, not in a mutable counter. Every movement goes
through a database function holding a real row lock, keyed for idempotency
on the appointment or payment that caused it, and
`verify_entitlement_balances()` reports any disagreement on Settings →
System Health. Whether balances are read from the ledger or from the older
counters is one admin switch (`entitlement_ledger_authoritative`), off by
default and reversible without a release. Admins can change any balance — grant, reverse, revive, all
with a mandatory reason — and cannot change any history.

An admin can write a recommendation on a therapist's behalf when that
therapist cannot reach their dashboard — same rules, same package whitelist,
programmes narrowed to that session's own condition, attribution stated at
the button, attributed to the clinician (`authored_by`) and recorded as typed
by the admin (`entered_by`) — and can withdraw one. They can also approve a
queued one with different numbers, which is the same thing again: a new
version through the same function, never an edit of the clinician's. All
three doors call `authorCarePlanVersion()`, and none of them can set a
price.

A therapist recommends treatment after a session as a **care plan**
(`care_plans` + append-only `care_plan_versions`), written from the session
note dialog. They answer two questions — which condition, and how many
sessions — and those two select exactly one admin-configured package. There
is no price, session count or discount column for anyone to set. Plus four
clinical fields. It needs a completed session they ran, and a purchased plan
is never re-versioned: a later recommendation opens a new thread. The same
rows render on the therapist's chart and the patient's Health Profile.

**The clinic approves it before the patient sees it.** A submission lands
`pending_review` and shows on Sessions → Recommendations, counted in Today's
inbox; an admin approves it in one tap, turns it down with a reason the
therapist reads, or approves it with different numbers — which writes a
*new* version attributed to the clinician and entered by the admin rather
than editing theirs, since versions are append-only. Decisions are recorded
in append-only `care_plan_reviews`; a reason is required only for the two
that take something away. Approval re-checks the live catalogue first, so a
stale offer is caught by the admin rather than by the patient's refused
payment, and the offer window is stamped at approval rather than at
authoring so a plan that waited does not reach the patient with its time
already spent. The queue is oldest-first and aged in words. One
switch, `care_plan_requires_approval`, on by default and failing closed.

The patient answers on **Suggested Sessions**, which also carries the
therapist-proposed times that used to live on Overview alone; accepting
re-derives the price server-side, refuses on a catalog mismatch, and grants
exactly the recommended sessions.

**Paying ends in booked appointments, not a balance.** The payment lands on
a confirmation and one next step; the scheduler opens with the whole run
already proposed from the clinician's own cadence
(`src/lib/sessionRhythm.ts` — a proposal only, re-checked server-side); and
anything still unbooked stays a `needsYou` item on the patient's dashboard
until the balance is spent. The patient's word for all of it is
**programme**.

A patient's first purchase is **one session**. A multi-session programme is a
clinical judgement, so it comes from a care plan and never from a price list:
`src/lib/consultationFirst.ts` allows direct purchase only of a single
session or visit, and the old `/book?package=` checkout is deleted. A
one-visit home package is the home-visit consultation and stays purchasable —
without it, a patient who needs to be seen at home would have no entry point,
since ordinary consultations are always video.

**Nor is a programme advertised.** The public pages carry no programme
catalogue at all: `/` and `/conditions` show treatment categories and their
consultation price, `/home-visit` shows single visits only, and the
`show_programme_prices` switch is retired rather than defaulted off — a
toggle somebody can flip back on is not the rule being gone. The patient
dashboard's booking hub is the same: one video consultation, or one visit
at home.

Four acquisition discounts exist and no more (`src/lib/discounts.ts`,
`promoCodes.ts`, `inviteRewards.ts`), recorded as five sources because an
invite has two halves: a standing **first-session offer**, whose eligibility
is "has this patient ever paid for a session" asked of the database and so
cannot be claimed twice or posted from a browser; a **goodwill adjustment**
an admin applies to one unpaid session with a mandatory reason and an audit
row; a **promo code**, a campaign an admin sets up that a patient claims by
typing its name at checkout; and a **patient invite**, which takes something
off the invited friend's first session and something off the inviter's next
one. They never stack — the largest applies, and a tie goes to the most
deliberate decision — travel is never discounted, and all four facts are
recorded — list price, amount off, which rule, and why — so the books can
tell "sold cheap" from "discounted". What discounting cost is **reported** on
Money → Costs, split by rule and never deducted from profit: it is already
inside gross revenue as a smaller number. Bundle pricing stays
`compare_at_paise` on a package.

**The payment screen quotes what checkout charges, and a discount may reach
zero.** One module resolves the price and every discount
(`src/lib/checkoutQuote.ts`), read by three callers that must never disagree:
`/api/appointments/quote` (a read, for the figure on the button),
`/api/razorpay/create-order` (the authority, claiming under a row lock), and
`/api/appointments/confirm-free`. The wizard used to print the category price
while create-order silently applied a first-session offer behind it. When a
discount takes the total to nothing there is no gateway order at all —
Razorpay refuses one, and the old ₹1 floor charged a figure nobody was
quoted; `MINIMUM_CHARGE_PAISE` now means only "the least a gateway order may
be", tested by `isGatewayPayable`. The free confirmation re-resolves
server-side and refuses with 409 if anything is still owed, writes no
`payments` row (no money moved, and that table is keyed on Razorpay's own
ids), records `amount_paid_paise = 0` with all four discount facts, and still
does everything a paid confirmation does — auto-assignment, the Meet event,
settling an invite half. A goodwill adjustment is the one rule still floored
above zero: it is a number a person typed, not an advertised free session.

**A promo code is an identifier, not an amount.** The browser sends the code;
every figure comes from the row an admin created. Its redemption cap is
enforced by `claim_promo_code()` under a row lock rather than by a count
taken a moment earlier, and a claim that is never paid for stops counting
after a checkout hold computed at read time — no status column, no sweep,
the same rule a pending session suggestion follows. The claim is recorded on
the booking (`appointments.promo_code_id`), not in a second table, so the
count and the money cannot disagree. Off by default
(`promo_codes_enabled`), because a code field with no campaign behind it
teaches every patient that there is a discount they are missing.

**An invite is not a referral.** A referral is a hospital sending a patient
under a commercial agreement; an invite is one patient telling another, and
the two words stay apart (`patient_invites`, and the referral flow's own
"invite link" is now a *registration link*). The inviter's half is earned
when their friend's first session is **paid for**, never on a signup, and a
patient may claim an invite exactly once and only before their own first
paid session. Amounts are snapshotted at claim, so lowering the reward later
does not lower what was already promised. Off by default
(`invite_rewards_enabled`), with a per-patient ceiling on rewards.

Treatment is paid for through this platform, and two admin-switchable
controls keep it that way. Every string one role writes and another reads is
scanned (`src/lib/contactLeakScan.ts` via `src/lib/communicationFlags.ts`):
a payment handle or payment link is refused, a phone number or email is
delivered and recorded, and clinical text full of numbers is left alone —
the two tiers exist because a check that cries wolf is a check nobody
reads. A patient's phone is masked on the therapist's screens and their
email is not loaded there at all; the real number comes one session at a
time from `/api/therapist/reveal-contact`, inside a video session's join
window or on a home visit's own day, and every reveal is logged.
`communication_flags` and `contact_reveal_log` are admin-read-only and
append-only by trigger. See the "platform keeps its own conversations" rule
in `AGENTS.md`.

Suspicious patterns surface on Today → Risk as `risk_signals`, written by a
bounded lazy sweep after the admin render. A flag is never an accusation and
never carries a penalty — nothing is suspended, held or hidden because a rule
fired; a signal links to the rows behind it and an admin acts, if at all,
through the ordinary screens. Thresholds are `risk_rules` and the two that
need a clinic baseline ship disabled. Reviews are append-only and need a real
note.

Payments are recorded in `payments` (one row per Razorpay order, unique on
both the order id and the payment id) and confirmed by whichever of the
browser callback or `/api/razorpay/webhook` arrives first — both go through
the one idempotent `record_payment_capture` function. Setting
`RAZORPAY_WEBHOOK_SECRET` is what makes the webhook half work; without it
a patient who pays and closes the tab leaves a paid order against an unpaid
booking.

Quick commands: `npm run dev`, `npm run build`, `npm run test` (Vitest over
the dependency-free `src/lib` modules), `npm run verify` (lint + test +
build), `npm run lint` (which also
runs `npm run check:realtime`, the Supabase Realtime publication coverage
check). A Playwright
e2e suite covers the money-critical paths, the public pages' section
navigation, the catalog detail dialogs, the specialist booking handoff and
the patient-only booking rule, therapist-suggested sessions, the Home
page walkthrough's admin-configured rotation pace, and self-signup without
an email-confirmation step, the brand splash's cold-open and
long-absence rules and its admin settings, and the Session Completed cutoff,
and the therapist roster end to end -- ranges, exceptions, leave,
authorization, stale and double-clicked saves, and the booking regression
(`npm run test:e2e`, see `e2e/`)
but needs a test Supabase project and Razorpay test keys — verify a change
with a build and a lint.

These three docs describe the app, so keep them current: whenever a change
adds or removes a route, role, environment variable, npm script, or alters a
documented rule (booking lead time, refund window, payment verification, Meet
sync, payout math) or a schema flow, update the docs in that same change
before it reaches `main`. See "Keeping the docs current" in `AGENTS.md`.

@AGENTS.md
