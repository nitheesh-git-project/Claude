# Dr. Pooja's Physio

Production web app for a physical therapy practice offering both virtual
consultations and in-home visits: public marketing site, patient booking and
payments, therapist scheduling and earnings, hospital (B2B) referrals, and a
full admin back office.

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4,
Supabase (Postgres + Auth + Storage + Realtime), Razorpay payments, and
Google Calendar/Meet for session links.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in the values described below
npm run dev
```

Open http://localhost:3000.

Scripts: `npm run dev`, `npm run build`, `npm start`, `npm run lint`,
`npm run check:realtime`, `npm run test:e2e`.

`npm run check:realtime` (also run first by `npm run lint`) checks that every
table the dashboards subscribe to for live updates is present in the
`supabase_realtime` publication in `supabase/schema.sql`. A missing entry has
no visible symptom — the subscription succeeds and the events never arrive —
so this is the only place it gets caught.

### End-to-end regression suite

`npm run test:e2e` runs a scoped Playwright suite under `e2e/` against a
running `npm run dev` (started automatically if one isn't already up). It
is not a full UI test suite — it covers the paths where a silent regression
would cost real money or trust: the CAS-guarded concurrency races (refund
double-fire, therapist reassignment, referral double-assignment), home-visit
area gating, and bulk-scheduling limits. Every spec talks to the app's HTTP
API and Supabase directly (no browser), so it needs real credentials for a
**test/staging** Supabase project and Razorpay **test-mode** keys in the
environment or `.env.local` — never point it at production, since it creates
real auth users, appointments, and Razorpay test-mode orders.

### Database

`supabase/schema.sql` is the whole schema — tables, row-level security
policies, views, triggers, and functions. It is written to be safe to
re-run: every statement is guarded with `if not exists` / `or replace`, and
later sections add columns to earlier tables, so applying the file top to
bottom always converges on the current schema.

Apply it either:

- In the Supabase SQL Editor (Project → SQL Editor → New query), paste and
  run the whole file, or
- `node scripts/run-schema.mjs`, which applies it over the Supabase
  Management API — needs `SUPABASE_ACCESS_TOKEN` set (see below). Useful for
  re-applying after every change to the file without the manual copy/paste.

### Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-side Supabase key, RLS-constrained |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key that bypasses RLS. Never prefix with `NEXT_PUBLIC_`, never commit |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Razorpay Key ID, sent to the browser to open checkout |
| `RAZORPAY_KEY_SECRET` | Razorpay secret, server-only (order creation, signature verification, refunds) |
| `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET` | OAuth2 Web application credentials from Google Cloud Console |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` | Obtained once via `node scripts/get-google-refresh-token.mjs` (see that file's header for the one-time setup) |
| `GOOGLE_CALENDAR_ID` | Calendar the session events are created on; its authorizing account is the meeting organizer |
| `SUPABASE_ACCESS_TOKEN` | Optional. A Supabase Personal Access Token (Account → Access Tokens on supabase.com, **not** the service role key or DB password), only needed to run `node scripts/run-schema.mjs` |

Use Razorpay Test Mode keys (`rzp_test_…`) until the payment flow has been
verified end to end.

`.env.production` has been **deleted**. It set `NEXT_PUBLIC_SHOW_DEBUG_NAV=true`
(a "jump to page" bar on the live site listing every route, protected
dashboards included) and `ALLOW_DEBUG_DATA_RESET=true` (which armed the button
that truncates every table). Both defaults are correct when unset: the debug
bar renders only outside production, and `/api/admin/debug-reset` answers 404
rather than 403, so a probe cannot learn the endpoint exists.

If either variable is also set in a hosting dashboard (Vercel project settings,
for instance), deleting the file does **not** clear it — check there too. The
matching `debug_reset_all_data()` function still exists in `supabase/schema.sql`
and should be dropped once it is no longer needed for testing; `EXECUTE` on it
is revoked from `anon` and `authenticated`, so only the service-role key can
reach it in the meantime.

### Error and loading states

Every route tree has an error boundary (`src/app/error.tsx` plus one per
dashboard) rendering `RouteError`, and `src/app/global-error.tsx` catches a
throw in the root layout itself — the one case an ordinary boundary cannot,
since no layout has rendered by then, which is why that file inlines its own
styles and supplies its own `<html>`. `src/app/not-found.tsx` covers a stale
link. None of them print the thrown message: it can carry a column name or a
row id, and patients see these screens. Next's `digest` hash is shown instead,
so a report can still be matched to a server log.

All four dashboards have a `loading.tsx` rendering `RouteLoading`. Three of
them keep their sidebar inside each page rather than a shared layout, so the
skeleton draws a sidebar rail of its own (`withSidebar`) — without it, every
navigation would blank the whole chrome, which is worse than the no-boundary
behaviour it replaces. The admin dashboard gets one for the opposite reason:
it is the slowest page in the app, and a cold load there can take tens of
seconds under load.

## Roles

Four roles live in `profiles.role`, all backed by Supabase Auth users:

- **patient** — self-registers (or arrives through a hospital invite link)
  and waits for admin approval before they can sign in and use the
  dashboard. Booking an online session through `/book` is the one exception:
  a self-signup patient can go straight from signing up to attempting
  payment, and `/api/razorpay/create-order` flips `approved` to `true`
  itself the moment they genuinely try to check out — whether or not that
  payment goes on to succeed. A patient who fails or abandons checkout after
  a few tries still lands straight in their dashboard (appointment showing
  pending) via the booking wizard's own retry-limit prompt, instead of
  waiting on a human — while a bare `/patient/register` signup, with no
  payment intent at all, still queues for approval as before.
- **therapist** — applies, is approved by the admin, sets weekly
  availability, runs sessions, and requests payouts.
- **hospital** — provisioned by the admin (no self-signup). Refers patients
  and earns a configured revenue share on referred sessions.
- **admin** — promoted by hand in the Supabase Table Editor. Runs everything
  else.

`profiles.approved` and `profiles.active` gate access: unapproved users land
on `/pending-approval`, suspended users on `/account-suspended`. Both flags
are enforced twice — in the proxy for dashboard navigation, and again in
`src/lib/supabase/requireActiveProfile.ts` for the self-service API routes,
so a still-valid session cookie can't call the API around the UI gate.

## Routes

**Public marketing:** `/` (home), `/conditions`, `/how-it-works`, `/team`,
`/hospitals`, `/faq`, `/get-started`, `/book`, `/home-visit`,
`/book-home-visit`.

**Patient:** `/patient/register`, `/patient/login`, `/patient/dashboard`,
`/patient/dashboard/profile`, `/patient/dashboard/health-profile`.

**Therapist:** `/therapist/login`, `/therapist/dashboard`,
`/therapist/dashboard/profile`, `/therapist/dashboard/health-profile`,
`/therapist/dashboard/health-profile/[patientId]`.

**Hospital:** `/hospital/login`, `/hospital/dashboard`,
`/hospital/dashboard/profile`.

**Admin:** `/admin/login`, `/admin/dashboard`, organised into six sections
(defined once in `src/lib/adminNav.ts`):

| Section | Screens | Answers |
| --- | --- | --- |
| **Today** | Today · Approvals | What is waiting on me right now |
| **Sessions** | Schedule · All Sessions · Roster · Delivery · New Booking | What is being delivered, and by whom |
| **People** | Patients · Therapists · Partners | Who is this person, and their whole history |
| **Money** | Summary · Transactions · Payouts · Costs · Breakdown | What came in, what goes out, what it costs, what is still owed |
| **Catalog** | Conditions · Packages · Service Areas · Purchases | What we sell, at what price, where |
| **Settings** | Brand & Contact · Public Site · Booking Rules · Clinical Questions · Team & Access · System Health · Activity Log · Account Security | How the product behaves |

**How the Money screens divide a rupee.** Every figure on Money → Summary
comes out of one function, `moneyByBucketFor` in `src/lib/adminMetrics.ts`,
so the stat strip, the cards and the breakdown chart cannot disagree. Two
identities always hold:

```
net revenue  = gross revenue - refunds processed
clinic share = splittable net - therapists' share - partners' share
```

- **Gross revenue** — everything charged for sessions whose slot falls in
  the selected range.
- **Refunded** — refunds that actually processed, not ones that failed or
  were never eligible.
- **Therapists' share** — earned only on sessions actually *delivered*
  (`completed`), at that therapist's own rate, with a home visit's travel
  fee added in full. A session paid for but never delivered earns nobody a
  share.
- **Partners' share** — a referring hospital's commission, taken on net
  revenue, so a refund reverses the commission with it.
- **Clinic share** — what is left after both splits, before the clinic has
  paid for anything of its own.
- **Payment fees** — the gateway's cut of everything collected online, from
  the percentage set on Money → Costs. Taken on gross, because a processor
  keeps its fee even when a payment is refunded; cash-on-visit collections
  never touch a gateway and are excluded.
- **Running costs** — salaries, rent, software and the rest, recorded by
  hand on Money → Costs and dated to the day they were incurred.
- **Operating profit** — clinic share less those two. The only figure in the
  app entitled to the word profit, and still before tax. With no costs
  recorded for a period it is a ceiling rather than the real number, and the
  screen says so.

Revenue and the split have different eligibility on purpose. Gross, refunds
and net count every paid session; the split leaves out any session whose
division cannot be known — the therapist has no revenue share set, or the
patient came from a partner whose share is not configured — and the screen
names how many and how much rather than guessing a percentage.

**Balances are not date-filtered.** "Owed to therapists" is the all-time
balance, already net of cash therapists are holding from home visits, and is
the same number the Payouts screen and the Pay button use. Everything beside
it (revenue, refunds, what was settled) is scoped to the dates in view. Each
label says which it is. `MoneyGlossary` sits at the bottom of all four Money
screens with the full list.

The visible screen is in the URL (`?section=&tab=`), written with the
History API rather than a router navigation — this page is one Server
Component making ~40 queries, so moving between two already-rendered screens
must not re-run them. A screen is therefore linkable, survives a reload, and
is restored after `router.refresh()`.

Plus per-person detail pages at `/admin/dashboard/patients/[id]`,
`/admin/dashboard/therapists/[id]`, and `/admin/dashboard/conditions/[id]`.
Those detail pages use a parallel `@modal` route with intercepting routes, so
clicking a person from the dashboard opens an overlay while a direct link
still renders the full page.

**Shared:** `/pending-approval`, `/account-suspended`, `/reset-password`.

**API:** `src/app/api/**` — mutations are POST route handlers grouped by
audience (`admin/`, `appointments/`, `patient/`, `therapist/`, `hospital/`,
`packages/`, `home-visit/`, `razorpay/`). Every route re-authenticates
server-side; admin routes go through `src/lib/supabase/requireAdmin.ts`.

## How the app works

**Booking.** The `/book` wizard picks a treatment category, language, date,
and time slot. Slots respect the online booking lead time — 12 hours by
default, admin-editable at **Settings → Booking Rules**
(`site_settings.online_booking_lead_time_hours`, with
`BOOKING_LEAD_TIME_HOURS` in `src/lib/bookingSlots.ts` as the fallback) — the therapist's weekly availability template
plus per-date overrides (`therapist_availability_template`,
`therapist_availability_override`), leave flags, and conflict checks
(`src/lib/checkTherapistConflict.ts`). `/book?package=<id>` switches the same
wizard into package-purchase mode instead: the category step is replaced by
a read-only package summary, Step 1's date/time becomes session 1's slot,
and the review step pays for the whole bundle.

**Payments.** Razorpay checkout: `/api/razorpay/create-order` creates the
order, the browser opens the widget, and `/api/razorpay/verify` verifies the
signature server-side before the appointment is confirmed. Failures are
recorded in `payment_failure_log`. Session packages are bought the same way
via `/api/packages/create-order` and `/api/packages/verify` — the latter
also books session 1 when the wizard supplied a slot, via
`src/lib/bookPackageSession.ts` — then any later sessions are redeemed with
`/api/appointments/book-with-package`. Both package routes enforce the
package visibility switch server-side, not just in the UI. The standard
session fee lives in `src/lib/pricing.ts`. The online full-refund
cancellation window is 24 hours by default and admin-editable at **Settings
→ Booking Rules** (`site_settings.online_cancellation_refund_hours`, with
`CANCELLATION_FULL_REFUND_HOURS` as the fallback). Cancellations inside the
window get no refund; outside it, a Razorpay refund is issued and stamped on
the appointment. That automatic rule can only say "all" or "nothing", so an
admin can additionally return any amount on a paid session from its own
record (`/api/admin/refund-session-partial`) — it requires a stated reason,
caps at what is still refundable, sets `refund_is_manual`, and is recorded
in the activity log.

**Session packages.** A package is a programme, not just a discount: bundle
price, an optional struck-through compare-at price (derived from the
category's per-session price when left blank), promises, validity, and
per-programme rules (minimum gap between sessions, max sessions/week, max
purchases/patient) — configured field-by-field in the admin **Session
Manager** tab, not Site Content or Feature Control. Active packages appear as
cards on `/` and `/conditions` (each gated by its own `visible_on_home` /
`visible_on_conditions` flag, plus the site-wide visibility switch) and link
to `/book?package=<id>`. A purchase's `expires_at` is set the moment payment
clears — an abandoned checkout never eats into a validity window — using the
package's own `validity_days` or the site default. When a package has
`therapist_locked` on (the default) and the site-wide switch
(`package_therapist_lock_enabled`) allows it, the first therapist assigned to
any session on a purchase locks onto `locked_therapist_id`; every later
session booked on that purchase (`src/lib/bookPackageSession.ts`)
auto-assigns that therapist, auto-confirms (payment is already collected),
and creates its own Meet link — a scheduling conflict never costs the
patient a session, it just leaves that one `requested` and unassigned for
the admin queue. Admin can reassign a whole programme to a new therapist in
one action, extend or view a purchase's expiry, restore a forfeited session,
or issue a pro-rata refund on the unused balance (which also cancels any
still-scheduled future sessions). `sessions_used` counts sessions
**claimed** (scheduled or completed) — see the counter-semantics comment
next to `patient_package_purchases` in `supabase/schema.sql` for the exact
completed/scheduled/pending math every surface relies on.

The patient dashboard's **Your Packages** widget shows that math per
purchase — progress, days left, the locked therapist — with a **Schedule
sessions** button opening a multi-select calendar
(`src/components/packages/PackageBulkScheduler.tsx`) that books up to
`package_bulk_schedule_max` sessions in one request via
`/api/appointments/book-package-sessions`, enforcing the package's minimum
gap and max-sessions-per-week rules and reporting exactly which slots made
it in. Any package-covered session card (patient or therapist dashboard)
carries a tappable chip that opens the same
`src/components/packages/PackageDetailModal.tsx` — accessible (Escape,
focus management, scroll lock, like `TeamTherapistPopup`) and backed by
`/api/packages/purchase-detail`, which scopes fields by viewer: the patient
sees what they paid, the locked therapist sees the clinical picture without
the money. The therapist dashboard's **Programme Patients** section lists
every purchase locked to that therapist the same way.

There's no cron or background worker in this deployment, so a purchase's
`status` moves from `active` to `expired` lazily: `src/lib/expirePackagePurchases.ts`
sweeps any purchase past its `expires_at` at the top of the admin and
patient dashboard page renders (idempotent — a concurrent sweep just finds
nothing left to update). `bookPackageSession` also checks `expires_at`
directly, so a booking is blocked the instant a package lapses regardless
of whether that request's sweep has run yet. Package revenue shows up two
ways, deliberately kept apart: the Metrics tab's **Revenue (range)** and
Site Content's **Category Performance** already recognize a package
session's own slice of the bundle price as that session gets scheduled
(package sessions are ordinary paid appointments); **Package Cash
(range)**/**Package Cash** alongside them is the full amount actually
collected up front, which the Session Manager's **Sessions Banked** stat
mirrors from the other side — the still-unrecognized value of every
purchase's unscheduled sessions. A purchase within `package_expiry_reminder_days`
of expiring gets a highlighted warning in the patient's package widget and
counts toward Session Manager's `Expiring ≤Nd` stat.

**Home Visit.** A second delivery mode, built on the same `appointments`
table rather than a parallel one: `visit_mode` is `'online'` or
`'home_visit'`, and a home visit differs from an online session in only four
ways — it carries an address snapshot instead of a Meet link, a travel fee
on top of the package price, it can be paid in cash at the door as well as
prepaid, and its session code starts `HV####` instead of `SS####`. Anyone
can book either mode; there is no such thing as an "online patient" — the
patient dashboard's **Book a Session** section always offers all three
products (single online consultation, online session package, home visit
package), and history sections (**Your Sessions** / **Your Home Visits**)
only appear once a patient actually has that kind of session.

- *Serviceability and pricing.* Admin maintains a pincode-level service-area
  list (`home_visit_areas`, bulk pincode paste supported) with a travel fee
  per area. `/api/home-visit/check-area` is checked before an address is
  even collected, and re-checked server-side at checkout — a browser can
  never buy a visit to a pincode the admin hasn't opened. The travel fee is
  a pass-through reimbursement paid to the therapist in full
  (`src/lib/homeVisitPricing.ts`) and deliberately excluded from revenue —
  folding it into the package price would mean the therapist funds their own
  transport out of their own cut. `home_visit_packages` is a separate
  catalog from the online session packages; a one-off visit is just a
  1-visit package, so there are exactly three purchasable products, not
  four.
- *Address.* `patient_addresses` is the patient's reusable address book
  (label, lines, landmark, pincode, optional map pin, contact phone, access
  notes); every booked visit snapshots its own copy onto the appointment
  (`visit_address_*` columns) so a later edit to a saved address never
  rewrites where a past visit was actually delivered. The map picker
  (Google Places autocomplete + draggable pin) was deferred — the address
  step ships with typed fields today, and `latitude`/`longitude`/
  `map_place_id` simply stay null until it lands, with no migration needed
  when it does.
- *Payment.* Prepaid via Razorpay (`/api/home-visit/create-order` +
  `/api/home-visit/verify`, mirroring the online package flow) or cash
  collected at the door (`/api/home-visit/book-cash` — books immediately,
  no Razorpay round trip, and never auto-confirms since nobody has paid yet;
  the business assigns a therapist before anyone travels). A self-signup
  guest normally waits on admin approval before paying for anything, but a
  completed home-visit payment against a serviceable address is itself the
  vetting — both purchase routes skip the `approved` check and require only
  `active`, same precedent as hospital-referred patients.
- *Booking and programmes.* `src/lib/bookHomeVisitSession.ts` is the one
  race-safe claim-and-book implementation every entry point shares (single
  purchase, bulk scheduler, hospital referral conversion). When a package
  has `therapist_locked` on, the first therapist assigned to any visit on a
  purchase locks onto it for the rest of the programme, auto-confirming
  later visits (a scheduling conflict never costs the patient a visit — it
  just lands `requested` and unassigned for the admin queue instead). The
  conflict check is padded by `home_visit_travel_buffer_minutes` on both
  sides of the new slot, since a therapist finishing one visit cannot be at
  another minutes later — an online session needs no such padding. The
  patient dashboard's **Your Home Visit Packages** widget mirrors **Your
  Packages**: progress, expiry warning, a **Schedule visits** button
  (`HomeVisitBulkScheduler.tsx` → `/api/home-visit/book-visits`, enforcing
  the package's minimum-gap/max-per-week rules and the bulk limit against a
  programme's single saved address), and a detail modal
  (`/api/home-visit/purchase-detail`, viewer-scoped the same way the online
  package route is). `visits_used` counts visits **claimed** (scheduled or
  completed), never completed — identical semantics to `sessions_used`, see
  the counter-semantics comment next to `home_visit_package_purchases` in
  `supabase/schema.sql`.
- *Cancellation and refunds.* Home visits use their own admin-configurable
  refund window (`home_visit_cancellation_refund_hours`) instead of the
  online one (`online_cancellation_refund_hours`) — a therapist has to physically travel, so the
  business can reasonably want more notice. A cash visit has no Razorpay
  payment to reverse; if cash was already collected and the cancellation is
  still eligible, `refund_status` is set to `'manual_pending'` and surfaced
  on the admin **Cash Ledger** as an action queue until the cash is
  physically handed back (`/api/admin/mark-cash-refund-returned`). Admin can
  also reassign a whole programme to a new therapist, extend its expiry,
  restore a forfeited visit, or pro-rata refund a prepaid programme's unused
  balance (sourced from the actual Razorpay order total, since
  `amount_paid_paise` deliberately excludes travel) — cash-on-visit
  programmes are refunded visit by visit instead, since there's no single
  payment behind the whole programme to reverse.
- *Delivery.* The therapist's **Home Visits** tab shows the address, a
  working Maps link (exact pin when one exists, formatted address
  otherwise), the patient's phone, and access notes — no Join button. A
  calendar event is still created (`location` set to the address, no Meet
  conferencing) since Google's invite email is the only outbound
  notification this platform sends; `google_meet_enabled` only gates
  conferencing, never event creation. Cash collection
  (`/api/therapist/record-cash-collection`) and remittance
  (`/api/admin/mark-cash-remitted`) are tracked as two separate timestamps
  on the appointment, reconciled on the admin **Cash Ledger**; a therapist's
  payout nets off any cash they're currently holding
  (`src/lib/therapistCashLedger.ts`), so a settlement only ever moves the
  money that actually needs to change hands. `profiles.home_visit_revenue_share_percent`
  is an optional separate split from the therapist's ordinary
  `revenue_share_percent`, falling back to it when unset.
- *B2B.* A hospital's referral form can mark a referral `'home_visit'` with
  a pincode; `/api/admin/assign-referral` applies the same travel-buffer
  conflict padding, and `/api/patient/register-via-referral` snapshots the
  address onto the resulting appointment and seeds it into the new patient's
  address book. `/api/razorpay/create-order` — the same generic route every
  plain online appointment pays through — adds the travel fee on top of the
  charge for a home-visit appointment, while still writing only the
  session's own price to `amount_paid_paise`.
- *No cron exists in this deployment* (see below), so a home-visit
  purchase's `status` moves from `active` to `expired` the same lazy way a
  package purchase's does: `src/lib/expireHomeVisitPurchases.ts`, swept at
  the top of the same dashboard renders.

**Video sessions.** Confirming an appointment creates a Google Calendar event
with a Meet link (`src/lib/googleCalendar.ts`,
`src/lib/googleCalendarSync.ts`). Calendar failures never block a booking —
the error is stored in `appointments.google_calendar_sync_error`, and the
session is re-attempted automatically: `src/lib/retryDueMeetSyncs.ts` sweeps
a few failed syncs at the top of each admin dashboard render (there is no
cron in this deployment), bounded by a per-attempt timeout, a per-sweep row
limit, and `appointments.google_calendar_sync_attempts`, which stops retrying
a session that has failed too many times rather than calling Google forever.
Those exhausted sessions stay in the admin's Sync Health panel marked as
needing attention, where a manual retry (`/api/admin/retry-meet-sync`) both
re-attempts the event and re-arms the automatic attempts. Both paths claim
the session (`appointments.google_calendar_sync_claimed_at`) before calling
Google, so a Retry click and a background sweep can never create two
calendar events for one session; a Retry that lands while a sync is already
running answers "already running, try again in a moment". The Join button
only opens inside a configurable window around the slot time.

**Feedback and ratings.** Patient and therapist each rate the session after
it completes. Aggregates (`src/lib/ratingAggregate.ts`, the
`public_rating_summary` view) feed the public team page; the admin can hide
individual ratings, hide a therapist's rating, or hide ratings site-wide.

**Payouts.** Each therapist has a `revenue_share_percent`. Earnings are
computed per completed, paid session (`src/lib/therapistEarnings.ts`,
`src/lib/therapistPayouts.ts`); therapists request payouts
(`therapist_payout_requests`), and the admin reviews, settles, and batches
them (`therapist_payout_batches`) with downloadable receipts.

**Hospital referrals.** Hospitals submit referrals from their dashboard or
share an invite link / referral code. Referred patients carry
`referred_by_hospital_id`, which drives the hospital's revenue share. The
public `/hospitals` page also captures anonymous B2B leads into `b2b_leads`,
which only the admin can read back.

**Admin-managed content.** Treatment categories (with ordering), FAQs,
testimonials, feature toggles (Meet on/off, join window, idle-timeout
minutes, booking languages), and **Brand & Contact Details** (website name,
tagline, description, contact email, WhatsApp number, contact phone, footer
copyright text — the strings the public Navbar and Footer render) are all
editable under **Settings** (Brand & Contact, Public Site, Booking Rules),
stored in `site_settings` and their own tables — see `src/lib/adminSettings.ts`.
Brand & Contact Details fields save individually (click Edit on a field,
change it, Save) via `/api/admin/update-setting`, same as every other
`site_settings` column; the root layout reads them on every request to pass
into `Navbar`/`Footer`, so a change is live everywhere those render, not
just on the admin page. Session packages live under **Catalog → Packages**
(beside the home-visit packages) and **Catalog → Purchases**; their
package-wide settings — visibility, default validity, the therapist-lock
switch, the bulk-scheduler limit, the expiry reminder window — sit with
every other rule under **Settings → Booking Rules**; see "Session packages"
above.

**Admin scopes, activity log, and admin-created bookings.** `profiles.
admin_scope` is one of `full`, `operations`, `finance`, `clinical` (see
`src/lib/adminScope.ts`). It decides which sections an admin can open, and
is enforced server-side by `requireAdminScope()` — hiding a section in the
sidebar is presentation only. Only a `full` admin can change scopes or
create another admin, nobody can change their own, and the last `full` admin
cannot be narrowed. Admins are created from **Settings → Team & Access**
(`/api/admin/create-account`, which also creates patients and therapists by
hand), so the database no longer has to be edited to add one.
`admin_activity_log` records every mutating admin action — actor, action,
subject, amount, timestamp — readable at **Settings → Activity Log** and
append-only by construction: the table has a select policy and no insert
policy, so the only writer is the service-role client inside the API routes.
**Sessions → New Booking** (`/api/admin/create-booking`) books an online
session on a patient's behalf, running the same conflict check and Meet sync
as a patient's own booking, with an explicit payment state and a logged
lead-time override. Home visits are not bookable this way yet — they need an
address and a serviceable pincode.

**Realtime.** `src/components/RealtimeRefresh.tsx` subscribes to Supabase
Realtime so dashboards refresh when the underlying rows change.

**Session notes and the prep loop.** A therapist assigned to any session
automatically gets that patient's full chart — this is unchanged (read
access needs no request; only *writing* to the patient's own intake or Pain
Map needs an admin-approved `condition_access_grants` row). What is new is
that the chart is now a preparation surface and has a clinician-only layer
of its own:

- **My Patients** (`/therapist/dashboard/health-profile`) lists everyone
  assigned to this therapist, soonest session first, each row carrying the
  plan left by the last session note, how the patient responded, anything
  flagged to watch, and how many notes are on file.
- **The session note** (`session_notes`, fields in
  `src/lib/sessionNotes.ts`) is written from the session card itself right
  after the session — what was treated, techniques and dosage, how the
  patient responded, home exercise prescribed, plan for the next session,
  anything to watch, plus free text. It opens as a pop-up so it costs no
  navigation.
- **Only the treating therapist and admins can read it.** There is no
  patient select policy on the table, the patient's data export and print
  view exclude it, and the dialog says so to the writer. A formal
  medical-records request is a clinic process outside the app.
- **Editable for 24 hours, then locked.** Every edit inside the window
  copies the previous version into `session_note_revisions`, so a record
  can never be silently rewritten.
- **Nothing is blocked on it.** Marking a session complete stays one tap;
  an unwritten note shows as "Notes to write" on the therapist's Overview
  and as a `needsYou` item in their feed until it exists.
- Admins see every note on the patient's condition detail screen, which is
  how the clinic can tell whether care is being delivered and documented.

**Dashboard information architecture.** Patient: Overview · Book a Session ·
Your Sessions · Packages · Payments · Health Profile · Edit Profile.
Therapist: Overview · Availability · Sessions · Earnings · My Patients ·
Edit Profile. Hospital: Overview · Refer a Patient · Your Referrals ·
Earnings · Edit Profile. Admin keeps its six sections
(`src/lib/adminNav.ts`).

These lists are the result of repeatedly merging entries that answered the
same question:

- Video sessions and home visits are one filtered Sessions screen on both
  the patient and therapist side (`SessionFilterList`).
- Calendar is a **view switch** on that same Sessions screen
  (`SessionsView`), not an entry of its own — a calendar is a way of
  looking at your sessions, not a different set of them.
- Programmes is a view switch inside the therapist's My Patients
  (`TherapistPatientsView`): the same people, grouped by package purchase
  rather than by name.
- Earnings absorbed Payout Receipts — one question, what am I owed and
  what have I been paid.
- The patient's three package entries became one Packages screen.

Naming follows one rule per role, so no word carries two meanings: money
owed *to* you is **Earnings** (therapist and hospital alike), money going
*out* is **Payments** (patient), and the clinic's own books are **Money**
(admin). The hospital's Account Security entry became **Edit Profile**,
which is what the page now is: organisation details (admin-reviewed, since
patients are told who referred them), contact preferences, and account
security. A screen that can only ever be empty is not shown at all —
Payments appears once a patient has a session or a package.

**Dashboard navigation.** The patient, therapist and hospital dashboards are
sets of real pages — `/patient/dashboard/sessions`,
`/therapist/dashboard/earnings`, `/hospital/dashboard/referrals` and so on —
one per sidebar entry, the same as Edit Profile has always been. They used to
be anchors on a single very long page with the sidebar highlighting whichever
section was nearest the top as you scrolled, which read as the nav choosing
for you. Each dashboard has one server-only loader
(`src/lib/{patient,therapist,hospital}DashboardData.ts`) shared by all of its
routes, and a `*DashboardShell` component for the chrome.

**Dashboard Overview (all four roles).** Patient, therapist, hospital and
admin dashboards each open on the same Overview screen
(`src/components/dashboard/DashboardOverview.tsx`): four headline figures,
a notification feed, and a quick-actions list. The figures differ per role
(a patient's next session and health-profile completeness; a therapist's
sessions today, sessions to mark complete and money owed; a hospital's
referrals and revenue share; the admin's sessions today, queue totals,
unassigned sessions and cash to remit) but the layout, wording style and
components are identical. The admin's Overview is the first tab of
**Today**, ahead of the exhaustive Action Inbox.

The feed is derived rather than stored (`src/lib/dashboardFeed.ts`): every
item comes from rows the page already queries — appointment statuses,
condition change requests, payouts, referrals, `admin_activity_log` — so
there is no notifications table and nothing for a cron to write. Items that
still need the viewer carry `needsYou`, which pins them to the top and
drives the "N things need you" count; there is deliberately no read/unread
state.

**Patient Care Intake and Pain Map.** Two linked but separate layers of a
patient's condition data, both surfaced on `/patient/dashboard/health-profile`
(patient), the therapist's `/therapist/dashboard/health-profile/[patientId]`,
and the admin's **Patient Conditions** tab.

- *Patient Care Intake* (`patient_condition_profiles`,
  `condition_change_requests`) is general history/severity answers plus a
  self-reported per-area pain scale (`src/lib/conditionIntake.ts` —
  `chief_complaint`, `since_when`, `severity`, `area_pain`, `worsens`,
  `helps`, `notes`). `area_pain` reuses the same 17 regions and
  `BodyMapDiagram` as the Pain Map below, but is the *patient's own*
  self-report (0–10 per tapped area, `AreaPainPicker.tsx`) — a separate
  dataset from the therapist's clinical exam, so the two can later be
  compared. Question wording and which questions are mandatory are both
  admin-editable (`intake_question_templates`, same override-table pattern
  as Pain Map's question bank — see below), enforced both client- and
  server-side on submit. The patient fills it themselves, or a therapist
  fills it on their behalf once granted access. Every submission — first
  fill or a later edit, from either role — queues in
  `condition_change_requests` and only becomes the live profile once an
  admin approves it; declining keeps the proposed data intact so the
  submitter can amend and resubmit. Admin's own edits (`ConditionDirectEditForm`)
  apply immediately, no review needed. One pending submission per patient at
  a time. The fill itself is a
  step-by-step pop-up, not a form on the page: `ConditionIntakePanel.tsx`
  shows only what's on file plus a "start / continue" button, and
  `ConditionIntakeWizard.tsx` asks one question per screen with
  plain-language help text saying why that answer matters, a progress bar,
  and a final review step before sending. Seven fields at once read as
  paperwork; one question at a time reads as a conversation. Help text,
  placeholder and short label are code-side (`IntakeQuestion.helpText` /
  `placeholder` / `shortLabel`) and deliberately *not* admin-editable —
  only wording and required-ness are. Answers autosave to
  `patient_condition_profiles.draft_data` as it is filled (`/api/patient/condition-profile/save-draft`,
  `/api/therapist/condition-profile/save-draft`) so closing mid-fill loses
  nothing; a submission clears the draft. Reopening the wizard prioritizes an
  in-progress draft, then a declined submission's answers, then the last
  approved data, and resumes on the first still-unanswered question. An
  abandoned fill is therefore never lost and never submitted: the answers
  sit in `draft_data`, the patient dashboard's reminder banner counts them
  ("You're 3 of 7 questions in"), and the Health Profile offers "Finish
  where you left off". Nothing reaches the therapist until the patient
  sends it and an admin approves it. Once approved, the answers render as
  `ConditionSummaryCard.tsx` — a chart, not a filled-in form — under a
  four-cell snapshot strip (`HealthSnapshotStrip.tsx`) and a three-step
  explainer (`HealthProfileSteps.tsx`) that says who writes which half of
  this screen.
- *Pain Map* (`pain_assessments`, `pain_map_question_templates`,
  `src/lib/painMap.ts`) is a 17-region clinical exam a therapist fills in
  after examining the patient — region-specific question sets with an
  admin-editable question bank, ending in a 0–100 pain percentage per
  region. Unlike the intake, this posts live immediately (it's the
  therapist's own clinical judgement, not an administrative edit). It also
  needs no access grant: a therapist assigned to the patient can record what
  they found, the same rule session notes use, while editing the patient's
  *intake* on their behalf still queues for admin approval. Rows are
  append-only so the patient's dashboard can show a trend against the
  previous assessment for that region. The patient can only view this, never
  edit it. Admin can also post an entry directly
  (`/api/admin/pain-assessments/submit`, no access-grant needed — admin is
  the final authority, same reasoning as the intake's direct-edit path),
  through the identical dialog so the two can never drift apart; like every
  other write here it's a new row, never an edit of a past one.

  Recording an exam happens in `PainExamDialog`, opened from the one body
  map by **Record an exam** or by tapping a region. The region is chosen by
  tapping the figure or picking a chip — never a dropdown — and stays in the
  dialog's header, alongside what that area scored last time, while the
  clinician works. The twenty questions are grouped into *What they
  describe · What sets it off · Pain on testing · Your findings*
  (`PAIN_EXAM_GROUPS`) instead of listed flat, and nothing is required.

  **Everything on screen is out of ten.** The exam is stored as a 0–100
  percentage while the patient rates their own pain 0–10, and printing both
  raw put "How you rate it 6/10" next to "Last exam found 34%" in the same
  row of figures. `formatPainOutOfTen()` is the single display helper; the
  stored column is untouched. All three surfaces
  render the same tap-point body diagram
  (`src/components/profile/BodyMapDiagram.tsx`, a jointed lay figure rather
  than a muscle chart — every joint doubles as a clinical landmark) via the
  shared `PainMapExplorer`/`PainMapView`; tapping a point in fill mode
  (therapist or admin) picks that region+side directly instead of a manual
  dropdown, and tapping an assessed point in view mode (patient/admin)
  opens a popup with that region's detail.

Both question banks (Patient Care Intake and Pain Map) are managed from
one place — a **Manage Questions** section at the top of the admin's
**Patient Conditions** tab (`QuestionBankManager.tsx`), not per-patient —
since question wording/required-ness is global config, not something tied
to one patient's record.

Both layers share one write-access model (`condition_access_grants`): a
therapist may only write to a patient's condition data after the patient's
admin approves an access request (`/therapist/dashboard/health-profile` →
"Request access to edit"). Read access is automatic for the patient's
assigned therapist — only *write* is gated. "Assigned" means the therapist
has ever had an appointment with the patient, or holds a package's
`locked_therapist_id`. Write access is exclusive to one therapist per
patient at a time — approving a new therapist's request automatically
revokes any other therapist's currently-approved grant for that same
patient, rather than leaving two therapists able to edit the same
condition data at once.

A patient's first dashboard visit also shows a one-time, skippable guided
spotlight tour (`src/components/patient/OnboardingTour.tsx`,
`profiles.onboarding_seen_at`) that highlights the actual sidebar nav items
in sequence. The Health Profile step also carries a "Fill it in now" CTA
that jumps straight there (marking the tour seen, same as Skip/Done) instead
of requiring the rest of the tour to finish first. The tour is separate from
the persistent "complete your health profile" banner on the main patient
dashboard, which keeps nudging based on intake status regardless of whether
the tour was seen or skipped.

Beyond the core workflow, a few surfaces exist specifically to make the
data useful once it's collected, not just to collect it:

- **One body map, two views** (`PainMapExplorer.tsx`) — the exam figure
  (`PainMapView.tsx`) with a switch to the comparison
  (`PainComparisonView.tsx`), where the patient's self-reported `area_pain`
  and the therapist's clinical Pain Map sit on one figure (fill = clinical
  finding, blue ring = patient also flagged it), so it's obvious where the
  two agree or don't. The switch only appears once the patient has marked
  areas of their own. Under it, `RegionStandingsList.tsx` ranks every
  examined area worst-first with its trend. Shown to patient, therapist,
  and admin.
- **Progress line** (`PainTrendChart.tsx`) — the average pain percentage
  recorded at each exam, oldest to newest, answering "am I getting better?"
  in one line. Deliberately one series: the patient's own 0–10 severity is
  a different scale and never shares the axis.
- **Point of care** — the therapist's Assigned Sessions cards link straight
  to that patient's Health Profile, and the Health Profiles list flags
  patients with no *approved* access grant yet as "New" (a merely-requested,
  not-yet-approved grant still counts as new — it still needs admin's
  attention) so a first-time assignment doesn't go unnoticed.
- **Admin audit trail** — a direct intake edit (`ConditionDirectEditForm`)
  also inserts an already-"approved" `condition_change_requests` row, so it
  shows up in the same Review History as every reviewed submission instead
  of silently overwriting `data` with no record of the prior value.
- **List search/filter/sort** (`ConditionsListFilter.tsx`) on the Patient
  Conditions tab, and an aging flag ("Waiting N days") on a pending request
  once it's sat for 3+ days.
- **Admin data exports** — every downloadable table in the admin back
  office (All Sessions, the receipts log, patient/therapist payment
  history, the therapist and patient ledgers, both package-purchase
  tables, and the activity log) offers **CSV** for a spreadsheet and
  **PDF** for a person, built from one column definition per table
  (`DataExportButtons` → `/api/admin/export-pdf`, `src/lib/tablePdf.ts`).
  Both always contain exactly the rows on screen with the filters in view
  applied, and the PDF prints the range or filters it was scoped to.
- **Patient data export** (`/api/patient/condition-profile/export`) — a
  typeset **PDF** of the patient's own intake, every Pain Map exam and the
  reports they have on file, downloaded as `Name_PatientCode.pdf` (e.g.
  `Priya_Sharma_PT0042.pdf`). Built server-side with `pdf-lib` in
  `src/lib/healthProfilePdf.ts`; the standard PDF fonts encode WinAnsi
  only, so every string is transliterated first and a name in a
  non-Latin script degrades rather than throwing. `?format=json` still
  returns the raw structure for machine-readable portability, and Print
  still uses the browser's own print dialog for the screen as it stands.
  Session notes are excluded from all three. No deletion path yet — that's
  a retention-policy decision for the practice, not something to build
  without that call being made first.
- **Test reports and scans** (`patient_medical_documents`,
  `MedicalDocumentsPanel.tsx`) — the patient uploads X-rays, MRI reports,
  blood tests, prescriptions and referral letters onto their own Health
  Profile, and the assigned therapist and admin can open them from the
  same chart. The files live in a **private** `medical-reports` Storage
  bucket and only their metadata is in Postgres; reads go through
  `/api/medical-documents/view`, which authorises with the caller's own
  RLS-scoped client and then mints a 120-second signed URL. Uploads are
  capped at 10MB per file and 20 files per patient, restricted to PDF and
  photo types, and photographed reports are re-compressed in the browser
  first. Uploading and deleting are the patient's own — a therapist and an
  admin read only, and the table has no update policy at all.
- Pain Map's popup shows a full per-region history list and a trend
  sparkline (not just the latest-vs-previous arrow), and who posted the
  latest entry (therapist or admin).
- `area_pain` entries can carry an optional free-text note per area (e.g.
  "started after a fall"), shown alongside the pain score everywhere it's
  displayed.
- The admin Patients tab (not Patient Conditions) shows a compact severity
  signal — self-reported severity and pain-area count — right where admin
  already manages patients, without a separate trip.

Deliberately not done: a hard gate blocking booking on intake completion
(a real business-risk decision, not something to make unilaterally — the
dashboard banner and onboarding tour are the current nudge mechanism), and
push/email notifications for any of this workflow's state changes (separate
planned work).

## Project layout

```
src/app/                 App Router pages, layouts, and API route handlers
src/components/          UI components (admin/, auth/, booking/, dashboard/,
                         home/, hospital/, profile/, motion/, visuals/)
src/lib/                 Domain logic, formatting, and Supabase clients
src/lib/supabase/        client / server / admin / public clients, proxy
                         session refresh, and the auth guards
src/proxy.ts             Auth proxy; matches the four dashboard route trees
supabase/schema.sql      Full database schema, RLS policies, views, triggers
scripts/                 One-off tooling (Google refresh-token helper)
public/                  Static assets
```

Notable conventions:

- Money is stored in paise (integers), never floats.
- Times are stored as `timestamptz`; display helpers live in
  `src/lib/formatIST.ts`, `formatSlotTime.ts`, and `formatSlotRange.ts`.
- Business math is kept in dependency-free modules under `src/lib/` so it can
  be reasoned about (and tested) without rendering components.
- Newer, migration-dependent columns (e.g. `session_code`) are queried in
  isolated calls and merged in, so a missing column can't blank an entire
  shared query.

## Knowledge graph (optional, one-time)

`graphify-out/graph.json` and `GRAPH_REPORT.md` are committed and refreshed by
CI on every merge to `main` (`.github/workflows/graphify.yml`), so a fresh
clone already has a current graph. To also refresh it locally whenever you
merge into `main`:

```bash
pip install graphifyy               # the graphify CLI
git config core.hooksPath .githooks # enables .githooks/post-merge
```

Git hooks aren't shared by a clone, so this is per-machine. Skipping it costs
nothing — the graph still arrives with the next `git pull`.

## Deployment

Deployed on Vercel. Set every variable from the table above in the project's
environment settings (service role, Razorpay secret, and Google credentials
as server-only), and apply `supabase/schema.sql` to the target Supabase
project before the first deploy.
