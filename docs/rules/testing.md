# Verifying a change

The commands, the three schema checks, the two gears, the SQL check files, the e2e suite's rules, the QA plan, and keeping the docs current.

**Mostly lives in:** package.json · e2e/README.md · scripts/*-sql-checks.sql · docs/qa/src/

> Part of `docs/rules/`. `CLAUDE.md` says which file a task needs; this one
> is the detail. Keep it current in the same change that makes it wrong --
> see the docs rule in `docs/rules/testing.md`.

---

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
Supabase (Postgres, Auth, Storage, Realtime) · Razorpay · Google
Calendar/Meet (`googleapis`) · `motion` for animation · Font Awesome ·
`libphonenumber-js` · `pdf-lib` (every PDF this app generates: the
patient's health profile and the admin's table exports).

**Three new checks and three new documents came out of the audit-fix pass.**
`npm run check:search-path` runs in lint beside `check:grants` and fails a
`security definer` function with no explicit safe `search_path` -- a definer
function resolving names through the *caller's* path can be made to execute
the caller's objects as its owner, and the failure is silent.
`npm run check:concurrency` and `npm run check:authorization` need a real
database: the first fires parallel RPCs at `claim_therapist_slot`, the rate
limiter and the invite cap; the second asserts cross-tenant isolation, IDOR
and enumeration resistance **below the routes**, because a session cookie
reaches PostgREST without passing any route guard. Read the caveat at the top
of `concurrency-checks.mjs` before trusting a green run -- it guards the
verdicts, not serialisation. `docs/MONEY-MODEL.md`,
`docs/LIFECYCLE-STATES.md` and `docs/DATA-POLICY.md` hold the money
vocabulary, every state machine, and the migration/backup/retention/deletion
policy; `docs/audit/AUDIT-FIX-REPORT.md` is what was found and what was done
about each of it.

Commands: `npm run dev`, `npm run build`, `npm start`,
`npm run start:cluster` (several workers on one port -- see the clustering
rule under "Supabase clients"), `npm run lint`,
`npm run test`, `npm run check:realtime`, `npm run check:grants`,
`npm run test:e2e` (the whole browser suite -- once before a merge, not once
per fix; see the two gears under the e2e section below),
`npm run seed:qa` (recreate the QA fixture accounts after a data reset),
`npm run clean:e2e` (delete the fixture rows earlier e2e runs left behind),
and `npm run verify` (lint + test + build, which `.github/workflows/ci.yml` also runs on every pull request and push to `staging`/`main`; the one to run before pushing --
and, for a change a browser can see, alongside the two or three specs
covering what moved rather than the whole suite).
`npm run test` is Vitest over `src/**/*.test.ts` - the dependency-free
modules in `src/lib`, which is why the business maths lives there rather
than inside components. It needs no database and no browser; anything that
does belongs in `e2e/`. `npm run lint` runs three schema checks first.
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
in both directions. It reports **three** outcomes rather than two, and the
third is what makes the other two worth reading: RLS filters rows rather
than raising, so a suspended admin's refused read and a permitted read of
an **empty table** are byte-identical on the wire (`HTTP 200 []`). On an
empty table the positive assertion cannot be proven and the negative one is
vacuous, so both are reported as *not proven* rather than as a pass, and the
summary names them. The old script collapsed all of it into a row count: it
passed on `admin_activity_log` because that table had rows and failed on
`appointments` because it had none, so its verdict moved with how much data
happened to be lying around -- a false alarm on a database whose policies
were perfect, which is exactly how a red line stops being read. **`e2e/README.md` is the inventory** -- all 54 spec files, what each covers,
how to run them, and the nine cases that cannot pass without browser egress.
Read it to find a spec; read this section for the rules behind it. A new spec
adds its row there in the same commit.

The e2e suite (Playwright, `e2e/`) covers the
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
invisible to an API test and obvious in a screenshot. `booking-pay-button-live.spec.ts`
is the same argument one screen over -- the payment step's own pay button
staying tappable while its price loads, with the wait stated on the screen
rather than enforced on the control. `admin-refresh-badge.spec.ts` is a third:
the Refresh button's waiting-changes badge staying at zero through an admin's
own work while still counting somebody else's -- a number that climbed all day
is visible to nobody but a person looking at it.
`refund-attempts.spec.ts` is the deliberate opposite: it drives the
**database** rather than the routes or a screen, because every refund writer
uses the service-role client and the only guarantee worth testing is that a
rewrite raises from the same client the routes hold. A route test would prove
the routes behave, which is what the routes were doing wrong.
It needs a
test/staging Supabase project plus
Razorpay test keys, so `npm run build` and `npm run lint` remain the default
verification for a change that can't reach one.

**The whole suite runs once before a merge, never once per fix.** It is
`workers: 1` against one Supabase project and one app instance by design, so
it is slow by design too -- running all of it after each bug fix spends
minutes to re-prove a few hundred cases the change could not have touched,
and the cost is paid on every commit rather than on the one that matters.
Worse, it is the habit that makes a red run routine: a suite run so often
that its six known no-egress failures are scrolled past is a suite nobody is
reading, which is the same failure mode as a badge that is always on. Two
gears:

0. **Two Playwright projects.** `desktop` is the suite as it always ran;
   `mobile` runs `e2e/mobile-*.spec.ts` on an emulated Pixel 7. Choose with
   `--project=desktop|mobile`; a plain `npm run test:e2e` runs both.
1. **Per change -- a quick retest and a regression.** `npm run verify`
   (lint + unit tests + build, which is what `verify` is for) plus **the
   specs that cover what moved**, by file:
   `npx playwright test e2e/<the-spec>.spec.ts`. The retest is the case the
   change was made for; the regression is the rest of that file and any spec
   over the same screen or the same money rule. Two or three files, not
   the whole suite. A change that cannot reach a test project stops at `verify`,
   as above.
2. **Once before the merge -- `npm run test:e2e` in full**, on the branch as
   it will land. That is the run whose six known failures get read (see the
   no-egress note above), and the only one that catches a spec broken by a
   change in a file it does not name.

**Updating the suite is part of the change, not part of the merge.** A fix
that changes what a person sees, a rule, a route or a row updates or adds its
spec **in the same commit** -- the same rule the docs follow, and for the same
reason: a suite updated later is a suite that spends the intervening commits
asserting a product that no longer exists. Adding a spec is not the same as
running all of them; the new file is what gear 1 runs, and gear 2 is where it
first runs beside everything else.

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
  pay-later. The last whole-suite run on `staging` was **343 passed, 9 failed,
  11 skipped**, and the nine are these cases -- `therapist-request` TR-002,
  `booking-rules` BR-CANCEL-001/002, `pay-later` PL-UI-003 to 006 and all
  three of `booking-pay-button-live` -- every one of which fails identically
  on a stashed, unmodified tree. Check that before reading a red pay-later
  run as a money bug. Take the **set** as the invariant and not the total:
  the total moves with every spec added (it was 258/6 across 40 spec files
  before this list reached 54), so a run that does not match it is telling
  you the suite has grown, not that something broke. `node
  scripts/.qa/egress-check.mjs` settles it in one call.
  `booking-pay-button-live.spec.ts` is the same case a fourth time -- three
  more cases, and the reason the count above is no longer the one to check
  against. It reads as the very regression it guards: all three walk the same
  Step 1 -> Step 3 path as BR-CANCEL, so with no browser egress the walk stops
  at Step 2 and the failure is the pay button *not found* -- which looks
  exactly like a button that was never rendered. A dead button and an absent
  one are different faults; check the egress before reading a red run here as
  the disable having come back.
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
configuration and money rule. **`docs/qa/src/*.md` is the source and the only
thing to edit.** It quotes real route paths, screen names, setting defaults and
error strings, so it goes stale the same way the other docs do -- update it in
the change that makes it wrong.

**The PDF, DOCX and HTML beside it are built on request, not on every
change.** `python3 scripts/build-test-plan.py` regenerates all of them, and
they are never hand-edited -- but running it is **not** part of an ordinary
fix. They are four large binaries (the plan's PDF alone is ~7.5MB), so
rebuilding them per change writes megabytes of unreviewable diff into the
history for a Markdown edit of two lines, and it drags the QA **audit
report's** binaries along with it, whose own source did not change -- their
diff is build-timestamp churn and has to be reverted by hand every time. So
the source is allowed to lead the binaries: rebuild when somebody asks, or
when a tester is about to be handed the document, and then in a commit of its
own rather than buried in a fix. The script also needs `python-docx`, which
is not in this repo's dependency set at all, so a rebuild is a deliberate act
on a machine set up for it.

`scripts/seed-qa-accounts.mjs` (`npm run seed:qa`) recreates every account
the manual plan names -- four admins, four patients, three therapists, two
hospitals -- with the fixture password, straight after a data reset. The
fourth patient is `qa.patient.e`, which the manual plan does not name:
`e2e/pay-later.spec.ts` deletes its patient's appointments in its own
`beforeAll`, so it needs one of its own rather than destroying the journey
tests' fixtures. It was **named by that spec and created by nothing**, so the
whole file failed on its first line with a null dereference -- a missing seed
reading as a broken money feature. It is seeded *without* pay-later terms on
purpose: the spec's first case is the grant, and a fixture that arrived
already on terms would make it pass without running. The reset
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

**The two append-only evidence tables are lifted the same way, and both had
to be taught.** `refund_attempts` and `session_settlements` carry every
foreign key `on delete restrict` on purpose -- `set null` is an UPDATE their
own append-only triggers refuse, and `cascade` would destroy the record that
money moved -- so a fixture appointment or purchase that reached a refund or
a completion cannot be deleted while a row points at it. Neither was in this
script when it shipped, and a whole-suite run found both in turn: a spec's
`afterAll` was refused by `refund_attempts_home_visit_purchase_id_fkey`, the
leftovers then made the clinic look like it owed undelivered visits and took
an unrelated home-visit case red, and `--apply` stopped on
`session_settlements_appointment_id_fkey` immediately behind it. Both
triggers are now suspended for those statements alone and restored before
the transaction commits, exactly as the ledger block does. **A new
append-only table with restrict keys belongs here in the same change that
adds it** -- residue that cannot be cleared is a permanent red row on
Settings -> System Health describing nothing wrong with the product.

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

`scripts/booking-idempotency-sql-checks.sql`,
`scripts/payout-atomicity-sql-checks.sql` and
`scripts/session-settlement-sql-checks.sql` are three more of the same shape,
each asserting both halves and each run with a negative control: a purchase
that cannot hold two sessions at one instant *and* still books a different
one; a payout that lands on every row, claims nothing twice, and leaves
**nothing** settled when its payload is bad; and a settlement that lands once,
is frozen, takes its external reference exactly once, and is not reported as
disagreeing when it is correct. All three build their own fixtures rather than
finding them, since this project has no appointments and a file that searched
for one would skip every assertion and report green.

`scripts/refund-attempt-sql-checks.sql` is the same shape for
`refund_attempts` -- the record a refund writes before the money moves. Both
halves of every guard: each resolution that must land, next to every rewrite
that must raise, plus `refund_attempt_health()` reporting each of its two
disagreements and *not* reporting a refund genuinely in flight. It **builds
its own appointment** rather than finding one, and that is not a stylistic
echo of the file above: this project has no appointments at all, so the first
draft skipped every assertion and reported a green run. It runs inside one
transaction and ends in ROLLBACK. Its own negative control arrived
unprompted -- the draft backdated `created_at` with an UPDATE and was refused
by the very trigger it was testing, which is the freeze doing its job: the
moment a refund was sent cannot be moved to make a stuck one look fresh.

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

- **Three specs guard this batch, and all three are screen-driven for the same
  reason.** `e2e/date-field.spec.ts` proves the popover opens, takes a **past**
  date (the report filters' whole requirement, which `isDateBookable` cannot
  express), closes on Escape with focus restored, and renders a value the old
  native input would have produced -- the source walk covers "is there a native
  input", and nothing but a browser covers "does the replacement work".
  `e2e/roster-read-write-day.spec.ts` covers the read-only gate, the day view,
  the scroll-to-selection, and the first-save case at the route: a 200 on a
  therapist with **no** `therapist_schedule_state` row, and still a 409 on a
  genuinely stale version, because fixing the first must not remove the second.
  `e2e/admin-partners-and-credentials.spec.ts` covers the three partner layouts
  (including the enquiry's line breaks, measured off the rendered box rather
  than the string), New Booking's width against `main` rather than a pixel
  constant, and the admin reset being absent from your own row **and** refused
  at the route.
  One locator rule runs through all three, learned three times over: the admin
  dashboard mounts **34 screens at once behind `hidden`**, so a bare
  `page.locator("ul > li")`, `form` or `getByText(/working/)` matches something
  on a screen nobody is looking at, and the failure reads as a broken feature.
  Every list these specs read is located **by name** -- which is why
  `AdminRosterTab`'s therapist list, `RosterDayView`'s day list and User
  Access's back-office list now carry `aria-label`s they should have had anyway.
  `getByRole` also skips hidden elements, so a role query that finds *nothing*
  on this page usually means the wrong `?tab=` rather than a missing control.
## The lint's schema and asset checks

`npm run lint` runs five checks before eslint, and they exist for the same
reason: each guards a failure with **no runtime symptom**. Nothing throws,
no test goes red, the page renders — it is just wrong, or slower than it
should be, in a way nobody notices until production.

| Check | Catches |
| --- | --- |
| `check:realtime` | A table subscribed in the UI but not in the publication |
| `check:grants` | A `security definer` function not revoked from all three of public/anon/authenticated |
| `check:search-path` | A `security definer` function with no explicit safe `search_path` |
| `check:rls-initplan` | A live policy calling `auth.uid()` bare instead of `(select auth.uid())` |
| `check:icon-styles` | A Font Awesome style used but not imported — renders an empty box, silently |

Adding one: **prove it fails before trusting that it passes.** Append a
known-bad fixture to the file it reads, confirm a non-zero exit and a
message that names the file and line, then restore. A check that cannot
fail is not a check, and the two added most recently were both wrong on
their first run — one truncated `storage.objects` to `storage` (which would
have produced a `DROP` against a table that does not exist and broken the
whole schema apply), the other failed on the very comments documenting the
rule it enforces.

## Unit tests and the dependency-free rule

`vitest.config.ts` includes `src/**/*.test.ts` and runs in a `node`
environment. The suite covers the dependency-free modules in `src/lib` —
the business maths lives there precisely so it can be tested without
rendering or a database. Anything needing a browser or Supabase belongs in
`e2e/`, and nothing here uses `vi.mock` to pretend otherwise.

`proxyProfileCache.test.ts` is the shape to copy for anything
security-bearing: it is mostly about the ways the thing must **refuse** —
a different user, an edited payload, a swapped signature, a wrong secret,
a malformed value — and it takes `nowMs` as a parameter so expiry is
asserted to the millisecond rather than waited out.

## Keeping the docs current

`README.md`, `CLAUDE.md` and `docs/rules/*.md` describe the app itself, so they go
stale the moment the app changes. Update them **in the same change** that
makes them wrong - do not leave it for later, and do not merge to `staging`
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

**The suite is kept current the same way, and in the same commit.** Every
trigger in the list above is also a trigger to look at `e2e/` and
`docs/qa/src/` - a changed rule, a moved route or a reworded screen leaves a
spec asserting a product that no longer exists, and a spec that goes stale
silently is worse than a doc that does, because it keeps passing. Write or
amend the spec beside the fix; do **not** run the whole browser suite to
prove it (see the two gears earlier in this file - the new file is
what the per-change gear runs, and the pre-merge run is where it first runs
beside everything else). For the manual plan that means
`docs/qa/src/*.md` and **nothing else**: do not rebuild its PDF, DOCX or
HTML, which are built on request only - see the QA plan note above for why.

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
