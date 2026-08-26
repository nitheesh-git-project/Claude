# Dr. Pooja's Physio

Production Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 app
for a physical therapy practice: public marketing site, patient booking and
Razorpay payments across two delivery modes (video consultation and in-home
visits), therapist scheduling and payouts, hospital (B2B) referrals, and an
admin back office. Data, auth, storage, and realtime come from Supabase;
session video links come from Google Calendar/Meet. The admin back office is
organised into six sections — Today, Sessions, People, Money, Catalog,
Settings — defined once in `src/lib/adminNav.ts`.

The public marketing site is seven pages — `/`, `/conditions`,
`/how-it-works`, `/home-visit`, `/team`, `/faq`, `/hospitals` — defined once
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

Patient files (avatars, and the test reports and scans patients upload to
their health profile) live in Supabase Storage, never in a table column —
`patient_medical_documents` holds metadata only, and its bucket is private.
The patient's own record leaves the app as a PDF named
`Name_PatientCode.pdf` (`src/lib/healthProfilePdf.ts`), not as JSON.

Before writing code: read the relevant guide in `node_modules/next/dist/docs/`
— this Next.js version differs from training data.

Quick commands: `npm run dev`, `npm run build`, `npm run lint` (which also
runs `npm run check:realtime`, the Supabase Realtime publication coverage
check). A Playwright
e2e suite covers the money-critical paths, the public pages' section
navigation, the catalog detail dialogs, the specialist booking handoff and
the patient-only booking rule, therapist-suggested sessions, the Home
page walkthrough's admin-configured rotation pace, and self-signup without
an email-confirmation step, and the Session Completed cutoff
(`npm run test:e2e`, see `e2e/`)
but needs a test Supabase project and Razorpay test keys — verify a change
with a build and a lint.

These three docs describe the app, so keep them current: whenever a change
adds or removes a route, role, environment variable, npm script, or alters a
documented rule (booking lead time, refund window, payment verification, Meet
sync, payout math) or a schema flow, update the docs in that same change
before it reaches `main`. See "Keeping the docs current" in `AGENTS.md`.

@AGENTS.md
