<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Dr. Pooja's Physio - agent guide

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

Commands: `npm run dev`, `npm run build`, `npm start`,
`npm run start:cluster` (several workers on one port -- see the clustering
rule under "Supabase clients"), `npm run lint`,
`npm run test`, `npm run check:realtime`, `npm run check:grants`,
`npm run test:e2e`,
`npm run seed:qa` (recreate the QA fixture accounts after a data reset),
`npm run clean:e2e` (delete the fixture rows earlier e2e runs left behind),
and `npm run verify` (lint + test + build, the one to run before pushing).
`npm run test` is Vitest over `src/**/*.test.ts` - the dependency-free
modules in `src/lib`, which is why the business maths lives there rather
than inside components. It needs no database and no browser; anything that
does belongs in `e2e/`. `npm run lint` runs two schema checks first.
`check:realtime` (`scripts/check-realtime-coverage.mjs`) fails the lint
when a table the UI subscribes to was never added to the `supabase_realtime`
publication in `schema.sql`. That mismatch has no runtime symptom - the
subscription succeeds and simply never fires - so the check is the only
thing that catches it. `check:grants`
(`scripts/check-function-grants.mjs`) fails the lint when a `security
definer` function in `schema.sql` is not revoked from **all three** of
`public`, `anon` and `authenticated` - see the function-grant rule below,
which is the same shape of failure: the statement succeeds, the ACL
changes, and nothing is protected. `scripts/check-live-grants.mjs` is its
runtime counterpart and is run by hand against a real project after
applying a schema change, because the file and the database can disagree
in both directions. The e2e suite (Playwright, `e2e/`) covers the
money-critical paths and the admin back office - booking + payment,
concurrency/CAS guards, bulk limits, admin route authorization for every
role, input validation, payout/refund maths, the dashboard's own
navigation in a real browser, the public pages' section rail and scroll
arrow (`section-nav.spec.ts`), the public catalog's detail dialogs
(`catalog-detail.spec.ts`), catalog covers uploaded, positioned and
rendering the same way on the card, the dialog and the patient's booking
screen (`catalog-cover-image.spec.ts`), and booking a named specialist from `/team`
(`therapist-request.spec.ts`), who may book plus the dashboards' way home
(`booking-account-role.spec.ts`), and therapist-suggested sessions including
button spam, concurrent answers and a dropped connection
(`session-suggestions.spec.ts`), the Home page walkthrough's
admin-configured rotation pace (`journey-pace.spec.ts`), and self-signup
going through with no email-confirmation step
(`patient-registration.spec.ts`), the Session Completed cutoff on every
surface that lists a session (`session-completed-cutoff.spec.ts`), and the
brand splash's cold-open, reload and long-absence rules together with its
admin settings (`splash-screen.spec.ts`), and each admin scope's own
landing screen -- the figure it leads with, quick actions that all land
inside that scope, the access card a limited scope gets and a Master Admin
does not, two dozen un-settled sidebar clicks leaving the dashboard naming
itself exactly twice with no console error and the scope still enforced,
six concurrent renders of one dashboard agreeing on every figure, and the
Logs section refusing all three limited desks at the screen *and* at both of
its routes while the retention floor refuses a cutoff inside the protected
window (`admin-scoped-dashboard.spec.ts` -- whose console-error assertion splits
failed requests by host, since this sandbox blocks the *browser* from
reaching Supabase and RealtimeRefresh's socket dies on every run; that split
covers the **console** channel as well as `requestfailed`, because a
WebSocket that never opens is reported only on the console and so slipped
past the host rule entirely, taking S-005 red on every run for a reason that
had nothing to do with the app. A **cancelled** request is not a failed one
either: `requestfailed` fires for both, and Next prefetches an RSC payload
for every Link entering the viewport, then aborts the ones a screen swap
supersedes -- which is precisely what S-005's two dozen unsettled sidebar
clicks produce, so an app-origin `ERR_ABORTED` on a `_rsc=` prefetch is the
test's own premise rather than a fault. Every other app-origin failure, and
an abort that is not a prefetch, still fails it),
and the therapist roster end to end
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
and the refusal to confirm anything still owed (`acquisition-codes.spec.ts`),
and pay later end to end in a real browser (`pay-later.spec.ts`) -- the
master switch and the grant card, a booking that never reaches a payment
screen, completion putting the money in the owed figure, the revenue and the
therapist's share at once, the patient's own widget and a declaration that
settles nothing until an admin confirms it, the settlement leaving every
money figure byte-identical, and a write-off costing the clinic without
moving one. It drives screens rather than routes deliberately: half of what
this feature got wrong the first time was what a person reads -- a delivered
session chipped "Unpaid", a feed telling a patient their booked session was
not booked, a Pay-now link that led nowhere -- and every one of those is
invisible to an API test and obvious in a screenshot.
It needs a
test/staging Supabase project plus
Razorpay test keys, so `npm run build` and `npm run lint` remain the default
verification for a change that can't reach one.

**The suite runs in the clinic's zone, pinned in `playwright.config.ts`.**
Specs build a bookable slot with `d.setHours(hour, 0, 0, 0)` -- a whole hour
in whatever zone the *runtime* is in -- while the app judges the whole-hour
rule in the booking's own zone, which is the whole point of that rule. On a
developer's machine set to India time the two agree; on a UTC host the same
slot arrives as 15:30 IST and the route correctly answers "Sessions start on
the hour", taking twenty cases across `session-scheduling`,
`session-suggestions`, `booking-rules` and `concurrency` red at once --
every one of them describing a working product. `process.env.TZ` is set at
the top of the config rather than left to whoever runs it: an environment
variable somebody has to remember is one they will forget, and this failure
reads as a broken booking funnel rather than as a clock.

Three environment notes for the browser specs:

- Set `PLAYWRIGHT_CHROMIUM_PATH` when the sandbox already ships a Chromium.
- They sign in by injecting a Node-minted session cookie rather than typing
  into the login form, so a sandbox whose browser has no outbound network
  can still exercise the whole dashboard.
- **A spec that needs the *browser* to reach Supabase cannot pass here.**
  The cookie injection above covers authentication, not data: a page that
  resolves something with the browser-side client still needs egress from
  Chromium. `therapist-request.spec.ts` TR-002 is the case in point -
  `BookingWizard` resolves `?therapist=` against `public_therapist_profiles`
  from the browser (the page is ISR-cached, so it cannot be done
  server-side), so with no egress the chip never renders and the test fails
  on a working feature. Check it before hunting for the bug:
  `fetch(SUPABASE_URL + "/rest/v1/")` from inside the page returns
  "Failed to fetch" where the same call from Node returns 200. Note TR-003
  asserts that chip is *absent*, so in the same environment it passes for the
  wrong reason.
  `booking-rules.spec.ts` BR-CANCEL-001/002 are the same case one flow over,
  and they read as a broken checkout rather than as a missing chip:
  `BookingWizard` resolves `isLoggedIn` from its own client-side
  `auth.getUser()`, so with no egress the injected cookie is invisible to it,
  Step 2 renders the signed-out registration fields, the walk never reaches
  Step 3, and the failure is `getByText(/Free cancellation/)` not found. Both
  fail identically on an unmodified tree -- confirmed by stashing and
  re-running -- so a change to the cancellation copy is not what to suspect
  first. `admin-settings-ia.spec.ts` CFG-005 covers the same page and passes
  here, because Step 1's picker is fed by the server render rather than by a
  browser-side read.
  `pay-later.spec.ts` PL-UI-003 to PL-UI-006 are the same case a third time,
  and its own screenshots are what settle it: `07-book-step2-filled.png` shows
  Step 2 offering *Full Name*, *Create Password* and "Already have an account?
  Sign in first" to a patient the spec had just signed in, so the four cases
  after it fail on a booking that was never made rather than on anything
  pay-later. A whole-suite run here is therefore **258 passed, 6 failed**, and
  those six are these three pairs -- all six fail identically on a stashed,
  unmodified tree. Check that before reading a red pay-later run as a money
  bug.
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

`scripts/seed-qa-accounts.mjs` (`npm run seed:qa`) recreates every account
the manual plan names -- four admins, three patients, three therapists, two
hospitals -- with the fixture password, straight after a data reset. The reset
deletes every non-admin account by design, so §8 of the plan is then a list of
twelve logins that do not exist, and two of them (a scoped admin, a hospital)
are normally minted from the back office with a generated password shown once.
It is idempotent: an existing account keeps its id, its history and its
hospital referral code, and only has its password put back to the fixture --
"invalid credentials" is nearly always a password nobody wrote down rather
than a missing row. It needs `SUPABASE_SERVICE_ROLE_KEY`, writes with the
service role, and must never be pointed at a database with real patients.
Rosters, service areas, home-visit packages and saved addresses are
deliberately **not** seeded: a test creates each of them, and a fixture that
arrived already correct would make that test pass without running.

`scripts/clean-e2e-residue.mjs` (`npm run clean:e2e`) deletes the fixture
rows the suite writes straight into the database. Three concurrency specs
insert a home-visit purchase, an appointment and a pair of referrals
directly rather than through the booking routes -- which is the point of
them, since each is racing a route that has to be *given* something to race
over -- and a direct insert never claims `visits_used` and never asks Google
for a calendar event. So a leftover fixture appointment is a credit the
ledger has reserved and the legacy counter has never heard of, which
`verify_entitlement_balances()` reports for ever because nothing sweeps it,
and it is also a session with no video link. Nine runs put nine of each on
Settings -> System Health, permanently red, none of them describing anything
wrong with the product. The specs register and delete their own rows in an
`afterAll` now (an afterAll rather than the end of each test, so a failed
assertion still cleans up); this script clears what earlier runs already
left, and matches only the literal marker strings in `E2E_MARKERS`
(`e2e/helpers.ts`). It is dry-run until one of two flags, and the **ledger is
why there are two**. `--reconcile` does what that table's own append-only
trigger tells a caller to do -- releases each fixture appointment's reserved
credit through `release_session_credit()` and cancels the appointment -- so
the balances agree again and the row leaves the Session Links backlog, which
counts confirmed sessions only. Nothing is destroyed, nothing is rewritten,
and the service-role key is all it needs. `--apply` removes the rows outright
instead, which cascades into `session_credit_ledger` and is therefore refused
over REST: it runs as one SQL transaction over the Management API, needs
`SUPABASE_ACCESS_TOKEN`, and lifts the trigger for those statements alone.
Either way the fixture `payments` rows go with their purchase -- that foreign
key is ON DELETE SET NULL, so leaving them would trade one red check for
another, a captured payment attached to nothing.

**Pay later's fixture money is the second thing only `--apply` can clear,
and for the same kind of reason.** `e2e/pay-later.spec.ts` writes its
`pay_later_payments` rows through the real routes rather than inserting them,
so they are correct rows -- and `pay_later_payments` is append-only by
trigger, so the spec cannot remove its own money history and a confirmed
settlement has no undo by design. Left behind, that payment's
`unallocated_paise` nets off the next run's owed figure: the patient's widget
reads less than the sessions listed under it, and the journey fails on a
working product. `--reconcile` **says it cannot help** rather than quietly
doing nothing, and the spec's own `beforeAll` fails naming this script
instead of swallowing the refused delete -- which is exactly what hid it the
first time.

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

`scripts/rate-limit-sql-checks.sql` is the rate limiter's storage-layer
check -- the cap holding, a refused hit still being counted, Retry-After
staying inside its window, one bucket not spending another's allowance, the
per-bucket cleanup keeping the table at one row, and a new window starting
clean. It runs inside one transaction and ends in ROLLBACK. Concurrency is
deliberately not in it: one psql session cannot race itself, so that property
is checked by firing parallel requests at the RPC instead (12 against a cap of
5 allowed exactly 5, with twelve distinct counts handed out and no lost
update).

`scripts/append-only-sql-checks.sql` is the append-only guards' check, and
it asserts **both** halves of each one: the single mutation the table
legitimately needs still lands, and every other one raises. Checking only the
refusals would pass just as well on a trigger that had broken the feature --
so it proves `admin_activity_log` still deletes for the retention purge,
`payment_webhook_events` still takes its `processed_at` update, and `payments`
still makes the created -> captured transition, alongside the nine refusals.
It runs inside one transaction and ends in ROLLBACK, and it **builds its own
session note** rather than finding one, since a database with no session notes
would otherwise skip that table silently. A negative control was run before
the file was trusted: a failed assertion has to reach the caller as an error,
or a green run means nothing.

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
workers made contention look like product bugs - an audit-log count picked
up another spec's writes, and the admin dashboard's ~70 queries blew past
an assertion timeout.

**Run the browser specs against `next dev`, not `next start`.** The public
pages are ISR-cached (`export const revalidate = 300`), so a production
server hands back HTML generated at build time - which predates any fixture
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
src/lib/adminNav.ts      the admin dashboard's seven sections + their screens
src/lib/adminHome.ts     what each admin scope's Today screen opens on
src/lib/activityLog.ts   the log's search, its categories and its retention floor
src/lib/formatDateTime.ts every date the app renders, pinned to clinic time
src/lib/refundState.ts   how a refund reads, wherever a session is shown
src/lib/catalogImage.ts  catalog covers: caps, paths, and where a subject sits
src/lib/catalogFeatured.ts which few of the catalogue a public page leads with
src/lib/marketingNav.ts  the eight public pages + their one-line purposes
src/lib/mission.ts       the mission, vision, promises and stated limits
src/lib/missionCopy.ts   the mission, vision, promises and limits as an admin
                         may have rewritten them
src/lib/marketingPhotos.ts every photograph the public pages use
src/lib/careAreas.ts     the six areas of practice, shared by / and /conditions
src/lib/carePlanAuthoring.ts the one writer of a care plan version, three doors
src/lib/carePlanReview.ts the clinic's decision on a queued recommendation
src/lib/sessionRhythm.ts the proposed run of dates a paid programme opens on
src/lib/discounts.ts     the acquisition discounts and what they record
src/lib/promoCodes.ts    a campaign's maths and whether this patient may claim it
src/lib/inviteRewards.ts one patient inviting another, and both halves of it
src/lib/rateLimit.ts     the named limits, and who a request counts against
src/lib/rateLimitServer.ts the one call that counts a hit and refuses
src/lib/checkoutQuote.ts what a booking costs, resolved once for three callers
src/lib/confirmPaidAppointment.ts the sequence a booking becoming paid runs
src/lib/cancellationWindow.ts what cancelling this slot will cost, before paying
src/lib/financeMetrics.ts the seven standard finance figures and their inputs
src/lib/patientBalances.ts what trusted patients owe, and how long they have
src/lib/payLaterSettingsServer.ts the clinic's own "worth chasing" threshold
src/lib/payLaterWriteOff.ts forgiving one session's debt, and taking that back
src/lib/sessionAmount.ts  one session's worth, with each caller's own fallback
src/lib/financeInputs.ts validation for the three things an owner types in
src/lib/financeSettingsServer.ts how Business Health reads the same money
src/lib/adminScope.ts    admin scopes and which sections each one may open
src/lib/accountDeletion.ts what blocks deleting an account, and what to say
src/lib/listOrdering.ts  moving a row up or down a hand-ordered admin list
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

An audit found eight routes with only the first - `acknowledge-payout-request`,
`withdraw-suggestion`, `hospital/withdraw-referral`, `home-visit/verify`,
`medical-documents/delete`, `dismiss-onboarding`, `log-payment-failure` and
`clear-temp-password`. All eight are ownership-scoped, so the reach was "a
suspended account keeps acting as itself" rather than anything cross-account,
but that is exactly what this rule exists to stop and the routes read as
though they had it. They call the helper now. Use the helper rather than an
inline `profile.active === false` even when the route already loads the row
(`reveal-contact` does, correctly, and is why the other eight were missed):
a grep for the helper name is how the next audit finds the gap.

Admin routes go through `src/lib/supabase/requireAdmin.ts`. Never trust a
role, an id, or an amount sent from the client - re-derive it server-side.

**A body is parsed through `parseJsonBody`, never `await request.json()`.**
`request.json()` throws on a malformed or absent body and nothing catches it,
so the caller gets a 500 where the honest answer is a 400 -- the request was
theirs to get right. A sweep of every POST handler found 45 still parsing
directly, among them `/api/razorpay/create-order`, `/api/razorpay/verify` and
the one public door in the list, `/api/patient/register-via-referral`. The
helper also refuses a body that is valid JSON but not an object (`null`, an
array, a bare string), because every call site destructures the result and
those arrive as an uncaught TypeError further down instead. Type the generic
with the shape the route expects rather than leaving the fields implicitly
`any`: doing that is what showed the admin forms post `""` for a blank number
box, so `displayOrder` and `rating` are `number | string` and the routes were
right to compare against `""`. Where a route already narrows a value itself
(`Array.isArray`, a `typeof` check, a literal comparison), the field is
`unknown` -- typing it concretely would claim a guarantee the request does not
carry.

**A check that could not be run is not a check that came back negative.**
`getAdminUser` collapsed three different outcomes into `null`, and the routes
turned that into a flat 403: no session, a failed read, and genuinely not
allowed all said "Forbidden". Two of those are not refusals. The one admins
actually met is the **session refresh race** - this dashboard fires many
requests at once, Supabase rotates refresh tokens, and the request carrying
one another has just rotated comes back with no user - so a Master Admin was
intermittently told they were not allowed to use a control they use every
day. `getAdminContextResult()` keeps the reason: `unauthenticated` (401,
retryable), `unavailable` (the profile read errored - anything but
`PGRST116`, which is a real "no such row"; 503, retryable), `forbidden`
(403, and deliberately still opaque so a limited admin cannot map what
exists beyond their access). `getAdminUser` and `getAdminContext` keep their
`null` shape, so the 99 routes built on them are unchanged; a route that can
act on the difference takes the result version instead. A client may retry a
401 or a 503 **once** - both are answered before anything is written, so
there is nothing to duplicate - and must not retry anything else.

Admins additionally carry a scope (`profiles.admin_scope`: `full`,
`operations`, `finance`, `clinical` - see `src/lib/adminScope.ts`), which
decides which dashboard sections they can open **and at what level**. A
`(scope, section)` pair is `none`, `view` or `manage`, and the middle value
is the point: a desk often needs to read something it must never change.
There is deliberately no "write only" - a dashboard cannot let somebody
change a row they are not allowed to see, so the third box a permissions
matrix usually draws is one this product has no honest meaning for.
**`requireAdminScope(section)` asks for `manage`**, which is what makes
`view` real rather than a label: every route guarded by it is a POST that
changes something, so a section granted at `view` is read-only at all 99 of
them without one being edited, and the level cannot be widened by a screen
forgetting to hide a button. `scopeCanOpen` (view or manage) decides what
renders; `scopeCanManage` decides what a control may do. One grant is
`view` today - **finance reads Sessions** - because the question finance
actually asks ("what was this ₹1,200 for?") was answerable only by asking
somebody else, while handing finance the section outright would let the
person reconciling the books cancel the sessions they are reconciling.
**Every** admin route guards
with `requireAdminScope(section)`, not `getAdminUser()`; the sidebar hiding a
section is presentation only, since a session cookie can call any route
directly. The section is chosen by the capability, not by where the button
happens to sit - a refund is `money` even though its button lives on a
Catalog screen. And a guarded route needs the UI to match: a control an
admin's scope cannot call must not render, or they get a 403 with nothing
to explain it. `ProfileSessionList`, `SessionDetailDrawer`, the two
purchase detail modals and the Partners screen's revenue-share editor and
its two share figures take `canSeeMoney` / `canManageSessions` for exactly
that reason -- Partners sits on People, which every scope opens, while
`update-hospital-revenue-share` is a money route.

**Every scope opens on its own dashboard, and one module decides all four.**
`src/lib/adminHome.ts` returns the greeting, the four figures, the quick
actions, the queue order and the access note for a given scope, and the
dashboard page renders what it returns. Four scopes on one Today screen went
wrong in three ways, and all three are the kind that look like a working
screen:
1. **A figure that disagrees with the list under it.** "Needs a person"
   summed every queue while the queue list beside it was already filtered to
   what the viewer could open, so a clinical admin read 23 over a list of
   four. `visibleQueueTotal()` counts the same rows the list renders, and
   the strip reads that. Same rule as the `?view=` presets: a count links to
   -- and agrees with -- the rows it counted.
2. **A link the viewer cannot follow.** The quick actions were hardcoded at
   Sessions and Money for everybody, and `findTab` falls back to the first
   section a scope *can* open -- so a finance admin's "All sessions" landed
   back on Today, silently. Every href this module produces is built through
   `scopeCanOpen`, and an action for an unreachable section is **dropped**
   rather than written carefully, so a future change to the scope table
   breaks the list rather than the admin. The dashboard's global search is
   filtered the same way: a purchase code that opens Today is a code the
   admin is told does not exist.
3. **A role reading a different role's questions first.** Emphasis is
   scope-shaped: operations leads with unassigned sessions, finance with
   what is owed, clinical with the recommendation queue. A money figure is
   not merely unlinked for a scope that cannot open Money -- the page does
   not compute it.
Ordering the queues is emphasis, never permission: `orderQueueGroups()`
moves a scope's own domains to the top and **removes nothing**, because what
a scope may work is the routes' decision and a UI that hid a reachable queue
would be a second permission model to disagree with the first.
**Activity is the one exception, and it is deliberate.** A queue is work
waiting on somebody, so hiding one would hide their job; a log is a record of
what other people did, and the clinic's decision is that a desk reads its own.
`src/lib/activityScope.ts` holds it: an entry is visible to a limited scope
only when the action's **domain** is a section that desk can work *and* the
**actor** sits at that desk. A Master Admin is unfiltered. The domain map is
taken from the `requireAdminScope("...")` each action's own route guards with,
so the feed cannot offer a row whose screen the reader is refused at, and
`activityScope.test.ts` fails when an action in the audit union has no entry.
The actor half has a cost worth knowing: in a small clinic the Master Admin
does most of the work, so these feeds run sparse -- which is why a scoped
reader is told the list is their desk's rather than being shown an empty
screen that reads as "nothing happened". What a queue
*count* reads, though, is `manage` and not merely open: a queue is a piece of
work, and finance reads Sessions without being able to assign one, so an
unassigned session is not waiting on them - counting it there would put a
figure on their Today screen that nothing they could do would ever bring
down. `visibleQueueTotal`, the queue list and `reachableActions` all take the
workable sections, so the three agree. **Every dashboard names itself**, in the sidebar brand (above "Admin Panel")
and again as the eyebrow over the section heading -- `Master Admin`,
`Operations`, `Finance`, `Clinical`, from `ADMIN_SCOPE_LABELS`. Twice
because the sidebar collapses to icons and is a closed drawer on a phone,
while the header is on every screen at every width. Four dashboards that all
said "Admin Panel" and differed only in which sidebar entries were missing
made an admin infer which one they were on from an absence. That label set
is **one set, doing three jobs** -- the entries in User Access's Account
type picker, the access level on an existing admin's row, and the name on
the dashboard -- which is why `full` reads "Master Admin"
rather than "Full access": as a permission both work, but only one is the
name of a desk somebody sits at, and every user-facing string that used to
say "full-access admin" says Master Admin now (the QA plan quotes those
verbatim, so it moved in the same change). **Creating one of those admins is one dropdown.** User Access's Account
type picker lists all six in two groups -- Clinic (Patient, Therapist) and
Back office (the four scope labels) -- rather than an "Admin" entry that
reveals a second Access level select once chosen. Hiring somebody into
Operations meant picking a word nobody uses and then finding a control that
was not on screen a moment earlier, in the one place where the four desks
are otherwise named consistently. The option value carries both halves
(`admin:operations`) because the route still takes a role and a scope: one
control over two fields, never a new concept in the database, and the
full-only check in `create-account` is what actually stops a limited scope
minting an admin -- the group being absent from the picker is presentation.
A limited scope additionally gets
an access note (`AdminAccessCard`) naming which sections its name comes to
-- the sections are correctly hidden already, and this is the sentence
saying they were hidden on purpose. The note carries no scope name of its
own: the brand and the header are both on that screen already. Add a screen to a scope's landing by editing that
module, not the page; `src/lib/adminHome.test.ts` asserts the two invariants
above over all four scopes.

`getAdminUser()` and the proxy's admin branch both refuse a suspended admin
(`profiles.active`). They deliberately do **not** check `approved`: an admin
is promoted by hand rather than through the signup queue, so gating on it
would lock out the people it protects. Only a `full` admin can change
scopes or mint another admin, nobody can change their own, and the last
`full` admin cannot be narrowed - otherwise a single mis-click locks
everyone out permanently.

Every mutating admin route records what happened via
`recordAdminActivity()` (`src/lib/adminActivityLog.ts`), and every action in
the `AdminActivityAction` union has a caller - that used to be true of only
16 of them, which left the largest money move in the app (`payout.settle`)
unattributed. Adding an action without a caller, or a mutating route without
a call, puts the log back where it was. A QA sweep found a quarter of them writing nothing -
including the route that changes a patient's sign-in email - so the rule is
now checked by counting rather than trusted: every admin route that inserts,
updates or deletes has a call, and the three that do not (`export-pdf` and
the two purchase-detail routes) are reads. A generated password never goes in
`details`: the log is readable by every admin, so who reset what and when is
the part with audit value. The call goes **after** the route's CAS claim,
so the log cannot record a settlement or cancellation that lost its race. It is best-effort
and never throws: an audit write failing must not block the action it
describes, same posture as the Meet-sync rule below. `admin_activity_log`
has a select policy and deliberately no insert policy, so the service-role
client is the only writer and the log is append-only from any session.

## Supabase clients - pick the right one

- `src/lib/supabase/client.ts` - browser, anon key, RLS applies.
- `src/lib/supabase/server.ts` - server components / route handlers, acts as
  the signed-in user.
- `src/lib/supabase/public.ts` - unauthenticated server reads of public data.
- `src/lib/supabase/admin.ts` - service role, **bypasses RLS**. Server-only.
  Use it only after an explicit auth check, and never import it into anything
  that can reach the browser.

**Every server-side one of those four shares one `fetch`, and that is not a
detail.** `src/lib/supabase/resilientFetch.ts` is passed as `global.fetch`
to `admin.ts`, `public.ts`, `server.ts` and `proxy.ts`, and a new server
client gets it too. It does three things, each of which is a failure that
was measured rather than imagined:

1. **It caps how many requests may be in flight to Supabase at once** (96 by
   default, `SUPABASE_MAX_IN_FLIGHT`). Node's fetch opens a socket per
   request and will happily open thousands. The admin dashboard fires ~82
   queries per render, so 40 concurrent admins is ~3,300 requests against
   one origin: the TLS handshakes queued past undici's 10-second connect
   timeout and the render's own isolated guards turned the failures into
   empty panels. Fifteen renders in that run answered **HTTP 200 having
   lost the appointments table** -- the query that feeds Overview, Calendar,
   Sessions and every money figure. The database answered 400 concurrent
   requests in 4.6s with no errors in the same run, so the origin was never
   what broke.
2. **It puts a deadline on every request** (20s, `SUPABASE_REQUEST_TIMEOUT_MS`).
   undici's default body timeout is five minutes, and a socket stuck that
   long holds a slot the requests behind it need.
3. **It retries a GET once on a transport error, and never a write.** The
   ledger RPCs, `record_payment_capture` and `claim_promo_code` are all
   idempotent, but on keys this layer cannot see -- so the decision to
   repeat belongs to the caller, and the default is not to. An HTTP error
   status is never retried either: a 500 from PostgREST is an answer.

The cap is **measured, and a cap that is too tight is its own failure**: at
40 concurrent renders, 48 gave a p50 of 130s, 96 gave 15.3s and 192 gave
16.4s. A page render is a chain of query batches rather than one batch, so
every sequential step pays the queue's whole depth again -- which is why
halving the cap multiplied latency by eight instead of two. Past ~96 the
database's own throughput is the limit (flat at ~290ms a query, ~330 queries
a second, from 8 concurrent to 96), so a higher number buys nothing and only
widens the burst this exists to stop.

**A read that failed is not a read that came back empty, and the admin
dashboard now says which.** Every read on that page is isolated so one
failure costs its own panel -- and the cost of that isolation is that a
failed read renders as an empty one. `AdminDataLoadBanner` is the sentence
saying so, above the health banner, for every scope: a `console.error` is
not a place a clinic owner looks, and a zero meaning "nothing happened" and
a zero meaning "we could not ask" are opposite facts that render
identically. The same correction was applied to the two routes where an
unreadable `home_visit_enabled` was being reported to a patient as the
clinic having withdrawn the service: `/api/home-visit/check-area` and
`/api/care-plan/create-order` still refuse (failing closed is the safe
direction for "do we come to you") but answer **503 "we couldn't check"**
rather than 403 "home visits aren't available", because those two send a
patient to two different places.

**One Node process renders everything, so production runs several.**
`npm run start:cluster` (`scripts/start-cluster.mjs`) forks `WEB_CONCURRENCY`
workers -- cores, capped at 4 -- on one port through `node:cluster`, which
hands each accepted connection to a worker off the primary's shared handle,
so nothing sits in front of it. `next start` still works and is still what a
single-process host should run.

It exists because the JS thread was the queue once the database was not:
with 200 concurrent visitors browsing the public pages, one admin dashboard
render went from 4.0s to 15.9s while Supabase held a flat ~290ms a query
throughout. Four workers: the public site went from 395 to 580 requests a
second and that same render to 11.3s.

Two things are per **process**, not per server, and the script handles both
rather than leaving them to be discovered:

1. **The lazy sweeps' minimum intervals.** `retryDueMeetSyncs` and
   `retryDueMeetAccess` hold a minute, `runRiskSweep` five, each in a
   module-level timestamp whose comment says "per server instance". With N
   workers the clinic can see up to N sweeps per window. Safe -- each claims
   its rows before calling Google and each row carries its own attempt cap --
   but it spends an appointment's automatic retries faster, which is why the
   worker count is capped rather than set to one per core.
2. **`SUPABASE_MAX_IN_FLIGHT`.** Left alone, four workers would carry four
   times the measured socket budget. The script divides a 192-request budget
   across the workers instead, and 192 rather than 96 is itself measured:
   dividing 96 four ways gave each worker 24, which queued every ~56-query
   batch two deep and pushed a *single* admin render on an idle server from
   4.0s to 6.7s -- a regression handed to the quiet case to protect the busy
   one. 4x48 gives 3.7s alone and 11.3s contended at 580 public rps; 4x96
   gives 7.5s contended but drops the public site to 454 rps, so the default
   takes the middle and an operator who would rather have the dashboard
   raises the variable.

**And the admin dashboard's own cost was measured rather than refactored.**
The obvious suspects are its ~82 queries and the 34 screens it renders at
once, and the second one is not where the time goes -- rendering only the
active screen was measured at 1.7MB down to 135KB for 0.4s of wall clock.
Clustered, it is 3.7s idle and 9-11s under a load no clinic this size will
see, for a screen a handful of admins open. So the "every screen stays
mounted" design stays, and the answer to a slow dashboard is another worker
rather than a rewrite. Revisit if the number of concurrent admins grows, not
before.

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
  touching it - the schema-apply workflow runs it on every push to `main`.
- New columns are migration-dependent - a live database may not have them
  yet. Query such a column in its own isolated call and merge the result in
  (see `src/lib/sessionCode.ts`), so one unknown-column error can't blank
  every field of a shared query.
- Money is integer paise. Times are `timestamptz`. Percentages
  (`revenue_share_percent`) are 0–100.
- **Session credits are a ledger, not a counter.** `session_entitlements`
  is what a patient bought; `session_credit_ledger` is every movement of it,
  append-only. The counts on the entitlement are a *cache* the ledger
  maintains by trigger, and the CHECK on that cache is what makes an
  impossible balance impossible rather than merely unwritten - a ledger row
  that would overdraw fails the constraint and takes its transaction with
  it. Six rules hold this together:
  1. **Every movement goes through an RPC** (`reserve_session_credit`,
     `consume_session_credit`, `release_session_credit`,
     `void_session_credits`, `adjust_session_credits`), called from
     `src/lib/sessionCredits.ts`. They open with `select … for update`,
     which is a real lock - verified with 12 concurrent reserves against one
     credit, of which exactly one won. Never write the ledger directly.
  2. **Idempotency keys are derived from the thing that happened**, never
     random: `reserve:<appointment_id>`, `consume:<appointment_id>`. A
     random key makes every retry look like a new event, which is the bug
     the key exists to prevent. Idempotency is checked *before* availability
     in `reserve_session_credit`, deliberately - checking availability first
     answers "no credits available" for a booking that in fact succeeded.
  3. **The ledger is append-only, enforced by a trigger, not by RLS.** The
     revoke covers a browser session; every route in this app writes with the
     service-role client, which bypasses RLS entirely. For a table whose
     whole value is that it cannot be rewritten, "no route updates it" is
     not the same guarantee as "an update raises".

     **That reasoning applies to every evidence table, and four did not have
     it.** An audit found the gap by simply issuing the UPDATE:
     `admin_activity_log` -- the trail the whole Logs section is built on, the
     record of who impersonated whom, who settled which payout and who cleared
     the log -- accepted a rewrite and changed a row. `payments`,
     `payment_webhook_events` and `session_note_revisions` were the other
     three. Each now permits exactly the one mutation it needs and refuses the
     rest: `admin_activity_log` keeps DELETE (the retention purge is the only
     path a row has ever left by) and never takes an UPDATE;
     `payment_webhook_events` may have `processed_at` and `processing_error`
     set after the work and nothing else, and is never deletable, because the
     row **is** the deduplication; `payments` still makes the created ->
     captured transition, and a captured payment's two Razorpay ids are frozen
     and its row is never deletable, since that is the record money moved;
     `session_note_revisions` takes neither. Verified with
     `scripts/append-only-sql-checks.sql`. A new table whose value is that it
     cannot be rewritten gets its guard in the same change.
  4. **`sessions_granted` and `package_snapshot` are frozen by trigger.**
     A purchase's definition never moves; its balance moves through the
     ledger. Never resolve a purchased entitlement by joining the live
     catalog row - read the snapshot, or an admin re-pricing a package
     silently rewrites what someone already owns.
  5. **A refund voids what is available, never what is consumed.** A
     delivered session stays delivered.
  6. **`admin_adjust` is the only entry type with free-form deltas, and the
     only one requiring a reason** - ten characters minimum, enforced by a
     CHECK so it holds for any caller. It is the override lane behind
     `/api/admin/grant-session-credits`, `reverse-session-credit` and
     `revive-entitlement`: an admin can change any balance, and cannot
     change any history.

  **Which number the app believes is a switch, not a deploy.**
  `site_settings.entitlement_ledger_authoritative` (Settings → Advanced,
  off by default) decides whether a balance shown and offered comes
  from the ledger or from `sessions_used` / `visits_used`. Flipping it is
  reversible in a second, because both are still written either way.

  The flip needed no screen to change. Every surface that shows a balance -
  the patient's widget, the therapist's programme list, both detail modals,
  the admin Purchases table, the bulk scheduler - reads the same
  `session_count` / `sessions_used` shape, so `src/lib/ledgerBalances.ts`
  substitutes `sessions_used` on the row **once, where the row is loaded**
  (`sessions_granted - available`), and every consumer follows. Add a new
  balance surface by loading its rows through that helper, not by reading
  the ledger yourself. It leaves `session_count` alone on purpose, so a
  refunded package still reads "6 sessions" with none pending rather than
  becoming a 1-session package, and it never touches a purchase with no
  entitlement - a database without the backfill behaves exactly as before.

  The flip deliberately does **not** change how a session is *claimed*. The
  counter's compare-and-swap still wins the booking race, with the ledger's
  row lock beside it. Making the ledger the claiming mechanism means
  deleting the counter writes, which is its own change with its own risk.

  **The ledger is written alongside the old counters, and does not yet
  replace them.** All eight statements in `src/` that mutate
  `sessions_used` / `visits_used` now have a mirror call beside them
  (`src/lib/sessionCreditMirror.ts`), and a mirror failure never fails the
  operation it mirrors - the counter is still authoritative, so a logged
  disagreement that reconciliation surfaces beats refusing a booking
  because a shadow ledger was unhappy. Two of the mirrors have no counter
  write to mirror at all, and both are the ledger saying something the
  counters could not: a **refund** never touched the counters (it cancels
  the remaining appointments in place and leaves the counter inflated), and
  an **expiry** left the balance implicit. A **late cancellation** mirrors
  a `consume` rather than nothing - the balance is the same either way, but
  leaving the reserve outstanding would claim a cancelled session is still
  pending. New purchases get their entitlement from
  `ensure_entitlement_for_purchase`, called by both verify routes and by
  cash-on-visit booking, which never becomes `paid` and so reaches neither.

  `verify_entitlement_balances()` reports where the cache, the ledger and
  the legacy counter disagree, on Settings → System Health → Books &
  Sessions Agree. It reports and
  never repairs - a silent auto-fix on a money record is how a discrepancy
  becomes permanent. It has already earned itself twice, catching two
  distinct bugs in the backfill it checks.

- **An invariant the app enforces belongs in the database too.**
  `sessions_used` / `visits_used` were guarded only by application-level
  compare-and-swap - correct, and true only for as long as every writer
  remembers the `.eq()` predicate, and not true at all for a hand-run
  UPDATE in the table editor. Both now carry CHECK constraints. If one
  fails against a live database, that failure is the finding: reconcile the
  rows, don't weaken the check.
- Any new table needs RLS policies written alongside it in the same file.
- **A function is revoked from `public`, `anon` AND `authenticated` - all
  three, every time.** Postgres grants EXECUTE on a new function to
  `PUBLIC`, and Supabase's `pg_default_acl` for `postgres` in schema
  `public` grants it to `anon` and `authenticated` explicitly on top. So
  each of the two obvious short forms is wrong in a different case, and
  both were:
  1. `revoke execute on function f(...) from anon, authenticated` removes a
     grant those roles never held directly and leaves PUBLIC's in place.
     Eleven functions were written that way - `record_payment_capture`
     (mark a booking paid), `grant_session_credits` (mint sessions),
     `adjust_session_credits`, `void_session_credits` and the rest of the
     ledger - and every one of them was callable over PostgREST by anybody
     holding the publishable anon key, no account needed. The statement
     succeeded. The ACL changed. Nothing was protected.
  2. `revoke ... from public` alone is correct on a database where those
     functions predate the default, and wrong on a fresh one: applying
     `schema.sql` to an empty project creates them anew, so they arrive
     carrying explicit `anon=X` and `authenticated=X`, which a revoke
     naming only PUBLIC does not touch. The hole returns on the first
     rebuild, in the file that appears to have fixed it.
  Name all three. Revoking a privilege that was never granted is a no-op,
  so the long form is safe on either shape of database.
  `alter default privileges in schema public revoke execute on functions
  from public/anon/authenticated` is at the end of the file so the next
  function is closed on arrival; a function genuinely meant for a signed-in
  caller then needs an explicit `grant execute ... to authenticated`, which
  is the right way round. `is_admin()` is the one deliberate exception -
  RLS policies invoke it as the querying role, so revoking it breaks all 23
  of them. `npm run lint` fails on a violation; `scripts/check-live-grants.mjs`
  checks the running database, since only that catches a revoke that was
  never applied.
- **Every admin policy calls `is_admin()`; none inlines it.** Eighteen
  policies carried a hand-written copy of the same `exists (select 1 from
  profiles where id = auth.uid() and role = 'admin')` instead of the call.
  That cost nothing while the copies agreed with the function - and the
  moment `is_admin()` learned to refuse a suspended admin, the eighteen did
  not. The tables involved were the worst possible list: the audit log, the
  impersonation record, the flagged-message and contact-reveal evidence
  trails, session notes, the risk queue and all four finance tables. A
  suspended admin was refused `appointments` and still read
  `admin_activity_log` with the same token. Two policies are compound
  ("the treating therapist OR an admin") and only the admin disjunct is the
  call. A new admin policy uses the function.
- **Suspending an account ends its sessions.** `profiles.active` is read by
  `src/proxy.ts` and `requireActiveProfile`, and both are this application;
  a session cookie reaches PostgREST without passing either, and Supabase
  keeps rotating that account's refresh token, so a flipped column alone had
  no end date on it. Two halves, both required: `is_admin()` refuses a
  suspended admin at the policy layer, and all four `set-*-active` routes
  call `revokeAllSessions()` (`src/lib/supabase/revokeSessions.ts`) over
  `revoke_user_sessions(uuid)`. It is a database function rather than
  `auth.admin.signOut`, which takes the suspended person's own JWT - which
  an admin route does not have - and the GoTrue admin endpoints that would
  do it by id answer 404 on this project's version; both were tested before
  this shape was settled on. It stops renewal rather than killing a token
  mid-flight, so remaining exposure is one JWT lifetime, during which the
  policy layer and each route's own `active` check already refuse them. A
  failed revoke never un-suspends the account - it returns a warning the
  route passes on, because "the door is locked but they are still inside"
  is worth saying out loud.
- A change to `schema.sql` only reaches the live database once it's applied
  - either by hand with `node scripts/run-schema.mjs`, or automatically via
  `.github/workflows/schema-apply.yml`, which runs that same script against
  Supabase on every push to `main` that touches `supabase/schema.sql` (needs
  the `SUPABASE_ACCESS_TOKEN` and `NEXT_PUBLIC_SUPABASE_URL` repo secrets
  set). Merging a schema change without either path running leaves the DB's
  policies out of sync with code that assumes them - the app can look fixed
  in review and still fail in production the same way.

## Domain rules worth knowing before editing

- **Booking lead time** is `site_settings.online_booking_lead_time_hours`,
  defaulting to the 12 hours `src/lib/bookingSlots.ts` still holds as
  `BOOKING_LEAD_TIME_HOURS`, and shared by the picker and the validator so
  they cannot drift apart.
  **The constant is the fallback, never the answer, and three surfaces had it
  the wrong way round.** `/api/appointments/create` has read the column since
  it became a setting; `/book`'s Step 1 filtered its calendar on the constant
  and printed the constant in *"at least N hours from now"*, `AssignReferralForm`
  validated against the constant, and `/api/admin/assign-referral` re-checked
  against the constant. So a clinic that widened its window was offered a slot
  by its own picker, and the patient met the refusal at the last step of
  checkout -- the "two answers to when can this be booked" failure this bullet
  is otherwise about, reintroduced one level up the moment the rule became
  configurable. All four read the setting now: `/book` loads it in its own
  isolated query beside the three settings already there, `BookingWizard` takes
  it as `bookingLeadTimeHours` and passes `leadTimeMsFromHours()` through to
  `bookableHoursForDate` / `BookingCalendar`, and `AdminSlotPicker`'s own hint
  reads the hours back off the value in force rather than printing the
  constant. `/book` is ISR-cached, so `update-setting` revalidates it for this
  key as it already did for `booking_languages`. A new surface that judges
  whether a slot is far enough ahead takes the hours as a prop or reads the
  column; there is no third source.
  **An admin screen that sets a session time reads that module too.**
  `AssignReferralForm` used `<input type="datetime-local">` with a
  five-minute floor, so an admin could promise a referred patient a slot the
  platform's own rule refuses - two answers to "when can this be booked", in
  the one flow where the person choosing is not the person who lives with
  it. `AdminSlotPicker` (`src/components/admin/`) is the patient's control,
  inline and compact: the same `BookingCalendar` in its `compact` mode (a
  mode, never a second calendar - forking it is how the two grow different
  ideas of which dates are bookable) plus hour chips from
  `bookableHoursForDate`, and `/api/admin/assign-referral` re-checks the
  lead time server-side rather than trusting the browser. It is deliberately
  **not** a dialog: the slot is chosen against the referral it sits inside.
  **Every screen that picks a session slot now renders that one control**,
  and `BookingCalendar` is the only month grid in the app: the two bulk
  schedulers kept private copies of it for one difference - a dot on days
  already holding a chosen slot - which is a `markedDateKeys` prop now;
  `AdminNewBookingTab` and `EditBookingForm` dropped their native
  date/time/datetime-local inputs; and the therapist's `SuggestSessionControl`
  dropped a date box beside an hour dropdown that could offer a time the
  patient's own screen would then refuse.
  **The lead time is a prop, and zero is the override lane.** `leadTimeMs` on
  `AdminSlotPicker` defaults to the patient's 12 hours; `EditBookingForm`
  passes 0 (moving a session that already exists is not a booking) and
  `AdminNewBookingTab` passes 0 only while its existing
  "book inside the window anyway" box is ticked, so the grid opens up exactly
  when the route would accept it. Zero still cannot reach into the past.
  **A slot starts on the hour, and the routes say so.** `isWholeHourSlot()` in
  `bookingSlots.ts` refuses anything else at all nine doors that write a slot
  time - `/api/appointments/create`, `book-package-sessions`,
  `/api/admin/create-booking`, `update-appointment`, `assign-referral`,
  `/api/therapist/suggest-session`, `/api/home-visit/book-visits`,
  `book-cash` and `verify` - with one shared message
  (`NOT_WHOLE_HOUR_ERROR`). Two admin screens used to reach `6:52` through a
  raw `type="time"` / `datetime-local`; they share the picker now, and this
  is the same rule where a request cannot get round it. **It is checked in
  the booking's own timezone, never the server's**: India is UTC+05:30, so 6
  PM IST is 12:30 UTC and reading the minute off the instant would refuse
  every correct booking in the clinic while passing one half an hour out.
  The wizard builds slots in the *patient's* local time and records which
  zone that was, so that column is the one to judge against - `update-
  appointment` reads it off the appointment row, which is why its check sits
  below the fetch rather than beside the other argument validation. An
  unknown IANA zone falls back to `CLINIC_TIMEZONE` rather than passing.
  The rule is enforced where a human *picks* a time, never where one is
  *consumed*: `/api/patient/respond-suggestion` and `register-via-referral`
  book a slot somebody already agreed to, so a legacy row carrying minutes
  is still honoured rather than stranded.
  A **date that is not a session slot** keeps its native input, deliberately:
  a report's date, a leave range, a promo campaign's window and every
  from/to filter (Metrics, Costs, Activity Log, All Sessions, Payment
  History, Earnings, the Calendar tab's day) have no hours and no lead time,
  and a control whose disabled state means "too soon to book" would be
  lying on all of them.
- **Rate limiting is Postgres, not Redis, and it fails open.** 173 route
  handlers had nothing throttled. `src/lib/rateLimit.ts` holds the named
  limits and the pure judgements (which caller a request counts against, how
  long they are held off, what they are told); `rateLimitServer.ts` is the
  one enforcement call; `check_rate_limit()` in `schema.sql` is the counter.
  Five things decide the shape:
  1. **The database is the store**, because this deployment has no worker and
     no Redis, and an in-memory counter resets on every cold start and
     disagrees between concurrent serverless instances -- which is the same as
     not having one. Adding Upstash would mean a dependency, an account and
     two more secrets before a single request could be refused.
  2. **A fixed window derived from the clock, with no expiry column.** Same
     reason a pending session suggestion writes no "expired" status: a row
     recording the passage of time needs a sweep. A counter for a window that
     has passed is never read again, and is deleted by the next call for its
     own bucket -- that per-bucket delete is the whole of the cleanup and is
     what keeps the table at one row per *active* bucket.
  2b. **It is counted AFTER the request's shape is checked, not before.**
     This reverses where a limiter usually goes, and the reason is that the
     limiter is the expensive half: it costs a database round trip where the
     validation above it is a trim and a regex. Counting first meant every
     malformed request bought a write -- so the app absorbed junk *worse*
     than validating first does -- and it meant a person correcting a phone
     number spent an allowance meant for abuse, then met a refusal worded for
     somebody who had already succeeded. Nothing is read or written before the
     count either way, so a refusal still costs the caller nothing.
  3. **The count is an insert-on-conflict, not a read then a write.** The
     unique index serialises two simultaneous calls, so a cap of 5 means 5
     while five requests are in flight -- the same reasoning as
     `claim_promo_code` taking a row lock. It counts the hit even when it
     refuses it, or a caller who keeps trying holds their own window open.
  4. **It fails open.** A limiter whose own query fails and then refuses the
     request has turned a blip into a checkout outage, which is worse than
     the burst it would have stopped -- the direction `contact_scan_mode`
     fails, and the opposite of `contact_masking_enabled`, because the safe
     answer differs by what is at stake. Logged, never silent. **No
     identifier is the same case**: with neither `x-real-ip` nor
     `x-forwarded-for` (local dev, or any host that does not set them) the
     request is allowed rather than filed under an invented key, which would
     put every visitor in one bucket and let the first thirty lock out the
     thirty-first.
  5. **Keyed on the account where there is one.** An IP can be rotated and a
     user id cannot, so the checkout limit sits *below* `auth.getUser()` and
     passes `user.id`, falling back to the IP for the anonymous quote and
     promo preview that `checkoutQuote` deliberately answers. `x-real-ip` is
     preferred over `x-forwarded-for` because the forwarded header is a list
     a client can pad from the left, and reading the leftmost entry of a
     padded list means counting a value the caller chose.
  6. **A 429 is not a "no".** This is the rule at the top of this file --
     *a check that could not be run is not a check that came back negative* --
     and adding the limiter reintroduced it one layer up, in the two callers
     whose success payload is a negative-capable boolean. `InviteRegisterCard`
     read `valid` off a 429 and told a referred patient holding a good
     registration link that it had **expired**, sending them to ring the
     hospital; `CarePlanOfferCard` read `serviceable` off one and told a
     patient the clinic does **not visit their address**, disabling the pay
     button on a programme their own clinician had recommended. Both now
     resolve three or four outcomes rather than a boolean, gate on `res.ok`
     before reading a field, and on "we could not ask" say exactly that. A
     route whose 200 body carries a boolean cannot be consumed without
     checking the status first -- and the honest state is a third value, not
     a falsy one.
  A new limit is an entry in `RATE_LIMITS` with its own scope -- never a
  number inlined at a route, and never a per-route limit, since the question
  is what is being protected rather than what one handler can take. **One
  scope per flow**, too: `areaLookup` and `referralCodeLookup` were a single
  `publicLookup`, which let a partner hospital checking codes spend the
  allowance a patient needed to find out whether we visit their street.
  Its message carries **no numbers** (the cap and window are configuration,
  and `rateLimit.test.ts` fails a digit) and **no blame** -- a limit is
  reached by a shared office address, a connection retrying or somebody
  correcting a form far more often than by anybody doing anything wrong, and
  "Too many attempts" reads as an accusation to all three. It also says only
  *what happened*: the concrete wait is composed by the caller from
  `retryAfterSeconds` through `rateLimitNotice()`, which is the half that can
  be specific because it is measured. A message that also said "please wait
  and try again" produced "…and try again. You can try again in about 9
  minutes."
  **A public write needs a route to put a limit in.** The Hospitals page
  inserted straight into `b2b_leads` from the browser under
  `for insert with check (true)`, so it had no server-side door to limit, no
  validation beyond its own JavaScript, and nothing bounding a table nothing
  sweeps. `/api/hospitals/inquiry` is that door and the policy and grant are
  dropped at the end of `schema.sql` -- the same move
  `appointments_insert_own` got. Sign-up and sign-in are **not** covered here:
  both call Supabase Auth directly from the browser rather than a route of
  ours, so their limits are the ones set in the Supabase dashboard.
- **Availability** = weekly template + per-date exceptions + leave flag, then
  a conflict check (`src/lib/therapistAvailability.ts`,
  `src/lib/checkTherapistConflict.ts`). It is the clinic's planning record -
  who can be *offered* - and it deliberately does **not** filter the
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
  construction - the second caller for an order finds it captured and
  changes nothing - which is what makes duplicate webhooks, Razorpay's
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
  **`payment.captured` is the only event that applies anything, and
  `payment.authorized` is not a capture.** An authorization is a hold, not
  money taken: Razorpay voids one that is never captured and auto-refunds
  it a few days later. The webhook used to treat the two alike, so an
  authorization marked the booking paid, confirmed the session, created the
  Calendar event and settled an invite half against money that could still
  evaporate -- and nothing in the app walks any of that back. Under
  auto-capture, which is what this account runs, `payment.captured` follows
  within seconds and does all of it correctly; under manual capture the
  authorization genuinely is not a payment yet. The event is still recorded
  in `payment_webhook_events` either way, so the trail keeps it. Both events
  stay subscribed in the Razorpay dashboard on purpose -- the trail is worth
  more than the one saved delivery.
  **The amount is passed to `record_payment_capture`, not inferred.** Left
  out, the function falls back to `appointments.amount_paid_paise`, which is
  the service line alone -- travel is deliberately off that column -- so a
  home visit's `payments` row recorded less than the gateway took, and only
  on the browser-callback path, since the webhook carries Razorpay's own
  figure. One booking recorded two different ways depending on which arrived
  first is the kind of disagreement this table exists to settle.
  `/api/razorpay/verify` passes the figure `create-order` built the order
  from. The two purchase verify routes still rely on the fallback: their
  travel is per-visit and gated by the package's own `travel_fee_included`,
  so reconstructing it there would be a second implementation of
  `computeHomeVisitTotal` to drift from the first, and `payments.amount_paise`
  is read only by the unmatched-payment check on System Health, never by the
  revenue maths.
  **`payments` has unique indexes on `razorpay_order_id` and
  `razorpay_payment_id`, and they are the point of the table.** Nothing in
  this database previously stopped one payment id being recorded against
  two rows. The per-table payment columns on `appointments` and the two
  purchase tables are unchanged and still answer "is this paid for";
  `payments` is the record of money. Don't drop those indexes to make an
  import succeed - a collision means a duplicate already exists and wants
  investigating.
  For a single online session, `/api/razorpay/create-order` flips the paying
  patient's `profiles.approved` to `true` the moment they genuinely attempt
  checkout (`approvePatientForGenuinePaymentAttempt` in
  `requireActiveProfile.ts`) - deliberately on the attempt, not a completed
  payment, so a patient who fails or abandons checkout after repeated tries
  still lands straight in their dashboard via BookingWizard's escape hatch,
  appointment showing pending, rather than being bounced to
  `/pending-approval`. The pre-payment appointment row that order is minted
  against is created by `/api/appointments/create`, which gates on plain
  `isProfileActive` for the same reason - a self-signup patient is
  unapproved by definition, and that row (always unpaid, unassigned,
  `requested`, `online`) grants nothing on its own. **Appointments are never
  inserted by the browser**, same rule as home visits: that route re-derives
  concern, duration, lead time and the therapist preference from the session
  and the category row. It replaced a direct client-side insert whose only
  validation was the `appointments_insert_own` RLS policy - which made one
  policy in a live database, reachable only by running
  `scripts/run-schema.mjs`, the single point of failure for the whole
  booking funnel, and failed real bookings with a raw Postgres
  "new row violates row-level security policy" string at the last step of
  checkout. The policy and its insert grant are now dropped at the end of
  `schema.sql`. Home-visit and package purchases keep the stricter "only a
  *completed* payment vets you" rule instead (`/api/home-visit/create-order`
  uses plain `isProfileActive`, no auto-approve). Standalone patient
  registration (`/patient/register`, no booking involved) always waits on a
  human admin - the point of gating on genuine payment intent is to keep a
  bare signup from being a free way to skip that queue.
- **A refund is shown wherever a payment is.** Money going out was recorded
  and never displayed: an admin refunded a session from a patient's profile,
  the route worked, the audit row was written, and the session row went on
  looking exactly as it had -- `ProfileSessionList` rendered `payment_status`
  and nothing about `refund_status` at all. The one question that screen
  could not answer was whether the patient had had their money back.
  `src/lib/refundState.ts` is the single reading of those columns -- state,
  label, tone, whether anybody is waiting -- so the chip on a row, the panel
  in the drawer and the export column cannot describe it four ways. Four
  states, and the difference is who is waiting for what: `processed` is done,
  `manual_pending` is cash somebody has to hand over, `failed` is the gateway
  refusing and is the most urgent precisely because nothing was watching it,
  and `not_eligible` is a decision that nothing is owed -- recorded rather
  than left blank, because "no refund due" and "we never looked" read
  identically when both are empty and mean opposite things. `none` renders
  **nothing**, not an empty chip on every unrefunded session.
  **`refunded_at` and `refunded_by` are the other half.** `paid_at` has
  existed since the first payment shipped; money going out had no equivalent,
  so "when was this refunded, and by whom" was answerable only from the audit
  log, which no session screen reads. Every writer stamps them --
  `cancelAppointmentAndRefund` on all four outcomes, including the failure
  and the forfeiture, because those are decisions too; `refund-session-
  partial`; and `mark-cash-refund-returned`, which stamps the moment the cash
  actually changed hands rather than when it became owed. Neither column is
  backfilled: a refund issued before they existed has no recorded time, and
  inferring one from `updated_at` would put a confident wrong date on a money
  record. They are the newest columns on `appointments`, so they are read in
  their own isolated query and merged, per the migration-dependent rule.
  **The patient reads the same refund in a different voice.**
  `describeRefundForPatient()` is the `voice` rule applied to money: the two
  readings differ in what they are *for*, not only in register. The admin
  chip answers "what happened to this money"; the patient's line answers "am
  I getting my money back, and when" -- so `manual_pending` is a work queue
  to one and a promise to the other, `failed` is a broken row to one and
  "please contact us" to the person who is out of pocket, and `not_eligible`
  says **nothing** to the patient, because the cancelled card already
  explains the window and repeating it as a refund line announces a refund to
  somebody who is not getting one. It renders on the session card (with the
  date and the clinic's own stated reason), on every Payments row and in that
  receipt's detail, and a failed refund is a pinned `needsYou` feed item --
  the one refund state nothing in the clinic's screens will move without the
  patient. A **partial** refund on a completed session reached none of these
  before, because `BookingReceipt.stage` has no honest value for a delivered
  session that was partly refunded; the refund is its own field beside the
  stage rather than folded into it, or a delivered session would read
  "Refunded".
  **A refund that is owed is a queue, and both tables are in it.** Money ->
  the alerts strip and Today's inbox count `manual_pending` across **cash
  visits and sessions alike** -- the count was home-visit rows only, so a
  session refunded by hand was work no screen could see -- and they count
  `failed` as its own row, which nothing in the app was watching at all. The
  two are separate because the work is: one is "go and hand over cash", the
  other is "find out why the gateway said no". A failed refund's row belongs
  to **Sessions**, not Money, because that is where it is fixed, which is
  also why `MoneyAlertsStrip` takes `workableSections` rather than
  `allowedSections`: Finance reads Sessions without being able to change one,
  so counting a failed session refund on their strip would put a figure on
  their screen that nothing they could do would bring down -- the same rule
  `visibleQueueTotal` already follows. Both counts run over the **appointments
  read alone**: `homeVisitRows` is that same table with a `visit_mode` filter,
  not a second table, so summing the two counted every cash home visit twice
  and put a figure on the Money strip that the Cash Ledger beneath it
  disagreed with -- the "a count agrees with the rows it counted" rule broken
  by arithmetic rather than by filtering. `refund_status` lives on the
  appointment for both delivery modes; nothing writes it on a purchase row.
  `AdminAllSessionsTab` takes
  `refunded`, `refund_pending` and `refund_failed` presets so each count
  opens exactly the rows it counted. **Its export follows `canSeeMoney` too.**
  The amount and the refund never render in that table at all, so Operations
  and Clinical could not read either on screen and could download both: a
  scope enforced in the markup and not in the file the markup produces is not
  enforced, and an export is the easiest place to forget it. Its **Refunded** payment-filter option
  matched nothing at all before this: `payment_status` is CHECKed to
  `unpaid` / `paid` / `failed` and can never hold `refunded`, so the filter
  silently returned an empty table. A refund lives on `refund_status`.
  **Every refund states why.** `refund_reason` was written by the partial
  refund route alone, so the commonest refund in the app -- a cancellation
  outside the window -- reached both the patient's Payments screen and the
  admin's drawer with that line blank. `cancelAppointmentAndRefund` records
  one on all four outcomes: the cancellation's own reason where the person
  cancelling gave one, and otherwise a sentence naming the rule that produced
  the outcome, matching what the credit ledger already writes for the same
  event. The **forfeiture** is the exception and takes the rule's sentence
  *always*, never the cancellation's reason -- this line is read as "why this
  money moved" and no money moved, so the answer has to be the window that
  withheld it, which is also the thing a patient disputes. It names the
  window that actually applied, which is why the patient card's no-refund
  hover reads it rather than printing `CANCELLATION_FULL_REFUND_HOURS`: a
  home visit has its own window, so the constant was quoting the wrong number
  of hours on every cancelled visit.
- **Cancellation/refund**: full refund only outside the 24-hour window in
  `src/lib/pricing.ts`; inside it, none. That constant is the **fallback**,
  never the answer -- the live window is
  `site_settings.online_cancellation_refund_hours`, and a screen printing the
  constant quotes the wrong number at every patient the moment a clinic
  changes it. Home visits use their own window
  instead (`home_visit_cancellation_refund_hours`, `cancelAppointmentAndRefund`) -
  see the Home Visit bullet below.
  **The payment screen names the deadline, not the rule**, and that is the
  difference between a policy and something a patient can act on.
  `describeCancellationWindow` (`src/lib/cancellationWindow.ts`) is
  the one judgement, dependency-free because it is a promise about money with
  a boundary: it answers `deadline` (free until an instant the screen prints
  through `formatClinicDateTime`), `already_inside`, or `rule_only` when no
  slot is chosen. Two rules hold it. It is judged against the wizard's own
  `nowMs` -- the same clock the picker measures the lead time from, and the
  one the debug bar's simulate-time box moves -- so the screen cannot offer a
  slot as bookable and describe its terms against a different "now". And it
  is refundable at **exactly** the boundary, because `cancelAppointment.ts`
  refuses on `hoursUntilSlot < refundWindowHours`; a screen that said "no
  refund" one millisecond early would promise less than the route delivers.
  `already_inside` is not an edge case: the booking lead time is 12 hours and
  this window defaults to 24, so **every booking made between those two is
  non-refundable from the moment it is made**, and the old sentence told
  exactly those patients they had free cancellation. They read it at the
  point where they can still pick another slot.
  A **free** booking and a **pay-later** one get their own sentences ahead of
  all three, the same rule `describeRefundForPatient` follows: a refund
  window is not a fact about a session nobody paid for, and quoting one
  describes money the patient never handed over.
  `cancellationWindow.test.ts` holds the boundary; `e2e/booking-rules.spec.ts`
  BR-CANCEL-001/002 hold what is on the screen, because none of the three
  regressions here (a fused "24hours", a constant quoted in place of the
  setting, a false promise of free cancellation) produces an error, a failed
  request or a wrong row.
- **The Google connection says whether it is up, because a dead token looks
  like a handful of unlucky sessions.** Every Calendar and Meet call
  authenticates with one refresh token, and when that token dies -- revoked,
  or, far the commonest cause, the OAuth consent screen left in **Testing**,
  where Google expires refresh tokens after seven days -- every session fails
  at once with `invalid_grant`. Nothing said so. Each failure appeared as its
  own row in Settings -> System Health -> Session Links with a raw error string
  and a Retry button that could never succeed, so the screen read "a few
  sessions failed" when the truth was "no session will get a link again". The
  one line naming the fix was a `console.error` no clinic owner reads.
  `src/lib/googleConnectionHealth.ts` answers it by *spending* the token --
  presence is not the test, since a token can be set and dead -- and three
  things about it are load-bearing. It **never throws**: it runs inside the
  admin dashboard's render, in that page's isolated `Promise.all`, so a
  status panel can cost its own panel and never the screen it sits on. It
  **distinguishes a dead token from a blip** (`deadToken`), because telling
  an owner to re-authorize over a network hiccup teaches them to ignore the
  panel. And a failure is **re-checked far sooner than a success is**
  (60s against 10 minutes), so an owner who has just re-run the token script
  watches the panel go green instead of waiting out a cache. **It reports the shape of
  the credential, never the credential.** `invalid_grant` is Google's answer
  both for a permission that has died and for a server still holding the value
  somebody just replaced -- and the card's numbered steps fix only the first,
  so an owner meeting the second re-pastes the same token and meets the same
  red card. `describeCredential()` gives `HealthCheck.evidence` three facts
  that settle it: the length, an 8-hex SHA-256 prefix (which changes when the
  saved value changes, so one reload after a redeploy answers "did it land?"),
  and whether the stored value carries surrounding whitespace -- that last one
  needs nothing to compare against, since a trailing newline survives a paste
  into most hosting dashboards and Google refuses it outright. It hashes the
  **raw** value rather than a trimmed one, or two values Google treats
  differently would print one fingerprint, which is the confusion the field
  exists to end. The broken status also carries `clientId`, because a refresh
  token is bound to the client that minted it and a deployment carrying a
  different one is refused with the same error and a completely different fix.
  `evidence` is facts and never advice -- it renders above the steps precisely
  because it is what decides whether those steps apply -- and it goes into the
  Copy for my developer text for the same reason. `retryDueMeetSyncs`
  reads the same verdict and returns early while the credential is down:
  retrying cannot fix it, and each attempt spends one of that appointment's
  five capped tries, so without the check the sessions that most needed the
  sweep are already retired to "needs attention" by the time the credential
  comes back. Checked after the backlog query, not before it, so an empty
  backlog still costs no outbound call.

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
- **"No Meet link" does not mean "broken" -- a home visit never has one.**
  `createMeetEventForConfirmedAppointment` passes `withMeet: false` for a home
  visit on purpose: there is nothing to join, the therapist is coming to the
  address. Three readers nonetheless used `meet_link is null` as their
  definition of an unsynced session, and every confirmed home visit therefore
  (1) sat in Settings -> System Health -> Session Links for ever, (2) was
  answered `502 "Retry failed"` by the Retry button -- whose success test was
  also `meet_link` -- on the runs where the event had in fact been created,
  and (3) got a **brand new calendar event on every click**, because
  `createSessionCalendarEvent` only ever creates. Three duplicate invites
  reached one patient and therapist before it was found.
  `src/lib/meetSyncState.ts` is the single answer now: a home visit is synced
  when `google_event_id` exists, an online session when `meet_link` does, and
  a column that was not *loaded* (`undefined`, as opposed to a loaded `null`)
  never counts as evidence of failure -- these columns come from isolated
  migration-tolerant queries, and guessing "absent means empty" restores the
  false positives. Two rules follow from the duplicate events. The refusal to
  create a second event lives in `createMeetEventForConfirmedAppointment`
  itself, keyed on `google_event_id`, so every door gets it -- the sweep, the
  manual Retry and the three booking paths -- rather than each caller
  remembering; the claim columns could not do this job, since they stop two
  callers racing over the same attempt and say nothing about an attempt that
  should never have been made. And a new surface answering "is this session
  synced" reads that module rather than testing a column, or it grows a fourth
  disagreeing opinion.
  **And which kind of event to make is read off the row, never defaulted.**
  `createMeetEventForConfirmedAppointment`'s `visitMode` used to default to
  `"online"`, which was true of the six callers that had the address in hand
  and passed it, and false of the three that did not: `confirmPaidAppointment`
  (a hospital home-visit referral is an ordinary appointment the patient pays
  for, so it reaches the Razorpay path like any other), the webhook that
  stands in for it when the browser never comes back, and
  `/api/admin/mark-paid-by-cash`. All three produced the same wrong event for
  a home visit -- a Meet link for a session nobody joins, and **no street
  address and no access notes** on an invite that is the only outbound
  message this platform sends, so the therapist was handed a video call
  instead of somewhere to drive to. The helper resolves it from
  `appointments.visit_mode` and the `visit_*` columns when the caller says
  nothing, in its own isolated call falling back to online -- same place and
  same reasoning as the duplicate-event guard above: every door gets it. An
  explicit `visitMode` is still never second-guessed, because some callers
  read the address from the patient's own address book rather than the row.

- **Google Calendar/Meet sync must never block a booking.** Failures are
  recorded on the appointment (`google_calendar_sync_error`), re-attempted
  automatically by `src/lib/retryDueMeetSyncs.ts` (a lazy sweep at the top of
  the admin dashboard render - see the no-cron rule below), and retried by
  hand by the admin (`/api/admin/retry-meet-sync`). The automatic sweep is
  capped four ways because, unlike the expiry sweeps, it makes outbound
  Google API calls from inside a page render: a wall-clock timeout per
  attempt, a few appointments per sweep, a minute's minimum gap between
  sweeps that do work - without which each attempt's own write to
  `appointments` refreshed the dashboard that had just swept, and the row's
  five attempts were gone inside a minute - and
  `appointments.google_calendar_sync_attempts` capping attempts per
  appointment so a permanently broken row (revoked credentials, deleted
  calendar) is not retried forever. Both the sweep and the manual Retry
  route claim an appointment through
  `appointments.google_calendar_sync_claimed_at` before calling Google, with
  a staleness window so a render that dies mid-attempt releases its row:
  `createSessionCalendarEvent` only ever creates, so two overlapping
  attempts leave an orphaned event on the calendar under a link the
  appointment no longer points at. At the cap the row stays in the admin's
  Session Links panel flagged as needing a person; a manual Retry resets the
  counter. A home visit still gets a
  calendar event even when `google_meet_enabled` is off - that toggle only
  gates the Meet conferencing, not event creation, since the invite email is
  the only outbound notification this platform sends.
- **Home Visit is a delivery mode, not a parallel booking system.**
  `appointments.visit_mode` (`'online'` / `'home_visit'`) is the only new
  column that matters at read time; everything else about an appointment -
  patient, therapist, payout, rating, refund - works identically either way.
  Anyone can book either mode; there is no "home-visit patient" vs.
  "online patient". A visit's address is snapshotted onto the appointment
  (`visit_address_*`) from the patient's reusable `patient_addresses` book,
  never referenced live, so editing a saved address later can't rewrite a
  visit already delivered. The travel fee (`travel_fee_paise`) is a
  pass-through reimbursement paid to the therapist in full and always
  excluded from revenue (`src/lib/homeVisitPricing.ts`) - never fold it into
  a price or a therapist funds their own transport. `home_visit_areas`
  (pincode → travel fee) gates what can be sold at all:
  `/api/home-visit/check-area` is checked before an address is even
  collected, and re-checked server-side at every purchase route - never
  trust a serviceability answer the browser already has. A locked
  therapist's conflict check is padded by
  `home_visit_travel_buffer_minutes` on both sides of the new slot
  (`findTherapistConflict`'s `bufferMinutes` option) since a therapist
  finishing one visit cannot be at another minutes later; online passes 0.
  Cash-on-visit purchases legitimately sit at `payment_status: 'unpaid'`
  for their whole life with real confirmed visits hanging off them - never
  assume `payment_status` reflects whether money changed hands for a home
  visit purchase the way it does everywhere else; check `payment_mode`
  first. Cash collected and not yet remitted is real exposure: it nets off
  what a therapist's payout actually transfers
  (`src/lib/therapistCashLedger.ts`), and a cash refund with no Razorpay
  payment behind it becomes `refund_status: 'manual_pending'`, surfaced on
  the admin Cash Ledger until an admin confirms the cash was handed back.
  `visits_used` counts visits **claimed** (scheduled or completed), never
  completed - identical rule to `sessions_used`, see the counter-semantics
  comment beside `home_visit_package_purchases` in `schema.sql`. See the
  "Home Visit" section in README.md for the full flow.
- **A flag is never an accusation, and never carries a penalty.** The
  detectors (`src/lib/riskDetectors.ts`, vocabulary in
  `src/lib/riskSignals.ts`) run as a bounded lazy sweep after the admin
  Today render - `after()`, a wall-clock budget checked between rules, and a
  five-minute minimum interval, because realtime refreshes that page on
  every booking. Nothing they produce suspends an account, holds a payout or
  hides a therapist: acting on a finding means going to the screen that owns
  that action and doing it deliberately, with its own audit row. That
  separation is what makes a heuristic over clinical data safe to run at
  all, and the Risk tab deliberately carries no action buttons.
  `risk_signals.evidence` stores the ids of the rows that fired a rule
  rather than a score, because an admin who can only see a verdict cannot
  disagree with it. A partial unique index gives at most one **open or
  reviewing** signal per `(rule, subject)` - closing one frees the slot, so
  a repeat after a dismissal is raised fresh, which is correct: it is new
  information. `risk_reviews` is append-only by trigger with a ten-character
  minimum note, since "dismissed" with no reason reads the same as "not
  read". Thresholds live in `risk_rules` and are edited on the tab itself,
  and the two rules that need a clinic baseline (`plan_conversion_low`,
  `post_consultation_dropout`) ship **disabled** - a threshold invented
  before anyone knows the normal rate fires on everyone or on nobody, and
  the first of those is how a queue stops being read.
  **The findings are scoped by desk; the evidence trails are not.**
  `RISK_RULE_DOMAIN` gives each rule the section that can act on it -- a cash
  variance and a session completed with no payment are money questions, a
  contact leak and an early completion are sessions questions -- and a
  limited desk reads and reviews its own. The reasoning the whole queue used
  to be closed for still holds for the two panels it was really about: the
  flagged messages quote what a colleague wrote and the reveal log names
  every patient contact they opened, so those, and the thresholds deciding
  what fires at all, stay Master-Admin-only (`canSeeTrails`). A desk with no
  rule of its own fetches nothing and is told so, rather than being shown a
  locked screen for a queue holding nothing for them.
  `appointments.completed_at` was added for the `early_completion` detector
  and is stamped only by `complete-session` and cleared only by
  `/api/admin/reopen-session`, which also claims the row on
  `status = 'completed'` rather than writing unconditionally -- reopening
  destroys both sides' ratings, so two admins passing the status check
  together must not both do it. Before that a reopened session kept the
  time of the completion that had just been undone, which is a row reading
  `confirmed` with a completion on it and exactly the evidence the detector
  should no longer see. A row closed before that column
  existed carries null and is skipped rather than guessed at.

- **Pay later: a trusted patient is treated first and settles afterwards.**
  `appointments.payment_terms` (`prepaid` | `pay_later`) is the new axis, and
  it exists because `payment_status = 'unpaid'` already means *"somebody
  abandoned a checkout"*. Without a second column those two are
  indistinguishable and three things break at once: an abandoned cart counts
  as a debt, `dashboardFeed`'s "Payment not completed / this session isn't
  booked" item scolds a patient whose session **is** booked, and
  `detectCompletionWithoutPayment` raises a high-severity signal on every
  session these patients ever have. Five rules:
  1. **Nothing is owed until the work is done.** `amount_due_paise` is stamped
     at booking and **counted** only once `status = 'completed'`. That one
     split is what makes "booking owes nothing" and "a late cancellation owes
     nothing" true with no special case anywhere -- there is no state to
     unwind, because nothing was ever owed. Everything in
     `src/lib/patientBalances.ts` filters on that one word.
  2. **The price is frozen at booking**, for the reason `package_snapshot` is
     frozen by trigger: `checkoutQuote` reads the **live** category price, so
     resolving it again at settlement charges the new price for work already
     delivered.
  3. **Revenue is recognised at completion, not at collection**, because the
     therapist's share is. `moneyLineFor` counts a completed pay-later session
     and reads its amount as the frozen price; settlement writes
     `amount_paid_paise` equal to it, so recognised revenue never moves.
     Counting at collection instead reports a loss in the month the work was
     done and a windfall in the month it was paid -- both months wrong for one
     session. `gatewayFeePaise` is deliberately **not** changed: a gateway fee
     is a real cost only when a gateway took money.
  4. **`sessionAmountPaise` takes its fallback as an argument**, and that is
     load-bearing. The three readers do not share one -- `adminMetrics` falls
     back to `SESSION_FEE_PAISE`, `therapistPayouts` to `0`,
     `therapistEarnings` to a value its caller passes. A shared helper
     hard-coding the session fee would make every already-paid session with a
     null amount start contributing the full fee to a therapist's payout where
     it contributes nothing today, changing what the clinic owes real people on
     sessions unrelated to this feature. The frozen price slots in **before**
     each caller's fallback and leaves it untouched.
  5. **There is no ceiling, by choice**, so the two figures on Money -> Owed by
     Patients are the whole of the early warning: the total, and
     `oldestOwedAgeDays` against `site_settings.pay_later_aged_after_days`.
     That threshold is configurable where one in this codebase normally is not,
     precisely because it is the only automatic warning the feature has -- a
     clinic settling weekly wants it far below the 60-day default, one settling
     quarterly above it, or the warning is on permanently and becomes the badge
     nobody reads. `PAY_LATER_AGED_AFTER_DAYS` stays as the default and
     `describeAgedAfterDays` is the judgement with the database taken out, so an
     unset, unreadable or hand-edited value resolves back to it rather than to
     a bound -- there is no safe direction to fail in when the thing being
     decided is the colour of a warning. `resolveAgedAfterDays` is that
     function's `.days` and keeps its exact old signature, which is what makes
     adding the reason provably behaviour-free: every one of its existing tests
     passes unmodified. There is deliberately **no zero**,
     unlike `splash_revisit_minutes` and `journey_step_seconds`: here it reads
     as "chase everything" to one person and "never warn me" to another, and a
     warning whose meaning depends on who set it is worse than no setting --
     so "off" is its own switch, `pay_later_age_warning_enabled` (on by
     default), which keeps the number while it is off so switching back on
     restores what the clinic chose rather than the default. `isAgedBalance` is
     the one answer its three readers share -- the total's colour, each patient
     card's amber, and the `patients_owing_aged` count on Today -- so a count
     cannot disagree with the rows it links to; with the warning off that count
     is **zero rather than hidden**, since an alert row nothing can bring down
     is worse than no row. Three things the screen used to know and not say, it
     says now: a stored value that could not be used is named beside the number
     in force (the screen and the database disagreeing with nothing
     reconciling them is the failure `AdminDataLoadBanner` exists for, one
     setting down), the days field carries a live "N of M patients would show
     as worth chasing" computed from the ages already on the page, and a scope
     that cannot manage settings gets `PayLaterAgeNote` -- the rule plus who
     owns it -- rather than an absence that reads as a half-built screen. Its
     control sits on Money -> Owed by Patients beside the figure it colours
     rather than in Settings -- the `promo_codes_enabled` placement rule -- but
     is gated on `scopeCanManage(scope, "settings")`, **not** money: Finance
     manages Money and holds settings at `none`, so `/api/admin/update-setting`
     would refuse them. `unclosedPayLaterSessions` is the other half -- debt,
     revenue and the therapist's pay all appear at completion, so a session
     nobody closed produces none of the three and no screen has anything to
     show. Every other failure here is a wrong number; that one is an absent
     number, which nothing else would catch.
  6. **The privilege is granted, never inferred, and every guard ships before
     it can be used.** `/api/admin/set-patient-pay-later` takes
     `requireAdminScope("money")` -- extending credit is a money capability
     whatever screen the control sits on, which is also why
     `PatientDetailContent` computes `scopeCanManage(viewer.scope, "money")`
     for the card rather than reusing that page's `canSeeMoney`, which is the
     looser `scopeCanOpen`. A ten-character reason is required to **grant**
     and not to stop: this is the opposite split from the care-plan review,
     because the thing being explained is the risk, and here the risk is the
     grant. It is enforced by the route and by
     `profiles_pay_later_needs_reason`, and revoking leaves the reason in
     place -- the CHECK is vacuous while disabled, and why terms were given
     stays on the record after they are stopped. A **hospital-referred**
     patient is refused outright: a partner's commission is taken on net
     revenue and revenue is recognised at completion, so terms would have the
     clinic owing a cut on money it has not received, and deferring the
     partner's share to settlement instead would break
     `clinic share = net - therapist - partner`, which is worse than the
     problem. One master switch, `site_settings.pay_later_enabled`, off for
     its first release, read in its own call and failing **closed** -- the
     opposite direction from the ageing threshold beside it, because that one
     decides the colour of a warning where neither direction is safe, and this
     one decides whether work may be delivered without money. It gates
     **granting** and never stopping, and never a debt already owed.
     Seven guards land in the same change and are **inert by construction** on
     the day they land, since nothing can carry `pay_later` until the booking
     path exists -- which is the point of the ordering: each guard is in place
     before the thing it guards can exist, so the feature never has a window
     where it looks broken. `detectCompletionWithoutPayment` and
     `readSessionsWithoutBacking` both stop counting a session on terms
     (it **is** backed: the sale is recorded, the revenue counted and the debt
     on its own screen -- without this every session one of these patients
     ever has is a high-severity signal and a permanent red row);
     `complete-session` gains a fourth allowance beside paid, programme and
     cash, because completing is what *creates* the debt and refusing would
     make the one session that must be closed the one that cannot be;
     `assign-appointment` confirms on terms as well as on payment, or the row
     never leaves `requested` and can never be completed; `TherapistSessionCards`
     drops `cashDue`, since chasing a trusted patient at a door that does not
     exist is what the platform's own communication rules exist to prevent;
     `dashboardFeed` branches its "Payment not completed" item, which was
     telling a patient their booked session was not booked, and the
     replacement is informational and **never** `needsYou` -- there is nothing
     for them to do, and pinning it would put a permanent to-do on the
     dashboard of the patients the clinic trusts most. And every chip reads
     `src/lib/sessionPaymentState.ts`, shaped on `refundState.ts` for the same
     reason: three surfaces printed `payment_status` raw, so a delivered
     session on terms said **"Unpaid"** beside an abandoned checkout saying the
     same word, on the screen an admin chases people from.
     **And the patient reads the same session in a different voice**, through
     `describeSessionPaymentForPatient()` -- `describeRefundForPatient`'s rule
     applied to the other direction of money. Two states genuinely differ.
     **"Written off" must never reach the patient**: it is the clinic's own
     accounting word for a debt it decided to stop chasing, a decision about
     them taken without them, and on their own session card it reads as the
     clinic having given up on them -- what is true for *them* is that there
     is nothing to pay, which is what it says. And a **cancelled** session on
     terms says nothing at all, exactly as `not_eligible` says nothing on a
     refund: the cancelled card already explains itself, and a payment chip
     beside it announces an arrangement that never came into play. Everything
     else is the admin's own wording, because those readings are already true
     for both. The card also stopped offering **Pay Now** on a session on
     terms: `create-order` refuses one outright, so the button did not merely
     read wrong, it led nowhere. `payment_terms` is
     added to every reader through an **isolated** read merged by id, never to
     a shared select -- verified against a live database missing the columns:
     PostgREST answers `42703`, supabase-js resolves rather than rejects, the
     `Promise.all` survives, the card reads "off" and the switch fails closed.
     **System Health carries a seventh check**, `pay_later`. `off` when the
     switch is off and nobody is on terms, and **owing money is never a
     fault** -- a patient on terms owing a large sum is the arrangement
     working. Its one amber state that matters is `unclosedSessions`: a
     session that happened and was never marked done produces no debt, no
     revenue and no therapist pay, and no screen has anything to show, which
     is the only place in this design where money can silently fail to exist.
     Its input is null on an unmigrated database and the check reads
     **"Not set up"**, so an unapplied migration becomes a line on a screen
     somebody already reads. **Risk carries two rules**, both
     `RISK_RULE_DOMAIN: "money"`, under their own heading *Trusted patients --
     follow up*: `pay_later_aged` ships **enabled** despite the no-baseline
     rule that keeps `plan_conversion_low` off, because the population is tiny
     and hand-picked so a threshold cannot fire on everyone, and it is the
     only automatic warning an arrangement with no ceiling has -- it reads the
     admin's own threshold rather than its own config, so the amber on the
     screen and the signal can never disagree about what "a while" means;
     `pay_later_balance_high` ships **disabled**. A third rule counting
     rejected declarations waits for the phase that builds them, because a
     rule that can never fire is a queue nobody reads.
  7. **Booking on terms is its own confirmation route, and it claims
     discounts like any other booking.**
     `/api/appointments/confirm-pay-later` is the sibling of `confirm-free`
     and deliberately the same shape: re-resolve server-side, refuse on the
     state, then confirm through the sequence the paid path uses.
     `confirmPaidAppointment` was split for it --
     `runConfirmation()` holds the roster read, the atomic claim and the Meet
     event, and the two exports differ only in which payment columns the
     claim writes. A `markPaid: false` flag was **rejected**: it reads as a
     lie at the call site, and the callers want different columns rather than
     one write with a field suppressed. `payment_status` stays `unpaid` and
     `paid_at` is never stamped, which is the whole reason `payment_terms`
     exists as a second axis.
     Four refusals, all re-derived and never sent: the switch, the patient's
     grant, a **home visit** (travel is a pass-through paid to the therapist
     in full -- deferring it has them funding their own transport until the
     patient settles) and a **programme** session (drawn from the credit
     ledger, which this feature never touches). `decidePayLaterBooking` in
     `src/lib/payLaterBooking.ts` is that judgement with the database taken
     out, returning a **named reason** rather than a boolean so the route and
     the wizard cannot grow two answers to "why not" -- and the two reasons
     that are about the patient say the *same* sentence on purpose, since
     somebody never granted terms must not learn the arrangement exists and
     they are not in it.
     **A free booking is not a debt of zero**: a discount reaching zero hands
     the caller back to `confirm-free`, and the quote's `settlement` is a
     named three-way (`gateway` | `free` | `pay_later`) rather than a second
     boolean beside `free`, since two booleans can contradict each other.
     `canPayNow` is separate because it answers a different question --
     **paying now is never taken away**, and choosing it produces an ordinary
     prepaid session touching none of this. Once confirmed on terms,
     `create-order` refuses: paying there would mark it paid outside the
     settlement path and skip the allocation deciding which delivered
     sessions the money covers.
     **The price is frozen inside the same claim that confirms**, so no row
     is ever pay-later-but-unconfirmed or confirmed-with-no-figure, and the
     route **returns the figure it wrote** rather than a re-read -- reading
     the price once to quote and again to render is how the two come to
     differ.
     **Discounts apply exactly as they do on every other booking**, which is
     a decision with a database consequence. Both claim functions counted a
     claim as spent only while the booking was `paid` or inside a
     thirty-minute checkout hold -- and a pay-later booking is `unpaid` for
     its whole life, so thirty minutes after booking its promo claim stopped
     counting against the cap while `promo_code_id` still pointed at the
     campaign and the discount stayed frozen into what was owed: a cap of 100
     handing out more than 100, which is the exact failure the cap exists to
     prevent. `claim_invite_half` had the mirror -- the booking stopped
     *holding* its half, so the same half could be spent twice. Both now
     count a confirmed pay-later booking permanently, exactly as a paid one:
     the discount has been given and can never be taken back. Re-created in
     full at the end of `schema.sql` with **their three revokes each**, since
     a re-created function arrives carrying `anon` and `authenticated` grants
     again. `scripts/pay-later-sql-checks.sql` asserts both halves of each --
     the pay-later claim still counting *and* an abandoned prepaid checkout
     of the same age still giving its claim back, without which a function
     that counted every claim forever would pass.
     `settleInvitesOnCapture` is **not** called: an inviter's reward is
     earned when their friend's first session is paid for, and nothing has
     been.
     **And the same decision had a second consequence, one layer up in
     eligibility rather than in a cap.** "Is this patient new" was asked in
     three places -- the standing first-session offer, a `first_session_only`
     promo code, and `claim_invite()`, whose own comment said it was "the
     same test the first-session offer uses" -- and all three asked
     `payment_status = 'paid'`. A session on terms is never paid, so a
     trusted patient read as brand new on **every** booking they ever made:
     the offer did not fire once, it fired on sessions two, three and four,
     and an invite welcome was claimable after they had already been
     treated. Silently, in all three. They now count a **commitment** rather
     than a capture, through one shared query
     (`countPriorCommittedSessions`, `src/lib/priorSessionsServer.ts`), and
     `priorSessions.test.ts` fails when a reader grows its own copy back.
     Two details are load-bearing. The `status <> 'cancelled'` exclusion
     applies to the terms arm **alone**: a cancelled pay-later booking was
     never delivered and owes nothing, while widening the paid arm the same
     way would hand the offer back to everybody who ever paid and then
     cancelled. And the terms half is a **second, isolated** count rather
     than one `or(...)`, because `payment_terms` is migration-dependent and
     this count fails closed -- folded into one query, an unapplied
     migration would quietly withdraw the first-session offer from
     everybody.
     What the decision also needs is for the discount to be **visible**,
     since a pay-later booking was the one checkout ending in this app that
     showed no figure at all: the confirmation names what was frozen and
     what came off it (the route already returned both and the wizard
     dropped them), and Money -> Owed by Patients states the list price and
     the rule beside any session owed less than it -- an unexplained ₹499
     against a ₹1,200 session, on the screen an admin chases people from,
     reads as an error.

  8. **Settling is a pool, and a payment never touches a session.**
     `pay_later_payments` is one row per **payment**;
     `allocate_pay_later_payment()` covers that patient's delivered,
     unsettled sessions **oldest first, whole sessions only**, under a
     `select ... for update` on the patient -- two admins confirming two
     payments at once is exactly what races. Six rules:
     - **Settlement writes `amount_paid_paise = amount_due_paise` exactly**,
       never the payment's share of it. That is the whole safety case: the
       therapist's cut is computed from that column, so spreading 2,000
       across four 1,200 sessions as 500 each would silently shrink it on
       sessions the clinic had already paid out on. `adminMetrics.test.ts`
       asserts every money figure is byte-identical either side of a
       settlement, and that is the first test written.
     - **The pool is fungible across payments, each payment is not.**
       Requiring one payment to cover one whole session reads tidier and
       strands money for ever: two 800 instalments leave 1,600 in the
       clinic's hands and a 1,200 session nothing can close. The session is
       stamped with the payment that **completed** it, since
       `pay_later_payment_id` holds one -- which is why a settlement receipt
       lists the sessions a payment closed rather than claiming its amount
       is the sum of their prices.
     - **Allocation runs at two moments**, a payment being confirmed and a
       session being completed, so a remainder is picked up without anything
       having to remember it. It reads the whole pool rather than one
       payment, which is also what makes it idempotent.
     - **A declaration settles nothing.** `/api/patient/declare-payment`
       writes a `pending` row and the owed figure does not move; only
       `/api/admin/confirm-pay-later-payment` reaches the allocator. One
       waiting at a time. **Confirming needs no reason and rejecting needs
       ten characters** -- the opposite split from the grant, because here
       the outcome that takes something away is the refusal, and its reason
       is the only half the patient can act on.
     - **An online row is never `pending`** (a CHECK): the gateway is the
       confirmation. So `record_payment_capture`'s fourth branch claims it on
       `razorpay_payment_id is null` rather than on the status -- a status
       guard could never match, and the allocator would never run on the one
       path it was written for. That bug was found by
       `scripts/pay-later-sql-checks.sql`, which asserts both halves: the
       capture closes the session, **and** a retried webhook closes nothing
       twice.
     - **The table is append-only by trigger**, permitting exactly
       `pending -> confirmed|rejected` one way plus the two columns
       allocation moves, and never a delete. `payments.purpose` is widened to
       `pay_later_settlement` and `payments.target_pay_later_payment_id`
       added, so a settlement is not reported as captured money attached to
       nothing -- read in its **own isolated query** in
       `readUnmatchedPayments`, since folding the column into the existing
       one would take the whole check to "unknown" on an unmigrated
       database. One receipt per payment, not one per session: four receipts
       for one transfer reads as four payments.

  9. **Money out is a cost, and a refund is a hand-back.** Two paths, and
     both were half-wired before they existed: `pay_later_outcome =
     'written_off'` was read in six places and written by nothing, and
     `refund-session-partial` refused every settled pay-later session
     because it requires `razorpay_payment_id` **on the appointment**.
     - **A write-off is a cost, not a revenue reduction.** Completion
       already counted the revenue and already paid the therapist, so
       `/api/admin/write-off-pay-later-session` touches **no** money column
       on the appointment: `amount_due_paise`, `amount_paid_paise` and
       `payment_status` stay exactly as they are, the session leaves the
       owed figure through `pay_later_outcome` alone, and the loss is one
       `business_expenses` row. Reducing the session's amount instead would
       pull revenue down *and* claw the therapist's share back off money
       already handed to somebody who had no say in extending the credit.
       `adminMetrics.test.ts` asserts every figure is byte-identical either
       side, the same shape as the settlement-invariance test.
     - **Its cost class is `fixed`, which is the accounting answer rather
       than the convenient one.** Bad debt is an operating expense: below
       the gross-profit line, inside break-even's "what has to be covered",
       and **not** added back in EBITDA. It is also `DEFAULT_COST_CLASS`, so
       the unmigrated-database fallback insert lands it in the same place.
       `BAD_DEBT_EXPENSE_CATEGORY` is deliberately **not** in
       `EXPENSE_CATEGORIES`: that list is what an admin may type by hand, and
       keeping bad debt out of it is what makes "written-off sessions equal
       the bad-debt rows" a reconciliation rather than a coincidence.
       `incurred_on` is the day it was decided, never the session's own date
       -- back-dating a cost into a month somebody has already read moves a
       profit figure under them.
     - **The order of the two writes is the safety case.** The appointment is
       claimed first (`pay_later_outcome is null`, so a double tap writes one
       cost row), the cost row second, and a failure on the second **reverts
       the first** -- same posture as `refund-session-partial` reverting its
       claim when Razorpay refuses. A session written off with no cost behind
       it overstates profit by exactly the amount forgiven and says so on no
       screen, which is worse than a write-off that failed.
       `business_expenses.source_appointment_id` plus a partial unique index
       is what ties the two together, and it is what
       `/api/admin/expenses/delete` refuses to break.
     - **It is reversible, and reversing needs a reason too.** The opposite
       split from the grant: there the risk is all on one side, here writing
       off gives money away and reversing re-imposes a debt on a patient who
       was told it was forgiven. Written-off sessions get their own list on
       Money -> Owed by Patients precisely so the undo is a control rather
       than a claim -- every balance drops them.
     - **A refund on a settled session is handed back by a person.** The
       money arrived into a **pool** covering several sessions and an online
       settlement's gateway id is on the `pay_later_payments` row, so "this
       session's share of that payment" is not something a gateway refund can
       express safely. Every settled pay-later session takes the
       `manual_pending` lane whatever it was settled with, on the same claim
       and the same ceiling, and is worked from **Refunds to hand back** on
       Money -> Owed by Patients through the existing
       `mark-cash-refund-returned`. An **unsettled** session is not a refund
       at all and the route says so rather than dead-ending: it is the
       write-off. A session paid by `mark-paid-by-cash` is the same shape and
       is deliberately left alone -- it has no figure of its own that an
       unrecorded hand-back would falsify.
     - **`manual_refunds` splits in two.** It counted every `manual_pending`
       row and linked to Money -> Payouts, whose Cash Ledger lists home
       visits -- so a pay-later refund would be counted there and actionable
       nowhere. `pay_later_refunds` is its own key linking to Owed by
       Patients; the two sum to the old total, so no count moved.
     - **System Health gains two states**: refunds owed back and not sent
       (amber -- a patient is out of pocket and nothing automatic will move
       it), and written-off sessions disagreeing with the bad debt recorded
       (red, and **null is not zero** -- a database without
       `source_appointment_id` reads "could not be checked").

- **A therapist asserts that money changed hands; the system owns the
  number.** `/api/therapist/record-cash-collection` used to accept
  `amountPaise` from the request body, which meant the person holding the
  cash also decided how much of it the clinic knew about - and that figure
  nets straight off what `therapistCashLedger` says they owe, so
  under-reporting was a one-field withdrawal. The body now carries an
  appointment id and nothing else; the total is reconstructed from the
  purchase with the same per-visit maths `bookHomeVisitSession` used. The
  honest exception is real (a patient short of cash, an adjustment agreed at
  the door) and it belongs to whoever is *not* holding the money:
  `/api/admin/correct-cash-amount`, `requireAdminScope("money")`, a
  mandatory reason, a CAS on the figure being replaced, and a
  `cash.correct_amount` audit row. It refuses a visit whose cash has already
  been remitted - that transfer has gone out, so the fix is an adjustment
  against the next payout rather than a silent edit of a settled one.

- **Completing a session is a financial write with a clinical name.**
  `status = 'completed' && payment_status = 'paid'` is the exact and only
  condition making a therapist's revenue share payable, so
  `/api/appointments/complete-session` gates the therapist's own path two
  ways (and an admin's neither, since a backfill or a correction is exactly
  what the override lane is for): nothing may be completed with no payment,
  no programme behind it and no cash recorded - a cash home visit collects
  first, which is the right order anyway - and nothing may be completed
  before the join window in which it could have been started. The route
  previously refused neither, and a therapist could mark a session done
  before its slot and be owed for it.
  **The admin half of it is a Sessions write, and asks for `manage`.** This
  is the one route shared between a therapist and an admin, so it cannot
  call `requireAdminScope("sessions")` outright -- it has to tell "an admin
  who may not" from "not an admin at all", and only the second falls through
  to the owning-therapist check. It reads `getAdminContext()` and applies
  `scopeCanManage(scope, "sessions")` itself, which is the same answer
  `requireAdminScope` gives. It used to take `getAdminUser()`, meaning any
  desk at all: Finance holds Sessions at `view` precisely so the person
  reconciling the books cannot change what they are reconciling, and this
  route let them close a session -- creating the payout obligation, exempt
  from both gates above. `ProfileSessionList` hides the two buttons on the
  same test, per the "a control an admin's scope cannot call must not
  render" rule.

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
  be asked to pay another way - and a therapist and a patient who have met
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
     recorded. Phone matching is the Indian mobile shape specifically - ten
     digits starting 6-9, optional `0`/`91` - not a loose digit run, which
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
     call and fails **closed** - the safe answer to "I don't know" is
     opposite for the two settings, and deliberately so.
  `communication_flags` and `contact_reveal_log` are admin-select-only and
  append-only **by trigger**, not only by RLS: every route here writes with
  the service-role client, which bypasses RLS entirely, so an evidence
  record the evidenced party could edit is not evidence. Adding a new
  free-text field that one role writes and another reads means adding a
  `surface` value and a `guardCommunication` call - the CHECK on that column
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
  where something the patient sends is involved - which is why each of them
  sends a **name**, never a figure.
  1. **The first-session offer** is standing configuration
     (`first_session_offer_enabled` / `_type` / `_value`, Settings → Offers
     & Discounts, off by default). Eligibility is `has this patient ever
     committed to paying for a session`, asked of the database in
     `/api/razorpay/create-order` -
     so it cannot be claimed twice, asked for, or sent from a browser, and a
     patient is only new once. **Committed, not paid**, and the word is
     load-bearing: it was `payment_status = 'paid'` until pay later existed,
     and a session on terms is never paid - so that test read every trusted
     patient as brand new on *every* booking they ever made and handed the
     offer out again each time. A confirmed booking on terms is not an
     abandoned checkout, because its price and its discount are frozen on it
     and can never be taken back; a **cancelled** one was never delivered and
     leaves them new. `countPriorCommittedSessions`
     (`src/lib/priorSessionsServer.ts`) is the one query all three readers of
     that question share - the offer, a `first_session_only` promo code and
     `claim_invite()` - and `priorSessions.test.ts` fails when a reader grows
     its own copy back. It fails **closed**: an unreadable answer
     means list price, because charging somebody who was owed an offer is a
     complaint while discounting everybody forever is a hole in the revenue
     nobody notices for a month. Video consultations only; a programme comes
     from a recommendation and a home visit carries travel.
  2. **The goodwill adjustment** is one admin, one session, one reason -
     `/api/admin/apply-goodwill-discount`, `requireAdminScope("money")`, a
     ten-character reason enforced by the route *and* a CHECK, and a
     `payment.goodwill_discount` audit row. Only **before** payment: a
     discount on something already paid for is a refund, and refunds have
     their own route, their own Razorpay call and their own audit.
     **Every route that later collects reads it.** `create-order` always
     did, through `checkoutQuote`; `/api/admin/mark-paid-by-cash` did not,
     and wrote the full category price as the cash taken -- so a goodwill
     adjustment given and then collected at the door overstated the cash
     ledger and gross revenue by exactly the amount given away, with the
     discount facts on the row describing a reduction the recorded amount
     did not reflect. It subtracts `discount_paise` now and records the
     list price beside it, like every other collecting path.
  3. **The promo code** (`src/lib/promoCodes.ts`, `promoCodesServer.ts`,
     `promo_codes`, `promo_codes_enabled` off by default) is a campaign an
     admin sets up on Money → Costs, beside the figure it produces -
     `/api/admin/save-promo-code` and `delete-promo-code`, both
     `requireAdminScope("money")` with `promo.*` audit rows. Five things
     hold it together:
     - **The code is an identifier.** The browser sends its name; the kind,
       the amount, the window and the caps are read from the row. That is
       what keeps the rule above true for a discount the patient triggers.
     - **The cap is enforced under a row lock**, by `claim_promo_code()` in
       `schema.sql`, not by a count taken a moment before an update - two
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
     `promo_codes` has no patient select policy - a patient who can list it
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
       link* - this is the "one word for one concept" rule applied before
       the second meaning got in rather than after.
     - **The reward is earned by a paid session, never a signup.**
       `grant_invite_reward()` fires from both capture paths (idempotent, so
       the browser callback and the webhook racing produce one reward). A
       reward that pays out on signups is a reward for creating accounts,
       and somebody will.
     - **A patient is new exactly once**, the same test the first-session
       offer uses - and that phrase was a comment in `claim_invite()` while
       the two had silently parted: an invite is claimable only before that
       patient's first **committed** session (paid, or standing on pay-later
       terms - see the first-session rule above), at most once ever (a unique
       index on `invitee_id`, not a route check), and never their own code
       (`claim_invite()` and a CHECK).
     - **Amounts are snapshotted at claim.** Lowering the reward next month
       must not lower what was already promised - the same reason a
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
  patient pays the lowest - the clinic agreed to every one of those prices,
  so charging a higher one because an admin tried to help would be perverse.
  A tie goes to the more deliberate decision: goodwill, then the code the
  patient typed, then a campaign that runs itself.
  Three rules are load-bearing:
  - **Travel is never discounted.** It is a pass-through reimbursement paid
    to the therapist in full, so discounting it makes them fund their own
    transport to subsidise the clinic's marketing. Discounts apply to the
    service line; every caller adds travel back afterwards.
    **It is refunded, though, and `amount_paid_paise` is the wrong figure to
    refund.** Travel is deliberately kept out of that column (it is not
    revenue -- see `bookHomeVisitSession`), while
    `/api/razorpay/create-order` charges the service line *plus* travel. So
    a directly-paid home visit -- which is only ever a hospital home-visit
    referral, since every other one is paid on its purchase -- was refunded
    the service line alone and the patient went on paying for a journey
    nobody made. `cancelAppointmentAndRefund` and
    `/api/admin/refund-session-partial` both add the travel back now, the
    second as the ceiling on what an admin may hand over, so the automatic
    and the typed refund agree about what the gateway is still holding.
  - **All four facts are recorded** - `list_price_paise`, `discount_paise`,
    `discount_source`, `discount_reason` - because a discount implemented by
    simply charging less leaves the books unable to tell "we sold this
    cheap" from "we discounted it", and that difference is the one number
    that decides whether an offer continues. `amount_paid_paise` keeps its
    existing meaning: what was collected.
  - **`sumDiscountsGiven` is reported, never deducted.** A discount means
    less was collected, so it is already inside gross revenue as a smaller
    number; subtracting it from operating profit would count it twice and
    understate profit by exactly the amount given away. It sits on Money →
    Costs as a stated figure answering the question no revenue line can -
    what buying those patients cost.
  Every **configured** amount - the offer, a promo code, either invite half
  - is floored at **zero**, and a total of zero is a free booking rather than
  a gateway order. That floor used to be `MINIMUM_CHARGE_PAISE`, which meant
  a clinic advertising a free first session charged ₹1: the quote-versus-
  charge bug again, in the place it matters most. The constant now means only
  "the least a Razorpay order may be" and `isGatewayPayable` is the test
  callers use to choose between paying and
  `/api/appointments/confirm-free`. A goodwill
  amount at or above the session price is **refused** instead - that one is a number a person typed with the price
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
  3 a self-signup patient has no account yet - the account, the booking and
  the payment are all created by one tap further down the same screen - and
  that visitor is exactly who a first-session offer is for. So
  `/api/appointments/quote` and `/api/patient/promo-code/preview` both accept
  a **category-only** request with no session, answering for a new patient:
  the offer applies, and the three things needing an identity (a goodwill
  adjustment, an invite half, a promo code's per-patient cap) are simply not
  part of it. Naming an actual booking still requires being its patient. It
  is never authoritative - the wizard re-quotes against the real appointment
  the moment the account exists, and `create-order` resolves everything again
  under a row lock - so the worst an anonymous quote can do is promise
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
  5. **Everything else still happens** - auto-assignment, the Meet event, the
     invite halves settling, the patient's approval. A free session is a
     session, and `confirmPaidAppointment()` is that sequence shared with
     `/api/razorpay/verify` so the two cannot drift.
  `create-order` answers a zero total with `409 {free: true}` rather than
  minting an order Razorpay would refuse, and `payForAppointment`'s `onFree`
  callback turns that into the confirmation - so a quote that goes stale
  between render and tap still lands correctly instead of erroring.

- **Session packages lock to one therapist by default.** The first therapist
  assigned to any session on a `patient_package_purchases` row sets
  `locked_therapist_id`; every later session on that purchase auto-assigns,
  auto-confirms, and gets its own Meet link via
  `src/lib/bookPackageSession.ts`, never through the normal per-session admin
  assignment flow. `sessions_used` counts sessions **claimed** (scheduled or
  completed), not completed - see the counter-semantics comment beside
  `patient_package_purchases` in `schema.sql`. A scheduling conflict on the
  locked therapist never fails the booking; the session lands `requested`
  and unassigned in the admin queue instead. Reassigning a whole programme
  (`/api/admin/reassign-package-therapist`) only ever touches future
  sessions - completed ones keep whoever actually ran them. A patient can
  schedule several remaining sessions in one request via
  `/api/appointments/book-package-sessions`, which loops
  `bookPackageSession()` per slot after enforcing the package's own
  minimum-gap/max-per-week rules and the bulk limit - it's the batch-level
  rules layer, not a second booking implementation.
- **No cron or background worker exists in this deployment.** Anything that
  needs to happen "when time passes" (a package purchase's `status` moving
  from `active` to `expired` past `expires_at`) runs as a lazy, idempotent
  sweep at the top of a relevant page's render instead of on a schedule -
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
  carries `specialty` - `ortho`, `neuro` or `pediatrics` - and that
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
     ever broken - violated silently it cross-contaminates two patients'
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
     map - it never queries `pain_assessments` (both health-profile pages
     do a two-phase read to know the specialty before choosing what to
     fetch), and both exam-submit routes 400. When those layers are
     built they are a **new table** (`neuro_assessments`), a new question
     module, a new `*Snapshot`, and one more arm on `SpecialtyExamPanel`
     - never a `specialty` column on `pain_assessments`, which would make
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
  unrecorded - every onboarding and re-triage writes an
  already-`approved` `condition_change_requests` row, the pattern
  `ConditionDirectEditForm` already uses, so it appears in the ordinary
  Review History with no new concept and no queue.

  **And it writes exactly one, which took two goes to get right.** The claim
  is a compare-and-swap so only the caller whose write lands writes the
  history entry -- that took ten taps down from ten entries to **two**, not
  to one, and the audit found the remainder. The route has two paths, an
  INSERT when no record exists and an UPDATE when one does, and they guard
  different races: a burst splits across both, so one caller wins the insert
  and another wins the first update, and each believes it was first. Both are
  right from their own view, which is why guarding the paths harder cannot
  fix it. The honest test is whether the request changed anything clinical,
  so an identical resubmission now writes **nothing at all** -- no record
  update, no history entry (`isSameIntakeSubmission`, keyed on the thing that
  happened rather than on who got there first, the same rule the credit
  ledger's idempotency keys follow). It compares the answers, the triage
  answers and the condition type, and deliberately not `updated_at` or
  `last_submitted_by`, which are bookkeeping and identical on a double-tap
  anyway. `e2e/health-profile.spec.ts` SPAM-001 is the guard; a record that
  is not yet `active` is never a no-op, since a draft going live is exactly
  what onboarding does.

  **The line is create versus edit.** Deciding what kind of patient this
  is, and writing down what they told you in a session you ran, is the
  therapist's own clinical record - the same kind of thing a Pain Map
  exam or a session note is, and gated the same way. *Editing* a live
  record on the patient's behalf is editing their own account of their
  history and still needs an admin-approved `condition_access_grants`
  request plus review (`/api/therapist/condition-profile/submit`).

  **The patient is read-only until that first fill**, computed once by
  `patientIntakeGate()` - a four-state union, not a boolean, because "not
  yours to do" and "yours, but not right now" need different copy. It is
  enforced in `submit` *and* `save-draft` (which flips `status` to
  `draft`, one of the gate's own inputs) and in
  `condition_change_requests_insert_gated`, without which the lock is
  cosmetic: `revoke` on that table only ever covered `update`. While
  locked, the CTA and the answered counter are **absent**, not disabled;
  the amber dashboard banner is dropped entirely rather than recoloured;
  the overview cell reads `-` on slate rather than `0%` on amber; and the
  reports uploader stays **open**, because it is the one useful thing the
  patient can do beforehand.

  Patient Care Intake is filled through a one-question-at-a-time pop-up
  (`ConditionIntakeWizard.tsx`), never as a form rendered on the
  dashboard: a wall of seven fields is what patients read as paperwork
  and abandon. A new question therefore needs `helpText` (why this answer
  matters, in the patient's words) and a `shortLabel` alongside its
  `label`. The therapist's own surfaces invert that pacing on purpose -
  the triage dialog shows everything at once with headings, the same rule
  `PainExamDialog` follows: a clinician filling this after every
  assignment wants to scan it, and the gentleness is for the patient who
  does it once. Once answered, the dashboard shows the answers, never
  inputs, and every reading figure on the page is derived in
  `src/lib/healthProfileSummary.ts`, not inside a component - that module
  now carries `orthoSnapshot` / `neuroSnapshot` / `pediatricsSnapshot`
  plus `intakeTrendSeries()`, which gives the two specialties with no
  exam layer a progress line read back out of the approved submissions
  already on file (no new table, no cron).

  Pain Map (`pain_assessments`, `pain_map_question_templates`, region and
  question logic in `src/lib/painMap.ts`) is therapist-only, per-region
  clinical exam data that posts live immediately with no review step, and
  is append-only (a re-assessment is a new row, never an edit) so the UI
  can show a trend against the previous visit. Recording one requires
  only that the therapist is **assigned** - enforced by
  `pain_assessments_insert_assigned_therapist` and mirrored in the submit
  route by `isTherapistAssignedToPatient`. *Read* access needs no request
  either way and is automatic for the assigned therapist. Both layers
  render on **one** body-map surface (`PainMapExplorer.tsx`), and that
  same surface is where an exam gets recorded - via `PainExamDialog`, not
  a form beneath the map. The region is chosen by tapping the figure (or
  a chip in the dialog), never a `<select>`, and it stays in the dialog
  header while the clinician types. Questions are grouped by
  `PAIN_EXAM_GROUPS` rather than listed flat.

  **The paediatric caregiver is a pre-step, not one of the seven.**
  `peds_caregiver_name` and `peds_caregiver_relationship` are ordinary
  flat keys - so the wizard, the required check, the admin's question
  bank and the PDF all handle them with no special case - but they are
  excluded from the seven-question count, because who is speaking for the
  child is provenance rather than a clinical question.

  **Admin edits wording per specialty, and can switch one off.**
  `intake_question_templates` is keyed `(specialty, question_key)`;
  Manage Questions has one tab per specialty (tabs, not three stacked
  sections - twenty-odd textareas is the wall-of-fields shape this
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
  Attribution is split rather than fudged - `authored_by` stays the clinician
  whose judgement it is, `entered_by` records the admin who typed it. Naming
  only the therapist would be a quiet lie about who was at the keyboard;
  naming only the admin a louder one about whose judgement it is.
  `/api/admin/author-care-plan` takes `requireAdminScope("sessions")`, a
  mandatory reason, and writes a `care_plan.author_on_behalf` audit row.
  The admin's panel matches the therapist's dialog on the two things that
  decide what gets picked. The programmes on offer are narrowed to the
  chosen session's own condition, through `narrowToCategory()` in
  `CarePlanFields.tsx` - both doors load the whole recommendable catalog in
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
  the patient is shown nothing - not a greyed-out card, nothing: the plan is
  absent from `loadActiveCarePlan`, `loadCarePlanHistory` drops it unless a
  caller passes `includeUnapproved`, and `/api/care-plan/create-order`
  refuses it, because hiding a card is presentation and refusing the order
  is the rule. Seven things hold it together:
  1. **Three outcomes, one route each.** `/api/admin/review-care-plan`
     approves or turns one down; `/api/admin/edit-and-approve-care-plan`
     publishes different numbers. All take `requireAdminScope("sessions")`
     and write `care_plan.approve` / `care_plan.reject` /
     `care_plan.edit_and_approve` audit rows. A ten-character reason is
     required for the two that take something away from somebody - a
     rejection the therapist has to act on, and an approval whose numbers
     are not the ones they wrote - and **not** for a plain approval, which
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
     the plan.** `care_plan_reviews` is append-only by trigger - the routes
     write with the service-role client, so RLS is not the guarantee - and
     both decisions revert their own status change when the insert fails.
     Same posture as `/api/therapist/reveal-contact`, and the opposite of
     the audit log's: an approval nobody can trace to a person is the one
     outcome these routes must not produce.
  4. **The offer is re-checked against the live catalogue before it is
     published, never only at checkout.** Checkout re-reads the package and
     refuses on a mismatch, which is right - but on its own it means an
     admin approving a recommendation whose package has since been
     re-priced, deactivated or made unrecommendable publishes an offer that
     fails at the last step of the patient's checkout, and the patient
     discovers the clinic's stale data by having their payment refused.
     `describeOfferDrift()` compares the two figures a patient reads and
     pays - session count and price - and blocks the approval with a
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
     the thread - the feed scrolls away, and the chart is where a clinician
     goes to rewrite. The reason is the actionable half: "Not approved"
     says the recommendation is gone, and only the reason says what to
     write instead. They rewrite - an admin editing a clinician's judgement from
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
  somebody treatment - the commonest reason
  to turn one down, and previously invisible without leaving the queue.
  Stated, never acted on: a patient with sessions left may well need a
  different programme, and the clinician has seen them.
  One switch, `site_settings.care_plan_requires_approval`, on by default,
  read in its own call -- deliberately **not** in `SITE_SETTINGS_SELECT`,
  the same treatment `therapist_suggestions_enabled` gets, because it is the
  newest column on that table and a shared select that fails takes every
  other setting down to its default with it -- and failing **closed** - the opposite direction from
  `contact_scan_mode`, because the safe answer to "I could not read the
  setting" is to hold a recommendation, never to publish one unreviewed.
  With it off, a therapist's submission publishes on save exactly as before.

- **The clinic can also see every recommendation, and stop one.** Sessions →
  Recommendations lists them all and `/api/admin/withdraw-care-plan`
  (`requireAdminScope("sessions")`, mandatory reason, CAS on either open
  status, `care_plan.withdraw` audit row) closes one whose author cannot -
  on leave, gone, or the reason it is wrong. It covers a **queued** plan
  too: refusing would leave the queue holding a thread nobody intends to
  approve while the patient's one-plan slot stayed taken. A **purchased**
  plan cannot be withdrawn at all - the patient has paid and the sessions
  exist, so the honest lane is a refund or a credit adjustment, both of
  which have their own screens.

- **Treatment volume is never sold before an assessment.** The rule lives in
  `src/lib/consultationFirst.ts` and is a property of the thing being sold,
  not a feature flag: a catalog row may be bought directly only when it is a
  **single** session or visit. One session is a consultation - there is
  nothing to assess before selling somebody one appointment - and two or
  more is a programme, which comes from a care plan a therapist wrote after
  a session they ran.
  Direct session-package purchase is **gone**: `/api/packages/create-order`,
  `/api/packages/verify`, `packagePayment.ts` and `BuyPackageButton` are
  deleted, and `/book` sells one consultation against a treatment category.
  So is the **advertising** of one. `/` and `/conditions` no longer query or
  render session packages at all, the programme dialog's price list of
  courses is gone, `/home-visit` filters to single visits, and
  `home/SessionPackages.tsx` is deleted. `show_programme_prices` /
  `session_packages_visible` are retired rather than defaulted off - a
  toggle somebody can flip back on is not the rule being gone, and a price
  list of programmes is exactly what a patient must not shop from. Both
  columns are **dropped** at the end of `schema.sql` now: leaving a column
  nothing reads is only free while nothing touches it, and ten successive
  re-declarations of `debug_reset_all_data()` kept resetting one of them
  while an e2e `beforeAll` kept writing it, so the next reader of either had
  to trace a column to its absence before learning it was dead. `drop column
  if exists` is re-runnable, which is what made the original "a drop cannot
  be undone by re-running the file" reasoning true of the data and not of
  the statement.
  The home-visit exception is load-bearing rather than a compromise: every
  home visit in this app is a `home_visit_packages` purchase and
  `/api/appointments/create` books `visit_mode: 'online'` only, so applying
  "no direct package purchase" literally to both catalogs would leave a
  patient who needs to be seen at home with **no entry point at all**. A
  one-visit home package is that patient's consultation and stays
  purchasable; `visit_count > 1` is refused by both
  `/api/home-visit/create-order` and `/api/home-visit/book-cash` (paying at
  the door is a payment method, not a different product).
  Both wizards **answer** a stale `?package=` link rather than ignoring it -
  taking a different amount of money than somebody came for is the one
  outcome a removed checkout must not produce. Existing purchases are
  untouched and keep booking to exhaustion.
  A recommended home visit collects an address at checkout
  (`src/lib/homeVisitAddress.ts`, shared with the direct route) and sets
  `default_address_id` and `travel_fee_paise`. The offer card quotes the fee
  for that address through `/api/home-visit/check-area` and shows
  programme + travel + total, because travel is charged **per visit** and the
  card previously printed the programme price on a button that charged more
  - a four-visit programme in a ₹150 area was ₹600 out. Quoting a different
  figure than you charge is the one thing a payment screen must never do.
  `/api/care-plan/create-order` also re-checks `home_visit_enabled`: an admin
  who switches home visits off has stopped the service, and a recommendation
  written before that must not stay purchasable. Without them
  `/api/home-visit/book-visits` refuses outright and the therapist funds
  their own transport - both were missing while a programme could still be
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
     their own price" is not a policy anyone enforces - it is a thing the
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
     patient buys a programme - what is written is now a bill, and the
     clinic that carries it sees one before the patient is asked to pay it.
     See the review rule below for the whole of it.
  4. **Versions are append-only, by trigger.** Only `is_current` may
     change; every other column raises on update, and delete raises
     outright. A recommendation that changed is a new version.
  5. **A purchased plan is never re-versioned.** Once `status = 'accepted'`
     the thread is closed and a later recommendation opens a new one with
     `supersedes_id` set, because editing a purchased plan would change the
     description of something already paid for. `care_plans_one_open_per_patient`
     keeps at most one **open** plan - `active` or `pending_review` - so a
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
  **eight** for the condition type - four of the ten on one screen. The
  words multiply whenever someone extends a surface rather than naming a
  concept, and every extra one is a patient wondering whether "your chart"
  and "your health profile" are two different things.
  - The record is **Health Profile**, to all three roles. Not "Patient Care
    Intake" (a code and docs term now), not "condition data", not "the
    questionnaire". "chart" is clinician register: fine on a therapist or
    admin screen, never on a patient's.
  - The kind of patient is a **condition type** to clinicians and admins.
    Never "specialty" (that is the column name), never "case". A patient is
    never shown a category word at all - name the care instead
    ("Paediatric physiotherapy", not "pediatrics"), and keep "triage" and
    "onboarding" off their screens entirely. The clinician word and the
    patient word are separate fields (`label` / `patientLabel`) and may
    differ, but where the clinic has settled on one name for a service, both
    say it: the catalogue, the condition picker and the exam panel calling
    the same care three things is the confusion this rule exists to stop.
    Spelling is British throughout - "Orthopaedic", "Paediatric" - so an
    American spelling in one label reads as a typo beside the others.
  - Whoever approves a change is **the clinic** to a patient, and **admin**
    on admin screens. Not both, and not "us".
  Before adding a noun to any of these screens, check it is not a fifth name
  for something already named.

- **Copy that two roles read needs a `voice`, not a compromise.**
  `ConditionIntakeWizard` and `ConditionIntakePanel` are filled by the
  patient *and* by a therapist on their behalf, and the same sentence cannot
  be true for both - a clinician was being told "this is your own account of
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

- **Every date renders in the clinic's zone, and the zone is never left to
  the runtime.** `toLocaleString()` with no `timeZone` formats in whatever
  zone the *runtime* is in -- on the server that is the host's, which is UTC,
  so a session booked for 6 PM IST printed as "12:30 PM" on the patient's own
  Overview; inside a client component the same call used the browser's zone
  instead, which is a different wrong answer and a hydration mismatch between
  the two. Ninety-one call sites were formatting that way.
  `src/lib/formatDateTime.ts` is the one answer -- `formatClinicDate`,
  `formatClinicDateShort`, `formatClinicTime`, `formatClinicDateTime`, all
  pinned to `Asia/Kolkata` and `en-IN`, all rendering a dash rather than
  "Invalid Date" for something unreadable. Pinned rather than per-viewer
  because the alternative is two people reading one screen and disagreeing
  about when a session is, with nothing on screen to say why.
  Three exceptions, each real and each documented where it sits:
  1. **A session slot** is formatted in the zone the patient booked it in
     (`formatSlotTime`, `appointments.patient_timezone`) -- the booking's own
     record of what they were looking at when they chose it. Its no-zone
     fallback for legacy rows is the clinic's zone, not the runtime's.
  2. **A wall-clock date** -- `new Date(y, m, d)` in `bookingSlots.ts`, which
     has no instant behind it -- must *not* be pinned: formatting a local
     midnight in another zone prints the previous day for any viewer east of
     India.
  3. **"Saved 3:42 pm"** on the intake wizard is the viewer's own clock,
     because it is their own draft, set in their browser, and gone on reload
     -- not a stamp on a record two people have to agree about.
  `formatDateTime.test.ts` walks every `.toLocale*String(` in `src/` and
  fails on one without an explicit zone, with those two files exempted by
  name. The check earns its keep because this failure is invisible locally:
  a developer's machine is often in the same zone as the clinic, and it only
  shows on a UTC host.
- **One pain scale on screen, whatever the column says.** Assessments are
  stored 0–100 and a patient rates their own pain 0–10; both used to be
  printed raw, so "How you rate it 6/10" sat beside "Last exam found 34%"
  in the same strip and read as two different measurements. Every
  user-facing exam figure goes through `formatPainOutOfTen()`
  (`painMap.ts`). Storage is unchanged - this is display only, and new
  surfaces must use the helper rather than printing `pain_percent`.
- **A permission gate belongs beside the thing it gates.** The therapist's
  "Request access to edit" card sat three sections above the Pain Map, the
  only thing it unlocks; it is now inside that card, stating what is
  readable regardless and what needs approval - if a third view of this data is ever needed, add a mode to
  that switch rather than another card. The figure itself
  (`BodyMapDiagram.tsx`) is an anatomical human silhouette built from
  cross-section nodes (`silhouettePath`), one `<svg>` per view so front and
  back stack on a phone instead of shrinking each tap target below a
  fingertip. See the "Patient Care Intake and Pain Map" section in README.md
  for the full flow.
- **A patient's own record leaves the app as a PDF, not as JSON.**
  `/api/patient/condition-profile/export` returns a typeset document named
  `Name_PatientCode.pdf`, built by `src/lib/healthProfilePdf.ts` - the
  thing a patient does with an export is hand it to another clinician, and
  a JSON file is only readable by a developer. `?format=json` still serves
  the raw structure for genuine portability; nothing in the UI links to
  it. pdf-lib's standard fonts encode **WinAnsi only**, so every string
  goes through that module's `toWinAnsi()` before it is drawn - a
  Devanagari name would otherwise throw at draw time and 500 the whole
  export rather than degrading. Session notes stay excluded from every
  format, same rule as before.
- **Patient-uploaded reports live in Storage; the database holds only
  metadata.** `patient_medical_documents` has no bytea or base64 column,
  and it never should: a handful of MRI PDFs stored inline would dominate
  the database's size and ride along on every `select *` over a patient's
  chart. The `medical-reports` bucket is **private**, unlike `avatars` -
  a scan report is the most sensitive thing this app holds, and a public
  bucket makes the object URL itself the only secret. Reads go through
  `/api/medical-documents/view`, which selects the metadata row with the
  caller's own RLS-scoped client (the row coming back *is* the
  authorization, same posture as `/api/packages/purchase-detail`) and only
  then mints a 120-second signed URL with the service role. Storage's own
  policies cover the owning patient alone, so there is no path-parsing
  subquery to get subtly wrong. Growth is bounded by two caps that only
  work together - 10MB per file and 20 files per patient
  (`src/lib/medicalDocuments.ts`, enforced in the upload route, which is
  the only writer) - since either alone leaves the bucket unbounded one
  upload at a time. Writes are the patient's own; a therapist and an admin
  read. There is deliberately **no update policy**: correcting a report
  means deleting it and uploading again, so the row and the object can
  never describe different things.
- **Session notes are clinician-only, and they are the prep loop.** After a
  delivered session the therapist writes what was treated, how the patient
  responded, the home exercise and the plan for next time
  (`session_notes`, fields in `src/lib/sessionNotes.ts`, written through
  `SessionNoteDialog` from the session card itself). `session_notes` has
  **no patient select policy and must never get one** - these are working
  notes written in the register clinicians use with each other, and the
  patient's data export (`/api/patient/condition-profile/export`) and
  printable profile both exclude the table on purpose. Notes stay editable
  for 24 hours (`SESSION_NOTE_EDIT_WINDOW_HOURS`), enforced in the submit
  route, and every edit inside that window copies what it replaced into
  `session_note_revisions`. Writing one needs no
  `condition_access_grant`, unlike the intake and Pain Map: a note records
  work this therapist personally did rather than editing the patient's own
  history. Completion is never blocked on a note - the nudge is a
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
  render - a tab is a server round trip now, so it must not pay for the
  whole dashboard's data to show one list. What the sidebar needs to decide
  which entries exist stays in the always-loaded core, or the nav would
  change shape as you move between screens. Anything rendered by more than one route
  (the session cards) is a real component, not a closure.
- **Every dashboard opens on the same Overview.** Patient, therapist,
  hospital and admin all render `DashboardOverview.tsx` - a strip of four
  figures (`StatStrip`), the notification feed (`ActivityFeed`), and a
  quick-actions list - in that order, because that is the order people ask
  "how am I doing / what needs me / what do I do next". Sections are
  `SurfaceCard`, statuses are `StatusPill`, blank states are `EmptyState`
  (all in `src/components/dashboard/`); do not hand-roll another white
  rounded box with a bold heading. The feed itself is *derived*, not
  stored: `src/lib/dashboardFeed.ts` turns rows each page already queries
  into `FeedItem`s, so there is no notifications table to keep in sync and
  no cron to write it (see the no-cron rule above). `needsYou` replaces
  read/unread - it marks what is still waiting on the viewer, and `sortFeed`
  pins those above everything else before sorting by date within each group,
  then caps repeats of one title at `MAX_PER_TITLE`. The cap is the other
  half of the pin: pinning alone let one noisy kind fill all twelve slots -
  a patient with a dozen abandoned checkouts saw "Payment not completed"
  twelve times and never saw that they had sessions already paid for and
  never booked. The twelfth identical line was never information.
  **A feed item's date is the row's, never the render's.** The three admin
  queue rollups -- signups waiting, change requests, sessions with no meeting
  link -- took a bare count and stamped themselves `new Date()`, and this
  dashboard re-renders on every realtime event, so "5 signups waiting for
  approval" reset to *just now* on every refresh. A signup that had waited
  three days read as having just arrived, which is exactly backwards for the
  one class of item that gets more urgent the longer it is ignored, and it
  pinned the queue to the top of a date-sorted feed for a reason that had
  nothing to do with the queue. They take a `QueueRollup` now -- the count
  **and** the oldest waiting row's own timestamp, built by `queueRollup()`,
  which takes the oldest rather than the newest because a queue's age is the
  age of what has waited longest. The two halves travel together in the type
  precisely so a count can no longer arrive without a date; changing it
  failed at every call site, which is what a bare count could not do. An
  empty list yields count 0 and no item is pushed, so an item on screen
  always has a real date behind it and there is no missing-date case to
  invent a fallback for.
  The pinning is load-bearing rather than cosmetic: an item dated when it
  arose sinks further the longer it goes unanswered, which is backwards for
  the one class of item that is still owed something - a programme paid for
  a month ago with sessions unbooked is the case that made it obvious.
- **The admin dashboard's information architecture lives in
  `src/lib/adminNav.ts`** - seven sections (Today, Sessions, People, Money,
  Catalog, Logs, Settings), each with its own screens. The sidebar, the URL
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
- **A password this clinic issued is stored; a password the user chose is
  not, and cannot be.** Supabase keeps a bcrypt hash, so there is no
  mechanism by which any screen can display a password somebody set
  themselves -- asking for one is asking for something the database does not
  contain. What the app does instead is keep the **plaintext it generated**,
  on four zero-policy tables the service role alone reads
  (`patient_admin_notes`, `therapist_admin_notes`, `hospital_admin_notes`,
  `admin_account_notes`), so an admin taking a "it won't let me in" call can
  read the credential back rather than resetting a working one. Four rules:
  1. **Every route that generates a password persists it**, the three
     `reset-*-password` routes and `/api/admin/create-account` alike.
     Create-account was the one that did not: it returned the password and
     held it in React state on the User Access screen, so the `profiles`
     insert it had just made fired a realtime refresh and took the password
     off the screen mid-sentence. `hospital_admin_notes` exists because the
     hospital reset button had the identical bug one role earlier -- the
     shape is known, and a new credential-issuing control must not
     reintroduce it.
  2. **It is cleared when they set their own** (`/api/clear-temp-password`,
     which acts on the caller's own id from their session and never a
     client-supplied one). That is what makes "still on the password we
     issued" true rather than stale, and it is why the directory can state
     which of two states an account is in without ever claiming a third.
  3. **It never reaches the account owner, and never reaches the log.** The
     tables carry no RLS policies at all, so a plain column on `profiles`
     (which `profiles_select_own` would hand straight back) is not an
     option; and a generated password stays out of `admin_activity_log`,
     which every admin reads.
  4. **`admin_account_notes` is deliberately outside the reset's TRUNCATE
     list**, alone among the four. Notes follow their accounts: the reset
     deletes every patient, therapist and hospital, and keeps every admin --
     so emptying this one would strip a working credential off an account
     the reset had just decided to keep.
- **User Access is where the access model is read, and it is derived.**
  Settings → User Access is one screen doing what two half-screens did: the
  back-office directory (who can sign in, at what level, and whether they
  still can) and the **matrix** - rows are the jobs people describe, columns
  are the four desks, cells come out of `ADMIN_CAPABILITY_GROUPS` +
  `sectionAccess` in `adminScope.ts`. Nothing in the product said what a
  scope *meant* before it: an owner deciding whether to hire somebody into
  Operations could read four one-line blurbs, or read the source.
  Three rules hold it.
  1. **The matrix is derived, never a second list of permissions.** Every
     cell is answered by the module the routes enforce with, so the screen
     cannot claim an access nobody has. A hand-maintained copy goes stale the
     first time a scope changes, and then the screen showing it is lying
     about the one thing it exists to explain. Add a capability row only when
     the grid already decides its answer; a capability needing its own rule
     wants the rule in the grid.
  2. **The cells are not checkboxes.** A tick that does not change a route is
     a lie, and making them real means a per-capability check at 99 routes -
     the fine-grained matrix whose failure mode is one route quietly falling
     through a gap in it, which is what coarse scopes exist to avoid.
     Changing what a desk reaches is a code change, reviewed.
  3. **Suspending is not deleting, and delete is the narrow case.**
     `/api/admin/delete-account` exists on all four roles' screens, and it is
     a delete that can only ever succeed on an account with **no history at
     all** -- the typo'd email, the duplicate, the one created against the
     wrong person. That is not a policy: thirty-five tables carry a foreign
     key to `profiles(id)` with no ON DELETE behaviour, so Postgres refuses
     outright for an account that has booked, paid, been paid, been treated
     or acted in the back office, and deleting one "properly" would mean
     deleting the money and the clinical record with it. So the route counts
     what points at the row first, groups it the way a person describes it
     (`src/lib/accountDeletion.ts` -- six groups, not fifty columns), and
     refuses with the counts named and **suspension offered beside them**,
     the same shape `describeCategoryBlockers` uses. Four rules:
     it is `full` scope only, checked directly rather than through
     `requireAdminScope("people")`, because every desk that manages People
     can already suspend and this one is irreversible; it carries suspension's
     own two guards, never yourself and never the last Master Admin who can
     still sign in; the audit row is written **before** the delete, since
     afterwards there is no row left to name and a failed attempt is worth
     recording on the one action with no undo; and it re-reads the profile
     afterwards, because GoTrue reporting success is not the same as the row
     being gone -- "removed nothing" and "removed it" must stay
     distinguishable. The counted groups are for the human; the database is
     still the authority, and a foreign key the probes do not cover produces
     `ACCOUNT_DELETE_REFUSED` rather than a Postgres string.
  4. **Suspending is not deleting.** `/api/admin/set-admin-active` mirrors
     `set-admin-scope`'s two guards (not yourself, not the last Master Admin
     who can still sign in) and flips `profiles.active`, which `getAdminUser`
     and the proxy already refused on - the enforcement existed and the
     control did not, so closing the door on somebody who left needed
     database access. The account stays because the admin's id is on every
     audit row they ever wrote.
  `src/lib/adminScope.test.ts` holds the grid's invariants - every pair has a
  level, manage never outruns open, every section has a capability group, and
  every group has at least one read-only row, without which a group cannot
  show the difference between `view` and `none`.
- **Settings is ten screens under four captions, and the captions are part
  of the definition.** `AdminTabDef.group` (`src/lib/adminNav.ts`) names the
  caption a screen sits under, and `AdminShell` draws one whenever the group
  changes -- so screens sharing a caption must be **adjacent** in that array
  or the caption is drawn twice. Four: *Your website*, *How the clinic runs*,
  *Who gets in*, *Technical*. A flat list of ten labels is one nobody reads
  top to bottom, which is the same failure the per-screen blurb fixes one
  level down. Sections with a short screen list name no groups and render
  exactly as before.
  Two screens moved in the same change, both because the label on the door
  was wrong about what was inside. **Sign-in & Security** (was *Account
  Security*, one button to email yourself a reset) now also carries the idle
  timeout and the sign-out banner, which sat on Booking Rules under a heading
  promising "when a patient may book, cancel, and join a video session".
  **Advanced** is the technical shelf: `entitlement_ledger_authoritative`
  alone, taken off Programmes & Home Visits where it sat between two rules
  about how a programme is sold. A switch belongs there when the clinic's own
  judgement cannot answer it *and* it is about how the app works inside rather
  than what it sells -- the test the ledger switch fails on both counts
  elsewhere, since its own help text sends the reader to System Health.
  Settings is `full` scope only, so Advanced needs no further gate.
  **A settings screen taller than a couple of screens carries a map of
  itself.** `SettingsJumpNav` + `SettingsSection`
  (`src/components/admin/SettingsJumpNav.tsx`) put a sticky strip of anchors
  above Public Site (4,300px) and Programmes & Home Visits (3,100px). Plain
  `<a href="#id">`, and the ids are prefixed per screen because the shell
  keeps every screen mounted behind `hidden` -- two screens naming a section
  "Testimonials" would collide on one id. Its `offsetTop` matches
  `AdminShell`'s: the pre-launch debug bar is fixed and 41px tall, and a strip
  stuck to `top-0` parks underneath it.
  **Two settings can be set into a combination where one does nothing, and
  the screen says so.** The join control reads the Session Completed cutoff
  before the join window (`JoinSessionButton`: `completed` wins over
  `isJoinable`), so a cutoff at or below the after-window makes the grace
  period unreachable. Booking Rules shows an amber line, computed off the
  typed values rather than the saved ones so it appears while the owner is
  still deciding. Stated, never refused: both numbers are legitimate alone,
  and which one they meant to move is theirs.

- **A settings screen says what it is and gives an example.** `AdminTabDef`
  carries an optional `blurb` and `example`, and `AdminShell` prints them
  under the page heading in place of the section's own line. Every Settings
  screen has both, because a section blurb cannot do this job: eight screens
  all sat under "How the product behaves", so the header explained nothing
  on the section people open least often and therefore remember least well,
  and a label alone ("Brand & Contact", "System Health") names a category
  rather than an action. The blurb is what the screen is, in a clinic
  owner's words -- no jargon, no column names, no feature names; if a
  sentence needs one, the screen is doing too many things and wants
  splitting. The example is one concrete thing you would come here to do,
  which is the half that makes an unfamiliar screen usable.
  **Every Money screen carries both too**, for a sharper version of the same
  reason: five screens named with abstract nouns ("Summary", "Breakdown",
  "Costs") make an owner open three of them to find the one answering the
  question they arrived with. The worst case of that was a dead end rather
  than a detour -- promo codes rendered on Money -> Summary while Settings ->
  Offers, the README and the QA plan all said Money -> Costs, so following
  that note landed on a screen with no promo codes anywhere on it. A campaign
  belongs beside the figure it costs (*Discounts given*), which is where it
  is now.
  **Booking Rules was that "too many things" case**, and splitting it is
  what the field was added alongside. It had grown six unrelated stacks with
  no heading between them -- when a single session may be booked, cancelled
  and joined; the two acquisition discounts; the recommendation rules; the
  programme rules; the nine home-visit settings -- so an owner opening it to
  change a refund window scrolled past the discount that decides what every
  new patient pays. It is three screens now: **Booking Rules** (one video
  session), **Offers & Discounts** (money off, to win a patient), and
  **Programmes & Home Visits** (more than one appointment, arranged in
  advance). Offers carries a note saying where promo codes and goodwill
  live, because "where did the promo screen go" is the question a split
  otherwise creates.
- **System Health is seven checks in one shape, and every unhealthy one says
  how to fix it.** The screen reports rather than sets, so it is not an
  `AdminFeatureControlTab` view -- `src/lib/systemHealth.ts` decides each
  check's status, its one-line headline, the numbered steps that fix it, and
  the *what this watches* / *for example* pair behind its (i) button, and
  `AdminSystemHealthTab` draws what that module returns. It replaced five
  panels that each explained a subsystem in its own words and its own layout:
  an owner had to read all of them to learn nothing was wrong, and the one
  sentence naming the fix was buried mid-paragraph. Four rules hold it:
  1. **A status is a word as well as a colour** (`Healthy`, `Needs a look`,
     `Needs you now`, `Not set up`, `Not checked`), and **`off` and
     `unknown` are not faults**. An owner who never wired Google up has not
     got a problem, and painting that red is how red stops meaning anything
     -- `needsPerson()` is the one test for "this is asking for somebody".
  2. **Anything not healthy carries steps the owner can follow alone.** A
     red card with no way out is the screen this replaced. `systemHealth.test.ts`
     asserts it over every check.
  3. **The teaching text lives behind the (i), never on the card.** It is
     what somebody needs the first time they open the screen and never
     again; inline, it is the wall of text that made the old one unreadable.
  4. **The sidebar badge counts checks, not rows**, so it equals the verdict
     strip's own count and its chips. Counting rows badged **0** for the two
     failures with no rows behind them -- a missing `RAZORPAY_WEBHOOK_SECRET`
     (money arriving against unpaid bookings) and a dead Google credential.
  5. **A red check leaves the screen; an amber one does not.** `healthBannerText()`
     puts one red line on the admin's Today screen (`AdminHealthBanner`, via
     `DashboardOverview`'s `banner` slot, and only for a scope that can open
     Settings -- the banner is a link, and `findTab` would land a scope that
     cannot on some other screen entirely). Red only, because the two worst
     failures are invisible from every other screen and nobody opens System
     Health until they already suspect trouble -- while a banner that is
     usually there is a banner nobody reads.
  6. **A cached answer prints its own age.** Every check but Google is
     computed at render; the Google probe is held ten minutes on success and
     one on failure, so it passes `googleConnectionCheckedAt()` and the card
     says "Checked 4 minutes ago". The relative time is rendered after mount,
     never on the server -- "4 minutes ago" computed server-side is already
     wrong in the browser, and rendering it in both is a hydration mismatch.
  An eighth check is an entry in that module plus, if it has rows, a card
  body in the tab -- never a new panel with its own shape. The two fix
  buttons render only under `scopeCanManage(scope, "settings")`, matching the
  routes.
  **The sixth is Public doors, and it watches the limiter rather than a
  backlog.** `enforceRateLimit` allows a request it cannot attribute, which
  is correct and is silent: there is no 429, no log line and no counter row
  to notice the absence by, so a deployment whose host does not forward the
  visitor's address has every public cap switched off and nothing anywhere
  says so. `rateLimitIdentifierStats()` counts what this server has actually
  seen and the check states it. Three things about it are load-bearing:
  1. **The failure that matters is not the one you would test for.** Next
     fills `x-forwarded-for` in from the socket, so a request arriving
     through a proxy that does not pass the original address still carries an
     identifier -- the proxy's. Every visitor then shares one allowance,
     thirty of them exhaust it and the thirty-first is refused for something
     somebody else did, and from the inside that looks exactly like a working
     limiter. So the check reports "every visitor is arriving as the same
     person" as its own state, above a floor of `MIN_SAMENESS_OBSERVATIONS`
     requests because below that it is just a quiet server.
  2. **It is `off`, not `broken`, when nobody can be told apart.** Nothing is
     failing: the app is doing what it was told, and the fix is one setting
     on the host. Red here is how red stops meaning anything.
  3. **The counter hangs off `globalThis`, and that is not a style choice.**
     Next bundles the App Router per entry, so a module imported by both a
     route handler and a page can exist twice in one process. Written as a
     plain module variable the route incremented one copy and the dashboard
     read the other, which never left zero -- the screen said "nothing has
     used a capped page yet" after fifteen requests that had. It holds the
     verdict and never an address: an IP belongs to a visitor, so only
     "one caller or more than one" is kept.
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
  count included - the same "list disagrees with the number" bug in a
  subtler form. And it is applied **during render** (read via
  `useSearchParams`, not at mount): every screen is mounted at once behind
  `hidden`, so there is no mount to hang it on when an admin already on the
  dashboard taps a figure, and an effect would paint the unfiltered table
  first. An unknown preset falls through to cleared filters, so a stale
  link shows everything rather than nothing.
- **Assigning is not reassigning, and the word has to say which.** A session
  nobody has ever been assigned to offered only "Reschedule / Reassign",
  which reads as editing something that already happened - so the one
  action an admin most often needs had no name on screen. Where a therapist
  is missing, every surface now says **Tap to assign**: the All Sessions and
  Calendar rows carry it as a chip (the row click already opens the drawer,
  where the work is done), `EditBookingForm`'s trigger swaps its label on
  `currentTherapistId`, and `SessionDetailDrawer` leads with
  `AssignTherapistForm` - one tap, honouring `preferred_therapist_id`, the
  therapist the patient asked for - with the reschedule form kept below for
  when the time has to move too.
- **A session is listed once - on every dashboard, not only the admin's.**
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
  the same rows arranged differently - only the first earns an entry.
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
- **The wait has to be visible, and it outlives the button.** Every mutating
  control had its own `loading` flag, and that flag was the problem: the
  shape was `setLoading(false); router.refresh();`, so the button went back
  to looking idle and *then* the expensive half started. On the admin
  dashboard a refresh re-runs the whole Server Component -- every screen's
  markup, not only the visible one -- with nothing on screen saying so, which
  is what gets reported as a freeze. A per-button flag cannot cover it: the
  work outlives the control (the row it sat in is refreshed away), and a
  navigation has no button left at all. So the signal is one counter at the
  root (`PendingWorkProvider`, `src/lib/pendingWork.tsx`) and one teal bar
  above every piece of chrome (`RouteProgress`). Three rules:
  1. **`useRouter` comes from `src/lib/useRouter.ts`, not `next/navigation`.**
     It is a drop-in with the same shape whose `refresh`/`push`/`replace`
     run inside a React transition -- the only thing that knows when a
     navigation has actually landed -- and reports that to the counter. That
     is why 100-odd client components changed one import line and nothing
     else: adopting it at the source covers every call site, including the
     ones that will be written next.
  2. **No percentage, ever.** Nothing in the client knows how far along a
     server render is. The bar eases toward a ceiling it never reaches and
     completes in one movement when the work lands; a bar that sits at 90%
     is a lie people learn to ignore.
  3. **It waits `APPEAR_AFTER_MS` before drawing.** Most actions finish well
     inside it, and a bar that flashes on every tap makes a fast app feel
     busy. Reduced motion keeps the bar and drops the travel -- someone who
     asked for less movement still needs to know the app is thinking.
  **The split matters at the call site, not only at the root.** A control
  that runs its fetch *and* its `router.refresh()` inside one
  `startTransition(async …)` keeps its own `isPending` true until the refresh
  lands -- so on the admin dashboard the button stays disabled and spinning
  through a full Server Component re-render, which is reported as a hang. The
  shape is: the control is busy for **its request**, releases in a `finally`,
  and calls `router.refresh()` after, handing the rest to the bar. That is
  not the `setLoading(false); router.refresh();` mistake above -- the
  difference is that the bar now exists to carry the half the button cannot.
  Guard the submit with a synchronous ref as well (a `disabled` attribute
  lands a render too late), and catch the request: an unhandled throw inside
  a transition puts nothing on screen at all.
  **And `await confirm(...)` never goes inside a transition -- that one is a
  deadlock, not a slow button.** `useConfirm` renders its dialog from state,
  so wrapping a submit that awaits a decision means the dialog that resolves
  the decision is itself an update belonging to the transition that is waiting
  on it: nothing paints, the promise never settles, and the control spins for
  ever. `PayLaterWriteOffForm` shipped that way and **Write it off did nothing
  at all** -- and neither did its undo, which is the worse half, because a
  debt the screen said was forgiven was not. Await the decision first, then
  transition only the request that follows, which is what
  `PartialRefundForm` and `HomeVisitCashLedger` already do; where the request
  wants its own busy state, keep the plain `useState` + `finally` shape above
  and hand the refresh to the bar. It was invisible to every check this repo
  has -- the route, its unit tests and its SQL assertions were all correct and
  all passed -- and `e2e/pay-later.spec.ts` PL-UI-007 is what found it, by
  being the only thing that ever pressed the button.
  **An append-only log does not belong on the operational realtime channel.**
  Every mutating admin route writes `admin_activity_log`, so while that table
  sat on the 2s channel each action rebuilt the whole dashboard twice -- once
  for the row it changed, once for the entry describing it -- and the admin
  who acted had already refreshed deliberately. It is on the 30s channel with
  `contact_reveal_log` and `risk_reviews`, which are there for the same
  reason.
- **A change that leaves no trace on screen has to say what it was.** Every
  mutating control ends the same way -- the request lands, `router.refresh()`
  re-runs the Server Component, and the screen re-renders into a state that
  looks identical. A toggle that was off is now on and the only evidence is
  a switch the person has stopped looking at; on a slow render it is
  indistinguishable from nothing having happened. `ToastProvider` +
  `useToast()` (`src/lib/toast.tsx`) is the answer, mounted in the **root
  layout above every route** -- which is what makes the confirmation survive
  the refresh the control itself fires, with no cookie and no message
  replayed on the next load. Three rules:
  1. **It names the thing and its new state.** "Home visits are on", never
     "Saved" -- a confirmation that does not name the thing tells somebody a
     request finished, which they could already see. For settings that
     wording lives in `src/lib/settingMessages.ts`, one vocabulary for the
     whole section in the owner's words rather than the column's, and
     `settingMessages.test.ts` fails when a key an admin screen can write
     has no sentence, reads a column name back to a person, or mis-pluralises
     a unit.
  2. **`useToast()` never throws outside a provider.** These controls render
     in dashboards, in modals and in the booking wizard on a public page, and
     a missing confirmation must not be the thing that takes a screen down --
     same posture as the audit log's best-effort write.
  3. **One `saveSetting`, not eight.** That helper was copy-pasted into every
     settings surface, which was survivable while it only made a request and
     stopped being survivable the moment saving needed to *say* something:
     a confirmation added to one copy is seven screens that do not get one.
     It is `useSaveSetting()` now, and a failure raises an error toast **and
     rethrows**, because the callers roll their optimistic switch back on a
     throw.
  **The bar has to hear about the navigation, and three dashboards were
  silent.** `useRouter` covers every navigation this app starts in code,
  which is why the admin dashboard always had a bar and the other three
  appeared to have none: patient, therapist and hospital move between
  sections with **plain anchors** (a deliberate choice -- client-side
  transitions into a differently-chromed route were silently not completing),
  and a hard navigation never touches the router hook, `useLinkStatus`, or a
  client-side `loading.tsx`. Nothing in React learned a navigation had
  started, so the person sat on the old screen with no acknowledgement at
  all. Two halves fix it, and both are needed:
  - `useLeavingPage()` (`src/lib/useLeavingPage.ts`) marks the page as
    leaving on click. The old document stays on screen until the new one is
    ready, so a bar drawn then is visible for exactly the wait. It is
    **never released on that page** -- the document is about to be torn down
    and the bar goes with it, and releasing on a timer would clear the signal
    while the person was still waiting -- but it **is** released on
    `pageshow`, because a bfcache restore brings the page back exactly as it
    was, bar included.
  - `ProgressLink` (`src/components/system/ProgressLink.tsx`) does the same
    for real `<Link>` navigations, which the public Navbar uses. Next's
    `useLinkStatus` only works *inside* a Link, so the reporter is a child
    component rendering nothing rather than a hook the wrapper could call.
  **And every dynamic route has a `loading.tsx`.** A boundary only at each
  dashboard's root left every sub-route leaning on an ancestor, so the
  fallback was the wrong shape or absent; all seventeen dashboard
  sub-routes and the three admin detail routes have their own now, each
  passing `withSidebar` and a label naming what is coming. **The `@modal`
  slot has one too**, and it is the case both loading signals miss: tapping a
  patient name is a `<Link>` into a parallel-route slot, which is not a
  `useRouter` transition (so no bar) and is not covered by an ancestor
  `loading.tsx` (which wraps the page tree, not a sibling slot) -- so the row
  was tapped, the server spent its render, and nothing acknowledged it. That
  fallback mirrors `DetailOverlayModal`'s own sheet rather than reusing
  `RouteLoading`: what is arriving is an overlay over the dashboard, and a
  full-page skeleton there would read as the dashboard itself being
  replaced. On a hard
  navigation this is what paints first: the server streams the shell and the
  fallback before the page's own queries resolve, so the new screen arrives
  as furniture rather than as a wait. The public marketing pages are
  deliberately left without one -- they are ISR-prerendered, so there is no
  server wait to cover, and the bar handles the transition.
  **Every dashboard carries one Refresh button**
  (`src/components/dashboard/RefreshButton.tsx`), in the header of both
  shells -- so all four get the same control in the same place. It re-runs
  the Server Component and nothing else: a browser reload throws away the
  client state these shells keep on purpose (an open row, a half-typed
  filter, the collapsed sidebar) and re-downloads the bundle, and
  `RealtimeRefresh` only fires for subscribed tables, on the catalog channel
  behind a 30-second cooldown. This is the one control whose own pending
  state **should** span the refresh -- the split above is for a control whose
  request is a different thing from the refresh that follows it, and here the
  refresh *is* the work, so releasing the button early would leave it looking
  idle while what it was asked for was still running. It is disabled while
  pending, because stacking refreshes on the admin dashboard stacks ~40
  queries a tap for no new answer. Where the shell counts changes rather than
  rebuilding for them (the admin dashboard -- see the realtime rule below) it
  also **says how many are waiting**: without that the button asks somebody
  to guess whether there is anything to fetch. Its accessible name stays
  "Refresh this screen" whatever the count, so a screen reader does not meet
  a different control mid-action; the count is announced once by its own
  `role="status"` region.
  `Spinner` (`src/components/system/Spinner.tsx`) is the app's only spinner,
  inheriting `currentColor` so one component works on the filled, outlined
  and text buttons alike. Before it, every busy state was a text swap, which
  reads as a label change rather than as motion.
- **Isolated is not the same as sequential.** The admin dashboard keeps its
  migration-dependent reads out of the big `Promise.all` so one
  unknown-column error costs its own panel rather than the dashboard -- and
  eleven of them had become a chain of `await`s, one round trip after
  another, paid on page load *and* on every `router.refresh()` any admin
  button fires. They are one second `Promise.all` now, each entry still
  swallowing its own error (through a `guard()` wrapper or its own helper),
  so the isolation is unchanged and only the waiting is gone. Add a new
  migration-dependent read to that batch rather than as another `await`
  below it.
  **The same rule caught the page a second time, three blocks lower, and
  those blocks were the whole of its perceived slowness.** Measured against a
  production build with a Master Admin's own session: the response took 7.9s,
  and of that the 56 queries in the two batches above cost **1.2s**. The
  other 5.4s was seventeen `await`s in a row between them and the return --
  the Risk block (7 round trips), the Recommendations queue (7), and the
  authoring panel with `loadRecommendablePackages` inside it (5+3). At ~320ms
  a round trip that is the entire gap, and the arithmetic matched the trace
  almost exactly. None of the three chains is as deep as it is long: the risk
  reads need two waves, the queue's three need one, and the whole authoring
  chain needs nothing from either of the others. So the reads inside each
  block go together, and the authoring chain -- the longest -- is **started
  above the risk block and awaited where it is read**, which is what lets the
  other two run inside its latency rather than after it. 7.9s to 3.5s, with
  the rendered markup byte-for-byte identical (555KB, 9,925 lines, diffed
  both ways) -- this changes only what waits for what.
  Three details are load-bearing. A promise started early and awaited later
  has a window with **no handler attached**, so `authoringDataPromise` takes a
  no-op `.catch()` the moment it is created: without it a rejection during the
  blocks below is reported as an unhandled rejection, which some runtimes
  treat as fatal, and the `await` still throws the real error exactly as an
  inline read did. `canSeeCarePlans` is hoisted above the risk block because
  that chain needs it -- it is `scopeCanOpen(viewerScope, "sessions")` and
  depends on nothing else. And every read keeps its **own** guard and its own
  empty fallback inside the batch (`Promise.resolve({ data: [] })` for a
  skipped one, a `soften()` wrapper where a `try`/`catch` used to sit), so a
  new column that a live database has not got still costs one panel rather
  than the screen.
  **What this is not.** The dashboard's 1.7MB of HTML is 34 screens rendered
  at once, and that is *not* where the time goes: rendering only the active
  screen was measured too, and it cut the response to 135KB while moving the
  wall-clock by 0.4s. Bytes and latency are separate problems here, and the
  "every screen stays mounted" design costs the second one almost nothing.
- **A dashboard refresh is expensive; debounce accordingly.**
  `RealtimeRefresh` turns a `postgres_changes` event into `router.refresh()`,
  which on the admin dashboard re-runs the whole Server Component - ~40
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
  `*_REALTIME_TABLES` arrays rather than inlining a third list - the coverage
  check reads them by that name - and add the matching `alter publication`
  to `schema.sql` in the same change.
  **On the admin dashboard the channels count instead of rebuilding.** Both
  are passed `mode="notify"`, `AdminShell` wraps itself in
  `LiveUpdatesProvider` (`src/lib/liveUpdates.tsx`), and the header's Refresh
  button turns teal and carries the number waiting. Two controls were
  answering the same question and only one of them was asked: a rebuild here
  is ~41 queries and every screen's markup, almost nothing arriving is a
  change the reader is waiting on, and the page moved the list they were
  reading while they read it. The other three dashboards keep
  `mode="refresh"` -- a rebuild there is cheap and the reader usually *is*
  waiting for that row (a patient watching for a therapist's suggested
  time). What it costs is stated rather than hidden: a Today figure can be
  minutes old, and the badge is the sentence saying so. The count clears on
  **any** deliberate refresh, through `onLocalRefresh`, never on the button's
  own click -- a control that mutates and refreshes would otherwise leave a
  count standing for rows it had just fetched. `useLiveUpdates` answers 0
  outside a provider rather than throwing, same posture as `useToast`, so
  `RefreshButton` renders unchanged where nothing counts.
  **A browser does not rebuild for its own work.** Most events reaching an
  open admin dashboard are that dashboard's own writes coming back: a
  control's route changes its row *and* writes an `admin_activity_log`
  entry, and the control has already called `router.refresh()`. Those two
  events then cost two more full rebuilds, the second of them up to the
  catalog channel's 30 seconds later - by which time the admin has forgotten
  the tap and reads it as the page reloading on its own. `useRouter().refresh()`
  stamps `src/lib/refreshSignal.ts` before it starts, and `RealtimeRefresh`
  drops a change that arrived **before** that stamp, since the fetch already
  read it. Three details are load-bearing. It compares timestamps rather than
  tagging events, which is what makes it work across both channels and across
  every control in the app - none of which knows which rows its route
  touched. It tests the **newest** waiting event, not the oldest, so a burst
  whose tail landed after the local refresh still fires. And a *skipped* fire
  does not start a cooldown: counting one would hold the next genuine change
  off for up to 30 seconds for a rebuild that never happened. The suppression
  is one-way - an event arriving *during* an in-flight refresh is newer than
  its start and still fires - so what it can cost is a change by somebody
  else landing in the moment before this browser refreshed for its own
  reason, which that refresh read anyway.
  **And a lazy sweep must not be able to refresh the render that started
  it.** Anything running in the dashboard's `after()` that *writes* a table
  on one of these channels closes a circle: render, write, realtime event,
  render. Every such sweep therefore carries a minimum interval remembered
  per server instance - `runRiskSweep`'s five minutes, and
  `retryDueMeetSyncs` / `retryDueMeetAccess`'s one, claimed only once the
  sweep has found work so an empty backlog never holds off the next one.
  Without it the circle is bounded only by each row's attempt cap, which
  bounds it by spending all five of an appointment's automatic retries inside
  a minute and retiring it to "needs a person" before the transient failure
  it was retrying could clear. `risk_signals` moved to the catalog channel in
  the same change, for the same reason: it is written by that sweep and read
  by a queue an admin opens deliberately.
- **Every admin export offers CSV and PDF, from one column definition.**
  A call site passes `DataExportButtons` the rows it is already rendering
  plus `CsvColumn[]` - never a pre-built string - so the spreadsheet and
  the printable document can't describe different tables. CSV is still
  built in the browser (no dependency, no round trip); the PDF is typeset
  by `/api/admin/export-pdf` (`src/lib/tablePdf.ts`), which keeps pdf-lib
  out of the admin dashboard's client bundle - that page already ships
  every screen at once. That route reads nothing: the caller sends the
  exact filtered rows it rendered, which is what guarantees the two
  formats agree, and it means there is nothing there to scope-check
  beyond being an admin at all. Give every export a `subtitle` naming
  what the rows are scoped to - a printed table nobody can date is
  worthless. Nothing in the admin dashboard exports JSON, and nothing
  should.
- **The log is a section of its own, and clearing it is the one thing that
  takes evidence away.** Logs (`logs` in `adminNav.ts`) is Master Admin only
  -- `SECTION_ACCESS` gives it to `full` at `manage` and to nobody else -- and
  holds two screens. **All Activity** is every entry with a search, a type
  filter, a date range, both exports and the detail dialog; the dashboard's
  render carries the newest 200 and `/api/admin/activity-log` pages the rest
  **by cursor**, never by offset, since rows are written continuously and an
  offset skips whichever entry crossed the boundary mid-scroll. **Archive &
  Clear** is the only delete path this table has ever had, and five things
  hold it:
  1. **A floor no setting can get under.** `MIN_RETENTION_DAYS` (30) is
     checked in `src/lib/activityLog.ts`, again in
     `/api/admin/clear-activity-log`, and again inside
     `purge_admin_activity_log()`. The database half is not belt-and-braces:
     that function is reachable by the service-role key and by hand in the
     SQL editor, where no route check runs. The newest month of the trail --
     where anything worth hiding would be -- is out of reach at every
     setting.
  2. **The clearing is logged, outside its own reach.** `log.clear` is
     written after the purge, with the cutoff and the count, and now is
     inside the protected window, so a clear can never remove the record of a
     clear.
  3. **A copy comes first.** The Clear button unlocks only once a download
     has actually been produced (`DataExportButtons`' `onExported`), not on a
     checkbox saying one was -- a record that is gone and was never kept is
     destroyed; one downloaded first has only been moved.
  4. **The count is taken server-side**, because the screen holds one page
     and a browser-side count would understate what is about to go.
  5. **Nothing here can be edited, and the screens say exactly that.** There
     is still no update path and never should be. The detail dialog's closing
     line was changed in the same change that added the cutoff -- it used to
     promise entries could never be deleted by anyone, and a screen making a
     promise the product stopped keeping is worse than the feature.
  Adding an action means adding it to `ACTION_DOMAIN` as well as the audit
  union: the type filter is derived from that map, so a second grouping of
  the same 80 actions cannot drift from the one the routes enforce.
  **A subject has a timeline, and it is keyed on the id.** Tapping an entry's
  subject fetches every entry against that `target_id`
  (`SubjectTimelineDialog`), because "what happened to this patient" is what
  gets asked in a dispute and the log was only good at "what did this admin
  do". Matching on `target_label` instead would split a patient renamed
  between two entries into two people -- the label is snapshotted at write
  time on purpose. An entry with no `target_id` is offered no timeline rather
  than one built by guessing, and the dialog's footer says what it is keyed
  on rather than claiming to be everything. One dialog is open at a time:
  opening a timeline closes the entry behind it, since two stacked modals
  over a table leave a reader unable to tell which Escape closes what.
  **So each replacement carries the way back itself.** `Modal` takes an
  optional `onBack` (with its own label), the timeline offers "Back to this
  entry", and an entry opened *from* a timeline offers "Back to this
  record's history". Without it the only exit from a dialog that replaced
  another was closing to the table and finding the entry again -- the cost
  of the one-at-a-time rule, paid by the reader rather than by the design.
  `e2e/logs-subject-timeline.spec.ts` is the guard, driven as a screen
  because nothing here is visible to an API test -- the routes are unchanged
  and both dialogs read the same rows either way -- and it skips itself on a
  log whose entries name no record.
  The way back is a real row, never a re-derivation: `timelineOrigin` holds
  the subject row the timeline was keyed on, because rebuilding it from the
  entry now on screen would open a different record's history. An entry
  opened from the table clears it, so no back button points at a timeline
  nobody came from.
- **An audit entry is read months later, so it says what changed from what.**
  Tapping a row in the Logs section -- or on a limited desk's
  Today -> Activity -- opens the whole entry
  (`ActivityDetailDialog`), and `src/lib/activityDetails.ts` turns the
  route's `details` blob into it. Four rules:
  1. **The before/after pair is found, not required.** Routes name it five
     ways -- `from`/`to`, `fromPercent`/`toPercent`, `oldExpiresAt`/
     `newExpiresAt`, `previousStatus` beside `status`, `before`/`after` --
     because each was written where it was needed. `readableDetails()`
     recognises all five (and `previousPaise` beside `amountPaise`, where
     the stem is only a unit), which is cheaper and safer than rewriting
     twenty routes to agree.
  2. **Nothing is dropped.** An unrecognised key is exactly the one somebody
     is looking for, so unpaired fields are listed plainly and the raw JSON
     stays behind a toggle.
  3. **Values are read, not parsed**: paise as rupees, an ISO stamp as a
     date in IST, a boolean as Yes/No, an absent value as a dash. `Paise` is
     a storage word and never reaches the screen.
  4. **Record the values, not that something changed.** `patient.update_contact`
     wrote `{emailChanged: true}` -- an entry saying a patient's sign-in
     address was altered without saying what it had been is unusable for the
     one question it gets asked. Both contact routes record the old and new
     values now. The exception is free text about a person: the four
     note routes record a **length**, deliberately, because this log is
     readable by every admin and a note about one patient must not be
     reproduced across the back office. A generated password still never
     goes in `details` at all.
- **Approvals are a queue, not a person.** Pending signups and profile
  change requests live under Today, beside the inbox that counts them, not
  on the patients directory.
- **One word, one money figure -- and the definition sits beside the
  figure.** "Package cash collected" is what came into the bank up front;
  revenue recognises that same money gradually, one session at a time.
  Gross/Net Revenue keep their standard meanings. If a new figure needs a
  word that is already taken, rename the figure, don't overload the word,
  and if two figures end up with the same meaning delete one rather than
  explaining the difference. (The Costs screen's `Payment fees` was that
  collision: it printed the gateway *percentage* under the name Summary uses
  for the resulting *amount*. It is `Gateway fee %` now.)
  The vocabulary itself lives in `src/lib/moneyTerms.ts`, read by two
  surfaces that must not disagree: `MoneyGlossary` (still at the foot of
  every Money screen) and the `(i)` on each figure (`MoneyFigure` /
  `MoneyTermInfo`). A glossary at the bottom of the screen puts the
  definition as far as the page allows from the number that needs it, so it
  is the fallback for reading the whole set, not the answer. Add a figure by
  adding its term there -- `moneyTerms.test.ts` fails a term with no entry,
  a duplicate name, or a missing scope.
  **`scope` is part of a figure's definition, not a sentence somebody
  remembers to write.** `range` moves with the dates in view, `now` is true
  this instant (a debt does not stop existing outside a filter), `setting`
  is a rate rather than an amount. It prints as a chip -- `StatCell.scopeNote`
  in a strip, `ScopeChip` on a card -- wherever the two kinds sit together,
  because an admin narrowing the range and watching one figure fall while
  the one beside it holds still is reading a screen that looks half-broken.
  **A total can be opened.** Each of Summary's four split figures has a "See
  the sessions" link listing exactly the rows behind it (`explainMoneyLines`
  in `adminMetrics.ts`, rendered by one modal for all four -- four modals
  would be four chances to filter differently from the card that opened
  them). It is derived from `moneyLineFor`, which `moneyByBucketFor` itself
  calls, so the drill-down and the total are the same arithmetic rather than
  two implementations that agree today; `adminMetrics.test.ts` asserts the
  lines sum to the buckets. A drill-down that can disagree with its own total
  is worse than none, because it makes a correct figure look wrong.
  The drill-down exports like every other table (one `CsvColumn[]`, both
  formats), and Net revenue carries `comparePeriod()` against `previousRange()`
  -- the same number of days immediately before, never a calendar month
  against a 30-day window, which would move the figure by the number of days
  rather than by the business. Two refusals in that helper are the point of
  it: a zero baseline yields **no** percentage (`+100%` and `∞` are both
  lies), and a move under half a percent reads "level" rather than drawing an
  arrow over noise an owner will learn to ignore.
  **Money answers "is anything wrong?" too.** `src/lib/moneyAlerts.ts` +
  `MoneyAlertsStrip` sit at the top of all five Money screens: payout
  requests waiting, cash a therapist is holding, refunds to hand back by
  hand, payments attached to nothing. Cash collected a month ago and never
  handed over is not a wrong number on any screen -- it is money that is
  simply not there -- so no figure could have surfaced it. Same rules as the
  admin home's actions: a zero row is dropped, an item whose section this
  scope cannot open is dropped rather than linked into `findTab`'s fallback,
  and every item links to the rows it counted.
  **A figure appears once per screen.** Summary printed Net revenue twice,
  Clinic share three times and Operating profit twice, because its strip
  repeated the chain below it. The strip is the answers now (net revenue,
  operating profit, what is owed, cash collected up front); the two blocks
  under it are the subtraction, where carrying a figure down from the block
  above is the point rather than a repeat.
- **The revenue split has one source and two invariants.**
  `moneyByBucketFor` (`src/lib/adminMetrics.ts`) is the only place the
  clinic's money is divided up, so the strip, the tiles and the breakdown
  chart cannot disagree. Two identities must always hold:
  `net = gross - refunds` and
  `clinic share = splittable net - therapists' share - partners' share`.
  Three rules decide the split, each one a correction of a real
  misstatement:
  1. A therapist's share is earned by **delivering**, not by being booked -
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
  3. **Refunds reverse the partner's commission, not the therapist's** - a
     refunded session was cancelled, so it never earned a therapist share,
     and a hospital's cut is taken on net revenue. This is what lets the
     clinic share be exact instead of the "approximate" figure it used to
     be labelled.
  Revenue and the split have **different eligibility**: gross, refunds and
  net count every paid session, while a session whose split is unknowable
  (no therapist share set, or a partner with no share configured) is
  excluded from the split alone and surfaced as a named count. Never guess
  a percentage to make the numbers tie.
- **The seven standard finance figures are a screen, and three of them stand
  on numbers this app cannot know.** Money -> Business Health reports return
  on investment, return on ad spend, working capital, both profit margins,
  EBITDA, break-even and revenue run rate. The maths is dependency-free in
  `src/lib/financeMetrics.ts`; the screen draws what it returns and derives
  nothing of its own. Revenue and the split come from `moneyByBucketFor` and
  `gatewayFeePaise` -- the same functions Summary reads -- so the two screens
  cannot disagree about what the clinic earned. Six rules hold it:
  1. **A figure that cannot be worked out is null, never zero**, and the card
     says which input is missing and links to the screen that takes it. ROI
     with nothing invested, ROAS with nothing traceable, a break-even where a
     session leaves nothing towards the fixed costs: each is a refusal with a
     sentence. A zero is read as a measurement and acted on -- the same
     reasoning `comparePeriod` refuses a percentage off a zero baseline.
  2. **Nothing is inferred from a label.** What kind of cost something is
     (`business_expenses.cost_class`), whether a write-off is depreciation or
     amortization, which campaign a booking came from -- all recorded columns,
     never guessed from wording somebody will reword. `cost_class` defaults to
     `fixed`, which is what every row predating the column already was, so no
     figure moved when it shipped; it is read in its own query and merged, so
     an unmigrated database still lists every cost.
  3. **Advertising revenue is traced or it does not exist.** A campaign is
     traced by a promo code, and is then worth exactly the net revenue of the
     bookings that claimed it -- read off the same `MoneyLine`s the profit
     figures are built from. Untraceable spend is held **out** of the
     division and stated separately, because leaving it in the denominator
     reports a campaign as a failure for the sole reason that nobody tagged
     it. A hand-entered figure is allowed (an ad that makes the phone ring is
     real and invisible here) and is labelled as the owner's own wherever it
     shows. Spend is pro-rated across the campaign's own days; an open-ended
     one runs to today, never to the end of the range in view, or one row
     would read as a different daily budget every time somebody moved the
     dates.
  4. **Working capital counts what the clinic already owes as care.** Money
     taken for sessions not yet delivered is a current liability
     (`unusedPaidValuePaise`, valued at what was actually paid, never at the
     live catalogue price), alongside what therapists are owed, cash they are
     holding and refunds still to hand back. It is a dated snapshot, not a
     period: every hand-entered row sharing an `as_of` is one snapshot and the
     most recent at or before the range end is the one read, so entering this
     month's bank balance does not erase last month's.
  5. **The three `finance_cogs_*` switches change a reading, never a total.**
     Moving the therapists' share, the partners' share or the payment fees
     between cost of delivery and overhead moves the gross-margin line and
     leaves operating income and net profit untouched -- asserted in
     `financeMetrics.test.ts`, because a switch that moved the bottom line
     would be a way to report a different profit.
  6. **A dimension filter narrows revenue, not costs.** Rent is not
     attributable to a therapist, so a filtered profit figure compares one
     slice's revenue with the whole clinic's costs. The screen says so in an
     amber line while any filter is on rather than leaving somebody to read it
     by accident.
  Adding a figure means a `financeMetrics` function with its own test, a
  `MONEY_TERMS` entry carrying `formula` and `source` as well as `meaning`,
  and a card on the screen -- never arithmetic inside the component.

- **Only one figure may be called profit, and only because costs exist.**
  `clinic share` is what net revenue leaves after the therapist and partner
  splits - a gross figure. **Operating profit** is that less the two cost
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
  live under **Sessions → Delivery**, not Money - a no-show rate is about
  how the clinic runs, not about its books. `AdminMetricsTab` renders all
  three slices (`summary`, `breakdown`, `delivery`) off one pass of the
  same maths, so adding a figure means choosing which question it answers,
  not duplicating a calculation.
- **A balance is never date-filtered.** "Owed to therapists" is all-time and
  net of cash held, matching the Payouts screen and what the Pay button
  actually transfers - scoping it to the range in view let an admin read
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
  `src/lib/adminSettings.ts` with defaults - don't hardcode these.

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
  **The rule is wider than booking: a patient-dashboard route answers a
  patient.** An audit found three that did not check --
  `/api/patient/dismiss-onboarding`, `previous-therapists` and
  `condition-profile/export` -- each answering a therapist or hospital
  session with a 200. All three act on the caller's **own** row, so nothing
  cross-account leaked, and that is exactly why it survived: the reach was
  "the wrong role got an empty answer" rather than anything alarming. The
  export was the sharpest, handing a non-patient a typeset PDF of an empty
  health record named after them. They call `isPatientProfile` now.
  `previous-therapists` had no `active` check either, which is the same gap
  the eight-route sweep closed elsewhere -- a grep for the helper name is how
  the next audit finds the next one.

- **An admin can sign in as somebody, and that is a session swap rather than
  a preview.** A Master Admin opens a patient's, therapist's or partner hospital's
  dashboard -- the first two from their profile page, a hospital from its card
  on People -> Partners, which is where a hospital's record lives -- and the
  browser genuinely becomes that account: same
  routes, same data, same controls, every write real. It exists because "the
  app is broken for me" is unanswerable from the back office, which shows an
  admin's view of a patient rather than the patient's own.
  It is the most dangerous capability in this codebase, so the rules live in
  `src/lib/impersonation.ts` -- dependency-free and unit-tested rather than
  only clicked -- and there are five:
  1. **`full` scope only, checked directly.** Not
     `requireAdminScope("people")`: a section scope would hand this to
     whoever can edit a phone number. Never another admin (that is one admin
     using another's authority, and an admin in trouble can be asked what
     they see), never a suspended account, never yourself.
  2. **A real reason, ten characters** -- the floor an admin credit
     adjustment uses -- stored on `admin_impersonation_sessions`, which is
     append-only by trigger apart from being closed once, so the admin it
     names cannot rewrite it. **The row is written before the swap**, so a
     session with no record behind it cannot exist; a failed insert refuses
     the whole thing, the same posture as `/api/therapist/reveal-contact`.
  3. **Everything done during the window is written as that user.** No column
     on `appointments` -- or anywhere else -- can say an admin was at the
     keyboard, so that row's `started_at`/`ended_at` window is the only thing
     a later reader can intersect an action against. That is a real cost of
     the swap, accepted deliberately: a read-only mirror cannot reproduce a
     bug that only appears on submit.
  4. **It expires, and the proxy is what ends it.** The marker cookie and the
     Supabase session cookies are separate things, so letting the marker
     lapse on its own max-age would drop the banner while the swap ran on
     underneath it. `updateSession` checks the window on every dashboard
     request and signs out past it -- a forgotten tab is an open window into
     a health record, and the safe direction for one is closed.
  5. **The banner is the only thing that differs from what they see**, so it
     sits above every dashboard screen (`ImpersonationGate`, a layout on each
     of the three trees -- never the root layout, which is shared with the
     ISR-cached public pages and would be forced dynamic by reading a
     cookie). It names the account, says the actions are real, counts the
     window down and carries Exit.
  The admin's own session is parked in a second httpOnly cookie so Exit puts
  them back; losing it costs a re-login and nothing else, which is the right
  direction for a failure here. `/api/admin/stop-impersonation` is authorized
  by the marker cookie rather than an admin check, deliberately: the caller
  is signed in as the patient at that point, so `getAdminContext()` would
  refuse the one person entitled to call it.

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
  **A response body names the back office too.**
  `/api/admin/stop-impersonation` answered `{"redirectTo":
  "/admin/dashboard"}` to an **anonymous** caller: it runs no admin check by
  design (the caller is signed in as the patient at that point, so
  `getAdminContext()` would refuse the one person entitled to call it), so
  the no-marker branch was reachable by anybody and told them where the back
  office is. Its other exit did the same with `/admin/login` for anyone who
  sent a forged marker, which is trivial since the marker is unsigned JSON.
  Both answer `/dashboard` now unless the caller has been **shown** to be the
  admin -- a restore token that actually exchanged, or a marker matching its
  own `admin_impersonation_sessions` row, which is a row the admin it names
  cannot write. `/dashboard` resolves the role server-side and sends a
  stranger to `/get-started`, which is the whole reason that route exists.
  Check what a route *says* as well as what it lets you do.

- **The way back in is one rule, not one per surface.**
  `useAccountDestination()` (`src/lib/useAccountDestination.ts`) answers
  "where does this account go, and what do I call it", and both surfaces that
  offer somebody a route back into the app read it: the public `Navbar` and
  the booking wizard's exit link. Two copies of that logic is two chances to
  send a patient somewhere the label did not name. It resolves on the client
  deliberately -- `/book` and `/book-home-visit` are ISR-cached, and reading
  the session server-side would force every one of those pages dynamic to
  answer a question about one link.
  It returns **`signedIn` separately from `destination`**, and that
  separation is load-bearing: both are null while the session is still being
  read, and a caller that swaps one control for another needs to tell "not
  signed in" from "not known yet". Collapsing them showed Sign In and Get
  Started to somebody who was already signed in.
  **The booking wizard's exit follows the account.** It read *Back to Home*
  always, which is right for a visitor who arrived from the marketing site
  and wrong for the commonest case -- a patient who came from their own
  dashboard to book, and was being sent to the public home page. Signed out
  it still says Back to Home (or Back to Home Visit, per wizard); signed in
  it says **Back to Dashboard** and goes there, or names the waiting screen
  when that is where the account actually lands. It stays outside the wizard
  so it covers every one of its states without being repeated four times.
- **A signed-in person always has a way back in.** The public `Navbar` hides
  Sign In and Get Started once somebody is signed in, so whatever replaces
  them is the only route back into the app from the marketing site. It used
  to be one boolean: an account waiting on approval, or suspended, got
  **nothing** -- the two CTAs gone because they are signed in, and no button
  in their place -- which is how an unapproved patient ends up on the home
  page with no way forward at all. The reasoning was sound and the fix was
  the wrong half: the button was dropped to avoid a round trip through
  `/dashboard`, when the round trip is what wanted removing.
  It is three destinations now, from the same `approved`/`active` pair the
  proxy enforces on, each linked **directly**: `/dashboard` ("Go to
  Dashboard"), `/pending-approval` ("Approval pending"), `/account-suspended`
  ("Account suspended"). Suspended is checked first, since an account can be
  both and the suspension decides where they land. The label names the real
  destination -- a button reading "Go to Dashboard" that opens a waiting
  screen is the "never tell someone they did something they did not do" rule
  in its navigational form. It starts **null** so a slow lookup offers
  nothing rather than briefly offering the wrong thing -- but a lookup that
  *finishes* badly, a read error or a row that is not there, falls back to
  `/dashboard` rather than staying null. Null forever is the original bug in
  its failure case: the navbar hides Sign In the moment somebody is signed
  in, so a dead profile read left them with no Sign In **and** no
  destination, stranded on the marketing site. `/dashboard` resolves the role
  server-side and the proxy carries an unapproved or suspended account onward
  from there, so the fallback is always correct and only ever one hop longer.
  `/pending-approval` and `/account-suspended` are in
  `AUTH_CTA_HIDDEN_ROUTES` so the button never points at the page it is on.
- **Every dashboard needs a way back to the public site.** All four are in
  `NAV_HIDDEN_ROUTES`, so the public `Navbar` never renders there; without an
  explicit link the only exit is Log Out, which also ends the session. Both
  shells (`dashboard/DashboardShell.tsx`, `admin/AdminShell.tsx`) carry a
  **Back to Home** entry in all three renders
  (expanded, collapsed rail, mobile drawer). It is a plain `<a>`, not
  `next/link`, for the reason the nav entries document: client-side
  transitions into a differently-chromed route were silently not completing.

- **A referral carries a phone number, because the clinic rings before it
  links.** `patient_referrals.patient_phone` is collected on the hospital's
  own form (required, validated through `PhoneNumberField` /
  `isValidStoredPhone` like every other number in the app) and rendered with
  `preferred_language` directly under the patient's name on Admin → People →
  Partners → Patient Referrals. A referral is the one flow where the clinic
  must reach someone who has no account yet: the admin agrees a time with
  them and only then sends the registration link. The column is nullable -
  every referral already on file predates it - and is read in its **own
  isolated query** on the admin dashboard, so a database without the
  migration loses the number on the card rather than the capacity note
  beside it or the referral list itself.

- **A therapist chosen on `/team` is a request, not an assignment.**
  `/book?therapist=<id>` resolves the id against `public_therapist_profiles`
  (client-side, since `/book` is ISR-cached) and writes
  `appointments.preferred_therapist_id` - the same field the wizard's
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
  an inline blocking script in the document head, not by an effect - an
  effect runs after first paint, so the greeting would land on top of a page
  the visitor can already read, which looks like a fault. The overlay's
  markup is in every page's HTML and never changes; visibility is entirely a
  `data-splash` attribute on `<html>` read by CSS, because deciding it in
  React state is a hydration mismatch on every page of the app (that
  attribute is also why `<html>` carries `suppressHydrationWarning` - it
  covers that one element, never a descendant). And the fade duration lives
  in both `globals.css` and `SPLASH_FADE_MS`: the timer is what takes the
  sheet out of the flow, so the two drifting apart either cuts the fade
  short or leaves an invisible sheet eating clicks. Anyone who has asked for
  reduced motion is skipped outright - it is decoration over content that is
  already rendered, so the honest answer to "don't animate" is not to show
  it. The name line, the wording, the hold and the away threshold are
  admin-configurable
  (`site_settings.splash_*`, Settings → Public Site → Opening Splash), and
  `splash_brand_line` is blank by default and falls back to `site_name`, so
  the greeting and the navbar say one thing until an admin deliberately
  parts them - it is the one text setting where blank is a value rather than
  an error, since blank is how the override is undone.
  `splash_revisit_minutes = 0` means "greet the first load only" - there is
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
  the same way on purpose - wherever a visitor stops reading, the next step
  is in the same place. Before adding a bespoke block to one page, check
  whether a `Section` plus `PhotoTile`/`IconCard`/`SplitFeature` already says
  it; the old pages each grew their own hero and their own closing block,
  and the result read as seven different sites.
- **The closing band asks for the sale, so it shows the sale.** `ClosingCta`
  is the last thing on seven of the eight pages (`/hospitals` ends on its
  referral form instead), and it was the only band made of nothing but text
  on a dark panel - a wall of words at the exact moment somebody is deciding
  whether to spend money. It carries a photograph like every other band, and
  the photograph is deliberately **not** of treatment: it is of the thing
  being asked for, someone at home smiling as she books on her phone. What a
  visitor is being asked to do is two minutes on a screen, and showing that
  argues better than another sentence saying it. The confirmation chip over
  it is the same argument once more - it shows what the next screen gives
  back rather than asking anyone to imagine it, and it labels itself an
  example **in the component**, so no page can render it as a real booking.
  Three rules keep it honest. **Each page names its own photograph, and the
  band has its own set of them** - the seven `cta-*` files in
  `marketingPhotos.ts`, which nothing else uses. The band's shape is
  identical everywhere, so the invitation is still one invitation and only
  the face changes; one image repeated seven times read as a template
  stamped on the end of each page, and reusing the *existing* photographs
  instead was no better, since those were shot for the heroes and the care
  bands and a visitor met a face they had already scrolled past. Each one
  answers that page's own question: `/team` a clinician opening a session,
  `/home-visit` a couple booking from their front room, `/faq` a patient
  reading her phone. The component's default is the fallback for a page that
  names nothing, not the house style. The image gets a **fixed** aspect
  (`4/3`, `5/4` at lg) rather than the photograph's own, or a portrait crop
  leaves the band mostly empty teal beside four lines of copy. And the
  assurance lines under the buttons are the **non-numeric** trust points
  only: a session's length is per-category and the cancellation window is an
  admin setting, so printing either as a fixed number in the one band that
  reads as a promise is the "don't hardcode admin-configurable behaviour"
  rule broken where it costs most.
- **One idea per band, and a hard word budget.** The rewrite exists because
  visitors could not tell what the site was, and the second round of feedback
  was that there was still too much to read. So the budgets are numbers, not
  a vibe, and they are the tightest thing on the site:

  | Slot | Budget |
  | --- | --- |
  | Hero subtitle | 12 words |
  | `Section` lede | 9 words - and drop it entirely when the heading already says it |
  | `IconCard` / `StepStrip` / `SplitFeature` body | 10 words |
  | `SplitFeature` bullet, `CareArea` check | 5 words |
  | `CareArea` blurb | 8 words · `detail` | 14 words |
  | `MarketingPage` blurb | 8 words |
  | `ClosingCta` body | 12 words |
  | Mission / vision sentence | 15 words |

  `Section` takes an eyebrow, a heading of a few words and **one** `lede`, and
  has no slot for a second paragraph. A lede that restates its heading is
  worse than no lede - several were deleted outright rather than shortened.
  If a card needs a paragraph it is a band of its own; if a band needs two
  ideas it is two bands. Don't reintroduce prose by passing a long string to
  `lede`.

- **The photograph is load-bearing, not decoration.** A visitor should be
  able to tell what a page is about with the text blurred out, which is why
  `PageHero` requires `photo` and `alt` rather than accepting a page with no
  image. Every photo is a static import through `src/lib/marketingPhotos.ts`
  (real dimensions at build time, generated blur placeholder, a missing file
  is a compile error) - never a `/photos/x.jpg` string, and never a remote
  URL. Pages name a `PhotoId`; only that one module imports the files. The
  images under `public/photos/` are licence-free stock and are meant to be
  replaced with the clinic's own photography: drop a file of roughly the same
  aspect ratio over the existing name and nothing else changes.
- **Every photograph shows a screen, except the two home-visit ones.** This
  clinic sells video consultations; home visits are the one in-person mode.
  The first pass used clinic photography throughout and the whole site read
  as a walk-in practice, which is the opposite of what it is. So every image
  has a laptop, tablet or phone in frame - a patient exercising to a laptop,
  a clinician with the patient live on screen, a scan marked up on a tablet -
  and only `hero-home-visit` and `mode-home-visit` show hands-on treatment.
  A new photo that cannot show a device is the wrong photo for this site.
  Crops are the trap: `public/photos/` files are pre-cropped, and a source
  with the laptop low in frame loses it to a centre crop, which silently
  turns an online photo back into a clinic one. Check the cropped file, not
  the original.
- **Every photograph shows a face, and the face is glad to be there.** Stock
  read as untrustworthy while the shots were backs of heads, hands on a
  phone, and an empty desk with a laptop on it - a patient cannot tell what a
  service is from a photo with nobody in it. So each image shows a real
  person, face visible, in a warm expression: a patient mid-session who looks
  glad to be there, or the clinician they are talking to. The one exception
  is the clinician reading a scan (`reports`), who is concentrating, because
  a physiotherapist grinning at an X-ray is the opposite of reassuring. A
  cropped-off head or a torso-only frame fails this rule as surely as a
  missing device does - check both in the cropped file.
- **`photoAlt` describes the picture; `blurb` describes the page.** Both
  `MarketingPage` and `CareArea` carry the two separately because the grids
  used to pass the blurb as `alt`, which announced the same sentence twice to
  a screen reader and said nothing about the image itself.
- **Every Explore band ends on booking, and its rows square up.**
  `BOOK_CONNECTOR` was on the home page's grid alone, so the six inner pages
  ended their index on another page to read -- the one band still answering
  "what now?" with "here is more to look at", on a site whose whole shape is
  that the next step is always in the same place. `exploreConnectors()` is
  the one list both use now.
  The tiles above it are squared up by arithmetic rather than by a
  hand-placed exception (`src/lib/exploreGridSpans.ts`), because the count
  moves: the page being read is always missing and Home Visit drops out when
  the switch is off, so which row ends short is not something a fixed rule
  can know. Seven tiles in three columns left the seventh alone beside two
  dead cells. Two details are load-bearing. The large breakpoint is a
  **six**-column grid with tiles spanning two -- the same three-across
  layout, but two leftover tiles can then take half the row each, where a
  literal three-column grid would need 1.5 columns and could only offer a
  gap. And `wide` (photo beside text) is applied only when a tile fills the
  row at **every** multi-column breakpoint: one that is full width on a
  tablet and half width on a desktop would change shape between them and
  read as two designs.
- **The site's own index lives in `src/lib/marketingNav.ts`.** The header
  nav, the footer's Explore column, the home page's connector grid and the
  "Where to go next" strip on the other six pages all read that one array, so
  a page cannot exist in the header and be missing from the index, and a
  renamed page cannot leave a stale description behind. It is the public-site
  counterpart of `adminNav.ts`. `blurb` is one short line in a patient's
  words - a page whose blurb needs two sentences is doing two jobs. Home
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
  does neither - photograph left, the answer right, the other five one tap
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
  JourneySteps' "How the process works" - `e2e/journey-pace.spec.ts` finds
  that widget by its label, and two tablists sharing a name makes both
  unfindable.

- **A section rail entry must match a section that renders, in DOM order.**
  Each public page still passes `SectionNav` a list built from what actually
  rendered - several bands are conditional on admin-controlled catalog data -
  and the bottom-right scroll arrow walks that list top to bottom, so an
  entry out of order sends the arrow backwards. `e2e/section-nav.spec.ts`
  reads the rail's own buttons rather than a hardcoded list, which is what
  lets these pages change shape without the spec changing with them.

- **Every catalog card has a cover slot, and one component owns the empty
  state.** Programmes, session packages and home-visit packages are all
  admin-created rows with a nullable `image_url`, so all three need an answer
  for "no photo yet" - and all three had a different one, at different
  heights, which read as three components rather than one catalog.
  `CatalogImage` is now that slot: the photo when set, otherwise the same
  tinted panel at the same height with the row's own illustration. A card with
  no photograph must look like one whose photo has not been chosen yet, never
  like one whose image failed to load. `treatment_categories.image_url` is the
  newest of the three (end of `schema.sql`), so it is read in its own isolated
  query on `/`, `/conditions` and the admin dashboard and merged in - the
  admin's batch is one `Promise.all` of ~40 queries, where an unknown-column
  error would blank the dashboard rather than one cover. The field is a plain
  URL an admin pastes, not a Storage object: these are public marketing images
  with nothing to sign, and a bucket would mean an upload pipeline to
  maintain. Rendered through a plain `<img>`, since optimising it would need a
  `remotePatterns` allowlist for every host an admin might paste from.
- **A catalog cover is uploaded, and positioned rather than cropped.** The
  three catalog tables carried `image_url` as a text box an admin pasted a
  link into, and that cost twice: in practice nobody pastes links, so the live
  site shipped with no photographs and the cards read as unfinished -- and
  every cover that did exist depended on a host this clinic does not control,
  on pages selling medical care. Uploads land in the clinic's own public
  `catalog-images` bucket through `/api/admin/upload-catalog-image`.
  Four things are load-bearing:
  1. **It is a route, not a browser-side upload.** `avatars` is written from
     the owner's browser because the owner is the only person allowed to write
     there and a storage policy can say exactly that. A catalog cover has no
     such owner -- the rule is "an admin who can manage the catalogue", a
     scope this app enforces in routes and not in RLS. The route is what makes
     the upload scope-guarded, size- and type-checked against one shared
     definition (`src/lib/catalogImage.ts`), and audited. The bucket
     accordingly carries **no insert policy at all**, only a public select.
  2. **A focal point, never a crop.** `image_focal_x` / `image_focal_y` (0-100,
     default 50) render as `object-position`. A cover is drawn with
     `object-fit: cover`, and the card is 4:3 where the detail dialog is 16:9
     -- so a photograph whose subject was not dead centre lost a head to one
     of them, which is what "the images look badly aligned" was. Cropping
     would bake one ratio into the file and make the other wrong, and changing
     either shape later would mean re-uploading the whole catalogue; two
     percentages are correct at every ratio, including ratios added after the
     upload. Default 50/50 is exactly what `object-fit` already does, so the
     migration moves no existing pixel.
  3. **`clampFocal` checks null and `""` before `Number()`.** Both become `0`
     rather than `NaN`, so without that an unset column would not centre a
     picture -- it would pin it to the top-left corner. That is the precise
     failure the function exists to prevent, arriving through its commonest
     input, and its own test is what caught it.
  4. **The upload clears all three extensions before writing.** Upsert alone
     overwrites a JPG with a JPG and leaves a stale PNG beside it, and then
     one row owns two covers with nothing ever removing the loser. There is no
     sweeper in this deployment to tidy that up later.
  The focal columns are written through `writeCatalogFocal`'s own isolated
  call and read in their own queries, **split from `image_url` rather than
  sharing one**: they are newer, so a single query would lose the photographs
  as well as their positions on a database mid-migration.
- **One card for everything the clinic sells, and one dialog header.**
  `CatalogCard` renders the programme cards on `/` and `/conditions`, the
  home-visit cards on `/home-visit`, and the patient dashboard's booking
  screen -- which was a text-only list before, so a patient who had already
  signed up met a plainer catalogue than a stranger did. The cover is an inset
  4:3 rather than a 104px full-bleed strip (a strip that shallow cannot hold a
  photograph of a person, which is why covers looked mis-cropped however they
  were shot); the meta chips are a **promotion, not an addition**, since
  duration, visit count, travel and therapist lock already existed on the row
  and were readable only by opening the dialog; the price sits on `mt-auto` so
  cards in a row align however long their titles run; and the two actions
  differ by weight rather than being two similar links. A field a row does not
  have simply does not render, which is what lets one component serve a
  treatment category, a multi-visit home package and a dashboard tile with no
  variants. It links with **`ProgressLink`, not `next/link`** -- the booking
  hub used it, and a Link click never touches `useRouter`, so plain `next/link`
  would have left the hub tapping through to the wizard with no teal bar.
  `CatalogDialogHeader` is the other half and fixes a real gap: the programme
  dialog never read `image_url` **at all** -- it drew a teal panel and a vector
  illustration -- so the moment admins could upload photographs, a card would
  show one and its own dialog a cartoon, one tap apart. The home-visit dialog
  did show the picture but laid its heading over it, which costs a scrim dark
  enough for any image and a heading sized to fight it. Now the photograph
  gets the full 16:9 with **nothing on top** and the heading sits on its own
  band below, so a bright cover and a dark one are equally safe and an admin
  can upload whatever they have. The badge moves into that band: it gains
  contrast and loses a little prominence, which is what the clean picture
  costs. `e2e/catalog-cover-image.spec.ts` asserts the heading sits below the
  image **geometrically** rather than by class name, so a restyle that puts
  text back over the photograph fails even if the markup changes shape.
- **The home page leads with four, and the full list is one tap away.** It
  rendered every active condition -- ten cards and climbing -- so the page
  whose job is to say what this clinic *is* spent most of its length being an
  index of itself. `treatment_categories.featured` and
  `home_visit_packages.featured` pick which four lead, ticked on the admin's
  own Conditions and Home Visit screens; `pickFeatured()` in
  `src/lib/catalogFeatured.ts` is the rule, dependency-free so a judgement
  about what a visitor sees is unit-tested rather than only clicked. Five
  things hold it:
  1. **Admin-chosen, never computed from sales.** "Most bought" is the
     intention, but a home page that rearranges itself when a booking lands
     changes without anybody deciding, and a newly added condition could
     never reach it until it had already sold -- backwards for the page that
     exists to sell it.
  2. **Nothing ticked falls back to the first four.** An empty band reads as
     the clinic having shut, not as a setting nobody has set; it is also what
     makes shipping the column and the UI in one change safe, since every row
     is `false` until an admin opens the screen.
  3. **More ticked than the limit is not an error**, and the cap is stated on
     the screen that sets it rather than discovered on the live site.
  4. **The two pages differ because their lists do.** `/` links on to
     `/conditions`, which still shows everything; `/home-visit` reveals the
     rest in place, because it *is* its own full list and has nowhere to send
     anybody. `hasMore` gates both -- a control opening a list identical to
     the one above it is a dead end with a label on it.
  5. **`featured` is not `highlight`.** The home-visit form already had a
     control labelled "Feature this package" that drew the teal ring; it
     reads "Highlight with a ring" now. Two controls called Feature, meaning
     different things, is the one-word-one-concept rule broken in the one
     place an admin meets both.
  The patient dashboard's booking hub deliberately keeps showing everything:
  it is the screen somebody opens *to* book, so trimming it hides what they
  came for.
  **A revalidate belongs after the isolated writes, not before them.** Both
  home-visit catalog routes called `revalidatePath("/home-visit")` before
  `writeCatalogFocal`, so the page was rebuilt from the row as it was a
  moment earlier and a repositioned cover waited out the full ISR window --
  the exact failure the revalidate exists to prevent, in the call that exists
  to prevent it.

- **Ordering a list is one save of the whole list, never a pairwise swap.**
  The Conditions screen moved a category by swapping two rows'
  `display_order` values. Two rows holding the *same* order swapped to the
  same two numbers, so the write succeeded and changed nothing - and the
  admin create form defaulted Order to `0`, which made equal orders the norm
  rather than the exception. The optimistic list showed the move, the next
  render put it back, and the public pages never changed. The arrows now
  rearrange client-side only and **Save order** posts the whole id list to
  `/api/admin/reorder-treatment-categories`, which renumbers `1..n` by array
  position in `set_treatment_category_order()` - a total order ties cannot
  express. Three rules came out of it: the button is **always rendered and
  only enabled when something moved**, so saving is visibly the step that
  publishes; the route **refuses a list that does not cover every row**
  (409), since renumbering a subset collides with the rows it never saw --
  and so does `set_treatment_category_order()` itself, because that route
  check is true only for as long as every caller remembers it and the
  function is reachable by the service-role client and by hand in the SQL
  editor; reordering one of two categories left both at 1 on a scratch
  database, which is the tie the whole change removes, put back; and
  a new category is created at `max(display_order) + 1` rather than `0`, so
  it appends instead of landing on top of everything at the same number.
  Build a future reorder control the same way rather than reintroducing a
  swap.
- **A delete that removed nothing is not a success.** `supabase-js` reports
  no error when a DELETE matches zero rows, so
  `/api/admin/delete-treatment-category` answered `{ success: true }` for a
  refusal, for a row somebody else had already deleted, and for a real
  deletion alike -- and the screen, told it had worked, refreshed and painted
  the condition still sitting there. "Delete does nothing and nothing says
  why" is the least actionable failure a screen can produce. Three rules,
  and they apply to any delete of a row other rows point at:
  1. **Count the blockers first, and name them.** The foreign keys here
     (`appointments`, `patient_package_purchases`, `home_visit_packages`,
     `appointment_reassignment_log`) carry no ON DELETE behaviour, so
     Postgres refuses outright. `describeCategoryBlockers()` in
     `src/lib/categoryDeletion.ts` turns the counts into the sentence, with
     the alternative (turn it off) named -- "it has bookings" sends an admin
     to delete sessions and be refused a second time by a home-visit package
     they were never told about.
  2. **Ask for the row back** (`.delete().eq(...).select("id")`), so
     "removed nothing" is distinguishable from "removed it". Nothing removed
     and nothing blocking is a 500 saying so, never a success: at that point
     the app does not know what happened and must not claim it worked.
  3. **A refusal that is a paragraph belongs in a dialog.** This one was an
     11px line clipped to 160px beside the button, which is how a refusal
     that did fire gets reported as a delete that did nothing. The `fetch`
     is wrapped too -- a request dying on a bad connection threw inside the
     transition and put nothing on screen at all.

- **`/team` is a public page too, and three more routes change it.** The
  rule below was applied to catalog and content edits and missed the one
  table whose *account* state decides what the public sees:
  `public_therapist_profiles` requires `approved and active and
  visible_on_team`, so suspending a therapist takes them off `/team` -- but
  `set-therapist-active` never invalidated it, and the page went on serving
  a suspended clinician until the ISR window happened to lapse. `approve-
  account` and `create-account` have the same reach in the other direction,
  since `visible_on_team` defaults to true and a therapist created or
  approved belongs there at once. All three call `revalidatePath("/team")`
  now, the two shared routes only when the row is a therapist -- a patient
  would throw away a cached page for nothing. `decline-account` deliberately
  does not: a declined account is still unapproved, so it was never on that
  page to remove.
  **A control that cannot change what anyone sees says so.** The same three
  columns mean the "Hide from /team page" button is only the deciding one
  while the other two hold. It is disabled for a suspended or unapproved
  therapist and names which of the two is the reason, rather than offering
  an action that would change nothing. The stored setting is left untouched,
  so restoring the account brings the therapist back to whatever the admin
  had chosen rather than to a default.
- **An admin write that a public page renders must invalidate that page.**
  `/`, `/conditions`, `/book`, `/faq`, `/mission` and `/team` are ISR-cached
  (`export const revalidate = 300`), so a catalog or content edit was
  invisible on the live site for up to five minutes - which reads as a save
  that silently failed, and is how the same edit gets made twice. Every
  admin route writing `treatment_categories`, `faqs`, `testimonials` or the
  rating-visibility settings now calls `revalidatePath` for each page that
  reads it, the way the home-visit routes always have. Adding a public
  surface for an admin-editable table means adding its path to those routes
  in the same change; the ISR window is a cache, not a publishing delay
  anyone chose.
- **A connector shows the whole of what is short and the headline of what is
  long.** The home page's mission band gives the mission and vision in full -
  they are two sentences, and paraphrasing them into a teaser would leave the
  home page making a weaker version of the same claim - while the four
  promises appear as titles only, each linking to
  `/mission#what-we-promise`. Both halves come from one resolution --
  `readMissionCopy()` over `resolveMissionCopy()` in `src/lib/mission.ts` --
  and reach `MissionPreview` as props rather than being fetched inside it, the
  same rule the Navbar's brand strings follow, so the home page cannot quote a
  mission the mission page has since reworded. Get that split wrong in either
  direction and you have a duplicate page or a band that says nothing.
- **The mission and the vision are an admin setting, and blank is the undo.**
  `site_settings.mission_statement` / `vision_statement`, written on Settings
  -> Public Site -> Mission & Vision. They were constants, which made the copy
  most likely to be argued over the copy only a developer could change. Four
  rules:
  1. **The constants in `src/lib/mission.ts` stay, as the default.** A blank
     or null column resolves to them, which is how an admin undoes an edit
     without retyping the original out of a file they cannot read -- the same
     rule `splash_brand_line` follows -- and it is why a database that has not
     run the migration renders exactly what it rendered before.
  2. **Read on its own, and deliberately not in `SITE_SETTINGS_SELECT`.**
     These are the newest columns on that table, and that shared select is the
     one whose failure takes every other setting down to its default with it.
     `readMissionCopy()` swallows its own error and falls back to the
     constants, because an empty mission card reads as a broken page on the
     one band whose job is to say who this clinic is.
  3. **Saving invalidates `/` and `/mission`.** Both are ISR-cached, so
     without it an owner rewords the sentence the site leads with and watches
     the old one stay up for five minutes -- which reads as a save that
     failed.
  4. **The word budget is advice; the character cap is the limit.** The form
     warns past fifteen words and still saves; `MAX_MISSION_LENGTH` /
     `MAX_VISION_LENGTH` are mirrored by the columns' CHECK constraints and
     re-checked in the route, because that pair is about the card these lines
     render in rather than about the writing.
- **The promises and the limits are rows, and an empty table is not an empty
  band.** `mission_principles` (`kind` = `promise` | `limit`, title, body,
  icon, `display_order`, `active`), one table and one manager
  (`MissionPrincipleManager`, rendered twice) for both bands, on Settings ->
  Public Site. Same shape as `faqs` and `testimonials`, and five rules:
  1. **An empty table falls back to `PRINCIPLES` / `COMMITMENTS` in
     `src/lib/mission.ts`**, per band rather than per table, because writing
     the promises must not empty the limits. It covers a database that has not
     run `schema.sql`, one the debug reset has just truncated, and a clinic
     that has not opened the screen -- and on `/mission` these two bands *are*
     the page, so a heading with nothing under it is the outcome worth a
     fallback. Deleting the last row is allowed and the screen says the
     shipped wording comes back, since otherwise a delete whose visible effect
     is the original text reappearing reads as a failed delete.
  2. **Every row switched off is respected, not fallen back on.** That is a
     decision somebody made, where an empty table is a state nobody chose --
     so both pages drop the band *and* its section-rail entry, per the
     "a rail entry must match a section that renders" rule.
  3. **Ordering is one save of the whole band.** The arrows rearrange in the
     browser, **Save order** posts every id of that one `kind`, and
     `set_mission_principle_order(text, uuid[])` renumbers 1..n and refuses a
     partial list itself -- the same tie bug, and the same reasoning, as
     `set_treatment_category_order`. A new row is appended at `max + 1`, never
     0.
  4. **The icon is a picker over `MISSION_ICONS`**, checked in the route, with
     `missionIcon()` answering for a retired name. Free text there is a way to
     put an empty square on the mission page, and a blank box does not say
     whether the icon or the row failed.
  5. **A delete or an edit that matched nothing answers 404**, never success:
     supabase-js reports no error for either, and the screen would refresh
     into an unchanged list it had just been told was saved.
  No heading counts the cards. "Four things, every patient" over three cards
  is the tell-someone-something-untrue rule broken by a number nobody
  remembered to change, so that title says what the band is instead.
- **Testimonials are the one place the site quotes a person, so treat them
  as evidence.** One `Testimonials` component serves Home and `/mission`,
  because the two bands make the same claim and a visitor may see both in one
  session. `testimonials.avatar_url` is migration-dependent, so every caller
  reads it in an isolated query and falls back to the patient's initial - a
  generic silhouette is a worse signal than no photo.
  **The five rows `schema.sql` seeds are illustrative copy, not real
  patients**, seeded only into an empty table and never re-seeded once it has
  any row. They exist so the band can be reviewed populated before launch.
  Never add a testimonial that reads as a real patient without consent for
  both the words and the face, and never present the seeded ones as real -
  the admin form says as much at the point of entry, and
  `public_rating_summary` stays the only place a *real* number is quoted.
- **A public catalog card opens a dialog; booking is its own button.** The
  session-package, home-visit-package and programme cards all follow one
  contract: the card body is a single tap target that opens a detail dialog
  (`src/components/Modal.tsx`, shared with `TeamTherapistPopup`), and a
  **Book …** link sits below it on the card and again at the foot of the
  dialog. The card used to be one big link to checkout, which left no way to
  read the rules - validity, one-therapist lock, minimum gap - before paying.
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
  Completed cutoff - minutes after slot time at which every "Tap to Join"
  control reads "Session Completed" instead, admin's own included, since a
  session an hour past its start reads the same way on every screen it
  appears on - idle timeout,
  booking languages, the online booking lead time and cancellation refund
  window, the package-wide settings - default
  validity, therapist-lock switch, bulk-scheduler limit, expiry reminder
  window - the three recommendation settings on Settings → Programmes &
  Home Visits -
  whether the clinic approves one before the patient sees it
  (`care_plan_requires_approval`, on by default), how long an approved one
  holds, and the ceiling on sessions a week a clinician may ask for - the nine `home_visit_*` settings - master switch, cash on/off,
  lead time, cancellation refund window, default validity, bulk-scheduler
  limit, travel buffer minutes, and the public page's heading/subheading -
  and Brand & Contact Details - site name, tagline, description, contact
  email, WhatsApp number, contact phone, footer copyright text - and the
  Home page walkthrough's per-step rotation seconds, where 0 means "don't
  rotate" - and the mission and vision lines on Settings -> Public Site, where
  blank means "use the wording in `src/lib/mission.ts`", and the promises and
  limits on that same screen, where an empty band means the same - and the
  opening splash's five settings - on/off, the name above
  the line (blank follows the site name), its one line, the hold in seconds,
  and the minutes a tab must be away to earn a second greeting, where 0
  means "first load only" - and the two contact controls,
  `contact_scan_mode` and `contact_masking_enabled`, on Settings → Team &
  Access, and `risk_signals_enabled` with the per-detector thresholds in
  `risk_rules`, on Today → Risk - and `enabled_intake_specialties`, which
  condition types triage offers - and the four invite settings on Settings →
  Offers & Discounts (on/off, what the friend gets, what the inviter gets, and the
  ceiling on rewards one patient may earn) plus `promo_codes_enabled`, whose
  switch sits on Money → Costs beside the campaigns it governs rather than in
  Settings, because an admin who has just written a code and cannot see why
  it does nothing is the failure that placement avoids) is read
  through `src/lib/adminSettings.ts` with defaults - don't hardcode these.
  Every dashboard page must select `SITE_SETTINGS_SELECT` from that module
  rather than its own column list, or a new setting silently reads as its
  default on whichever page forgot it. The root layout is the one place
  that reads Brand & Contact Details (via a public/anon client, so
  ISR-cached pages under it aren't forced dynamic) and passes it into
  `Navbar`/`Footer` as props - those two components take the strings as
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

**`treatment_categories` and `treatment_category_packages` are kept.** They
are the one part of that list an admin builds by hand rather than generates
by testing -- the conditions the public pages show and the programmes a
therapist may recommend under each -- so emptying them meant retyping the
catalogue after every reset, and the public site came back with nothing on
it, which reads as the clinic having shut rather than as test data being
cleared. Keeping them is safe alongside the rest going, because
`TRUNCATE ... CASCADE` reaches tables that *reference* the truncated ones
and never the reverse: appointments, care plan versions and purchases all
point **at** a category or a package. A purchase reads its frozen
`package_snapshot` rather than the live row, so a surviving package cannot
rewrite what somebody already bought. Home-visit packages, service areas,
FAQs, testimonials and the question templates are still cleared; take one
out of the list the same way, one at a time with its own reason, rather
than exempting "the catalogue" as a category nobody can check.

**The route reports what the function returned.** It read
`accounts_deleted` where the function returns `deleted_accounts`, and asked
for an `admins_kept` it never returned, so a wipe that had just emptied
every table answered "0 accounts deleted, 0 admins kept" -- indistinguishable
from a reset that did nothing, on the one control whose result cannot be
checked by looking at the screen behind it.

**Every UPDATE and DELETE in that function needs a WHERE clause, even the
ones meant to hit every row.** Supabase preloads pg-safeupdate for the
`authenticator` role -- the one PostgREST connects as -- so a bare
`update risk_rules set ...` is refused with `UPDATE requires a WHERE clause`,
and the reset had never once worked from the app. Three things make this
easy to reintroduce. `security definer` does not get round it: the library is
preloaded into the *session*, so the hook runs whoever the statement ends up
executing as. It is invisible to every other way of running the file --
`scripts/run-schema.mjs` and the schema-apply workflow both connect as
`postgres`, which has no such preload, so the function installs cleanly and
only the one caller that matters cannot run it. And it covers UPDATE and
DELETE only, which is why the `TRUNCATE` at the heart of the wipe was always
fine. Write the predicate so it still means "every row" and still reads as a
real one -- `where rule_key is not null` on a NOT NULL key, or `where id` on
the boolean-keyed `site_settings` singleton, rather than a `where true` that
reads as a token added to silence a check.

**Adding a table means adding it to that `TRUNCATE` list**, or a reset
silently leaves its rows behind. Before real patients exist, remove
`ALLOW_DEBUG_DATA_RESET` and drop the function.

## Keeping the docs current

`README.md`, `AGENTS.md`, and `CLAUDE.md` describe the app itself, so they go
stale the moment the app changes. Update them **in the same change** that
makes them wrong - do not leave it for later, and do not merge to `main`
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
`.env.example` without touching a doc. It is a reminder, not a gate - a
change that genuinely needs no doc update can ignore it.

**Security headers ship from `next.config.ts`.** `X-Frame-Options: DENY`,
`X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` and HSTS, on every response. There were none, so the
admin dashboard and the patient's health profile were both framable by any
site, and a referral token or an appointment id in a URL travelled as a full
referrer to third parties. CSP is **report-only** on purpose and must not be
promoted without reading the reports first: Razorpay's checkout injects its
own script and iframe, the splash boot script is inline by necessity (it has
to run before first paint), and Next inlines hydration data - a policy
written blind takes down checkout, which is the one failure a payment screen
must not have.

## Style

- TypeScript throughout; no `any` escapes for convenience.
- Tailwind utility classes; design tokens and font stacks are composed in
  `src/app/globals.css` (`--font-sans`, `--font-display`). Fonts are
  self-hosted via `next/font/google` - no runtime request to Google.
- Server components by default; add `"use client"` only where interaction
  requires it.
- Comments in this codebase explain *why*, especially where a non-obvious
  constraint or a past bug drove the shape of the code. Match that.
- **A wrapped JSX sentence containing an HTML entity loses a space, and the
  browser is the only place you can see it.** Next's compiler decodes entities
  in the same pass that normalises JSX whitespace, and where a text node both
  carries an entity (`&apos;`, `&quot;`, `&nbsp;`, …) **and** spans more than
  one source line, its leading space is dropped. Either half alone is
  harmless, which is why this survived: the identical sentence on one line is
  fine, and so is the same wrap without an entity. Eight sentences shipped
  broken -- "at least 24hours' notice", "For 1 sessionyou've already had",
  "Only turn this offif the Google account", "₹1,200excluded from this
  breakdown" -- and none of them is visible in the source, in review, or to
  esbuild, which keeps the space, so Vitest and Playwright transform the file
  differently from what the browser is served. It was found by reading pixels
  in a screenshot. The fix is always to make the space a child in its own
  right, `{" "}`, which nothing can trim; interpolating the whole sentence as
  a template literal is better where a ternary sits mid-sentence.
  `src/lib/jsxEntitySpacing.test.ts` walks every `.tsx` in `src/` and fails on
  one, the same shape and the same reasoning as `formatDateTime.test.ts`'s
  walk for unzoned dates -- a mistake that produces no error is one a
  reviewer will not catch.
- **`text-slate-400` is a dark-surface token.** On white it is 2.63:1, which
  fails WCAG AA for body text, and an axe-core sweep found it on 62 surfaces
  across the public pages and all four dashboards -- every one of them a label,
  a count, a hint or a code somebody actually has to read. The rule is by
  surface, not by taste: on the dark chrome (the two shells' rails, the
  footer, the debug bar) `text-slate-400` is correct and `text-slate-500` is
  the failure; on a white or `slate-50` card the floor is `text-slate-500`,
  and on a `slate-100` fill -- a segmented-control track, a neutral pill --
  it is `text-slate-600`, since slate-500 there is 4.34:1 and just misses.
  Sidebar's own active entry is `bg-teal-700`, not `-600`: white on teal-600
  is 3.66:1. The same split applies to the chart constants in
  `src/components/admin/TrendCharts.tsx` (where the Money and Business Health
  screens both read them from) -- they are drawn as lines *and* printed as
  figures, so they take the -700 shades while `PatientProfitChart`, which only
  draws, keeps -600. Axis tick labels there are slate-500 for the same reason:
  they are read, not decoration.
  **The debug bar is the one surface the app-wide sweep could not see**, since
  it was run with `NEXT_PUBLIC_SHOW_DEBUG_NAV=false`. Its page picker and its
  simulate-time box carry `aria-label`s of their own -- the visible words
  beside them are spans that vanish below `sm`, so on a phone both controls
  were announced as nothing.
- **Every control carries an accessible name, and an icon-only one carries it
  explicitly.** A visible label is associated with `htmlFor` + `useId` (not
  by sitting next to the input), a control with no visible label at all --
  an icon button, a visually hidden `type="file"` behind a styled button, a
  number box under an `<h3>` -- takes `aria-label`, and a decorative glyph
  inside a named button takes `aria-hidden`. Two whole-app sweeps were needed
  to get here, so a new control without one is a regression rather than an
  omission.
- **A dialog opened by a tap uses `useDialogChrome`** (`src/lib/`), which is
  the one implementation of the contract: `role`, `aria-modal`, focus moved
  in on open and restored on close, Escape, a Tab trap and the scroll lock.
  It takes an `active` flag because `Modal.tsx` stays mounted and toggles
  `open` -- a hook that locked body scroll while closed is the bug that flag
  exists to prevent.

## Gotchas

- **The debug bar is on in every environment, on purpose.** The app is
  pre-launch with no real patients, so `isDebugNavVisible()`
  (`src/lib/debugNavVisible.ts`) returns true unless
  `NEXT_PUBLIC_SHOW_DEBUG_NAV` is exactly `"false"` - local dev,
  `next build` + `next start`, and the deployed site alike. It used to
  default off whenever `NODE_ENV === "production"`, which hid it in the one
  environment worth checking a published change in. Don't gate it back
  behind `NODE_ENV`, and don't reintroduce the ten copies of that
  expression: the root layout, three dashboard shells and six pages that
  hide the shared Navbar all call the one helper. At real launch, **delete**
  the bar rather than flipping the flag - it is a public flag, and the bar
  names every route including `/admin/login` and `/admin/dashboard`.
- **No `.env` file that arms the reset is committed, and two have been.**
  `.env.production` armed both the public debug nav and the whole-database
  reset on the live site. `.env.development` then did the same thing one
  file over: tracked in git despite `.gitignore`'s own `.env*` rule, and
  setting `ALLOW_DEBUG_DATA_RESET=true` for every `next dev` on every
  machine that cloned the repo -- against whatever `NEXT_PUBLIC_SUPABASE_URL`
  happened to point at, which on a developer's machine is often the real
  project. Its own header said to delete it before real patients existed,
  and CLAUDE.md says the flag "stays unset"; a committed file setting it to
  true is that rule being false in the one direction that costs a database.
  Both are gone. The flag is documented in `.env.example` and belongs in a
  server environment somebody set on purpose, never in a file a clone
  brings with it.
- **`.env.production` stays deleted.** It armed both the public debug nav
  and the whole-database reset on the live site. The nav no longer needs it
  (the default above covers it), and the reset must never be armed from a
  committed file - `ALLOW_DEBUG_DATA_RESET` belongs in a server environment,
  set deliberately, against a project whose data is throwaway. Check the
  hosting dashboard's own env vars too, since a file cannot clear those.
- **The page behind an intercepted overlay has to look like the app.** The
  admin's patient, therapist and condition details are normally an overlay --
  the dashboard intercepts the route (`@modal/(.)patients/[id]`) and draws
  the detail over the screen you were on. Interception applies to
  **client-side navigation only**, so a reload, a shared link, a new tab and
  the `router.refresh()` an action inside the overlay fires all land on the
  real page underneath. That page was a bare `<section>` with a small
  "← Back to Dashboard" link and no chrome at all, so pressing Mark Done on a
  patient's profile appeared to throw the admin out of the back office onto a
  different, plainer site.
  `AdminDetailFrame` is what those three wear now: the same dark rail, the
  same section list, the same header shape. It reads `ADMIN_SECTIONS` and the
  scope grid exactly as the shell's sidebar does, so the two cannot list
  different sections or offer one this admin cannot open, and every entry is
  built with `adminScreenHref` rather than a hardcoded `?section=`. It is
  **deliberately reduced** -- no collapse, no badges, no global search, no tab
  state -- because this is a leaf page and all of those belong to the screen
  you return to; reproducing them would be a second shell to drift from the
  first. A route that gets this frame also needs its `loading.tsx` to pass
  `withSidebar`, or the chrome blanks while the page resolves.
- **A full-screen overlay opened from inside another one must be portalled.**
  `position: fixed` is relative to the viewport *until* an ancestor carries
  `transform`, `filter`, `backdrop-filter`, `perspective`, `contain` or
  `will-change` -- that ancestor then becomes the containing block, and the
  overlay is measured against its box instead. Every modal in this app sets
  `backdrop-blur-sm`, which is a `backdrop-filter`, so **any modal is one of
  those ancestors**. Mark Done on a patient's profile was the case that
  showed it: the confirmation renders inside `DetailOverlayModal`, so its
  dark sheet covered only that modal's scrolling panel, the prompt sat at
  the top of the scrolled content rather than in front of the reader, and it
  slid away as they scrolled. Nothing was wrong with the dialog.
  `OverlayPortal` (`src/components/system/OverlayPortal.tsx`) renders into
  `document.body`, which has no such ancestor, so `fixed` means the viewport
  again. Two rules:
  1. **Portal the ones that can be nested**, which is every dialog opened by
     a tap -- `ConfirmDialog`, `admin/Modal`, `SessionDetailDrawer`,
     `PainExamDialog`, `ConditionTriageDialog`. React portals bubble along
     the **React** tree rather than the DOM one, so a dialog inside a panel
     that stops propagation behaves exactly as it did: this moves pixels,
     not clicks.
  2. **Never portal a server-rendered overlay.** The admin's `@modal` detail
     routes (`DetailOverlayModal`) are in the initial HTML; portalling them
     renders nothing on the server and pops the modal in after hydration.
     They are also always outermost, so they have nothing to escape.
  The five `motion.div` overlays inside an `AnimatePresence` are left alone
  deliberately -- a portal between the two stops `AnimatePresence` seeing its
  child and kills the exit animation, and all five are outermost, with every
  dialog that can open inside them portalled from the child side, which is
  the side that matters.
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
  column (`where patient_code is not null`), not the role - so anything that
  resyncs `patient_code_seq` must take its max the same way, over **every**
  non-null code regardless of role. Scoping the max by role set the sequence
  back below codes held by promoted accounts, and signup then failed
  intermittently with a duplicate key, surfacing as a 500 from
  `auth.signUp` with an empty body. `assign_profile_code` /
  `assign_session_code` now also loop past a taken code rather than trusting
  the sequence, so a drift from any other cause (a restore, a manual insert)
  cannot break signup again.
- **A fallback that is silent is half a fix.** `findTab` landing somewhere
  valid is correct -- a stale bookmark must not produce a blank page -- but
  on its own the tap just goes somewhere else and looks like it worked.
  `AdminShell` now compares the screen the URL *asked for* against the one it
  resolved, and when an admin's scope is why they differ it says so in one
  amber line with a Dismiss. It names only a tab that exists in the nav: an
  unknown key is a stale link, and telling somebody they lack access to a
  screen that was never there is worse than the silence it replaces. The case
  that produced it: Finance following **Book for a patient** from `/book`
  reads Sessions and cannot change one, so New Booking is not theirs and they
  arrived at the Schedule calendar with nothing saying why.
  Two related bugs came out of the same path and are worth not
  reintroducing. `WrongAccountForBooking` linked to `?section=sessions` with
  **no tab**, so every admin scope -- Master Admin included -- landed on the
  month grid from the one button in the product named "Book for a patient";
  a `?section=` with no `?tab=` is a link to a section's first screen, not to
  the screen you meant. And `AdminShell`'s own popstate handler called
  `findTab` **without `limitedScope`**, so a limited desk deep-linking to
  Today -> Activity, or pressing Back to it, resolved the URL differently
  from the server that had just rendered it. Both arguments are easy to omit
  and neither failure announces itself.
- **A hardcoded `?section=&tab=` link is a dead link waiting to happen.**
  `findTab` falls back to a section's first screen when the tab key is
  unknown, so a stale link looks like it works - it just quietly lands
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
  **It arrives as a pull request, not as a commit on `main`.** The workflow
  used to push straight to `main`, which the branch-protection ruleset
  rejects (`GH013`), so it failed on every merge and threw away the graph it
  had just built. It force-pushes one long-lived `chore/graphify-refresh`
  branch and opens a PR from it instead -- deliberately not a commit onto the
  branch that was merged, since sessions here push to their own `claude/*`
  branches constantly and a CI commit landing underneath one turns their next
  push into a rejected non-fast-forward. Merging that PR is what keeps
  `manifest.json` current, so leaving it open has the exact cost the
  paragraph above describes. Opening the PR is itself refusable, by
  **Settings -> Actions -> General -> Allow GitHub Actions to create and
  approve pull requests** (off by default, and off here): that refusal is
  soft too -- the branch still carries the graph and the job summary links
  the "open a PR" page -- because failing on it would put the workflow back
  to red on every merge for a reason the red X could not explain.
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, Google
  credentials) are server-only. Never add a `NEXT_PUBLIC_` prefix to them and
  never commit real values.
