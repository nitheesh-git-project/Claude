<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

Next.js 16 has breaking changes - APIs, conventions and file structure may
all differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code. Heed deprecation
notices.
<!-- END:nextjs-agent-rules -->

# MoveRestore Physiotherapy

Production Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 app
for a physiotherapy practice: public marketing site, patient booking and
Razorpay payments across two delivery modes (video consultation and in-home
visits), therapist scheduling and payouts, hospital (B2B) referrals, and an
admin back office. Data, auth, storage and realtime come from Supabase;
session video links come from Google Calendar/Meet.

**This file is deliberately short.** It holds what you need *before* you know
what the task is: the rules whose failure cannot be undone, and a map to the
rest. The detail lives in `docs/rules/` and is read on demand - see
**Where the rules live** below. Read the file for what you are touching
before you change it; the rules exist because something was found the hard
way, and the reasoning is in there with the rule.

---

## Non-negotiables

Everything here is a rule whose failure is **unrecoverable, silent, or
destroys something real**. Everything else is in `docs/rules/`.

### Branches

**`staging` is the default branch and the only one anything merges to.
`main` is live.** "Merge" with no branch named means merge to `staging`, as a
pull request - both branches refuse a direct push, so a `GH013` refusal is
the rule working rather than a credential to go hunting for.

**Never merge to `main`.** That is a release to the deployed site *and* to
the production Supabase project, and the owner does it by hand, deliberately.
`STAGING.md` has the model, including the one thing that does **not** travel
with a merge: `supabase/schema.sql` reaches staging's database only when a
person applies it.

### Secrets

`SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET` and the Google
credentials are **server-only**. Never add a `NEXT_PUBLIC_` prefix to one and
never commit a real value. `ALLOW_DEBUG_DATA_RESET` stays **unset** - it arms
a button that truncates every table, and two committed `.env` files have
armed it before. `.env.example` documents every variable; a real value
belongs in `.env.local` (gitignored) or a server environment.

### Destructive tooling

These talk to a real database with the service-role key and **must never be
pointed at one holding real patients**: `scripts/seed-qa-accounts.mjs`,
`scripts/concurrency-checks.mjs`, `scripts/authorization-checks.mjs`,
`e2e/admin-degraded-schema.spec.ts` (it drops columns), and the e2e suite
generally. `scripts/debug-reset-sql-checks.sql` must never run against a
database anything else is using - `ROLLBACK` undoes its rows but not its
locks, and `TRUNCATE` takes an `AccessExclusiveLock` on every table.

### The schema file

`supabase/schema.sql` is the single source of truth and is **re-runnable**:
guarded with `if not exists` / `or replace`, with later sections adding
columns to earlier tables. **Add changes at the end** in that same style; do
not rewrite earlier statements. `create or replace` means the **last**
declaration wins, so edit the newest one - there are ten of
`debug_reset_all_data()`, and editing an earlier one changes nothing while
reading as though it did. Re-apply the file **twice** after touching it;
re-runnability is the whole deployment story and two guards are easy to
forget (a policy needs `drop policy if exists` under *its own* name, and
`alter publication ... add table` needs the `duplicate_object` wrapper).

Four things in there are not negotiable:

- **A new table gets its RLS policies in the same change.**
- **A `security definer` function is revoked from `public`, `anon` AND
  `authenticated` - all three, every time**, and gets an explicit safe
  `search_path`. Naming only the last two leaves PUBLIC's implicit grant,
  which is how two ledger functions came to be callable by anyone holding the
  publishable anon key. `npm run lint` fails on either omission.
- **Append-only means a trigger, not RLS.** Every route here writes with the
  service-role client, which bypasses RLS entirely, so for a table whose
  whole value is that it cannot be rewritten, "no route updates it" is not
  the same guarantee as "an update raises". A new evidence table gets its
  guard in the same change - and if its foreign keys are `restrict`, it also
  gets taught to `scripts/clean-e2e-residue.mjs`, or its residue is a
  permanent red row on System Health.
- **If a CHECK or a constraint fails against a live database, that failure is
  the finding.** Reconcile the rows; never weaken the check.

### Money and time

- Money is **integer paise**, never floats. Times are `timestamptz`.
  Percentages are 0-100.
- **Never trust a role, an id or an amount sent from the client** -
  re-derive it server-side.
- **Every date renders in the clinic's zone**, through
  `src/lib/formatDateTime.ts`. A bare `toLocaleString()` formats in the
  *runtime's* zone, which on the server is UTC, so a 6 PM IST session printed
  as 12:30 PM. `formatDateTime.test.ts` walks `src/` and fails on one without
  an explicit zone.
- **Business maths lives in dependency-free modules under `src/lib/`**, not
  inside components, so it can be tested without rendering.

### Routes

- **Every admin route guards with `requireAdminScope(section)`**, never
  `getAdminUser()`. The section is chosen by the capability, not by where the
  button sits - a refund is `money` even though its button lives on a Catalog
  screen. A control an admin's scope cannot call must not render.
- **Every POST body is parsed through `parseJsonBody`**, never
  `await request.json()`, which throws on a malformed body and returns a 500
  where the honest answer is a 400.
- **A check that could not be run is not a check that came back negative.**
  No session, a failed read, and genuinely-not-allowed are three different
  answers; collapsing them into one is how a Master Admin gets told they are
  not allowed to use a control they use every day. Same rule one layer up: a
  429 is not a "no", and an unreadable setting is "we couldn't check" rather
  than "the service is unavailable".
- **Don't hardcode admin-configurable behaviour.** Read it through
  `src/lib/adminSettings.ts` with a default. A constant is the *fallback*,
  never the answer - and every dashboard page must select
  `SITE_SETTINGS_SELECT` rather than its own column list.

### Don't name the back office to anyone outside it

A signed-in non-admin reaching `/admin/dashboard` is redirected to
`/get-started`, never `/admin/login`. No client component maps a role to a
dashboard path - `/dashboard` resolves that server-side. Check what a route
*says* as well as what it lets you do: a response body naming
`/admin/dashboard` to an anonymous caller is the same leak.

### Keeping the docs current

The docs describe the app, so they go stale the moment it changes. Update
them **in the same change**, and the same triggers apply to `e2e/` and
`docs/qa/src/` - a spec left asserting a product that no longer exists goes
stale silently and keeps passing. Any of these means the docs need a look:

- a new or removed route, page or API route handler
- a new role, or a change to how `approved` / `active` gate access
- a new environment variable, or a changed meaning for an existing one
- a schema change that affects a documented flow
- a changed rule: booking lead time, refund window, payment verification,
  Meet sync, payout maths
- a new npm script, dependency or build step

For the manual QA plan that means `docs/qa/src/*.md` **only** - never its
PDF, DOCX or HTML, which are built on request in a commit of their own.

---

## Where the rules live

`docs/rules/` holds the detail, split so you load what the task needs
instead of all of it. **Read the file before changing the thing.** When a
task spans two, read both - they are short.

| Touching | Read |
| --- | --- |
| `src/app/api/razorpay/**`, a capture, a refund, a cancellation | `docs/rules/payments.md` |
| `src/app/api/appointments/**`, a slot, a lead time, the booking wizard | `docs/rules/booking.md` |
| Money screens, the revenue split, payouts, settlements, costs, finance figures | `docs/rules/money.md` |
| Anything named `pay_later*`, what a patient owes, a write-off | `docs/rules/pay-later.md` |
| A discount, a promo code, an invite, what checkout quotes | `docs/rules/discounts.md` |
| A health profile, the Pain Map, a care plan, a session note, a patient file | `docs/rules/clinical.md` |
| The roster, availability, a specialisation, assigning a therapist, completing a session | `docs/rules/roster.md` |
| `visit_mode`, a service area, a travel fee, cash at the door, Calendar/Meet | `docs/rules/home-visit.md` |
| A programme, a package purchase, session credits, a hospital referral | `docs/rules/programmes.md` |
| `src/lib/adminNav.ts`, a scope, a Settings screen, System Health, the log, an export | `docs/rules/admin.md` |
| A patient/therapist/hospital dashboard, the Overview feed, realtime, navigation | `docs/rules/dashboards.md` |
| A public page, a photograph, a catalog card, the mission, the splash | `docs/rules/public-site.md` |
| Any component: dates, voice, a dialog, a disabled control, a toast, a list, accessibility, style | `docs/rules/frontend.md` |
| `supabase/schema.sql`, a Supabase client, RLS, a grant, the credit ledger, a sweep | `docs/rules/data-schema.md` |
| `src/proxy.ts`, a guard, rate limiting, impersonation, risk signals, the data reset | `docs/rules/ops-security.md` |
| Running tests, adding a spec, the SQL checks, the QA plan | `docs/rules/testing.md` |

Not sure which? `docs/rules/00-index.md` lists every rule by its own
sentence, so `grep` finds the file from a symptom. `rg -l "<the thing>"
docs/rules/` also works, and is usually faster than guessing.

Other reference, read on demand: `README.md` (the product and setup in full),
`docs/MONEY-MODEL.md`, `docs/LIFECYCLE-STATES.md`, `docs/DATA-POLICY.md`,
`e2e/README.md` (the suite's inventory), `docs/audit/` (what the audit found).

---

## Layout

```
src/app/                 pages, layouts, API route handlers (187 of them)
src/app/api/**           grouped by audience: admin/, appointments/, patient/,
                         therapist/, hospital/, packages/, razorpay/, and
                         medical-documents/ (the one route every role shares,
                         authorised by RLS rather than by role)
src/components/          UI by area: admin/ auth/ booking/ catalog/ dashboard/
                         home/ hospital/ marketing/ profile/ motion/ system/
                         visuals/
src/lib/                 domain logic, formatting, Supabase clients (264 files)
src/lib/supabase/        client / server / admin / public, the bounded fetch,
                         the proxy session refresh, and the auth guards
src/proxy.ts             auth proxy over the four dashboard route trees
supabase/schema.sql      the entire schema: tables, RLS, views, triggers
e2e/                     Playwright suite; e2e/README.md is its inventory
docs/rules/              the working rules, split by what you are touching
scripts/                 one-off tooling and the SQL check files
public/photos/           the public pages' photography (licence-free stock)
```

Most `src/lib/` modules are named for the question they answer
(`refundState.ts`, `clinicalAccess.ts`, `checkoutQuote.ts`), so
`ls src/lib/` is a usable index and the relevant `docs/rules/` file names
the ones that matter for that area.

---

## Commands

```bash
npm run dev                  # Next dev server
npm run verify               # lint + unit tests + build -- run before pushing
npm run lint                 # 5 schema/asset checks, then eslint
npm run test                 # Vitest, 1,267 tests over dependency-free src/lib
npm run build
npm run start:cluster        # production on several Node workers

npm run test:e2e             # the whole Playwright suite -- once before a merge
npx playwright test e2e/X.spec.ts   # one spec -- this is the per-change gear

npm run seed:qa              # recreate the QA fixture accounts after a reset
npm run clean:e2e            # clear fixture rows earlier e2e runs left behind
```

**Two gears, and the whole suite is the slower one.** A change gets
`npm run verify` plus the two or three specs covering what moved. The whole
suite runs **once before the merge**, on the branch as it will land: it is
`workers: 1` against one project by design, so running all of it per fix
spends minutes re-proving cases the change could not have touched, and it is
how a red run becomes routine. **Updating the suite is part of the change**,
though - a fix that alters what a person sees, a rule, a route or a row
writes or amends its spec in the same commit. Details, and the nine cases
that cannot pass without browser egress, are in `docs/rules/testing.md` and
`e2e/README.md`.

A change that cannot reach a test Supabase project stops at `npm run verify`.
