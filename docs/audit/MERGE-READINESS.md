# Merge readiness — `claude/audit-fixes`

Written after the whole browser suite was run against the branch as it will
land, twice: once to find what was wrong, and once to prove it no longer is.

## Verdict

**Ready to merge**, subject to the last full suite run finishing clean — its
result is appended at the foot of this file. Everything else is green and
every failure found has been resolved rather than explained away.

| Gate | Result |
| --- | --- |
| `npm run verify` | **exit 0** — lint, 3 schema checks, build |
| Unit tests | **1163 passed**, 80 files |
| `check:realtime` | 46 subscribed tables, all published |
| `check:grants` | 33 definer functions revoked; 2 intentionally reachable |
| `check:search-path` | 58 definer functions, all with a safe `search_path` |
| eslint | clean |
| `clean:e2e --reconcile` | balances that disagree: **0** |

## The two bugs you reported

**"Approval Pending" on Step 3 of booking.** Fixed. `BookingExitLink` no
longer offers the pending-approval destination mid-booking. A patient who
signs up *inside* the wizard is unapproved by construction —
`create-order` approves them the moment they genuinely attempt checkout —
so telling them they were awaiting approval at the payment screen was both
wrong and a dead end that abandoned the booking. Suspended is still named,
deliberately: checkout refuses those accounts, so silence there would leave
a button that cannot work. Guarded by `e2e/booking-exit-link.spec.ts`.

**The debug reset deleting website data.** Fixed, on the *last* of the ten
`create or replace debug_reset_all_data()` declarations — the one that wins.
`site_settings` and `risk_rules` are no longer touched at all, and `faqs`,
`testimonials` and `mission_principles` are kept alongside
`treatment_categories`. Clinic name, tagline, description, contact email and
phone, footer, mission and vision all survive a reset. Patient, therapist,
hospital and every row hanging off them still goes. The button's own warning
copy says so. Asserted both ways by
`scripts/debug-reset-sql-checks.sql` — the test data that must go, and the
clinic's own writing that must survive.

## What the whole-suite run found

Sixteen failures across six chunks. Seven were the known no-egress cases:
this sandbox blocks the *browser* from reaching Supabase, so the booking
wizard never leaves Step 2. They fail identically on an unmodified tree and
are not defects. The other nine were real, and two were product bugs.

### 1. A regression this branch would have shipped — `update-setting` 500

`update-setting`'s compare-and-swap passed the value it had just read
straight to `.eq()`. For a `jsonb` column that value is a JS array, and
postgrest-js renders a JS array as a Postgres **array literal** —
`{ortho,neuro}` — which Postgres then tries to read as json and refuses:
`22P02 invalid input syntax for type json`.

Two settings are jsonb and both were unreachable: **Condition Types** and
**Booking Languages**. `booking_languages` is `not null default
'["English"]'`, so its previous value is never null, the `.eq()` branch
always ran, and the failure was total — an admin could not change either
one at all.

Comparing the serialised text fixes it and keeps the guard real. Verified
both ways against a live database: the correct text matches the row, and a
value the column does not hold still matches nothing, so the stale-write
409 is unchanged. Caught by `health-profile.spec.ts` AD-006/007.

### 2. A pre-existing bug on `main` — a chart widening the page

`TrendCharts` measures its container after mount and draws to that width,
deliberately rather than stretching a viewBox, which would squash the axis
labels. What the server renders before the observer runs is a fixed 640px
SVG, and its wrapper was `w-full` with nothing clipping it — so on a phone
the chart was 640px wide inside a 360px page and the whole document
scrolled sideways until hydration caught up. On this dashboard, 1.7MB of
HTML with 34 screens mounted at once, that is not a blink.

Money → Summary overflowed a 360px viewport by **321px**, which is exactly
640 plus the card and page padding less the viewport.

Clipping costs nothing after hydration: the observer reads
`contentRect.width`, which an overflow rule does not change. Shrinking the
default instead would make every desktop first paint draw a small chart and
then jump.

### 3. A design flaw — the back-office directory had no order

`Settings → User Access` read its admins with no `ORDER BY`, so the list
came back in whatever order Postgres handed over, which can differ between
two renders of the same screen. Invisible while everyone fits on one page,
and real the moment they do not: the list pages at ten and this database
holds sixteen back-office accounts, so an unordered read decided **who was
on page one**. Sorted by name now, nameless rows last, email breaking ties.

### 4. A gap this branch left in its own tooling

The branch added two append-only evidence tables — `refund_attempts` and
`session_settlements` — with every foreign key `on delete restrict`. That
is correct: `set null` is an UPDATE their own triggers refuse, and
`cascade` would destroy the record that money moved. But neither was taught
to `scripts/clean-e2e-residue.mjs`, so fixture rows became undeletable.

That is not a tidiness problem. The leftover purchases made the clinic look
like it owed undelivered visits, which correctly made the Home Visit switch
ask before going off — and took an unrelated test red describing a screen
working exactly as designed. Unclearable residue is also a permanent red row
on System Health with nothing wrong behind it.

### 5. Four specs were asserting something other than their own rule

None of these was catching a real defect.

- **NAV-003** checked for an `input[type="date"]`. `DateField` replaced all
  twenty-eight native date inputs before this branch and
  `nativeDateInput.test.ts` fails the build on a new one — so the assertion
  had been **unreachable**, hidden behind a skip that fires whenever nothing
  is booked for today. A populated database is what finally ran the line,
  three product changes after it stopped being true. This is the exact
  failure AGENTS.md warns about: a spec asserting a product that no longer
  exists goes stale silently and keeps passing.
- **SP-001** is titled "neither wizard offers a native dropdown of
  services" and asserted the whole document holds no `<select>`. The
  pre-launch debug bar ships on in every environment and renders one.
  Scoped to the wizard — switching the bar off for the suite would stop the
  tests exercising what a visitor gets.
- **PC-004** located its own row among whichever ten happened to render.
- **WAIT-AREA-001** expected a travel fee derived from a city's existing
  areas and never created them, inheriting them from whatever ran before —
  which is what AGENTS.md forbids for exactly this reason.

## Also fixed earlier on this branch

**Every admin-created booking answered 500 after creating the
appointment.** `create-booking` threw `ReferenceError: status is not
defined` — the binding was lost in `287338b` (on `main`) when the atomic
claim replaced the read-then-insert, and the two references below it were
not. The appointment was created and the admin was told it failed, so they
booked again. Found by an e2e case, not by any unit test or SQL check: the
throw happens past every guard, so the route does its work and then dies
naming the answer.

## The 135 items

`docs/audit/AUDIT-FIX-REPORT.md` carries all of them, numbered to match your
list, each saying what was actually wrong, what you proposed, what I did and
how it was checked. The headline is unchanged by this run: **101 fixed**, 10
closed by writing the definition down, 7 already held, **17 open** — of which
16 are infrastructure this deployment does not have (a worker, a queue, a
malware scanner, an APM) and one, item 41, is ready for you to switch on: its
precondition is verified, `verify_entitlement_balances()` returns zero rows.

## One thing that needs you

`SUPABASE_ACCESS_TOKEN` in `.env.local` is being **rejected with 401**, so
`npm run clean:e2e -- --apply` cannot run. Nothing depends on it now —
`--reconcile` reports zero disagreements and the one spec that needed a clean
database parks and restores its own state — but the token wants regenerating
at https://supabase.com/dashboard/account/tokens.

Separately, and more importantly: the Supabase and Razorpay credentials
pasted into the chat earlier are permanently in that transcript and **still
need rotating**. They live only in `.env.local`, which `.gitignore` matches
and which has never been committed.

