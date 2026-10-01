# Performance

What was done to make this app fast before launch, why each change was
chosen, and what is deliberately left. Read `docs/rules/data-schema.md`
(indexes, RLS, the row cap) and `docs/rules/ops-security.md` (the proxy
cookie) for the rules this produced.

---

## The starting point

Worth saying first, because it shaped everything below: the app was already
built for this. Queries were batched into `Promise.all` groups, every
dashboard route had a `loading.tsx`, nothing used `select('*')`, the
realtime refresh was leading-edge-debounced with a `notify` mode for the
admin dashboard, and the server clients shared a concurrency-capped fetch.
There was no naive code to clean up.

What was left was **structural** — work that happens on every request no
matter how tight each individual query is. Those are the changes with real
leverage, because they are multiplied by every page view rather than by one
screen's traffic.

---

## What changed

### 1. The root layout's four serial queries

`src/app/layout.tsx` read `site_settings` four times, one after another,
before it could render anything. That layout wraps every page, so every
load in the app — the marketing homepage included — paid four sequential
Supabase round-trips before the first byte.

They are **still four separate selects**. That part was never the problem
and is deliberate: these columns were added at different times, PostgREST
fails a select naming an unknown column outright, and folding them together
would mean a database missing the newest column renders every page with the
fallback brand. One missing column should cost its own group and nothing
else.

What changed is that they are concurrent, and cached —
`src/lib/siteSettingsCache.ts`, with React `cache()` for per-request dedupe
and `unstable_cache` tagged `site-settings` across requests.

`unstable_cache` rather than Next 16's `"use cache"` **on purpose**:
`"use cache"` requires `cacheComponents: true`, which changes caching
semantics for every route at once. That is a migration, not a performance
fix, and not something to flip underneath a payment flow.

Both routes that write the table drop the tag. They pass `{ expire: 0 }`
rather than the generally-recommended `"max"`, because `"max"` is
stale-while-revalidate — it would show the admin who just saved a setting
the old value one more time, which is exactly the "did my save work?"
confusion the existing `revalidatePath` calls were added to prevent.
(`updateTag`, the other immediate option, is Server-Actions-only and these
are Route Handlers.)

### 2. RLS predicates

128 policy predicates called `auth.uid()` bare. Postgres marks it volatile,
so it was re-evaluated **once per candidate row** — and inside the
`exists (...)` subqueries in the clinical-access policies, across the
product of two row counts. All live policies now use `(select auth.uid())`,
which the planner hoists into an InitPlan computed once per statement.

Same predicate, same rows, same authorisation. Only the number of times
Postgres recomputes a constant changes.

Four policies containing `auth.uid()` were **excluded**: each is dropped
later in `schema.sql` and never recreated, because its client-side INSERT
was withdrawn deliberately. Regenerating them to make them faster would
have quietly reopened what was closed on purpose. This is the main hazard
in mechanical SQL rewriting and the reason the generator checked for a drop
with no later create.

### 3. Indexes

20 added, each earned from a measured call site or an RLS predicate. The
reasoning, and the three rules for adding more, are in
`docs/rules/data-schema.md`.

Two things Postgres does not do for you bit here: a foreign key is not
indexed automatically (93 were not), and an unindexed FK makes a parent
`DELETE` scan the child table. One apparent gap —
`therapist_availability_template.therapist_id` — was not one: its
table-level `UNIQUE` already builds an index led by that column, which is
easy to miss in an FK audit.

### 4. The proxy's second round-trip

`auth.getUser()` plus a `profiles` read, serially, on every request under
the four dashboard trees. `getUser()` stays — it refreshes the token and
its cookie writes are load-bearing. The `profiles` read is now a signed
60-second cookie. Full reasoning, the two guarantees that make trusting a
cookie safe here, and the freshness trade-off: `docs/rules/ops-security.md`
and `src/lib/proxyProfileCache.ts`.

### 5. Client weight

Font Awesome's `all.min.css` was importing every style. The app used one
`fa-brands` icon and one `fa-regular` icon, each pulling a whole webfont
(113 KB and 19 KB) for a single glyph on every page. Both are inline SVG
now; only the solid stylesheet is imported. `docs/rules/frontend.md` has
the rule and the silent-failure mode it created.

Also: `images.formats` for AVIF/WebP (the public pages carry 3.8 MB of
JPEG photography), the last two raw `<img>` tags moved to `next/image` so
Supabase-hosted covers go through the optimizer, and
`optimizePackageImports` for `motion`.

### 6. The admin dashboard's serial waves

`src/app/admin/dashboard/page.tsx` issues ~87 queries. They were already
batched into `Promise.all` groups, but several standalone reads sat at
their point of use hundreds of lines further down, so each began only
after the whole preceding wave had finished — despite depending on nothing
in it.

Those are now started early and awaited where they are used, matching the
`authoringDataPromise` pattern the file already had. They keep their
isolation (each is still its own query, for the unknown-column reason) and
lose the serial round-trip.

---

## Two bugs found on the way, and fixed

Both are the same class, and the class is worth knowing: **PostgREST caps a
response at 1,000 rows and answers 200**, with nothing to distinguish it
from a table that holds exactly a thousand rows. `readAllRows` exists for
this; these two reads did not use it.

- **Promo code claim counts** were counted from a bare select over every
  promo-coded appointment. Past the cap the count silently stopped growing
  — and since Delete is offered only where the count is zero, a code with
  real claims behind the cap could be offered for deletion. Undercounting
  in the direction that unlocks a destructive control is the worst way
  round for that number to be wrong. Now paged, and narrowed with `.in()`
  to the codes actually on screen, which is also the faster query.
- **`readSettlementReconciliation`** summed money from two bare selects and
  asserts `confirmed = settled + unallocated`. One side hitting the cap
  before the other turns a balanced ledger into a reported discrepancy;
  both hitting it reports healthy on figures that are wrong. Now paged, and
  returns `null` when either walk truncates — which is what the function's
  own stated contract always required, since a partial total is not a
  smaller total but an unknown one.

---

## What is deliberately not done

- **The admin dashboard still builds every tab's data on load.** The shell
  is a client component that switches tabs with no server round-trip, so
  the current design trades first-load cost for instant tab switching.
  Streaming each tab behind its own `<Suspense>` would need each tab's
  fetching extracted into its own async component — a large refactor of a
  4,910-line file, and one that cannot be validated without running the
  admin e2e specs against a real Supabase project. It is the right next
  step, and it is its own change.
- **Splitting the admin dashboard into route segments per tab** would be
  better still and is a bigger product decision: it moves URLs, navigation,
  specs and docs, and it makes tab switching a navigation.
- **Redundant single-column indexes were left in place.** The new composite
  indexes serve their own prefixes, so several older single-column indexes
  are now redundant for reads. Dropping an index is the one schema change a
  re-run of `schema.sql` cannot undo, and the write cost of keeping them is
  small. Worth revisiting with production traffic to measure against.
- **Subsetting the solid webfont** (117 KB, ~192 of ~2,000 glyphs used)
  needs a font-subsetting tool in the build. That is a real dependency and
  a real build step for an app that currently needs neither; the two
  single-glyph webfonts were the disproportionate cost and they are gone.
- **The hero JPEGs are not re-encoded on disk.** `images.formats` means
  Next serves AVIF/WebP from them on demand, which gets most of the benefit
  without touching the source assets.

---

## Verifying a change here

`npm run verify` is the gate: lint (five schema/asset checks, then eslint),
1,184 unit tests, then the build. Watch the build's route table — the
public pages must still print `○ (Static)`. Anything that reads
`cookies()` or `headers()` in the root layout silently turns the whole
marketing site dynamic, which is the single easiest way to undo most of
section 1.

Schema changes are applied **twice** against a test project to prove
re-runnability, per `CLAUDE.md`. The full Playwright suite runs once on the
branch as it will land, not per change.
