# Dr. Pooja's Physio

Production Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 app
for a virtual physical therapy practice: public marketing site, patient
booking and Razorpay payments, therapist scheduling and payouts, hospital
(B2B) referrals, and an admin back office. Data, auth, storage, and realtime
come from Supabase; session video links come from Google Calendar/Meet.

- `README.md` — product overview, setup, environment variables, routes, and
  how each flow works.
- `AGENTS.md` — the working rules for editing this codebase (imported below;
  follow it in full).
- `supabase/schema.sql` — the entire database schema, RLS policies, views,
  and triggers. Single source of truth, re-runnable, append-only.

Before writing code: read the relevant guide in `node_modules/next/dist/docs/`
— this Next.js version differs from training data.

Quick commands: `npm run dev`, `npm run build`, `npm run lint`. No test runner
is configured; verify with a build and a lint.

@AGENTS.md
