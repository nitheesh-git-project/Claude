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
`libphonenumber-js`.

Commands: `npm run dev`, `npm run build`, `npm start`, `npm run lint`,
`npm run check:realtime`, `npm run test:e2e`. `npm run lint` runs
`check:realtime` first: `scripts/check-realtime-coverage.mjs` fails the lint
when a table the UI subscribes to was never added to the `supabase_realtime`
publication in `schema.sql`. That mismatch has no runtime symptom — the
subscription succeeds and simply never fires — so the check is the only
thing that catches it. The e2e suite (Playwright, `e2e/`) covers the
money-critical paths and the admin back office — booking + payment,
concurrency/CAS guards, bulk limits, admin route authorization for every
role, input validation, payout/refund maths, and the dashboard's own
navigation in a real browser. It needs a test/staging Supabase project plus
Razorpay test keys, so `npm run build` and `npm run lint` remain the default
verification for a change that can't reach one.

Three environment notes for the browser specs:

- Set `PLAYWRIGHT_CHROMIUM_PATH` when the sandbox already ships a Chromium.
- They sign in by injecting a Node-minted session cookie rather than typing
  into the login form, so a sandbox whose browser has no outbound network
  can still exercise the whole dashboard.
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

## Layout

```
src/app/                 pages, layouts, API route handlers
src/app/api/**           POST route handlers grouped by audience:
                         admin/, appointments/, patient/, therapist/,
                         hospital/, packages/, razorpay/
src/components/          UI, grouped by area (admin/, auth/, booking/,
                         dashboard/, home/, hospital/, profile/, motion/,
                         visuals/)
src/lib/                 domain logic, formatting, Supabase clients
src/lib/adminNav.ts      the admin dashboard's six sections + their screens
src/lib/adminScope.ts    admin scopes and which sections each one may open
src/proxy.ts             auth proxy over the four dashboard route trees
supabase/schema.sql      the entire schema: tables, RLS, views, triggers
scripts/                 one-off tooling
```

## Roles and access

`profiles.role` is one of `patient`, `therapist`, `hospital`, `admin`.
Patients and therapists self-register and wait for approval; hospitals are
provisioned by the admin; admins are promoted by hand in Supabase.

Two flags gate everything: `profiles.approved` and `profiles.active`.
They are enforced in **two** places and both must stay in place:

1. `src/proxy.ts` → `src/lib/supabase/proxy.ts` for dashboard navigation.
2. `src/lib/supabase/requireActiveProfile.ts` inside self-service API routes,
   because a valid session cookie can call the API directly around the UI.

Admin routes go through `src/lib/supabase/requireAdmin.ts`. Never trust a
role, an id, or an amount sent from the client — re-derive it server-side.

Admins additionally carry a scope (`profiles.admin_scope`: `full`,
`operations`, `finance`, `clinical` — see `src/lib/adminScope.ts`), which
decides which dashboard sections they can open. A route that belongs to one
section guards with `requireAdminScope(section)` rather than
`getAdminUser()`; the sidebar hiding a section is presentation only, since a
session cookie can call any route directly. Only a `full` admin can change
scopes or mint another admin, nobody can change their own, and the last
`full` admin cannot be narrowed — otherwise a single mis-click locks
everyone out permanently.

Every mutating admin route should record what happened via
`recordAdminActivity()` (`src/lib/adminActivityLog.ts`). It is best-effort
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
  same guarded style; do not rewrite earlier statements.
- New columns are migration-dependent — a live database may not have them
  yet. Query such a column in its own isolated call and merge the result in
  (see `src/lib/sessionCode.ts`), so one unknown-column error can't blank
  every field of a shared query.
- Money is integer paise. Times are `timestamptz`. Percentages
  (`revenue_share_percent`) are 0–100.
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
  For a single online session, `/api/razorpay/create-order` flips the paying
  patient's `profiles.approved` to `true` the moment they genuinely attempt
  checkout (`approvePatientForGenuinePaymentAttempt` in
  `requireActiveProfile.ts`) — deliberately on the attempt, not a completed
  payment, so a patient who fails or abandons checkout after repeated tries
  still lands straight in their dashboard via BookingWizard's escape hatch,
  appointment showing pending, rather than being bounced to
  `/pending-approval`. `appointments_insert_own` lets a self-signup patient's
  pre-payment appointment row through RLS while still unapproved (requiring
  only `active`) precisely so a real order can exist to attempt in the first
  place. Home-visit and package purchases keep the stricter "only a
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
  calendar) is not retried forever. At the cap the row stays in the admin's
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
  `therapistCashLedger`) so it can be reasoned about without rendering. Keep
  new math there rather than inside components.
- **Patient Care Intake and Pain Map are two separate data layers**, both
  gated behind one write-access model. Patient Care Intake
  (`patient_condition_profiles` / `condition_change_requests`, question set
  in `src/lib/conditionIntake.ts`) is patient- or therapist-submitted
  general history and always queues for admin review before it goes live —
  first fill and later edits alike. Pain Map (`pain_assessments` /
  `pain_map_question_templates`, region + question logic in
  `src/lib/painMap.ts`) is therapist-only, per-region clinical exam data
  that posts live immediately with no review step, and is append-only (a
  re-assessment is a new row, never an edit) so the UI can show a trend
  against the previous visit. A therapist may only *write* to either layer
  after the patient's admin approves a `condition_access_grants` request;
  *read* access needs no request and is automatic for the patient's
  assigned therapist (ever had an appointment with them, or holds a
  package's `locked_therapist_id`). See the "Patient Care Intake and Pain
  Map" section in README.md for the full flow.
- **The admin dashboard's information architecture lives in
  `src/lib/adminNav.ts`** — six sections (Today, Sessions, People, Money,
  Catalog, Settings), each with its own screens. The sidebar, the URL
  (`?section=&tab=`), the content map in the dashboard page, and the scope
  check all read that one list, so adding a screen is one entry there plus
  one entry in the page's `screens` map. Tab state is written with the
  History API, never `router.push`: the dashboard is a single Server
  Component making ~40 queries, and a router navigation would re-run all of
  them to move between two already-rendered screens.
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
- **Approvals are a queue, not a person.** Pending signups and profile
  change requests live under Today, beside the inbox that counts them, not
  on the patients directory.
- **One word, one money figure.** "Recognised revenue" is what has been
  earned (a package counts one session at a time); "Package cash collected"
  is what came into the bank up front. Gross/Net Revenue keep their standard
  meanings. `MoneyGlossary` states each one on the Money screens -- if a new
  figure needs a word that is already taken, rename the figure, don't
  overload the word.
- **Admin-configurable behavior** (Meet on/off, join window, idle timeout,
  booking languages, the online booking lead time and cancellation refund
  window, the package-wide settings — visibility, default
  validity, therapist-lock switch, bulk-scheduler limit, expiry reminder
  window — the nine `home_visit_*` settings — master switch, cash on/off,
  lead time, cancellation refund window, default validity, bulk-scheduler
  limit, travel buffer minutes, and the public page's heading/subheading —
  and Brand & Contact Details — site name, tagline, description, contact
  email, WhatsApp number, contact phone, footer copyright text) is read
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

- `.env.production` sets `NEXT_PUBLIC_SHOW_DEBUG_NAV=true` for a debug nav bar
  on the deployed site. It must be removed before a public launch.
- `graphify-out/` is CI-generated (`.github/workflows/graphify.yml`); only
  `graph.json` and `GRAPH_REPORT.md` are committed. Don't hand-edit them.
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, Google
  credentials) are server-only. Never add a `NEXT_PUBLIC_` prefix to them and
  never commit real values.
