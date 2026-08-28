<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Dr. Pooja's Physio — agent guide

Production web app for a virtual physical therapy practice: public marketing
site, patient booking and payments, therapist scheduling and earnings,
hospital (B2B) referrals, and an admin back office. `README.md` has the full
product and setup description; this file is the working context for coding
agents.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
Supabase (Postgres, Auth, Storage, Realtime) · Razorpay · Google
Calendar/Meet (`googleapis`) · `motion` for animation · Font Awesome ·
`libphonenumber-js` · `pdf-lib` (every PDF this app generates: the
patient's health profile and the admin's table exports).

Commands: `npm run dev`, `npm run build`, `npm start`, `npm run lint`,
`npm run check:realtime`, `npm run test:e2e`. `npm run lint` runs
`check:realtime` first: `scripts/check-realtime-coverage.mjs` fails the lint
when a table the UI subscribes to was never added to the `supabase_realtime`
publication in `schema.sql`. That mismatch has no runtime symptom — the
subscription succeeds and simply never fires — so the check is the only
thing that catches it. The e2e suite (Playwright, `e2e/`) covers the
money-critical paths and the admin back office — booking + payment,
concurrency/CAS guards, bulk limits, admin route authorization for every
role, input validation, payout/refund maths, the dashboard's own
navigation in a real browser, the public pages' section rail and scroll
arrow (`section-nav.spec.ts`), the public catalog's detail dialogs
(`catalog-detail.spec.ts`), and booking a named specialist from `/team`
(`therapist-request.spec.ts`), who may book plus the dashboards' way home
(`booking-account-role.spec.ts`), and therapist-suggested sessions including
button spam, concurrent answers and a dropped connection
(`session-suggestions.spec.ts`), the Home page walkthrough's
admin-configured rotation pace (`journey-pace.spec.ts`), and self-signup
going through with no email-confirmation step
(`patient-registration.spec.ts`), the Session Completed cutoff on every
surface that lists a session (`session-completed-cutoff.spec.ts`), and the
brand splash's cold-open, reload and long-absence rules together with its
admin settings (`splash-screen.spec.ts`). It needs a
test/staging Supabase project plus
Razorpay test keys, so `npm run build` and `npm run lint` remain the default
verification for a change that can't reach one.

Three environment notes for the browser specs:

- Set `PLAYWRIGHT_CHROMIUM_PATH` when the sandbox already ships a Chromium.
- They sign in by injecting a Node-minted session cookie rather than typing
  into the login form, so a sandbox whose browser has no outbound network
  can still exercise the whole dashboard.
- **A spec that needs the *browser* to reach Supabase cannot pass here.**
  The cookie injection above covers authentication, not data: a page that
  resolves something with the browser-side client still needs egress from
  Chromium. `therapist-request.spec.ts` TR-002 is the case in point —
  `BookingWizard` resolves `?therapist=` against `public_therapist_profiles`
  from the browser (the page is ISR-cached, so it cannot be done
  server-side), so with no egress the chip never renders and the test fails
  on a working feature. Check it before hunting for the bug:
  `fetch(SUPABASE_URL + "/rest/v1/")` from inside the page returns
  "Failed to fetch" where the same call from Node returns 200. Note TR-003
  asserts that chip is *absent*, so in the same environment it passes for the
  wrong reason.
- `admin-login.spec.ts` is the exception, since the login form itself is
  what it tests: it needs a second app instance whose
  `NEXT_PUBLIC_SUPABASE_URL` points at `scripts/.qa/supabase-relay.mjs` (a
  localhost passthrough to the real Supabase, nothing mocked), and skips
  itself when that instance isn't running. Next refuses two dev servers in
  one directory, so it is a separate pass:
  `RELAY_TARGET=$NEXT_PUBLIC_SUPABASE_URL node scripts/.qa/supabase-relay.mjs`,
  then `NEXT_PUBLIC_SUPABASE_URL=http://localhost:8099 npx next dev -p 3100`,
  then `E2E_BASE_URL=http://localhost:3100 npx playwright test e2e/admin-login.spec.ts`.

`e2e/admin-degraded-schema.spec.ts` drops columns and tables and restores
them by re-applying `schema.sql` in a `finally`. Point it at a throwaway
project, never one whose data matters.

The suite runs `workers: 1` deliberately: every spec talks to the same
Supabase project and the same app instance, so parallel files read each
other's rows out of shared tables and contend for one server. Running two
workers made contention look like product bugs — an audit-log count picked
up another spec's writes, and the admin dashboard's ~70 queries blew past
an assertion timeout.

**Run the browser specs against `next dev`, not `next start`.** The public
pages are ISR-cached (`export const revalidate = 300`), so a production
server hands back HTML generated at build time — which predates any fixture
row the spec just created. `catalog-detail.spec.ts` fails four ways under
`next start` (the card for its freshly-created package is simply not in the
markup) and passes 7/7 against `next dev`, where nothing is cached. Those
failures look exactly like a broken catalog, so check which server you are
pointed at before suspecting the components.

It is also **not fully idempotent across repeated runs against one
database**. `E-018/C-008` books a slot a fixed seven days out and leaves the
appointment behind, so the next run's booking is refused as a clash; a rerun
after deleting future appointments for the `qa.*@example.test` fixtures
passes. If a spec fails on a second consecutive run but passes on a fresh
one, suspect leftover state before suspecting the app.

## Layout

```
src/app/                 pages, layouts, API route handlers
src/app/api/**           POST route handlers grouped by audience:
                         admin/, appointments/, patient/, therapist/,
                         hospital/, packages/, razorpay/, and
                         medical-documents/ (the one route every role
                         shares, authorised by RLS rather than by role)
src/components/          UI, grouped by area (admin/, auth/, booking/,
                         catalog/, dashboard/, home/, hospital/, marketing/,
                         profile/, motion/, system/, visuals/)
src/components/marketing/ the eight public pages' design system: PageHero,
                         Section, PhotoTile, SplitFeature, StepStrip,
                         IconCard, TrustBar, ExploreGrid, ClosingCta
src/lib/                 domain logic, formatting, Supabase clients
src/lib/adminNav.ts      the admin dashboard's six sections + their screens
src/lib/marketingNav.ts  the eight public pages + their one-line purposes
src/lib/mission.ts       the mission, vision, promises and stated limits
src/lib/marketingPhotos.ts every photograph the public pages use
src/lib/careAreas.ts     the six areas of practice, shared by / and /conditions
src/lib/adminScope.ts    admin scopes and which sections each one may open
src/lib/conditionSpecialty.ts the three condition specialties, the triage
                         questions and the suggestion rule
src/lib/intakeOrtho.ts   the orthopaedic intake question set
src/lib/intakeNeuro.ts   the neurological intake question set
src/lib/intakePediatrics.ts the paediatric intake question set
src/lib/conditionProfileServer.ts server-side helpers every condition
                         route and page shares
src/proxy.ts             auth proxy over the four dashboard route trees
supabase/schema.sql      the entire schema: tables, RLS, views, triggers
scripts/                 one-off tooling
public/photos/           the public pages' photography (licence-free stock)
```

## Roles and access

`profiles.role` is one of `patient`, `therapist`, `hospital`, `admin`.
Patients and therapists self-register and wait for approval; hospitals are
provisioned by the admin; admins are promoted by hand in Supabase.

**Email confirmation is off, deliberately, and the app assumes it.** The
Supabase project keeps *Confirm email* disabled, so `signUp` returns a
session immediately and the admin's approval is the only gate a new account
waits on. Never add a "check your email" step back into a sign-up path: a
signup with no session is a misconfigured project, and the four sign-up
call sites (`PatientAuthCard`, `TherapistAuthCard`, `BookingWizard`,
`HomeVisitBookingWizard`) all report it as a failure rather than an
instruction. `e2e/patient-registration.spec.ts` is what catches the setting
being turned back on.

Two flags gate everything: `profiles.approved` and `profiles.active`.
They are enforced in **two** places and both must stay in place:

1. `src/proxy.ts` → `src/lib/supabase/proxy.ts` for dashboard navigation.
2. `src/lib/supabase/requireActiveProfile.ts` inside self-service API routes,
   because a valid session cookie can call the API directly around the UI.

Admin routes go through `src/lib/supabase/requireAdmin.ts`. Never trust a
role, an id, or an amount sent from the client — re-derive it server-side.

Admins additionally carry a scope (`profiles.admin_scope`: `full`,
`operations`, `finance`, `clinical` — see `src/lib/adminScope.ts`), which
decides which dashboard sections they can open. **Every** admin route guards
with `requireAdminScope(section)`, not `getAdminUser()`; the sidebar hiding a
section is presentation only, since a session cookie can call any route
directly. The section is chosen by the capability, not by where the button
happens to sit — a refund is `money` even though its button lives on a
Catalog screen. And a guarded route needs the UI to match: a control an
admin's scope cannot call must not render, or they get a 403 with nothing
to explain it. `ProfileSessionList`, `SessionDetailDrawer` and the two
purchase detail modals take `canSeeMoney` / `canManageSessions` for exactly
that reason.

`getAdminUser()` and the proxy's admin branch both refuse a suspended admin
(`profiles.active`). They deliberately do **not** check `approved`: an admin
is promoted by hand rather than through the signup queue, so gating on it
would lock out the people it protects. Only a `full` admin can change
scopes or mint another admin, nobody can change their own, and the last
`full` admin cannot be narrowed — otherwise a single mis-click locks
everyone out permanently.

Every mutating admin route records what happened via
`recordAdminActivity()` (`src/lib/adminActivityLog.ts`), and every action in
the `AdminActivityAction` union has a caller — that used to be true of only
16 of them, which left the largest money move in the app (`payout.settle`)
unattributed. Adding an action without a caller, or a mutating route without
a call, puts the log back where it was. A generated password never goes in
`details`: the log is readable by every admin, so who reset what and when is
the part with audit value. The call goes **after** the route's CAS claim,
so the log cannot record a settlement or cancellation that lost its race. It is best-effort
and never throws: an audit write failing must not block the action it
describes, same posture as the Meet-sync rule below. `admin_activity_log`
has a select policy and deliberately no insert policy, so the service-role
client is the only writer and the log is append-only from any session.

## Supabase clients — pick the right one

- `src/lib/supabase/client.ts` — browser, anon key, RLS applies.
- `src/lib/supabase/server.ts` — server components / route handlers, acts as
  the signed-in user.
- `src/lib/supabase/public.ts` — unauthenticated server reads of public data.
- `src/lib/supabase/admin.ts` — service role, **bypasses RLS**. Server-only.
  Use it only after an explicit auth check, and never import it into anything
  that can reach the browser.

## Schema conventions

- `supabase/schema.sql` is the single source of truth and is re-runnable:
  guarded with `if not exists` / `or replace`, with later sections adding
  columns to earlier tables. Add changes at the **end** of the file in that
  same guarded style; do not rewrite earlier statements. Two guards are easy
  to forget and both broke a re-run in practice: a policy needs
  `drop policy if exists` under **its own** name (not just the name it
  replaces), and `alter publication ... add table` needs the
  `do $$ ... exception when duplicate_object then null; end $$` wrapper every
  other publication line in the file uses. Re-apply the file twice after
  touching it — the schema-apply workflow runs it on every push to `main`.
- New columns are migration-dependent — a live database may not have them
  yet. Query such a column in its own isolated call and merge the result in
  (see `src/lib/sessionCode.ts`), so one unknown-column error can't blank
  every field of a shared query.
- Money is integer paise. Times are `timestamptz`. Percentages
  (`revenue_share_percent`) are 0–100.
- **Session credits are a ledger, not a counter.** `session_entitlements`
  is what a patient bought; `session_credit_ledger` is every movement of it,
  append-only. The counts on the entitlement are a *cache* the ledger
  maintains by trigger, and the CHECK on that cache is what makes an
  impossible balance impossible rather than merely unwritten — a ledger row
  that would overdraw fails the constraint and takes its transaction with
  it. Six rules hold this together:
  1. **Every movement goes through an RPC** (`reserve_session_credit`,
     `consume_session_credit`, `release_session_credit`,
     `void_session_credits`, `adjust_session_credits`), called from
     `src/lib/sessionCredits.ts`. They open with `select … for update`,
     which is a real lock — verified with 12 concurrent reserves against one
     credit, of which exactly one won. Never write the ledger directly.
  2. **Idempotency keys are derived from the thing that happened**, never
     random: `reserve:<appointment_id>`, `consume:<appointment_id>`. A
     random key makes every retry look like a new event, which is the bug
     the key exists to prevent. Idempotency is checked *before* availability
     in `reserve_session_credit`, deliberately — checking availability first
     answers "no credits available" for a booking that in fact succeeded.
  3. **The ledger is append-only, enforced by a trigger, not by RLS.** The
     revoke covers a browser session; every route in this app writes with the
     service-role client, which bypasses RLS entirely. For a table whose
     whole value is that it cannot be rewritten, "no route updates it" is
     not the same guarantee as "an update raises".
  4. **`sessions_granted` and `package_snapshot` are frozen by trigger.**
     A purchase's definition never moves; its balance moves through the
     ledger. Never resolve a purchased entitlement by joining the live
     catalog row — read the snapshot, or an admin re-pricing a package
     silently rewrites what someone already owns.
  5. **A refund voids what is available, never what is consumed.** A
     delivered session stays delivered.
  6. **`admin_adjust` is the only entry type with free-form deltas, and the
     only one requiring a reason** — ten characters minimum, enforced by a
     CHECK so it holds for any caller. It is the override lane behind
     `/api/admin/grant-session-credits`, `reverse-session-credit` and
     `revive-entitlement`: an admin can change any balance, and cannot
     change any history.

  **The ledger is written alongside the old counters, and does not yet
  replace them.** All eight statements in `src/` that mutate
  `sessions_used` / `visits_used` now have a mirror call beside them
  (`src/lib/sessionCreditMirror.ts`), and a mirror failure never fails the
  operation it mirrors — the counter is still authoritative, so a logged
  disagreement that reconciliation surfaces beats refusing a booking
  because a shadow ledger was unhappy. Two of the mirrors have no counter
  write to mirror at all, and both are the ledger saying something the
  counters could not: a **refund** never touched the counters (it cancels
  the remaining appointments in place and leaves the counter inflated), and
  an **expiry** left the balance implicit. A **late cancellation** mirrors
  a `consume` rather than nothing — the balance is the same either way, but
  leaving the reserve outstanding would claim a cancelled session is still
  pending. New purchases get their entitlement from
  `ensure_entitlement_for_purchase`, called by both verify routes and by
  cash-on-visit booking, which never becomes `paid` and so reaches neither.

  `verify_entitlement_balances()` reports where the cache, the ledger and
  the legacy counter disagree, on Settings → System Health. It reports and
  never repairs — a silent auto-fix on a money record is how a discrepancy
  becomes permanent. It has already earned itself twice, catching two
  distinct bugs in the backfill it checks.

- **An invariant the app enforces belongs in the database too.**
  `sessions_used` / `visits_used` were guarded only by application-level
  compare-and-swap — correct, and true only for as long as every writer
  remembers the `.eq()` predicate, and not true at all for a hand-run
  UPDATE in the table editor. Both now carry CHECK constraints. If one
  fails against a live database, that failure is the finding: reconcile the
  rows, don't weaken the check.
- Any new table needs RLS policies written alongside it in the same file.
- A change to `schema.sql` only reaches the live database once it's applied
  — either by hand with `node scripts/run-schema.mjs`, or automatically via
  `.github/workflows/schema-apply.yml`, which runs that same script against
  Supabase on every push to `main` that touches `supabase/schema.sql` (needs
  the `SUPABASE_ACCESS_TOKEN` and `NEXT_PUBLIC_SUPABASE_URL` repo secrets
  set). Merging a schema change without either path running leaves the DB's
  policies out of sync with code that assumes them — the app can look fixed
  in review and still fail in production the same way.

## Domain rules worth knowing before editing

- **Booking lead time** is 12 hours, defined once in `src/lib/bookingSlots.ts`
  and shared by the picker and the validator so they cannot drift apart.
- **Availability** = weekly template + per-date overrides + leave flag, then a
  conflict check (`src/lib/therapistAvailability.ts`,
  `src/lib/checkTherapistConflict.ts`).
- **Payments** must be verified server-side: `/api/razorpay/verify` checks the
  signature before anything is confirmed. Never confirm on a client callback.
  **A capture is applied in exactly one place**: `record_payment_capture` in
  `schema.sql`, called through `src/lib/recordPaymentCapture.ts` by the three
  verify routes and by `/api/razorpay/webhook`. It is a database function
  rather than TypeScript because supabase-js cannot express a transaction,
  and a capture has to move a `payments` row and the row it paid for
  together under a real `select ... for update`. It is idempotent by
  construction — the second caller for an order finds it captured and
  changes nothing — which is what makes duplicate webhooks, Razorpay's
  at-least-once retries, a webhook racing the browser callback and a
  double-clicked Pay button all safe without any of them knowing about the
  others. It deliberately does **not** confirm an appointment or create a
  Meet event (those need an outbound Google call, so they stay in the
  route), and it never revives a cancelled booking. Add a new payment
  purpose by extending its `purpose` check, not by writing a second
  fulfilment path.
  **The webhook's signature is checked against the raw body.** `await
  request.text()`, never a re-serialised parse: `JSON.parse` then
  `JSON.stringify` does not round-trip byte-for-byte, so verifying a
  re-serialised body rejects legitimate webhooks and tempts someone to
  "fix" it by skipping the check. The webhook inserts its
  `payment_webhook_events` row **before** doing any work, because that
  insert colliding on `razorpay_event_id` is the deduplication; processing
  first and recording after would let a retry arriving mid-flight do the
  work twice.
  **`payments` has unique indexes on `razorpay_order_id` and
  `razorpay_payment_id`, and they are the point of the table.** Nothing in
  this database previously stopped one payment id being recorded against
  two rows. The per-table payment columns on `appointments` and the two
  purchase tables are unchanged and still answer "is this paid for";
  `payments` is the record of money. Don't drop those indexes to make an
  import succeed — a collision means a duplicate already exists and wants
  investigating.
  For a single online session, `/api/razorpay/create-order` flips the paying
  patient's `profiles.approved` to `true` the moment they genuinely attempt
  checkout (`approvePatientForGenuinePaymentAttempt` in
  `requireActiveProfile.ts`) — deliberately on the attempt, not a completed
  payment, so a patient who fails or abandons checkout after repeated tries
  still lands straight in their dashboard via BookingWizard's escape hatch,
  appointment showing pending, rather than being bounced to
  `/pending-approval`. The pre-payment appointment row that order is minted
  against is created by `/api/appointments/create`, which gates on plain
  `isProfileActive` for the same reason — a self-signup patient is
  unapproved by definition, and that row (always unpaid, unassigned,
  `requested`, `online`) grants nothing on its own. **Appointments are never
  inserted by the browser**, same rule as home visits: that route re-derives
  concern, duration, lead time and the therapist preference from the session
  and the category row. It replaced a direct client-side insert whose only
  validation was the `appointments_insert_own` RLS policy — which made one
  policy in a live database, reachable only by running
  `scripts/run-schema.mjs`, the single point of failure for the whole
  booking funnel, and failed real bookings with a raw Postgres
  "new row violates row-level security policy" string at the last step of
  checkout. The policy and its insert grant are now dropped at the end of
  `schema.sql`. Home-visit and package purchases keep the stricter "only a
  *completed* payment vets you" rule instead (`/api/home-visit/create-order`
  uses plain `isProfileActive`, no auto-approve). Standalone patient
  registration (`/patient/register`, no booking involved) always waits on a
  human admin — the point of gating on genuine payment intent is to keep a
  bare signup from being a free way to skip that queue.
- **Cancellation/refund**: full refund only outside the 24-hour window in
  `src/lib/pricing.ts`; inside it, none. Home visits use their own window
  instead (`home_visit_cancellation_refund_hours`, `cancelAppointmentAndRefund`) —
  see the Home Visit bullet below.
- **Google Calendar/Meet sync must never block a booking.** Failures are
  recorded on the appointment (`google_calendar_sync_error`), re-attempted
  automatically by `src/lib/retryDueMeetSyncs.ts` (a lazy sweep at the top of
  the admin dashboard render — see the no-cron rule below), and retried by
  hand by the admin (`/api/admin/retry-meet-sync`). The automatic sweep is
  capped three ways because, unlike the expiry sweeps, it makes outbound
  Google API calls from inside a page render: a wall-clock timeout per
  attempt, a few appointments per sweep, and
  `appointments.google_calendar_sync_attempts` capping attempts per
  appointment so a permanently broken row (revoked credentials, deleted
  calendar) is not retried forever. Both the sweep and the manual Retry
  route claim an appointment through
  `appointments.google_calendar_sync_claimed_at` before calling Google, with
  a staleness window so a render that dies mid-attempt releases its row:
  `createSessionCalendarEvent` only ever creates, so two overlapping
  attempts leave an orphaned event on the calendar under a link the
  appointment no longer points at. At the cap the row stays in the admin's
  Sync Health panel flagged as needing a person; a manual Retry resets the
  counter. A home visit still gets a
  calendar event even when `google_meet_enabled` is off — that toggle only
  gates the Meet conferencing, not event creation, since the invite email is
  the only outbound notification this platform sends.
- **Home Visit is a delivery mode, not a parallel booking system.**
  `appointments.visit_mode` (`'online'` / `'home_visit'`) is the only new
  column that matters at read time; everything else about an appointment —
  patient, therapist, payout, rating, refund — works identically either way.
  Anyone can book either mode; there is no "home-visit patient" vs.
  "online patient". A visit's address is snapshotted onto the appointment
  (`visit_address_*`) from the patient's reusable `patient_addresses` book,
  never referenced live, so editing a saved address later can't rewrite a
  visit already delivered. The travel fee (`travel_fee_paise`) is a
  pass-through reimbursement paid to the therapist in full and always
  excluded from revenue (`src/lib/homeVisitPricing.ts`) — never fold it into
  a price or a therapist funds their own transport. `home_visit_areas`
  (pincode → travel fee) gates what can be sold at all:
  `/api/home-visit/check-area` is checked before an address is even
  collected, and re-checked server-side at every purchase route — never
  trust a serviceability answer the browser already has. A locked
  therapist's conflict check is padded by
  `home_visit_travel_buffer_minutes` on both sides of the new slot
  (`findTherapistConflict`'s `bufferMinutes` option) since a therapist
  finishing one visit cannot be at another minutes later; online passes 0.
  Cash-on-visit purchases legitimately sit at `payment_status: 'unpaid'`
  for their whole life with real confirmed visits hanging off them — never
  assume `payment_status` reflects whether money changed hands for a home
  visit purchase the way it does everywhere else; check `payment_mode`
  first. Cash collected and not yet remitted is real exposure: it nets off
  what a therapist's payout actually transfers
  (`src/lib/therapistCashLedger.ts`), and a cash refund with no Razorpay
  payment behind it becomes `refund_status: 'manual_pending'`, surfaced on
  the admin Cash Ledger until an admin confirms the cash was handed back.
  `visits_used` counts visits **claimed** (scheduled or completed), never
  completed — identical rule to `sessions_used`, see the counter-semantics
  comment beside `home_visit_package_purchases` in `schema.sql`. See the
  "Home Visit" section in README.md for the full flow.
- **A therapist suggests; the patient books.** A therapist can propose the
  next session on a programme locked to them
  (`/api/therapist/suggest-session`), and the patient accepts or declines
  (`/api/patient/respond-suggestion`). Three rules hold the design together
  and none of them is optional:
  1. A suggestion is its own row (`session_suggestions`), never an
     appointment in a new status. `sessions_used` counts sessions *claimed*;
     a suggestion claims nothing, and storing it as an appointment would
     either spend a session every decline had to refund or leave a row the
     counter deliberately ignores. Only acceptance calls
     `bookPackageSession()`, which is what makes the count move.
  2. No slot is held. A hold needs releasing, releasing needs a sweep, and
     there is no scheduled worker -- so the therapist's calendar is
     re-checked at acceptance instead.
  3. Nothing writes an "expired" status. A pending suggestion simply stops
     being acceptable once its slot is inside the booking lead time, computed
     by `suggestionState()` in `src/lib/sessionSuggestions.ts` everywhere it
     is read. `status` records explicit human actions only.
  At most one pending suggestion per purchase, enforced by a partial unique
  index rather than a route check, because a double tap defeats
  SELECT-then-INSERT. Both dashboards' controls guard submits with a
  synchronous ref (a `disabled` attribute lands a render too late) and never
  clear optimistically, so a request that dies on a bad connection leaves the
  person exactly where they were. Gated by
  `site_settings.therapist_suggestions_enabled`, off by default.

- **Session packages lock to one therapist by default.** The first therapist
  assigned to any session on a `patient_package_purchases` row sets
  `locked_therapist_id`; every later session on that purchase auto-assigns,
  auto-confirms, and gets its own Meet link via
  `src/lib/bookPackageSession.ts`, never through the normal per-session admin
  assignment flow. `sessions_used` counts sessions **claimed** (scheduled or
  completed), not completed — see the counter-semantics comment beside
  `patient_package_purchases` in `schema.sql`. A scheduling conflict on the
  locked therapist never fails the booking; the session lands `requested`
  and unassigned in the admin queue instead. Reassigning a whole programme
  (`/api/admin/reassign-package-therapist`) only ever touches future
  sessions — completed ones keep whoever actually ran them. A patient can
  schedule several remaining sessions in one request via
  `/api/appointments/book-package-sessions`, which loops
  `bookPackageSession()` per slot after enforcing the package's own
  minimum-gap/max-per-week rules and the bulk limit — it's the batch-level
  rules layer, not a second booking implementation.
- **No cron or background worker exists in this deployment.** Anything that
  needs to happen "when time passes" (a package purchase's `status` moving
  from `active` to `expired` past `expires_at`) runs as a lazy, idempotent
  sweep at the top of a relevant page's render instead of on a schedule —
  see `src/lib/expirePackagePurchases.ts`, called from both the admin and
  patient dashboard pages before their own reads. Follow this pattern
  rather than reaching for a cron job or a queue. Home-visit purchases get
  the identical treatment via `src/lib/expireHomeVisitPurchases.ts`, and
  failed Meet syncs via `src/lib/retryDueMeetSyncs.ts`. A sweep that calls an
  external API is the one that needs limits: bound it by wall-clock time,
  rows per sweep, and attempts per row, or a permanently failing row becomes
  an unbounded retry loop attached to every page render.
- **Package (and home-visit package) detail is viewer-scoped, not
  role-branched.** `/api/packages/purchase-detail` and
  `/api/home-visit/purchase-detail` both query the purchases table with the
  caller's own RLS-scoped client rather than checking role: the
  `*_purchases_select_*` policies already encode exactly who may see a given
  purchase, so a row coming back at all *is* the authorization check. Only
  the one cross-role name lookup RLS can't provide (the other party's name)
  uses the admin client. Don't add a manual ownership branch here or you'll
  duplicate what the policies already guarantee.
- **Business math lives in dependency-free `src/lib/` modules** (`pricing`,
  `adminMetrics`, `therapistEarnings`, `therapistPayouts`, `ratingAggregate`,
  `packageProgress`, `homeVisitPricing`, `homeVisitProgress`,
  `therapistCashLedger`, `healthProfileSummary`) so it can be reasoned about
  without rendering. Keep new math there rather than inside components.
- **Patient Care Intake and Pain Map are two separate data layers**, and
  the intake is **per specialty**. A `patient_condition_profiles` row
  carries `specialty` — `ortho`, `neuro` or `pediatrics` — and that
  decides its question set (`src/lib/intakeOrtho.ts` / `intakeNeuro.ts` /
  `intakePediatrics.ts`, assembled in `conditionIntake.ts`), its summary
  card, its snapshot strip and its progress line. Four things about this
  are load-bearing:
  1. **Question keys are globally unique across the three sets and `data`
     stays flat.** Ortho keys are unchanged, neuro keys are all `neuro_*`,
     peds keys all `peds_*`. That is what lets a re-triaged patient keep
     the previous specialty's answers in the same blob (hidden, never
     deleted) with no jsonb migration inside a re-runnable file. A
     module-load assertion in `conditionIntake.ts` throws if the rule is
     ever broken — violated silently it cross-contaminates two patients'
     charts.
  2. **Applying an approved change MERGES, it does not replace.**
     `mergeSpecialtyAnswers()` keeps every key the incoming specialty does
     not own. The approve path used to write `data: proposedData`
     outright, which under re-triage deletes a patient's whole
     orthopaedic record the moment a neurological one is written.
  3. **`schema_version` is per specialty**
     (`INTAKE_QUESTIONS_VERSION_BY_SPECIALTY`), so it means "version of
     *this profile's own* set". One shared scalar bumped to 3 would have
     fired the "we've changed some of these questions" banner at every
     existing patient even though ortho's seven are byte-identical.
  4. **Pain Map is ORTHOPAEDIC and stays so.** Neuro and paediatric exam
     layers are deferred. A non-ortho page does not merely hide the body
     map — it never queries `pain_assessments` (both health-profile pages
     do a two-phase read to know the specialty before choosing what to
     fetch), and both exam-submit routes 400. When those layers are
     built they are a **new table** (`neuro_assessments`), a new question
     module, a new `*Snapshot`, and one more arm on `SpecialtyExamPanel`
     — never a `specialty` column on `pain_assessments`, which would make
     every reader branch. The two new summary cards must not import
     `PAIN_MAP_REGIONS` or `parseAreaPain`; that import boundary is what
     keeps the rule true in practice rather than only in intent.

  **The therapist owns the first fill, and it is not reviewed.** A
  patient's record does not exist until a therapist triages them
  (`ConditionTriageDialog`, four questions in
  `src/lib/conditionSpecialty.ts` that *suggest* a specialty with its
  reason shown, never auto-accepted) and fills that specialty's set.
  `/api/therapist/condition-profile/onboard` needs only
  `isTherapistAssignedToPatient` and writes **live**. Both halves matter:
  the access-grant queue cannot sit in front of the first record ever
  existing (the exact failure the Pain Map gate was changed to avoid),
  and the patient is locked out of their own health profile until it
  lands, so an admin approval in between would leave them on a read-only
  screen after their session with nothing happening. Live is not
  unrecorded — every onboarding and re-triage writes an
  already-`approved` `condition_change_requests` row, the pattern
  `ConditionDirectEditForm` already uses, so it appears in the ordinary
  Review History with no new concept and no queue.

  **The line is create versus edit.** Deciding what kind of patient this
  is, and writing down what they told you in a session you ran, is the
  therapist's own clinical record — the same kind of thing a Pain Map
  exam or a session note is, and gated the same way. *Editing* a live
  record on the patient's behalf is editing their own account of their
  history and still needs an admin-approved `condition_access_grants`
  request plus review (`/api/therapist/condition-profile/submit`).

  **The patient is read-only until that first fill**, computed once by
  `patientIntakeGate()` — a four-state union, not a boolean, because "not
  yours to do" and "yours, but not right now" need different copy. It is
  enforced in `submit` *and* `save-draft` (which flips `status` to
  `draft`, one of the gate's own inputs) and in
  `condition_change_requests_insert_gated`, without which the lock is
  cosmetic: `revoke` on that table only ever covered `update`. While
  locked, the CTA and the answered counter are **absent**, not disabled;
  the amber dashboard banner is dropped entirely rather than recoloured;
  the overview cell reads `—` on slate rather than `0%` on amber; and the
  reports uploader stays **open**, because it is the one useful thing the
  patient can do beforehand.

  Patient Care Intake is filled through a one-question-at-a-time pop-up
  (`ConditionIntakeWizard.tsx`), never as a form rendered on the
  dashboard: a wall of seven fields is what patients read as paperwork
  and abandon. A new question therefore needs `helpText` (why this answer
  matters, in the patient's words) and a `shortLabel` alongside its
  `label`. The therapist's own surfaces invert that pacing on purpose —
  the triage dialog shows everything at once with headings, the same rule
  `PainExamDialog` follows: a clinician filling this after every
  assignment wants to scan it, and the gentleness is for the patient who
  does it once. Once answered, the dashboard shows the answers, never
  inputs, and every reading figure on the page is derived in
  `src/lib/healthProfileSummary.ts`, not inside a component — that module
  now carries `orthoSnapshot` / `neuroSnapshot` / `pediatricsSnapshot`
  plus `intakeTrendSeries()`, which gives the two specialties with no
  exam layer a progress line read back out of the approved submissions
  already on file (no new table, no cron).

  Pain Map (`pain_assessments`, `pain_map_question_templates`, region and
  question logic in `src/lib/painMap.ts`) is therapist-only, per-region
  clinical exam data that posts live immediately with no review step, and
  is append-only (a re-assessment is a new row, never an edit) so the UI
  can show a trend against the previous visit. Recording one requires
  only that the therapist is **assigned** — enforced by
  `pain_assessments_insert_assigned_therapist` and mirrored in the submit
  route by `isTherapistAssignedToPatient`. *Read* access needs no request
  either way and is automatic for the assigned therapist. Both layers
  render on **one** body-map surface (`PainMapExplorer.tsx`), and that
  same surface is where an exam gets recorded — via `PainExamDialog`, not
  a form beneath the map. The region is chosen by tapping the figure (or
  a chip in the dialog), never a `<select>`, and it stays in the dialog
  header while the clinician types. Questions are grouped by
  `PAIN_EXAM_GROUPS` rather than listed flat.

  **The paediatric caregiver is a pre-step, not one of the seven.**
  `peds_caregiver_name` and `peds_caregiver_relationship` are ordinary
  flat keys — so the wizard, the required check, the admin's question
  bank and the PDF all handle them with no special case — but they are
  excluded from the seven-question count, because who is speaking for the
  child is provenance rather than a clinical question.

  **Admin edits wording per specialty, and can switch one off.**
  `intake_question_templates` is keyed `(specialty, question_key)`;
  Manage Questions has one tab per specialty (tabs, not three stacked
  sections — twenty-odd textareas is the wall-of-fields shape this
  codebase keeps correcting). `enabled_intake_specialties` removes a
  specialty from **triage only**: an existing profile carrying it must
  keep rendering, and a therapist re-triaging such a patient is still
  offered it. Ortho can never be switched off.
- **One word for the record, one for the condition type, one for the
  reviewer.** The clinical counterpart of the money-word rules below, added
  after an audit found **ten** user-facing names for the health profile and
  **eight** for the condition type — four of the ten on one screen. The
  words multiply whenever someone extends a surface rather than naming a
  concept, and every extra one is a patient wondering whether "your chart"
  and "your health profile" are two different things.
  - The record is **Health Profile**, to all three roles. Not "Patient Care
    Intake" (a code and docs term now), not "condition data", not "the
    questionnaire". "chart" is clinician register: fine on a therapist or
    admin screen, never on a patient's.
  - The kind of patient is a **condition type** to clinicians and admins.
    Never "specialty" (that is the column name), never "case". A patient is
    never shown a category word at all — name the care instead
    ("Children's physiotherapy"), and keep "triage" and "onboarding" off
    their screens entirely.
  - Whoever approves a change is **the clinic** to a patient, and **admin**
    on admin screens. Not both, and not "us".
  Before adding a noun to any of these screens, check it is not a fifth name
  for something already named.

- **Copy that two roles read needs a `voice`, not a compromise.**
  `ConditionIntakeWizard` and `ConditionIntakePanel` are filled by the
  patient *and* by a therapist on their behalf, and the same sentence cannot
  be true for both — a clinician was being told "this is your own account of
  your condition, in your words". Both take `voice: "patient" | "clinician"`
  and branch every sentence that addresses someone. A new string on a
  shared surface either reads correctly for both or gets a branch; there is
  no third option, and "mostly fine" is how the leak happened.

- **Never tell someone they did something they did not do.** Three separate
  bugs came out of one habit: `draft_data` is shared by both roles' autosave,
  so a therapist's abandoned edit told the patient *"You left off part-way
  through"* (fixed with `draft_saved_by_role`); the counter said "3 of 7
  answered" over "Add the missing answers" for questions a clinician wrote
  and never asked (fixed with `answerAuthorship()`, derived from the
  approved-submission rows already on file rather than a new column); and
  the banner said "Your therapist has your answers" about a record the
  patient never sent. Attribution is not a nicety on a medical record.

- **One pain scale on screen, whatever the column says.** Assessments are
  stored 0–100 and a patient rates their own pain 0–10; both used to be
  printed raw, so "How you rate it 6/10" sat beside "Last exam found 34%"
  in the same strip and read as two different measurements. Every
  user-facing exam figure goes through `formatPainOutOfTen()`
  (`painMap.ts`). Storage is unchanged — this is display only, and new
  surfaces must use the helper rather than printing `pain_percent`.
- **A permission gate belongs beside the thing it gates.** The therapist's
  "Request access to edit" card sat three sections above the Pain Map, the
  only thing it unlocks; it is now inside that card, stating what is
  readable regardless and what needs approval — if a third view of this data is ever needed, add a mode to
  that switch rather than another card. The figure itself
  (`BodyMapDiagram.tsx`) is an anatomical human silhouette built from
  cross-section nodes (`silhouettePath`), one `<svg>` per view so front and
  back stack on a phone instead of shrinking each tap target below a
  fingertip. See the "Patient Care Intake and Pain Map" section in README.md
  for the full flow.
- **A patient's own record leaves the app as a PDF, not as JSON.**
  `/api/patient/condition-profile/export` returns a typeset document named
  `Name_PatientCode.pdf`, built by `src/lib/healthProfilePdf.ts` — the
  thing a patient does with an export is hand it to another clinician, and
  a JSON file is only readable by a developer. `?format=json` still serves
  the raw structure for genuine portability; nothing in the UI links to
  it. pdf-lib's standard fonts encode **WinAnsi only**, so every string
  goes through that module's `toWinAnsi()` before it is drawn — a
  Devanagari name would otherwise throw at draw time and 500 the whole
  export rather than degrading. Session notes stay excluded from every
  format, same rule as before.
- **Patient-uploaded reports live in Storage; the database holds only
  metadata.** `patient_medical_documents` has no bytea or base64 column,
  and it never should: a handful of MRI PDFs stored inline would dominate
  the database's size and ride along on every `select *` over a patient's
  chart. The `medical-reports` bucket is **private**, unlike `avatars` —
  a scan report is the most sensitive thing this app holds, and a public
  bucket makes the object URL itself the only secret. Reads go through
  `/api/medical-documents/view`, which selects the metadata row with the
  caller's own RLS-scoped client (the row coming back *is* the
  authorization, same posture as `/api/packages/purchase-detail`) and only
  then mints a 120-second signed URL with the service role. Storage's own
  policies cover the owning patient alone, so there is no path-parsing
  subquery to get subtly wrong. Growth is bounded by two caps that only
  work together — 10MB per file and 20 files per patient
  (`src/lib/medicalDocuments.ts`, enforced in the upload route, which is
  the only writer) — since either alone leaves the bucket unbounded one
  upload at a time. Writes are the patient's own; a therapist and an admin
  read. There is deliberately **no update policy**: correcting a report
  means deleting it and uploading again, so the row and the object can
  never describe different things.
- **Session notes are clinician-only, and they are the prep loop.** After a
  delivered session the therapist writes what was treated, how the patient
  responded, the home exercise and the plan for next time
  (`session_notes`, fields in `src/lib/sessionNotes.ts`, written through
  `SessionNoteDialog` from the session card itself). `session_notes` has
  **no patient select policy and must never get one** — these are working
  notes written in the register clinicians use with each other, and the
  patient's data export (`/api/patient/condition-profile/export`) and
  printable profile both exclude the table on purpose. Notes stay editable
  for 24 hours (`SESSION_NOTE_EDIT_WINDOW_HOURS`), enforced in the submit
  route, and every edit inside that window copies what it replaced into
  `session_note_revisions`. Writing one needs no
  `condition_access_grant`, unlike the intake and Pain Map: a note records
  work this therapist personally did rather than editing the patient's own
  history. Completion is never blocked on a note — the nudge is a
  `needsYou` feed item plus the "Notes to write" figure on the therapist's
  Overview.
- **Patient, therapist and hospital dashboard sections are real routes**, not
  anchors on one long scroll. Each nav item has an `href`
  (`/patient/dashboard/sessions`, `/therapist/dashboard/earnings`, ...) and
  its own `page.tsx`; the scroll-spy path in `DashboardShell` now only
  serves Edit Profile's sub-sections. The reason is UX: spy-highlighting
  made the sidebar appear to change its mind while you read. Each dashboard
  has one server-only loader (`src/lib/patientDashboardData.ts`,
  `therapistDashboardData.ts`, `hospitalDashboardData.ts`) that every one of
  its routes calls, so seven routes cannot grow seven slightly different
  copies of the same queries, and a `*DashboardShell` component holding the
  sidebar/header/realtime props. Each loader takes the screen asking
  (`loadPatientDashboard("receipts")`) and skips what that screen cannot
  render — a tab is a server round trip now, so it must not pay for the
  whole dashboard's data to show one list. What the sidebar needs to decide
  which entries exist stays in the always-loaded core, or the nav would
  change shape as you move between screens. Anything rendered by more than one route
  (the session cards) is a real component, not a closure.
- **Every dashboard opens on the same Overview.** Patient, therapist,
  hospital and admin all render `DashboardOverview.tsx` — a strip of four
  figures (`StatStrip`), the notification feed (`ActivityFeed`), and a
  quick-actions list — in that order, because that is the order people ask
  "how am I doing / what needs me / what do I do next". Sections are
  `SurfaceCard`, statuses are `StatusPill`, blank states are `EmptyState`
  (all in `src/components/dashboard/`); do not hand-roll another white
  rounded box with a bold heading. The feed itself is *derived*, not
  stored: `src/lib/dashboardFeed.ts` turns rows each page already queries
  into `FeedItem`s, so there is no notifications table to keep in sync and
  no cron to write it (see the no-cron rule above). `needsYou` replaces
  read/unread — it marks what is still waiting on the viewer, and the feed
  pins those to the top and counts them.
- **The admin dashboard's information architecture lives in
  `src/lib/adminNav.ts`** — six sections (Today, Sessions, People, Money,
  Catalog, Settings), each with its own screens. The sidebar, the URL
  (`?section=&tab=`), the content map in the dashboard page, and the scope
  check all read that one list, so adding a screen is one entry there plus
  one entry in the page's `screens` map. Tab state is written with the
  History API, never `router.push`: the dashboard is a single Server
  Component making ~40 queries, and a router navigation would re-run all of
  them to move between two already-rendered screens. The page also reads
  `?section=/?tab=` server-side and passes them to `AdminShell` as
  `initialSection`/`initialTab`, so a shared deep link server-renders that
  screen instead of painting Today first and jumping once the client effect
  runs.
- **A session is listed once — on every dashboard, not only the admin's.**
  The patient's and therapist's video sessions and home visits were
  separate sidebar entries over the same `appointments` rows, so "what is
  next?" was a two-screen question. Both are now one Sessions screen using
  `SessionFilterList` (Upcoming / Past / Cancelled, plus a Video / Home
  visit filter that only appears for people who have both). Add a filter
  rather than a second list.
- **A different way of looking at the same rows is a view switch, not a
  sidebar entry.** Calendar was its own entry on the patient and therapist
  dashboards and is now a List/Calendar toggle on Sessions
  (`SessionsView`); Programmes was its own entry and is now a
  Patients/Programmes toggle on the therapist's My Patients
  (`TherapistPatientsView`). Both render the *same* server-rendered cards,
  passed in by id, so the two views can never disagree about a session.
  Before adding a nav entry, ask whether it is a different set of rows or
  the same rows arranged differently — only the first earns an entry.
- **A screen that can only ever be empty is not in the sidebar.**
  `buildPatientNavItems` hides Sessions, Packages and Payments until the
  patient actually has one, and the therapist's Programmes toggle only
  appears for a therapist with package patients. Booking is the deliberate
  exception: it is always shown, because that is how a patient gets their
  first of anything.
- **One money word per role.** Money owed *to* someone is **Earnings**
  (therapist and hospital), money going *out* is **Payments** (patient),
  and the clinic's own books are **Money** (admin). The hospital's screen
  was "Revenue & Payouts", which read as a third concept for the same
  thing. This is the sidebar-level counterpart of the "one word, one money
  figure" rule below.
- **A session is listed once.** All Bookings, Session Story, the calendar's
  day panel and the home-visit queue were four lists over the same
  `appointments` rows; they are now one filterable list
  (`AdminAllSessionsTab`) plus the calendar, both opening the same
  `SessionDetailDrawer`. Home-visit specifics (address, travel fee, cash)
  are a panel inside that drawer, not a parallel screen. If you find
  yourself building a second list of sessions, add a filter instead. All
  Sessions remembers its filters per browser (not the date range, which goes
  stale) and paints at most 200 rows before offering "Show all" -- the page
  server-renders every screen at once, so an unbounded table is HTML every
  admin downloads whether they open that screen or not.
- **Every list pages, and every list that has a dimension filters.**
  A list of rows ends with `ListPager` (`src/components/dashboard/`), the
  one control: a "Show N per page" number field, Previous/Next that grey
  out when there is nothing in that direction, and an "x-y of n" count. It
  is driven by `usePagedList` (`src/lib/usePagedList.ts`), which pages the
  rows the screen already has -- these lists filter in the browser and the
  export buttons read the same filtered array, so fetching per page would
  make the download disagree with the list. A `storageKey` remembers that
  one list's page size per browser; wanting 100 payouts on screen says
  nothing about wanting 100 FAQs. Filtering, sorting, totals, balances and
  both exports always run over the **whole** filtered set -- only what is
  painted is paged, or a range total starts describing a page. A list a
  Server Component rendered uses `PagedList` instead, which takes finished
  elements keyed by id (a function prop cannot cross that boundary, a
  rendered element can) plus an optional `group` per item and a `filters`
  list, and works the counts out itself. Filter chips are `FilterChips`,
  and `PagedList` hides them unless two of them would actually have rows
  behind them -- a filter nobody can act on is noise. Don't cap a list at
  an arbitrary number with a "Show all" escape hatch: that was what All
  Sessions did, and "Show all" then painted every row anyway.
- **A dashboard refresh is expensive; debounce accordingly.**
  `RealtimeRefresh` turns a `postgres_changes` event into `router.refresh()`,
  which on the admin dashboard re-runs the whole Server Component — ~40
  queries, every screen, not only the visible one. It fires on the **leading
  edge** and then holds a `cooldownMs`, rather than debouncing: the first
  change always lands immediately, and only the burst behind it is collapsed
  (a plain trailing debounce would delay every lone event too, which is the
  case an admin is actually watching for). `AdminShell` runs two channels on
  that basis: operational tables (bookings, payouts, profiles, care records)
  on a short cooldown, and catalog/settings tables (`site_settings`,
  treatments, packages, testimonials, FAQs, areas) on a much longer one,
  since those change only when an admin edits them and the editor already
  sees their own change. Put a new table in one of those two
  `*_REALTIME_TABLES` arrays rather than inlining a third list — the coverage
  check reads them by that name — and add the matching `alter publication`
  to `schema.sql` in the same change.
- **Every admin export offers CSV and PDF, from one column definition.**
  A call site passes `DataExportButtons` the rows it is already rendering
  plus `CsvColumn[]` — never a pre-built string — so the spreadsheet and
  the printable document can't describe different tables. CSV is still
  built in the browser (no dependency, no round trip); the PDF is typeset
  by `/api/admin/export-pdf` (`src/lib/tablePdf.ts`), which keeps pdf-lib
  out of the admin dashboard's client bundle — that page already ships
  every screen at once. That route reads nothing: the caller sends the
  exact filtered rows it rendered, which is what guarantees the two
  formats agree, and it means there is nothing there to scope-check
  beyond being an admin at all. Give every export a `subtitle` naming
  what the rows are scoped to — a printed table nobody can date is
  worthless. Nothing in the admin dashboard exports JSON, and nothing
  should.
- **Approvals are a queue, not a person.** Pending signups and profile
  change requests live under Today, beside the inbox that counts them, not
  on the patients directory.
- **One word, one money figure.** "Package cash collected" is what came into
  the bank up front; revenue recognises that same money gradually, one
  session at a time. Gross/Net Revenue keep their standard meanings.
  `MoneyGlossary` states each one and renders on **every** Money screen --
  if a new figure needs a word that is already taken, rename the figure,
  don't overload the word, and if two figures end up with the same meaning
  delete one rather than explaining the difference.
- **The revenue split has one source and two invariants.**
  `moneyByBucketFor` (`src/lib/adminMetrics.ts`) is the only place the
  clinic's money is divided up, so the strip, the tiles and the breakdown
  chart cannot disagree. Two identities must always hold:
  `net = gross - refunds` and
  `clinic share = splittable net - therapists' share - partners' share`.
  Three rules decide the split, each one a correction of a real
  misstatement:
  1. A therapist's share is earned by **delivering**, not by being booked —
     only a `completed` paid session adds to it, the same rule
     `computeTherapistPayoutSummary` and `settle-therapist-payout` enforce.
     Counting every paid session deducted a share nobody would ever be paid,
     which understated the clinic's take on every forfeited late
     cancellation.
  2. A home visit's **travel fee is part of the therapist's share** and
     never revenue, so the Money screens must be passed the
     payout-enriched appointments (`visit_mode`, `travel_fee_paise`, the
     cash columns) and the per-therapist home-visit rate. Passing the plain
     array silently moved the whole travel bill into the clinic's share.
  3. **Refunds reverse the partner's commission, not the therapist's** — a
     refunded session was cancelled, so it never earned a therapist share,
     and a hospital's cut is taken on net revenue. This is what lets the
     clinic share be exact instead of the "approximate" figure it used to
     be labelled.
  Revenue and the split have **different eligibility**: gross, refunds and
  net count every paid session, while a session whose split is unknowable
  (no therapist share set, or a partner with no share configured) is
  excluded from the split alone and surfaced as a named count. Never guess
  a percentage to make the numbers tie.
- **Only one figure may be called profit, and only because costs exist.**
  `clinic share` is what net revenue leaves after the therapist and partner
  splits — a gross figure. **Operating profit** is that less the two cost
  lines in `src/lib/operatingCosts.ts`: the payment-gateway fee, derived
  automatically from what was collected online (charged on gross, since a
  processor keeps its fee through a refund, and skipped for cash-on-visit,
  which never touches a gateway), and `business_expenses`, hand-entered on
  Money → Costs and dated by `incurred_on` rather than when someone typed
  it in. Before that table existed no screen could honestly say "profit",
  which is why none of them did. With no costs recorded for a range,
  Operating profit is a ceiling and the screen says so rather than
  implying a number it cannot know. Nothing here is post-tax; don't label
  it "net profit".
- **Money answers financial questions; Sessions answers operational ones.**
  No-show, cancellation and repeat-booking rates and sessions-per-therapist
  live under **Sessions → Delivery**, not Money — a no-show rate is about
  how the clinic runs, not about its books. `AdminMetricsTab` renders all
  three slices (`summary`, `breakdown`, `delivery`) off one pass of the
  same maths, so adding a figure means choosing which question it answers,
  not duplicating a calculation.
- **A balance is never date-filtered.** "Owed to therapists" is all-time and
  net of cash held, matching the Payouts screen and what the Pay button
  actually transfers — scoping it to the range in view let an admin read
  "nothing owed" off a quiet week while a real debt sat outside the window.
  Flows (revenue, refunds, what was settled) are range-scoped; balances are
  not, and the label has to say which it is.
- **Netting cash off a payout is a remittance.** `settle-therapist-payout`
  reduces the transfer by the cash a therapist is holding, so it marks
  exactly those visits `cash_remitted_at` in the same run. Without that the
  same rupees were deducted again on the next payout and the Cash Ledger
  went on asking someone to chase money already recovered. The one
  exception is a therapist holding **more** than they are owed: the transfer
  floors at zero, the difference stays as `stillOwedToBusinessPaise`, and
  those collections deliberately stay open on the Cash Ledger for a person
  to chase.
- **Admin-configurable behavior** (Meet on/off, join window, idle timeout,
  the sign-out banner's duration,
- **Only a patient account can book; one account carries one role.**
  `profiles.id` *is* the auth user's id and `role` is a single column, so a
  therapist/hospital/admin session can never also be the patient a booking is
  for. It used to succeed and produce a session that account could never see
  again (each dashboard lists by its own role's column, and `src/proxy.ts`
  bounces a non-patient off `/patient/dashboard`) after money had moved. Both
  wizards render `src/components/booking/WrongAccountForBooking.tsx` instead
  of the form, routing each role to what is theirs: hospitals refer, admins
  use `/api/admin/create-booking`, and a clinician wanting therapy signs out
  and uses a separate patient account. Enforced in three places, all of which
  must stay: the wizards, `isPatientProfile()` in the four purchase routes,
  and `isPatientProfile()` in `/api/appointments/create`. That last one used
  to be a `role = 'patient'` clause on `appointments_insert_own`, back when
  the wizard inserted the row itself; the policy is dropped now and the
  check moved with the insert. Don't add a fifth booking entry point without
  all three.

- **Don't name the back office to anyone outside it.** Non-admin roles are
  already locked out (`src/proxy.ts`, `requireAdmin`, `requireAdminScope`);
  keep it out of what they can *see* too. A signed-in non-admin reaching
  `/admin/dashboard` is redirected to `/get-started`, never to
  `/admin/login`, which would confirm the back office exists and name its
  door. `/admin/login` is `robots: noindex`. And no client component maps
  role to dashboard path: `src/app/dashboard/page.tsx` resolves that
  server-side, so `Navbar` and `WrongAccountForBooking` link to `/dashboard`
  and the admin path never reaches a public bundle. A `hash` param on that
  route becomes a real fragment (the anchor-based shells need it) and is
  pattern-checked, since it is the one input that could otherwise smuggle a
  host into the redirect. Link new "go to my dashboard" affordances at
  `/dashboard` rather than adding a fifth role map. The debug bar is the
  deliberate exception -- it still lists the admin routes, and is switched
  off before release.

- **Every dashboard needs a way back to the public site.** All four are in
  `NAV_HIDDEN_ROUTES`, so the public `Navbar` never renders there; without an
  explicit link the only exit is Log Out, which also ends the session. Both
  shells (`dashboard/DashboardShell.tsx`, `admin/AdminShell.tsx`) carry a
  **Back to Home** entry at the top of the sidebar, in all three renders
  (expanded, collapsed rail, mobile drawer). It is a plain `<a>`, not
  `next/link`, for the reason the nav entries document: client-side
  transitions into a differently-chromed route were silently not completing.

- **A therapist chosen on `/team` is a request, not an assignment.**
  `/book?therapist=<id>` resolves the id against `public_therapist_profiles`
  (client-side, since `/book` is ISR-cached) and writes
  `appointments.preferred_therapist_id` — the same field the wizard's
  "continue with the same therapist" dropdown has always written, read by
  `AssignTherapistForm`. Only the admin can see whether that therapist is
  actually free for the slot, so never word this as a confirmed booking. A
  therapist the public view hides (suspended, unapproved, `visible_on_team`
  off) resolves to nothing and the request is dropped silently rather than
  failing the booking.

- **The splash greets a cold open, and nothing else.** The teal sheet the
  root layout paints over the site for a beat
  (`src/components/system/SplashScreen.tsx`, everything it needs defined once
  in `src/lib/splashScreen.ts`) shows on the first load of a browser tab and
  again when a tab that has been in the background for longer than
  `SPLASH_REVISIT_AWAY_MS` is returned to. It deliberately does **not** show
  on every navigation, every reload or every tab focus: a patient paying by
  UPI leaves the tab for their bank's app and comes back mid-checkout, and
  splashing over a payment in progress is the one thing this must never do.
  Three details are load-bearing and easy to undo. The decision is made by
  an inline blocking script in the document head, not by an effect — an
  effect runs after first paint, so the greeting would land on top of a page
  the visitor can already read, which looks like a fault. The overlay's
  markup is in every page's HTML and never changes; visibility is entirely a
  `data-splash` attribute on `<html>` read by CSS, because deciding it in
  React state is a hydration mismatch on every page of the app (that
  attribute is also why `<html>` carries `suppressHydrationWarning` — it
  covers that one element, never a descendant). And the fade duration lives
  in both `globals.css` and `SPLASH_FADE_MS`: the timer is what takes the
  sheet out of the flow, so the two drifting apart either cuts the fade
  short or leaves an invisible sheet eating clicks. Anyone who has asked for
  reduced motion is skipped outright — it is decoration over content that is
  already rendered, so the honest answer to "don't animate" is not to show
  it. The name line, the wording, the hold and the away threshold are
  admin-configurable
  (`site_settings.splash_*`, Settings → Public Site → Opening Splash), and
  `splash_brand_line` is blank by default and falls back to `site_name`, so
  the greeting and the navbar say one thing until an admin deliberately
  parts them — it is the one text setting where blank is a value rather than
  an error, since blank is how the override is undone.
  `splash_revisit_minutes = 0` means "greet the first load only" — there is
  deliberately **no** value meaning "greet on every tab focus", because that
  is the setting that would splash over a checkout in progress. The fade
  length stays a constant for the reason above: it is the same duration
  written in two places, so it is a design decision rather than a policy an
  admin should be able to desynchronise.
  `e2e/splash-screen.spec.ts` holds these rules.

- **The eight public pages are one template, not eight layouts.** `/`,
  `/conditions`, `/how-it-works`, `/home-visit`, `/team`, `/mission`, `/faq`
  and `/hospitals` all assemble from `src/components/marketing/`: a `PageHero`
  (photo right, one headline, one sentence, up to two CTAs), `TrustBar`, some
  `Section` bands, an `ExploreSection`, and a `ClosingCta`. Every page ends
  the same way on purpose — wherever a visitor stops reading, the next step
  is in the same place. Before adding a bespoke block to one page, check
  whether a `Section` plus `PhotoTile`/`IconCard`/`SplitFeature` already says
  it; the old pages each grew their own hero and their own closing block,
  and the result read as seven different sites.
- **One idea per band, and a hard word budget.** The rewrite exists because
  visitors could not tell what the site was, and the second round of feedback
  was that there was still too much to read. So the budgets are numbers, not
  a vibe, and they are the tightest thing on the site:

  | Slot | Budget |
  | --- | --- |
  | Hero subtitle | 12 words |
  | `Section` lede | 9 words — and drop it entirely when the heading already says it |
  | `IconCard` / `StepStrip` / `SplitFeature` body | 10 words |
  | `SplitFeature` bullet, `CareArea` check | 5 words |
  | `CareArea` blurb | 8 words · `detail` | 14 words |
  | `MarketingPage` blurb | 8 words |
  | `ClosingCta` body | 12 words |
  | Mission / vision sentence | 15 words |

  `Section` takes an eyebrow, a heading of a few words and **one** `lede`, and
  has no slot for a second paragraph. A lede that restates its heading is
  worse than no lede — several were deleted outright rather than shortened.
  If a card needs a paragraph it is a band of its own; if a band needs two
  ideas it is two bands. Don't reintroduce prose by passing a long string to
  `lede`.

- **The photograph is load-bearing, not decoration.** A visitor should be
  able to tell what a page is about with the text blurred out, which is why
  `PageHero` requires `photo` and `alt` rather than accepting a page with no
  image. Every photo is a static import through `src/lib/marketingPhotos.ts`
  (real dimensions at build time, generated blur placeholder, a missing file
  is a compile error) — never a `/photos/x.jpg` string, and never a remote
  URL. Pages name a `PhotoId`; only that one module imports the files. The
  images under `public/photos/` are licence-free stock and are meant to be
  replaced with the clinic's own photography: drop a file of roughly the same
  aspect ratio over the existing name and nothing else changes.
- **Every photograph shows a screen, except the two home-visit ones.** This
  clinic sells video consultations; home visits are the one in-person mode.
  The first pass used clinic photography throughout and the whole site read
  as a walk-in practice, which is the opposite of what it is. So every image
  has a laptop, tablet or phone in frame — a patient exercising to a laptop,
  a clinician with the patient live on screen, a scan marked up on a tablet —
  and only `hero-home-visit` and `mode-home-visit` show hands-on treatment.
  A new photo that cannot show a device is the wrong photo for this site.
  Crops are the trap: `public/photos/` files are pre-cropped, and a source
  with the laptop low in frame loses it to a centre crop, which silently
  turns an online photo back into a clinic one. Check the cropped file, not
  the original.
- **Every photograph shows a face, and the face is glad to be there.** Stock
  read as untrustworthy while the shots were backs of heads, hands on a
  phone, and an empty desk with a laptop on it — a patient cannot tell what a
  service is from a photo with nobody in it. So each image shows a real
  person, face visible, in a warm expression: a patient mid-session who looks
  glad to be there, or the clinician they are talking to. The one exception
  is the clinician reading a scan (`reports`), who is concentrating, because
  a physiotherapist grinning at an X-ray is the opposite of reassuring. A
  cropped-off head or a torso-only frame fails this rule as surely as a
  missing device does — check both in the cropped file.
- **`photoAlt` describes the picture; `blurb` describes the page.** Both
  `MarketingPage` and `CareArea` carry the two separately because the grids
  used to pass the blurb as `alt`, which announced the same sentence twice to
  a screen reader and said nothing about the image itself.
- **The site's own index lives in `src/lib/marketingNav.ts`.** The header
  nav, the footer's Explore column, the home page's connector grid and the
  "Where to go next" strip on the other six pages all read that one array, so
  a page cannot exist in the header and be missing from the index, and a
  renamed page cannot leave a stale description behind. It is the public-site
  counterpart of `adminNav.ts`. `blurb` is one short line in a patient's
  words — a page whose blurb needs two sentences is doing two jobs. Home
  Visit carries `requiresHomeVisit`, because `/home-visit` 404s while the
  admin master switch is off and every surface listing pages has to drop it
  rather than link into a dead end (`readHomeVisitEnabled()` in
  `src/lib/homeVisitFlag.ts`, read on its own for the usual
  migration-tolerance reason and failing closed).
- **Show one photograph at a time when six would say the same thing.**
  "What we treat" has been through both failure modes and the result is worth
  keeping. Six photo tiles at once was the busiest band on the page while
  saying the least: a picture of a patient exercising at home cannot
  distinguish back pain from knee pain, so all six said the same sentence and
  filled most of each card. Stripping the photography out fixed the density
  and threw away what makes this site legible at a glance. `CareAreaShowcase`
  does neither — photograph left, the answer right, the other five one tap
  away and costing no vertical space. Because only one panel is on screen, the
  copy can be a real answer (`detail` plus three `checks` in `careAreas.ts`)
  rather than the six words a card could fit. Reach for this shape whenever a
  grid's images would be interchangeable; reach for a grid when they would
  not.
- **A carousel that moves on its own is a carousel nobody can read.**
  `CareAreaShowcase` never advances by itself: the home page already carries
  the auto-rotating `JourneySteps`, and a second thing moving while you read
  the first is worse than either alone. Swipe, the arrow buttons and the
  picker all go through one `select()` so they cannot disagree about what is
  showing, and the picker is a real tablist with roving focus and arrow keys.
  Its `aria-label` is "Areas of practice" and must stay distinct from
  JourneySteps' "How the process works" — `e2e/journey-pace.spec.ts` finds
  that widget by its label, and two tablists sharing a name makes both
  unfindable.

- **A section rail entry must match a section that renders, in DOM order.**
  Each public page still passes `SectionNav` a list built from what actually
  rendered — several bands are conditional on admin-controlled catalog data —
  and the bottom-right scroll arrow walks that list top to bottom, so an
  entry out of order sends the arrow backwards. `e2e/section-nav.spec.ts`
  reads the rail's own buttons rather than a hardcoded list, which is what
  lets these pages change shape without the spec changing with them.

- **Every catalog card has a cover slot, and one component owns the empty
  state.** Programmes, session packages and home-visit packages are all
  admin-created rows with a nullable `image_url`, so all three need an answer
  for "no photo yet" — and all three had a different one, at different
  heights, which read as three components rather than one catalog.
  `CatalogImage` is now that slot: the photo when set, otherwise the same
  tinted panel at the same height with the row's own illustration. A card with
  no photograph must look like one whose photo has not been chosen yet, never
  like one whose image failed to load. `treatment_categories.image_url` is the
  newest of the three (end of `schema.sql`), so it is read in its own isolated
  query on `/`, `/conditions` and the admin dashboard and merged in — the
  admin's batch is one `Promise.all` of ~40 queries, where an unknown-column
  error would blank the dashboard rather than one cover. The field is a plain
  URL an admin pastes, not a Storage object: these are public marketing images
  with nothing to sign, and a bucket would mean an upload pipeline to
  maintain. Rendered through a plain `<img>`, since optimising it would need a
  `remotePatterns` allowlist for every host an admin might paste from.
- **A connector shows the whole of what is short and the headline of what is
  long.** The home page's mission band gives the mission and vision in full —
  they are two sentences, and paraphrasing them into a teaser would leave the
  home page making a weaker version of the same claim — while the four
  promises appear as titles only, each linking to
  `/mission#what-we-promise`. Both halves read from `src/lib/mission.ts`, so
  the home page cannot quote a mission the mission page has since reworded.
  Get that split wrong in either direction and you have a duplicate page or a
  band that says nothing.
- **Testimonials are the one place the site quotes a person, so treat them
  as evidence.** One `Testimonials` component serves Home and `/mission`,
  because the two bands make the same claim and a visitor may see both in one
  session. `testimonials.avatar_url` is migration-dependent, so every caller
  reads it in an isolated query and falls back to the patient's initial — a
  generic silhouette is a worse signal than no photo.
  **The five rows `schema.sql` seeds are illustrative copy, not real
  patients**, seeded only into an empty table and never re-seeded once it has
  any row. They exist so the band can be reviewed populated before launch.
  Never add a testimonial that reads as a real patient without consent for
  both the words and the face, and never present the seeded ones as real —
  the admin form says as much at the point of entry, and
  `public_rating_summary` stays the only place a *real* number is quoted.
- **A public catalog card opens a dialog; booking is its own button.** The
  session-package, home-visit-package and programme cards all follow one
  contract: the card body is a single tap target that opens a detail dialog
  (`src/components/Modal.tsx`, shared with `TeamTherapistPopup`), and a
  **Book …** link sits below it on the card and again at the foot of the
  dialog. The card used to be one big link to checkout, which left no way to
  read the rules — validity, one-therapist lock, minimum gap — before paying.
  Keep the booking link outside the tap-target button: a link nested inside a
  button is invalid markup and behaves differently per browser. Programme
  cards are one component (`src/components/catalog/ProgramCards.tsx`) used by
  both `/` and `/conditions`; the dialogs' shared visual pieces (session
  dots, savings meter, stat tiles) live in
  `src/components/catalog/CatalogVisuals.tsx` and are fed already-computed
  numbers, since the arithmetic belongs in `src/lib/`.

- **Approvals are a queue, not a person.** Pending signups and profile
  change requests live under Today, beside the inbox that counts them, not
  on the patients directory.
- **One word, one money figure.** "Recognised revenue" is what has been
  earned (a package counts one session at a time); "Package cash collected"
  is what came into the bank up front. Gross/Net Revenue keep their standard
  meanings. `MoneyGlossary` states each one on the Money screens -- if a new
  figure needs a word that is already taken, rename the figure, don't
  overload the word.
- **Admin-configurable behavior** (Meet on/off, join window, the Session
  Completed cutoff — minutes after slot time at which every "Tap to Join"
  control reads "Session Completed" instead, admin's own included, since a
  session an hour past its start reads the same way on every screen it
  appears on — idle timeout,
  booking languages, the online booking lead time and cancellation refund
  window, the package-wide settings — visibility, default
  validity, therapist-lock switch, bulk-scheduler limit, expiry reminder
  window — the nine `home_visit_*` settings — master switch, cash on/off,
  lead time, cancellation refund window, default validity, bulk-scheduler
  limit, travel buffer minutes, and the public page's heading/subheading —
  and Brand & Contact Details — site name, tagline, description, contact
  email, WhatsApp number, contact phone, footer copyright text — and the
  Home page walkthrough's per-step rotation seconds, where 0 means "don't
  rotate" — and the opening splash's five settings — on/off, the name above
  the line (blank follows the site name), its one line, the hold in seconds,
  and the minutes a tab must be away to earn a second greeting, where 0
  means "first load only" — and `enabled_intake_specialties`, which
  condition types triage offers) is read
  through `src/lib/adminSettings.ts` with defaults — don't hardcode these.
  Every dashboard page must select `SITE_SETTINGS_SELECT` from that module
  rather than its own column list, or a new setting silently reads as its
  default on whichever page forgot it. The root layout is the one place
  that reads Brand & Contact Details (via a public/anon client, so
  ISR-cached pages under it aren't forced dynamic) and passes it into
  `Navbar`/`Footer` as props — those two components take the strings as
  props rather than hardcoding or fetching their own copy.

## Pre-launch data reset

The debug bar carries a **Reset data** button (`DebugResetButton` ->
`/api/admin/debug-reset` -> `debug_reset_all_data()` in `schema.sql`). It
empties every table and deletes every non-admin account, keeping only admin
logins, and puts `site_settings` back to its defaults. It exists because
testing the app means filling it with throwaway patients and bookings.

Four gates, all of which must pass:

1. `ALLOW_DEBUG_DATA_RESET=true` in the **server** environment. Deliberately
   not `NEXT_PUBLIC_SHOW_DEBUG_NAV` -- that one is public and already true
   on the deployed site, so reusing it would arm a data wipe for anyone who
   can reach the page. Unset, the route answers 404, not 403.
2. A signed-in admin.
3. ...with `full` scope.
4. The exact phrase `RESET ALL DATA`, typed by hand in the UI.

The wipe is one `TRUNCATE` inside a database function, not a list of deletes
from the route: it is atomic (a half-emptied database is worse than none),
it is one round trip, and three of the tables have no `id` column for a
filtered delete. The function refuses to run if it would leave no admin
behind. `EXECUTE` is revoked from `anon` and `authenticated`, so only the
service-role key can call it.

**Adding a table means adding it to that `TRUNCATE` list**, or a reset
silently leaves its rows behind. Before real patients exist, remove
`ALLOW_DEBUG_DATA_RESET` and drop the function.

## Keeping the docs current

`README.md`, `AGENTS.md`, and `CLAUDE.md` describe the app itself, so they go
stale the moment the app changes. Update them **in the same change** that
makes them wrong — do not leave it for later, and do not merge to `main`
without checking. Anything in this list means the docs need a look:

- a new or removed route, page, or API route handler
- a new role, or a change to how `approved` / `active` gate access
- a new environment variable, or a changed meaning for an existing one
- a schema change in `supabase/schema.sql` that affects a documented flow
- a change to a documented rule: booking lead time, cancellation/refund
  window, payment verification, Meet sync behavior, payout math
- a new npm script, dependency, or build/deploy step

`.github/workflows/docs-freshness.yml` warns on a pull request that touches
`src/`, `supabase/`, `scripts/`, `package.json`, `next.config.ts`, or
`.env.example` without touching a doc. It is a reminder, not a gate — a
change that genuinely needs no doc update can ignore it.

## Style

- TypeScript throughout; no `any` escapes for convenience.
- Tailwind utility classes; design tokens and font stacks are composed in
  `src/app/globals.css` (`--font-sans`, `--font-display`). Fonts are
  self-hosted via `next/font/google` — no runtime request to Google.
- Server components by default; add `"use client"` only where interaction
  requires it.
- Comments in this codebase explain *why*, especially where a non-obvious
  constraint or a past bug drove the shape of the code. Match that.

## Gotchas

- **The debug bar is on in every environment, on purpose.** The app is
  pre-launch with no real patients, so `isDebugNavVisible()`
  (`src/lib/debugNavVisible.ts`) returns true unless
  `NEXT_PUBLIC_SHOW_DEBUG_NAV` is exactly `"false"` — local dev,
  `next build` + `next start`, and the deployed site alike. It used to
  default off whenever `NODE_ENV === "production"`, which hid it in the one
  environment worth checking a published change in. Don't gate it back
  behind `NODE_ENV`, and don't reintroduce the ten copies of that
  expression: the root layout, three dashboard shells and six pages that
  hide the shared Navbar all call the one helper. At real launch, **delete**
  the bar rather than flipping the flag — it is a public flag, and the bar
  names every route including `/admin/login` and `/admin/dashboard`.
- **`.env.production` stays deleted.** It armed both the public debug nav
  and the whole-database reset on the live site. The nav no longer needs it
  (the default above covers it), and the reset must never be armed from a
  committed file — `ALLOW_DEBUG_DATA_RESET` belongs in a server environment,
  set deliberately, against a project whose data is throwaway. Check the
  hosting dashboard's own env vars too, since a file cannot clear those.
- **Every route tree has an error boundary, and a thrown message never
  reaches the screen.** `RouteError` / `RouteLoading`
  (`src/components/system/`) back `error.tsx` and `loading.tsx` in each
  dashboard, with `global-error.tsx` for a root-layout throw (it inlines its
  styles and supplies its own `<html>`, because at that point nothing else
  has rendered). An Error's message can carry a column name or a row id and
  patients see these screens, so only Next's `digest` is shown. A dashboard
  `loading.tsx` must pass `withSidebar`: the patient, therapist and hospital
  dashboards render their sidebar per page rather than in a layout, so a
  bare skeleton would blank the chrome on every navigation.
- **A display code outlives the role that generated it.** `handle_new_user`
  inserts every self-signup as a patient, so an account promoted to admin or
  hospital later keeps its `PT####`. The unique indexes are scoped to the
  column (`where patient_code is not null`), not the role — so anything that
  resyncs `patient_code_seq` must take its max the same way, over **every**
  non-null code regardless of role. Scoping the max by role set the sequence
  back below codes held by promoted accounts, and signup then failed
  intermittently with a duplicate key, surfacing as a 500 from
  `auth.signUp` with an empty body. `assign_profile_code` /
  `assign_session_code` now also loop past a taken code rather than trusting
  the sequence, so a drift from any other cause (a restore, a manual insert)
  cannot break signup again.
- **A hardcoded `?section=&tab=` link is a dead link waiting to happen.**
  `findTab` falls back to a section's first screen when the tab key is
  unknown, so a stale link looks like it works — it just quietly lands
  somewhere else. Two feed items pointed at `today&tab=requests` and
  `today&tab=sync`, tabs that never existed. Build these with
  `adminScreenHref(section, tab)`, which is typed against `adminNav.ts`.
- `graphify-out/` is CI-generated (`.github/workflows/graphify.yml`); only
  `graph.json`, `GRAPH_REPORT.md` and `manifest.json` are committed. Don't
  hand-edit them. `manifest.json` is the per-file hash record `--update`
  diffs against, and it is committed for a reason: without it every CI run
  re-extracts the whole corpus, and the semantic pass then spends the Gemini
  free tier's 20 requests per day on files nothing touched, which is what
  made the workflow fail with a wall of 429s. That failure is now soft --
  the run retries with the key unset and commits a structural graph rather
  than leaving the committed one stale.
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, Google
  credentials) are server-only. Never add a `NEXT_PUBLIC_` prefix to them and
  never commit real values.
