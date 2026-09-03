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
`npm run test`, `npm run check:realtime`, `npm run test:e2e`, and
`npm run verify` (lint + test + build, the one to run before pushing).
`npm run test` is Vitest over `src/**/*.test.ts` — the dependency-free
modules in `src/lib`, which is why the business maths lives there rather
than inside components. It needs no database and no browser; anything that
does belongs in `e2e/`. `npm run lint` runs
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
admin settings (`splash-screen.spec.ts`), and the therapist roster end to end
(`therapist-roster.spec.ts`: ranges saving as the same hour rows, exceptions
owning only their own date, leave leaving the schedule intact, role and
scope authorization on every roster route, stale/double-clicked saves, and
the regression that no roster change moved a booking or the patient's time
picker), and the clinic's reach over a
recommendation -- who may write one on a therapist's behalf, the split
attribution the successful write produces, and the panel that offers it
(`admin-care-plans.spec.ts`, whose fixtures are found-or-created rather than
deleted, since an append-only version pointing at one makes it undeletable),
and that same file's walk through the review step -- a submission queued and
invisible, refused at checkout with the patient's own session, approved with
its window stamped and its decision recorded, turned down and rewritten, and
approved with changes leaving the therapist's original in place, and the two
acquisition discounts a patient can trigger themselves -- a promo code
quoting what it takes off with no amount in the request, a redemption cap
refusing the second claim, a paused or expired campaign doing nothing and
saying which, and an invite that cannot be claimed by its owner, twice, or by
a patient who has already paid, plus the free-booking path -- the quote
matching what checkout charges, a 100%-off code resolving to zero rather than
a token rupee, a confirmation that writes no payment row and is idempotent,
and the refusal to confirm anything still owed (`acquisition-codes.spec.ts`).
It needs a
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

`docs/qa/` holds the **manual** E2E plan a human tester executes -- a feature
guide plus a click-by-click regression suite covering every route, role,
configuration and money rule. Its sources are `docs/qa/src/*.md`; the PDF and
DOCX beside them are generated by `python3 scripts/build-test-plan.py` and are
never hand-edited. It quotes real route paths, screen names, setting defaults
and error strings, so it goes stale the same way the other docs do -- update it
in the change that makes it wrong.

`scripts/care-plan-review-sql-checks.sql` is the review step's
storage-layer check -- the one-open-plan index covering a queued plan, the
offer window that may be stamped once and never moved, and the review trail
being append-only with a real reason on it. It runs inside one transaction
and ends in ROLLBACK, so it leaves nothing behind and can be re-run against
the same database. Applying `schema.sql` twice against a scratch Postgres and
then running this is what a schema change to these tables should be verified
with.

`scripts/promo-invite-sql-checks.sql` is the promo/invite storage-layer
check -- a redemption cap holding under a second claim, an abandoned checkout
giving its claim back, a window whose end is exclusive, a self-invite, a
second invite for one patient, and a reward that does not exist until the
friend has paid. It runs inside one transaction and ends in ROLLBACK, so it
leaves nothing behind and can be re-run against the same database. Applying
`schema.sql` twice against a scratch Postgres and then running this is what a
schema change to these tables should be verified with.

`scripts/roster-sql-checks.sql` is the roster's storage-layer check: the
malformed and out-of-range payloads the API routes cannot produce, asserted
against a scratch Postgres with `schema.sql` applied
(`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/roster-sql-checks.sql`).
It raises on the first failure and cleans up after itself. Two real bugs came
out of it, both in this file's own comments. `e2e/ROSTER-TEST-PLAN.md` says
what is covered at which layer and what is deliberately not.

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
src/lib/carePlanAuthoring.ts the one writer of a care plan version, three doors
src/lib/carePlanReview.ts the clinic's decision on a queued recommendation
src/lib/sessionRhythm.ts the proposed run of dates a paid programme opens on
src/lib/discounts.ts     the acquisition discounts and what they record
src/lib/promoCodes.ts    a campaign's maths and whether this patient may claim it
src/lib/inviteRewards.ts one patient inviting another, and both halves of it
src/lib/checkoutQuote.ts what a booking costs, resolved once for three callers
src/lib/confirmPaidAppointment.ts the sequence a booking becoming paid runs
src/lib/adminScope.ts    admin scopes and which sections each one may open
src/lib/availabilityRanges.ts the roster's range layer over its hour rows
src/lib/availabilityRequest.ts server-side validation both save doors share
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

  **Which number the app believes is a switch, not a deploy.**
  `site_settings.entitlement_ledger_authoritative` (Settings → Booking
  Rules, off by default) decides whether a balance shown and offered comes
  from the ledger or from `sessions_used` / `visits_used`. Flipping it is
  reversible in a second, because both are still written either way.

  The flip needed no screen to change. Every surface that shows a balance —
  the patient's widget, the therapist's programme list, both detail modals,
  the admin Purchases table, the bulk scheduler — reads the same
  `session_count` / `sessions_used` shape, so `src/lib/ledgerBalances.ts`
  substitutes `sessions_used` on the row **once, where the row is loaded**
  (`sessions_granted - available`), and every consumer follows. Add a new
  balance surface by loading its rows through that helper, not by reading
  the ledger yourself. It leaves `session_count` alone on purpose, so a
  refunded package still reads "6 sessions" with none pending rather than
  becoming a 1-session package, and it never touches a purchase with no
  entitlement — a database without the backfill behaves exactly as before.

  The flip deliberately does **not** change how a session is *claimed*. The
  counter's compare-and-swap still wins the booking race, with the ledger's
  row lock beside it. Making the ledger the claiming mechanism means
  deleting the counter writes, which is its own change with its own risk.

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
- **Availability** = weekly template + per-date exceptions + leave flag, then
  a conflict check (`src/lib/therapistAvailability.ts`,
  `src/lib/checkTherapistConflict.ts`). It is the clinic's planning record —
  who can be *offered* — and it deliberately does **not** filter the
  patient's `/book` picker, which is the lead-time rule alone. Connecting
  the two is a product decision with a deploy-sized blast radius, not a
  refactor; `e2e/therapist-roster.spec.ts` R-B02 is the guard.
- **Nobody edits an hour.** The roster is managed as working *periods*
  ("Monday 9 AM – 1 PM and 2 PM – 6 PM") on one shared editor
  (`WeeklyScheduleEditor`, used by the therapist's own screen and the
  admin's Roster), and `src/lib/availabilityRanges.ts` converts between those
  periods and the hour rows the tables store. The storage model is
  unchanged and must stay that way: every existing schedule, including a
  sparse exception written one cell at a time by the old grid, reads back as
  exactly the same hours. Three rules hold this together:
  1. **The three concepts stay separate.** A weekly schedule is what
     somebody normally works; an exception is one date that differs; leave
     takes them off entirely. Leave never clears the schedule -- there is
     nothing to restore on the way back because nothing was removed -- and
     an exception never edits the weekly template.
  2. **Availability never touches an appointment.** Removing hours a session
     is booked into names who is affected and says the session stays as
     booked. Nothing here cancels, moves or flags one; the two systems are
     separate and the booking wins.
  3. **A weekly save is a compare-and-swap under a real row lock**
     (`save_therapist_weekly_schedule`, versioned by
     `therapist_schedule_state`), and a date exception replaces its whole
     day in one function (`set_therapist_date_exception`). A stale save
     asking for different hours is refused with 409; a double-clicked Save
     -- two identical requests carrying the same stale version -- is a
     no-op success, because it is one logical change. Never go back to the
     unlocked delete-then-insert this replaced.
  Writing a date exception is an admin capability and stays one: a therapist
  reads theirs. Widening that is its own decision, not a side effect of a
  screen.
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
- **Nobody is admitted to a session by hand.** Meet's default access type is
  TRUSTED, which admits only signed-in Google users who are *on the invite*
  and knocks for everyone else -- and a patient registers with whatever email
  they have, so the invite rarely matches the account their browser is signed
  into. Both parties ended up in the waiting room with only the authorizing
  Gmail account able to let them in. `src/lib/googleMeetSpace.ts` switches
  each new session's space to OPEN right after the Calendar event is created
  (a second call, to the Meet REST API -- `conferenceData` has no access-type
  field). Four rules hold it:
  1. **It never fails a booking, and never touches
     `google_calendar_sync_error`.** The event and the link already exist by
     then; only the door is in question. That column is what the sync sweep
     retries on, and it retries by *creating an event*, so recording a
     waiting-room failure there would orphan a second calendar entry for a
     session that already has one. The outcome goes on
     `appointments.meet_access_open` / `meet_access_error` instead, written
     in their own isolated update.
  2. **Its retry is a separate pass with a separate cap.**
     `retryDueMeetAccess()` patches an existing space, which is idempotent
     and cannot orphan anything -- so it needs no claim column, unlike the
     event sweep beside it. `meet_access_attempts` caps it low, because the
     commonest failure (a refresh token predating the
     `meetings.space.settings` scope) is permanent until a person re-runs
     `scripts/get-google-refresh-token.mjs`.
  3. **The scope is `meetings.space.settings`, not
     `meetings.space.created`.** Calendar creates the space, not this app, so
     "spaces this app created" does not cover it.
  4. **OPEN removes the knock; it does not allow anonymous joining.** A
     meeting organized by a personal Gmail account still requires every
     participant to be signed in to some Google account. Only moving the
     organizer to Google Workspace changes that -- do not describe this
     feature to a patient as "no Google account needed".
  One admin switch (`site_settings.meet_open_access_enabled`, on by
  default), because an owner whose Google account cannot grant the scope
  needs a way to stop the attempt and its recorded errors.
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
- **A flag is never an accusation, and never carries a penalty.** The
  detectors (`src/lib/riskDetectors.ts`, vocabulary in
  `src/lib/riskSignals.ts`) run as a bounded lazy sweep after the admin
  Today render — `after()`, a wall-clock budget checked between rules, and a
  five-minute minimum interval, because realtime refreshes that page on
  every booking. Nothing they produce suspends an account, holds a payout or
  hides a therapist: acting on a finding means going to the screen that owns
  that action and doing it deliberately, with its own audit row. That
  separation is what makes a heuristic over clinical data safe to run at
  all, and the Risk tab deliberately carries no action buttons.
  `risk_signals.evidence` stores the ids of the rows that fired a rule
  rather than a score, because an admin who can only see a verdict cannot
  disagree with it. A partial unique index gives at most one **open or
  reviewing** signal per `(rule, subject)` — closing one frees the slot, so
  a repeat after a dismissal is raised fresh, which is correct: it is new
  information. `risk_reviews` is append-only by trigger with a ten-character
  minimum note, since "dismissed" with no reason reads the same as "not
  read". Thresholds live in `risk_rules` and are edited on the tab itself,
  and the two rules that need a clinic baseline (`plan_conversion_low`,
  `post_consultation_dropout`) ship **disabled** — a threshold invented
  before anyone knows the normal rate fires on everyone or on nobody, and
  the first of those is how a queue stops being read. The whole queue is
  `full` scope only, not merely the deciding: a signal names a colleague and
  quotes what they wrote, so a scoped admin's render does not fetch it.
  `appointments.completed_at` was added for the `early_completion` detector
  and is stamped only by `complete-session`; a row closed before that column
  existed carries null and is skipped rather than guessed at.

- **A therapist asserts that money changed hands; the system owns the
  number.** `/api/therapist/record-cash-collection` used to accept
  `amountPaise` from the request body, which meant the person holding the
  cash also decided how much of it the clinic knew about — and that figure
  nets straight off what `therapistCashLedger` says they owe, so
  under-reporting was a one-field withdrawal. The body now carries an
  appointment id and nothing else; the total is reconstructed from the
  purchase with the same per-visit maths `bookHomeVisitSession` used. The
  honest exception is real (a patient short of cash, an adjustment agreed at
  the door) and it belongs to whoever is *not* holding the money:
  `/api/admin/correct-cash-amount`, `requireAdminScope("money")`, a
  mandatory reason, a CAS on the figure being replaced, and a
  `cash.correct_amount` audit row. It refuses a visit whose cash has already
  been remitted — that transfer has gone out, so the fix is an adjustment
  against the next payout rather than a silent edit of a settled one.

- **Completing a session is a financial write with a clinical name.**
  `status = 'completed' && payment_status = 'paid'` is the exact and only
  condition making a therapist's revenue share payable, so
  `/api/appointments/complete-session` gates the therapist's own path two
  ways (and an admin's neither, since a backfill or a correction is exactly
  what the override lane is for): nothing may be completed with no payment,
  no programme behind it and no cash recorded — a cash home visit collects
  first, which is the right order anyway — and nothing may be completed
  before the join window in which it could have been started. The route
  previously refused neither, and a therapist could mark a session done
  before its slot and be owed for it.

- **A paid session assigns itself when the answer is unambiguous, and
  otherwise waits exactly as it did.** `src/lib/autoAssignTherapist.ts`,
  called from `/api/razorpay/verify` and `/api/razorpay/webhook` -- both, so
  a patient who pays and closes the tab gets the same outcome as one who
  waits for the page. It reads the roster (template + that date's
  exceptions + `on_leave`) and `findTherapistConflict`, and assigns only
  when **exactly one** eligible therapist is free, or when the patient's own
  `preferred_therapist_id` is among the free ones. Zero or two-or-more
  returns null and the appointment stays `requested` and unassigned in the
  admin queue -- the pre-existing behaviour, and deliberately the fallback,
  because assigning the wrong clinician is far worse than the wait this
  removes. `decideAutoAssignment()` is that rule with the database taken
  out, so the judgement is unit-tested rather than only integration-tested.
  It never throws: this runs inside payment confirmation and a booking must
  never fail for it. Gated by `site_settings.auto_assign_therapist_enabled`,
  read in its own call and failing **closed**.
  **This is not the roster filtering the patient's picker** -- that
  separation stays, and `e2e/therapist-roster.spec.ts` R-B02 still guards
  it. The roster's own job is who can be *offered* a session, which is
  exactly what is being read.

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
  `site_settings.therapist_suggestions_enabled`. The column's default is now
  **true** -- a finished feature nobody can reach drifts out of test coverage
  and accrues maintenance for no return -- but that default applies to a
  **fresh** database only. `site_settings` is a singleton that already
  exists, so an established clinic keeps its current value until an admin
  toggles it, or until a reset restores defaults. Applying a schema file must
  not turn a live feature on by itself.

- **The platform keeps its own conversations, and leaves evidence when it
  doesn't.** Treatment is paid for through this app, so a patient must never
  be asked to pay another way — and a therapist and a patient who have met
  can agree to carry on privately at a lower price, costing the clinic the
  patient, the revenue and any record that the care happened. Two controls,
  both admin switches, neither of them a policy nobody can check:
  1. **Every cross-role free-text write is scanned**
     (`src/lib/contactLeakScan.ts`, applied through
     `src/lib/communicationFlags.ts`): the suggestion note, a care plan's
     `clinical_rationale` and `instructions`, Pain Map exam answers (which
     reach the patient through the export PDF even though the dashboard
     does not render them), and the patient's own booking notes. Two tiers,
     because this text is **clinical** and a scanner that treats digits as
     suspicious fires on every dose and every exercise prescription: a
     `block` hit (UPI handle, payment link, payment app) refuses the write,
     a `flag` hit (phone, email, social handle, bare URL) is delivered and
     recorded. Phone matching is the Indian mobile shape specifically — ten
     digits starting 6-9, optional `0`/`91` — not a loose digit run, which
     flagged order references. The patient direction is `record_only`: a
     patient is not who this exists to catch, and a 400 at the last step of
     checkout costs a real booking. `site_settings.contact_scan_mode`
     (`off` / `flag_only` / `flag_and_block`) is read in its own call and
     fails **open**.
  2. **A patient's phone is masked on therapist surfaces and their email is
     not loaded at all** (`src/lib/contactMasking.ts`, masked once in
     `therapistDashboardData.ts` where the rows are loaded, so the
     plaintext number is never in the page). The full number comes one
     session at a time from `/api/therapist/reveal-contact`, allowed inside
     a video session's join window or any time on a home visit's own day,
     never for a cancelled session, and every reveal writes
     `contact_reveal_log`. That log write is **not** best-effort: a reveal
     that could not be recorded is refused, unlike the audit log's posture,
     because a reveal with no trace is the one outcome this route must not
     produce. `site_settings.contact_masking_enabled` is read in its own
     call and fails **closed** — the safe answer to "I don't know" is
     opposite for the two settings, and deliberately so.
  `communication_flags` and `contact_reveal_log` are admin-select-only and
  append-only **by trigger**, not only by RLS: every route here writes with
  the service-role client, which bypasses RLS entirely, so an evidence
  record the evidenced party could edit is not evidence. Adding a new
  free-text field that one role writes and another reads means adding a
  `surface` value and a `guardCommunication` call — the CHECK on that column
  is what stops a new field quietly skipping the scan.

- **A purchase ends in booked sessions, not in a balance.** What a patient
  buys is appointments; a credit balance is an accounting fact about that
  purchase, not the thing itself. Paying for a recommendation used to
  `router.refresh()`, which removed the offer card (the plan was accepted,
  so it no longer rendered) and put nothing in its place -- the highest
  intent moment in the product, and the screen went blank. Three things now
  hold the other half of the flow together:
  1. **Payment lands on a confirmation and one next step.** What arrived,
     what they own, then the scheduler. "I'll do it later" is a real,
     unpunished option, because (3) keeps asking.
  2. **The calendar opens answered, not empty.** `src/lib/sessionRhythm.ts`
     proposes the whole run from what the clinician already decided --
     `frequency_per_week` (captured since care plans shipped and, until
     this, read by nothing), the programme's `min_gap_hours` and
     `max_sessions_per_week`, the lead time, and the purchase's validity.
     It is strictly a **proposal**: every slot still goes through
     `/api/appointments/book-package-sessions`, which re-checks all of it
     server-side, so this module being wrong can only produce a worse
     suggestion and never a booking that should not exist. Two rules inside
     it are load-bearing. A day that cannot take the run's hour is
     **skipped rather than substituted** -- someone who asked for five
     o'clock and was handed nine in the evening because it was the only
     slot clearing the lead time has been given a schedule they did not ask
     for, and a day later there is a five o'clock free. And it **stops at
     the validity**, returning fewer than asked rather than proposing
     sessions the patient would lose.
  3. **The dashboard keeps asking.** Sessions paid for and not in the diary
     are a `needsYou` feed item until the balance is spent. It is the one
     thing a patient can buy and then receive nothing for, and the only
     step between them and their treatment is a calendar on a screen they
     have to think to visit. Derived from rows `patientDashboardData`
     already loads, so it cannot claim a balance the Programmes screen
     disagrees with.
  A failed slot is fixable in place rather than a list that can only be
  closed: a patient whose third pick clashed used to start the whole flow
  again from a screen that had forgotten why.

- **A discount is a rule an admin configured, never a number a browser
  sent.** The same reasoning that keeps a therapist picking a package rather
  than a price: an amount that can be posted is an amount that can be posted
  wrong. There are exactly four, and the two that arrived last are the two
  where something the patient sends is involved — which is why each of them
  sends a **name**, never a figure.
  1. **The first-session offer** is standing configuration
     (`first_session_offer_enabled` / `_type` / `_value`, Settings → Booking
     Rules, off by default). Eligibility is `has this patient ever paid for
     a session`, asked of the database in `/api/razorpay/create-order` —
     so it cannot be claimed twice, asked for, or sent from a browser, and a
     patient is only new once. It fails **closed**: an unreadable answer
     means list price, because charging somebody who was owed an offer is a
     complaint while discounting everybody forever is a hole in the revenue
     nobody notices for a month. Video consultations only; a programme comes
     from a recommendation and a home visit carries travel.
  2. **The goodwill adjustment** is one admin, one session, one reason —
     `/api/admin/apply-goodwill-discount`, `requireAdminScope("money")`, a
     ten-character reason enforced by the route *and* a CHECK, and a
     `payment.goodwill_discount` audit row. Only **before** payment: a
     discount on something already paid for is a refund, and refunds have
     their own route, their own Razorpay call and their own audit.
  3. **The promo code** (`src/lib/promoCodes.ts`, `promoCodesServer.ts`,
     `promo_codes`, `promo_codes_enabled` off by default) is a campaign an
     admin sets up on Money → Costs, beside the figure it produces —
     `/api/admin/save-promo-code` and `delete-promo-code`, both
     `requireAdminScope("money")` with `promo.*` audit rows. Five things
     hold it together:
     - **The code is an identifier.** The browser sends its name; the kind,
       the amount, the window and the caps are read from the row. That is
       what keeps the rule above true for a discount the patient triggers.
     - **The cap is enforced under a row lock**, by `claim_promo_code()` in
       `schema.sql`, not by a count taken a moment before an update — two
       patients at one checkout each are a race, and "100 uses" has to mean
       100 while forty of them are open. `previewPromoCode` counts the same
       way and is deliberately *not* the authority: a preview being a moment
       stale costs nothing, because nothing has been promised yet.
     - **A claim that is never paid for stops counting** after a checkout
       hold computed at read time (`PROMO_HOLD_MS`, matching `v_hold`).
       Nothing writes an "expired" status, for the reason a pending session
       suggestion does not: a status recording the passage of time needs a
       sweep, and there is no worker here to run one.
     - **The claim lives on the booking**, `appointments.promo_code_id` +
       `promo_claimed_at`, not in a redemptions table. A second place the
       same claim is written is two places that can disagree about how many
       times a code was used, which is the bug a cap exists to prevent.
     - **A refused code refuses the checkout.** `/api/razorpay/create-order`
       answers 409 rather than quietly charging list price: the patient was
       shown a figure with the code applied, and taking more money than they
       were quoted is the one outcome a payment screen must never produce.
       A code that is claimed but then loses to a larger discount is
       *released*, so it does not count against its own cap for nothing.
     `promo_codes` has no patient select policy — a patient who can list it
     reads every campaign the clinic has ever scheduled, including the ones
     not yet running. A **claimed** code is never deleted, only paused: a
     paid session pointing at a campaign nobody can name cannot answer which
     rule gave the money away.
  4. **The patient invite** (`src/lib/inviteRewards.ts`,
     `inviteRewardsServer.ts`, `patient_invites`, `profiles.invite_code`,
     `invite_rewards_enabled` off by default) is two halves: a **welcome**
     off the invited friend's first booking, and a **reward** off the
     inviter's next one. Six rules:
     - **"Invite" is not "referral".** A referral is a hospital sending a
       patient under a commercial agreement, with its own table, dashboard
       and revenue share. One back office cannot have two things called an
       invite, so the referral flow's own strings now say *registration
       link* — this is the "one word for one concept" rule applied before
       the second meaning got in rather than after.
     - **The reward is earned by a paid session, never a signup.**
       `grant_invite_reward()` fires from both capture paths (idempotent, so
       the browser callback and the webhook racing produce one reward). A
       reward that pays out on signups is a reward for creating accounts,
       and somebody will.
     - **A patient is new exactly once**, the same test the first-session
       offer uses: an invite is claimable only before that patient's first
       paid session, at most once ever (a unique index on `invitee_id`, not
       a route check), and never their own code (`claim_invite()` and a
       CHECK).
     - **Amounts are snapshotted at claim.** Lowering the reward next month
       must not lower what was already promised — the same reason a
       purchased entitlement reads its package snapshot rather than the live
       catalog. An unspent half is honoured even after the feature is
       switched off; the switch stops new claims, it does not withdraw a
       promise.
     - **A half is spent once**, attached to a booking by
       `claim_invite_half()` and made final by `settle_invite_half()` on
       capture. The same checkout hold the promo claim uses stops one reward
       being quoted on two open checkouts, which would otherwise spend it
       twice.
     - **A ceiling per inviter** (`invite_max_rewards_per_patient`, 10).
       Someone who genuinely sends ten patients is worth ten rewards;
       someone sending a hundred is running a scheme, and the refusal is
       worded so it does not tell the invitee about somebody else's account.
  They never stack (`resolveDiscount`), and where more than one applies the
  patient pays the lowest — the clinic agreed to every one of those prices,
  so charging a higher one because an admin tried to help would be perverse.
  A tie goes to the more deliberate decision: goodwill, then the code the
  patient typed, then a campaign that runs itself.
  Three rules are load-bearing:
  - **Travel is never discounted.** It is a pass-through reimbursement paid
    to the therapist in full, so discounting it makes them fund their own
    transport to subsidise the clinic's marketing. Discounts apply to the
    service line; every caller adds travel back afterwards.
  - **All four facts are recorded** — `list_price_paise`, `discount_paise`,
    `discount_source`, `discount_reason` — because a discount implemented by
    simply charging less leaves the books unable to tell "we sold this
    cheap" from "we discounted it", and that difference is the one number
    that decides whether an offer continues. `amount_paid_paise` keeps its
    existing meaning: what was collected.
  - **`sumDiscountsGiven` is reported, never deducted.** A discount means
    less was collected, so it is already inside gross revenue as a smaller
    number; subtracting it from operating profit would count it twice and
    understate profit by exactly the amount given away. It sits on Money →
    Costs as a stated figure answering the question no revenue line can —
    what buying those patients cost.
  Every **configured** amount — the offer, a promo code, either invite half
  — is floored at **zero**, and a total of zero is a free booking rather than
  a gateway order. That floor used to be `MINIMUM_CHARGE_PAISE`, which meant
  a clinic advertising a free first session charged ₹1: the quote-versus-
  charge bug again, in the place it matters most. The constant now means only
  "the least a Razorpay order may be" and `isGatewayPayable` is the test
  callers use to choose between paying and
  `/api/appointments/confirm-free`. A goodwill
  amount at or above the session price is **refused** instead — that one is a number a person typed with the price
  on screen beside it, so more than the price is a typo, and quietly
  charging ₹1 because of it is far worse than saying no.

- **One resolution, three callers, and a total of zero is free.**
  `src/lib/checkoutQuote.ts` is the only place a booking's price and
  discounts are worked out, because three things need that answer and must
  not be able to disagree: `/api/appointments/quote` (what the payment screen
  prints), `/api/razorpay/create-order` (what the patient is charged), and
  `/api/appointments/confirm-free` (what happens when there is nothing to
  charge). Before it, `BookingWizard` printed the category price on its own
  Pay button while create-order silently resolved a first-session offer
  behind it, so a patient owed ₹499 read "Pay ₹1,200 Now" and watched a
  different figure open in the Razorpay sheet.
  **A quote may be unidentified, and that is the case that matters.** At step
  3 a self-signup patient has no account yet — the account, the booking and
  the payment are all created by one tap further down the same screen — and
  that visitor is exactly who a first-session offer is for. So
  `/api/appointments/quote` and `/api/patient/promo-code/preview` both accept
  a **category-only** request with no session, answering for a new patient:
  the offer applies, and the three things needing an identity (a goodwill
  adjustment, an invite half, a promo code's per-patient cap) are simply not
  part of it. Naming an actual booking still requires being its patient. It
  is never authoritative — the wizard re-quotes against the real appointment
  the moment the account exists, and `create-order` resolves everything again
  under a row lock — so the worst an anonymous quote can do is promise
  something checkout then reports rather than silently charging. Refusing
  these callers, which is where this landed first, means showing list price
  and charging the offer: the same bug, on the one path the offer exists for.
  It has two modes and the difference is only whether anything is claimed:
  `claim: false` is a read (being a moment stale costs nothing, nothing has
  been promised), `claim: true` claims the promo code under
  `claim_promo_code()`'s row lock, attaches an invite half, and releases
  whichever candidate lost.
  **A free booking never touches a gateway.** Five rules hold
  `/api/appointments/confirm-free`:
  1. **The browser never says it is free.** The route re-resolves everything
     through the same module and answers 409 when `isGatewayPayable` is still
     true. A route that trusted a `free: true` flag would be a way to book
     anything for nothing.
  2. **No `payments` row.** That table is the record of money that moved,
     keyed on Razorpay's own order and payment ids; a collection of zero has
     neither, and inventing them would put a fiction in the one place the
     books are reconciled from.
  3. **`amount_paid_paise = 0` with all four discount facts**, written inside
     the same claim, so the giveaway is still nameable and a fact can never
     be recorded against a booking whose claim was lost.
  4. **Idempotent by that claim.** A double tap finds the row paid and
     answers success rather than confirming twice.
  5. **Everything else still happens** — auto-assignment, the Meet event, the
     invite halves settling, the patient's approval. A free session is a
     session, and `confirmPaidAppointment()` is that sequence shared with
     `/api/razorpay/verify` so the two cannot drift.
  `create-order` answers a zero total with `409 {free: true}` rather than
  minting an order Razorpay would refuse, and `payForAppointment`'s `onFree`
  callback turns that into the confirmation — so a quote that goes stale
  between render and tap still lands correctly instead of erroring.

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
- **One authoring implementation, three doors.** A therapist writes their own
  recommendation from the session note dialog; an admin writes one on their
  behalf from Sessions → Recommendations when that therapist cannot reach the
  dashboard (on leave, off sick, gone, with a patient still waiting to hear);
  and an admin approving a queued one with different numbers writes a third,
  which is the same act again rather than an edit. All three call
  `authorCarePlanVersion()` in `src/lib/carePlanAuthoring.ts`, which
  is what stops the later doors growing weaker rules than the first: the
  package still comes from the admin whitelist, the source still has to be a
  **completed session that therapist ran**, the text is still scanned, and
  there is still no price, session-count or discount field for anyone.
  Attribution is split rather than fudged — `authored_by` stays the clinician
  whose judgement it is, `entered_by` records the admin who typed it. Naming
  only the therapist would be a quiet lie about who was at the keyboard;
  naming only the admin a louder one about whose judgement it is.
  `/api/admin/author-care-plan` takes `requireAdminScope("sessions")`, a
  mandatory reason, and writes a `care_plan.author_on_behalf` audit row.
  The admin's panel matches the therapist's dialog on the two things that
  decide what gets picked. The programmes on offer are narrowed to the
  chosen session's own condition, through `narrowToCategory()` in
  `CarePlanFields.tsx` — both doors load the whole recommendable catalog in
  one go (a therapist's dashboard covers all their patients, an admin's
  screen covers all of them), so neither can narrow at load time and both
  narrow per session at the point of use; the admin's draft is dropped when
  the chosen session changes, so a package for someone else's condition
  cannot be carried across. And whose name it goes out in is stated at the
  button rather than in a subtitle two screens up. It renders even with no session
  to write against or no recommendable package, saying which of the two is
  missing -- an admin opens this screen because a patient is waiting, and a
  panel that is simply absent reads as a feature that does not exist.

- **A recommendation is reviewed before it is published, and the review is
  evidence.** A therapist's submission lands `status = 'pending_review'` and
  the patient is shown nothing — not a greyed-out card, nothing: the plan is
  absent from `loadActiveCarePlan`, `loadCarePlanHistory` drops it unless a
  caller passes `includeUnapproved`, and `/api/care-plan/create-order`
  refuses it, because hiding a card is presentation and refusing the order
  is the rule. Seven things hold it together:
  1. **Three outcomes, one route each.** `/api/admin/review-care-plan`
     approves or turns one down; `/api/admin/edit-and-approve-care-plan`
     publishes different numbers. All take `requireAdminScope("sessions")`
     and write `care_plan.approve` / `care_plan.reject` /
     `care_plan.edit_and_approve` audit rows. A ten-character reason is
     required for the two that take something away from somebody — a
     rejection the therapist has to act on, and an approval whose numbers
     are not the ones they wrote — and **not** for a plain approval, which
     is one tap. Approving is the outcome this queue exists to reach;
     taxing it with a sentence meaning "fine" is how a reason column fills
     up with "ok" and stops being worth reading, and how a patient waits
     longer for a recommendation nobody objected to. A plain approval's
     evidence is who and when, both already on the row.
  2. **Approve-with-changes is not an edit.** It writes a new version
     through `authorCarePlanVersion()` with `authored_by` still the
     therapist and `entered_by` the admin, leaving the original in the
     thread as superseded. Rewriting a version under a clinician's name
     would be a lie about who decided what, and the append-only trigger
     refuses it anyway.
  3. **Every decision is recorded, and a failure to record it un-publishes
     the plan.** `care_plan_reviews` is append-only by trigger — the routes
     write with the service-role client, so RLS is not the guarantee — and
     both decisions revert their own status change when the insert fails.
     Same posture as `/api/therapist/reveal-contact`, and the opposite of
     the audit log's: an approval nobody can trace to a person is the one
     outcome these routes must not produce.
  4. **The offer is re-checked against the live catalogue before it is
     published, never only at checkout.** Checkout re-reads the package and
     refuses on a mismatch, which is right — but on its own it means an
     admin approving a recommendation whose package has since been
     re-priced, deactivated or made unrecommendable publishes an offer that
     fails at the last step of the patient's checkout, and the patient
     discovers the clinic's stale data by having their payment refused.
     `describeOfferDrift()` compares the two figures a patient reads and
     pays — session count and price — and blocks the approval with a
     sentence naming the drift. A **rejection** is deliberately not checked:
     refusing to let an admin close a thread because its package moved
     would trap exactly the recommendation that most needs closing.
  5. **The offer window is stamped at approval, not at authoring.** A
     version is written with a null `expires_at`; the approval sets it. The
     append-only trigger permits exactly that one transition, one-way, so a
     window can be stamped once and never moved after the patient has read
     it. Stamping at authoring meant the plans the clinic took longest over
     reached the patient with the least time on them.
  6. **A new version on a published thread sends the whole thread back.**
     Deliberately, even though it takes a live offer off the patient's
     screen: what they can now see is a version nobody approved.
  7. **The rejection reaches the therapist, twice over.** It is a `needsYou`
     feed item carrying the reason, and it is on the patient's chart beside
     the thread — the feed scrolls away, and the chart is where a clinician
     goes to rewrite. The reason is the actionable half: "Not approved"
     says the recommendation is gone, and only the reason says what to
     write instead. They rewrite — an admin editing a clinician's judgement from
     the back office is what door three is deliberately narrow about.
  The queue itself reads as work rather than as a record: **oldest first**,
  aged in words rather than dated (`formatWaitingFor`, with
  `isQueueStale` colouring anything past four hours -- and Today's inbox row
  is urgent on **that** count, never on the queue merely being non-empty: a
  badge that is always on is a badge nobody reads, which is how the one
  queue with a patient waiting behind it stops being looked at), and each
  card states how many sessions or visits that patient already has unused,
  read through `applyLedgerSessionBalances` / `applyLedgerVisitBalances`
  like every other balance surface -- reading `sessions_used` raw would make
  this figure disagree with the Purchases screen the moment the ledger
  switch is flipped, in the one place it is read as a reason to refuse
  somebody treatment — the commonest reason
  to turn one down, and previously invisible without leaving the queue.
  Stated, never acted on: a patient with sessions left may well need a
  different programme, and the clinician has seen them.
  One switch, `site_settings.care_plan_requires_approval`, on by default,
  read in its own call -- deliberately **not** in `SITE_SETTINGS_SELECT`,
  the same treatment `therapist_suggestions_enabled` gets, because it is the
  newest column on that table and a shared select that fails takes every
  other setting down to its default with it -- and failing **closed** — the opposite direction from
  `contact_scan_mode`, because the safe answer to "I could not read the
  setting" is to hold a recommendation, never to publish one unreviewed.
  With it off, a therapist's submission publishes on save exactly as before.

- **The clinic can also see every recommendation, and stop one.** Sessions →
  Recommendations lists them all and `/api/admin/withdraw-care-plan`
  (`requireAdminScope("sessions")`, mandatory reason, CAS on either open
  status, `care_plan.withdraw` audit row) closes one whose author cannot —
  on leave, gone, or the reason it is wrong. It covers a **queued** plan
  too: refusing would leave the queue holding a thread nobody intends to
  approve while the patient's one-plan slot stayed taken. A **purchased**
  plan cannot be withdrawn at all — the patient has paid and the sessions
  exist, so the honest lane is a refund or a credit adjustment, both of
  which have their own screens.

- **Treatment volume is never sold before an assessment.** The rule lives in
  `src/lib/consultationFirst.ts` and is a property of the thing being sold,
  not a feature flag: a catalog row may be bought directly only when it is a
  **single** session or visit. One session is a consultation — there is
  nothing to assess before selling somebody one appointment — and two or
  more is a programme, which comes from a care plan a therapist wrote after
  a session they ran.
  Direct session-package purchase is **gone**: `/api/packages/create-order`,
  `/api/packages/verify`, `packagePayment.ts` and `BuyPackageButton` are
  deleted, and `/book` sells one consultation against a treatment category.
  So is the **advertising** of one. `/` and `/conditions` no longer query or
  render session packages at all, the programme dialog's price list of
  courses is gone, `/home-visit` filters to single visits, and
  `home/SessionPackages.tsx` is deleted. `show_programme_prices` /
  `session_packages_visible` are retired rather than defaulted off — a
  toggle somebody can flip back on is not the rule being gone, and a price
  list of programmes is exactly what a patient must not shop from. The two
  columns stay in `schema.sql`, read by nothing.
  The home-visit exception is load-bearing rather than a compromise: every
  home visit in this app is a `home_visit_packages` purchase and
  `/api/appointments/create` books `visit_mode: 'online'` only, so applying
  "no direct package purchase" literally to both catalogs would leave a
  patient who needs to be seen at home with **no entry point at all**. A
  one-visit home package is that patient's consultation and stays
  purchasable; `visit_count > 1` is refused by both
  `/api/home-visit/create-order` and `/api/home-visit/book-cash` (paying at
  the door is a payment method, not a different product).
  Both wizards **answer** a stale `?package=` link rather than ignoring it —
  taking a different amount of money than somebody came for is the one
  outcome a removed checkout must not produce. Existing purchases are
  untouched and keep booking to exhaustion.
  A recommended home visit collects an address at checkout
  (`src/lib/homeVisitAddress.ts`, shared with the direct route) and sets
  `default_address_id` and `travel_fee_paise`. The offer card quotes the fee
  for that address through `/api/home-visit/check-area` and shows
  programme + travel + total, because travel is charged **per visit** and the
  card previously printed the programme price on a button that charged more
  — a four-visit programme in a ₹150 area was ₹600 out. Quoting a different
  figure than you charge is the one thing a payment screen must never do.
  `/api/care-plan/create-order` also re-checks `home_visit_enabled`: an admin
  who switches home visits off has stopped the service, and a recommendation
  written before that must not stay purchasable. Without them
  `/api/home-visit/book-visits` refuses outright and the therapist funds
  their own transport — both were missing while a programme could still be
  bought the old way, and neither is optional now that it cannot.

- **A therapist recommends; the clinic prices.** A care plan
  (`care_plans` + `care_plan_versions`) is what a therapist proposes after a
  session, and it is the only route by which a patient buys a programme once
  the consultation-first flow is on. Five rules hold it together:
  1. **A therapist picks a package, never a price.** Session count, price,
     validity, duration and the gap rules all come from an
     admin-configured `treatment_category_packages` / `home_visit_packages`
     row, re-read server-side in
     `/api/therapist/care-plan/submit`. There is no price column, no session
     count column and no discount column on a version, so "the therapist set
     their own price" is not a policy anyone enforces — it is a thing the
     schema cannot express. The four fields they *do* choose
     (`hands_on_required`, `frequency_per_week`, `clinical_rationale`,
     `instructions`) are clinical judgement.
  2. **A version needs a completed session that therapist ran.**
     `source_appointment_id` is NOT NULL, and the route re-derives the
     appointment rather than trusting the body. That is what makes
     "recommend to everyone and see who bites" impossible rather than
     discouraged.
  3. **The clinic approves it before the patient sees it.** This used to
     write live, on the same reasoning as `condition-profile/onboard`: a
     queue in front of a clinician's own judgement means the patient hears
     nothing for hours after a session that just ended. That reasoning held
     while a recommendation was one clinical record among several, and
     stopped holding once a care plan became the only route by which a
     patient buys a programme — what is written is now a bill, and the
     clinic that carries it sees one before the patient is asked to pay it.
     See the review rule below for the whole of it.
  4. **Versions are append-only, by trigger.** Only `is_current` may
     change; every other column raises on update, and delete raises
     outright. A recommendation that changed is a new version.
  5. **A purchased plan is never re-versioned.** Once `status = 'accepted'`
     the thread is closed and a later recommendation opens a new one with
     `supersedes_id` set, because editing a purchased plan would change the
     description of something already paid for. `care_plans_one_open_per_patient`
     keeps at most one **open** plan — `active` or `pending_review` — so a
     patient never sees two competing recommendations, and a queued one
     cannot go live beside a published one. Scoping that index to `active`
     alone, as it was before the review step, is exactly how that happens.

  One record, two readers: `CarePlanHistory` renders the same
  `care_plan_versions` rows on the therapist's chart and the patient's
  Health Profile, branching on `voice` rather than keeping a copy per
  surface. Read them through `src/lib/carePlanServer.ts`, never with your
  own query.

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
    ("Paediatric physiotherapy", not "pediatrics"), and keep "triage" and
    "onboarding" off their screens entirely. The clinician word and the
    patient word are separate fields (`label` / `patientLabel`) and may
    differ, but where the clinic has settled on one name for a service, both
    say it: the catalogue, the condition picker and the exam panel calling
    the same care three things is the confusion this rule exists to stop.
    Spelling is British throughout — "Orthopaedic", "Paediatric" — so an
    American spelling in one label reads as a typo beside the others.
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
  read/unread — it marks what is still waiting on the viewer, and `sortFeed`
  pins those above everything else before sorting by date within each group,
  then caps repeats of one title at `MAX_PER_TITLE`. The cap is the other
  half of the pin: pinning alone let one noisy kind fill all twelve slots —
  a patient with a dozen abandoned checkouts saw "Payment not completed"
  twelve times and never saw that they had sessions already paid for and
  never booked. The twelfth identical line was never information.
  The pinning is load-bearing rather than cosmetic: an item dated when it
  arose sinks further the longer it goes unanswered, which is backwards for
  the one class of item that is still owed something — a programme paid for
  a month ago with sessions unbooked is the case that made it obvious.
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
- **A count links to the rows it counted, never to the whole table.** A
  Today figure or queue row that opened an unfiltered list made the reader
  redo the filtering by hand and, worse, made the number look wrong.
  `adminScreenHref(section, tab, view)` adds a third, optional `?view=`
  preset, and the target screen applies it to its own filters on arrival:
  `AdminAllSessionsTab` knows `unassigned`, `today`, `cancelled`, `no_show`,
  `completed`, `home_visit` and `unpaid`; `AdminPayoutsTab` knows `owed` and
  `settled`. Three rules keep it honest. It is **one-shot**:
  `AdminShell.navigate()` deletes `view` on the next tab change, so a preset
  never becomes a filter an admin cannot find the source of, and a repeat
  tap on the same row re-applies it. It **clears the screen's other filters
  first**, since a remembered therapist or date range would hide rows the
  count included — the same "list disagrees with the number" bug in a
  subtler form. And it is applied **during render** (read via
  `useSearchParams`, not at mount): every screen is mounted at once behind
  `hidden`, so there is no mount to hang it on when an admin already on the
  dashboard taps a figure, and an effect would paint the unfiltered table
  first. An unknown preset falls through to cleared filters, so a stale
  link shows everything rather than nothing.
- **Assigning is not reassigning, and the word has to say which.** A session
  nobody has ever been assigned to offered only "Reschedule / Reassign",
  which reads as editing something that already happened — so the one
  action an admin most often needs had no name on screen. Where a therapist
  is missing, every surface now says **Tap to assign**: the All Sessions and
  Calendar rows carry it as a chip (the row click already opens the drawer,
  where the work is done), `EditBookingForm`'s trigger swaps its label on
  `currentTherapistId`, and `SessionDetailDrawer` leads with
  `AssignTherapistForm` — one tap, honouring `preferred_therapist_id`, the
  therapist the patient asked for — with the reschedule form kept below for
  when the time has to move too.
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
- **Admin-configurable behavior** (Meet on/off, join without approval, join
  window, idle timeout, the sign-out banner's duration, whether a
  recommendation is approved before the patient sees it) is read through
  `src/lib/adminSettings.ts` with defaults — don't hardcode these.

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
  window, the package-wide settings — default
  validity, therapist-lock switch, bulk-scheduler limit, expiry reminder
  window — the three recommendation settings on Settings → Booking Rules —
  whether the clinic approves one before the patient sees it
  (`care_plan_requires_approval`, on by default), how long an approved one
  holds, and the ceiling on sessions a week a clinician may ask for — the nine `home_visit_*` settings — master switch, cash on/off,
  lead time, cancellation refund window, default validity, bulk-scheduler
  limit, travel buffer minutes, and the public page's heading/subheading —
  and Brand & Contact Details — site name, tagline, description, contact
  email, WhatsApp number, contact phone, footer copyright text — and the
  Home page walkthrough's per-step rotation seconds, where 0 means "don't
  rotate" — and the opening splash's five settings — on/off, the name above
  the line (blank follows the site name), its one line, the hold in seconds,
  and the minutes a tab must be away to earn a second greeting, where 0
  means "first load only" — and the two contact controls,
  `contact_scan_mode` and `contact_masking_enabled`, on Settings → Team &
  Access, and `risk_signals_enabled` with the per-detector thresholds in
  `risk_rules`, on Today → Risk — and `enabled_intake_specialties`, which
  condition types triage offers — and the four invite settings on Settings →
  Booking Rules (on/off, what the friend gets, what the inviter gets, and the
  ceiling on rewards one patient may earn) plus `promo_codes_enabled`, whose
  switch sits on Money → Costs beside the campaigns it governs rather than in
  Settings, because an admin who has just written a code and cannot see why
  it does nothing is the failure that placement avoids) is read
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
