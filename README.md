# Dr. Pooja's Physio

Production web app for a global virtual physical therapy practice: public
marketing site, patient booking and payments, therapist scheduling and
earnings, hospital (B2B) referrals, and a full admin back office.

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

Scripts: `npm run dev`, `npm run build`, `npm start`, `npm run lint`.

### Database

`supabase/schema.sql` is the whole schema — tables, row-level security
policies, views, triggers, and functions. Run it in the Supabase SQL Editor
(Project → SQL Editor → New query) after creating the project. It is written
to be safe to re-run: every statement is guarded with `if not exists` /
`or replace`, and later sections add columns to earlier tables, so applying
the file top to bottom always converges on the current schema.

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

Use Razorpay Test Mode keys (`rzp_test_…`) until the payment flow has been
verified end to end.

`.env.production` currently sets `NEXT_PUBLIC_SHOW_DEBUG_NAV=true`, which
renders a "jump to page" debug bar on the deployed site. Delete that file or
flip the value to `false` before a real public launch.

## Roles

Four roles live in `profiles.role`, all backed by Supabase Auth users:

- **patient** — self-registers (or arrives through a hospital invite link),
  waits for admin approval, then books and pays for sessions.
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
`/hospitals`, `/faq`, `/get-started`, `/book`.

**Patient:** `/patient/register`, `/patient/login`, `/patient/dashboard`,
`/patient/dashboard/profile`.

**Therapist:** `/therapist/login`, `/therapist/dashboard`,
`/therapist/dashboard/profile`.

**Hospital:** `/hospital/login`, `/hospital/dashboard`,
`/hospital/dashboard/profile`.

**Admin:** `/admin/login`, `/admin/dashboard` (tabbed: metrics, calendar,
roster, people directory, payments, payouts, payout requests, session story,
feature control), plus per-person detail pages at
`/admin/dashboard/patients/[id]` and `/admin/dashboard/therapists/[id]`.
Those detail pages use a parallel `@modal` route with intercepting routes, so
clicking a person from the dashboard opens an overlay while a direct link
still renders the full page.

**Shared:** `/pending-approval`, `/account-suspended`, `/reset-password`.

**API:** `src/app/api/**` — mutations are POST route handlers grouped by
audience (`admin/`, `appointments/`, `patient/`, `therapist/`, `hospital/`,
`packages/`, `razorpay/`). Every route re-authenticates server-side;
admin routes go through `src/lib/supabase/requireAdmin.ts`.

## How the app works

**Booking.** The `/book` wizard picks a treatment category, language, date,
and time slot. Slots respect a 12-hour minimum lead time
(`src/lib/bookingSlots.ts`), the therapist's weekly availability template
plus per-date overrides (`therapist_availability_template`,
`therapist_availability_override`), leave flags, and conflict checks
(`src/lib/checkTherapistConflict.ts`).

**Payments.** Razorpay checkout: `/api/razorpay/create-order` creates the
order, the browser opens the widget, and `/api/razorpay/verify` verifies the
signature server-side before the appointment is confirmed. Failures are
recorded in `payment_failure_log`. Session packages are bought the same way
via `/api/packages/create-order` and `/api/packages/verify`, then redeemed
with `/api/appointments/book-with-package`. The standard session fee and the
24-hour full-refund cancellation window live in `src/lib/pricing.ts`.
Cancellations inside the window get no refund; outside it, a Razorpay refund
is issued and stamped on the appointment.

**Video sessions.** Confirming an appointment creates a Google Calendar event
with a Meet link (`src/lib/googleCalendar.ts`,
`src/lib/googleCalendarSync.ts`). Calendar failures never block a booking —
the error is stored in `appointments.google_calendar_sync_error` and the
admin can retry with `/api/admin/retry-meet-sync`. The Join button only opens
inside a configurable window around the slot time.

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

**Admin-managed content.** Treatment categories (with ordering), packages,
FAQs, testimonials, booking languages, and feature toggles (Meet on/off, join
window, idle-timeout minutes, package visibility) are all editable from the
dashboard and stored in `site_settings` and their own tables — see
`src/lib/adminSettings.ts`.

**Realtime.** `src/components/RealtimeRefresh.tsx` subscribes to Supabase
Realtime so dashboards refresh when the underlying rows change.

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
