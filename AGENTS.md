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

Commands: `npm run dev`, `npm run build`, `npm start`, `npm run lint`.
There is no test runner configured — verify with `npm run build` and
`npm run lint`.

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

## Domain rules worth knowing before editing

- **Booking lead time** is 12 hours, defined once in `src/lib/bookingSlots.ts`
  and shared by the picker and the validator so they cannot drift apart.
- **Availability** = weekly template + per-date overrides + leave flag, then a
  conflict check (`src/lib/therapistAvailability.ts`,
  `src/lib/checkTherapistConflict.ts`).
- **Payments** must be verified server-side: `/api/razorpay/verify` checks the
  signature before anything is confirmed. Never confirm on a client callback.
- **Cancellation/refund**: full refund only outside the 24-hour window in
  `src/lib/pricing.ts`; inside it, none. Home visits use their own window
  instead (`home_visit_cancellation_refund_hours`, `cancelAppointmentAndRefund`) —
  see the Home Visit bullet below.
- **Google Calendar/Meet sync must never block a booking.** Failures are
  recorded on the appointment (`google_calendar_sync_error`) and retried by
  the admin (`/api/admin/retry-meet-sync`). A home visit still gets a
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
  the identical treatment via `src/lib/expireHomeVisitPurchases.ts`.
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
- **Admin-configurable behavior** (Meet on/off, join window, idle timeout,
  booking languages, the package-wide settings — visibility, default
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
