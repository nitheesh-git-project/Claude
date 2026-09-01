# Therapist roster — test plan

What is tested, at which layer, and why that layer. The roster's UI changed
completely and its storage model did not, so most of this plan is about
proving the second half of that sentence.

Four layers, chosen by what each one can actually prove:

| Layer | Runs with | Proves |
| --- | --- | --- |
| Unit (`src/lib/*.test.ts`, Vitest) | nothing | the range ⇄ hour conversion, validation, summaries, conflict detection |
| SQL (`scripts/roster-sql-checks.sql`, psql) | a scratch Postgres | the write functions under malformed and out-of-range input |
| E2E (`e2e/therapist-roster.spec.ts`, Playwright) | test Supabase + the app | authorization, concurrency, and that booking did not move |
| Browser (same spec + the checks below) | the app | accessible names, keyboard, save-spam, mobile |

## 1. Unit — the range layer

`src/lib/availabilityRanges.test.ts`, `src/lib/availabilityRequest.test.ts`.
No database, no browser.

- **Round trip.** Any set of hours becomes periods and comes back as
  exactly the same hours — `[]`, `[6]`, `[23]`, a sparse `[6,7,9,23]`, and
  the full 18. This is the migration guarantee: an existing schedule must
  read back unchanged.
- **Shape.** Contiguous hours collapse to one period; a lunch break stays
  two; unsorted and touching periods normalise.
- **Validation** (client and server share it): end before start, end equal
  to start, overlap, exact duplicate, a fractional hour, below 6 AM, past
  midnight, and the legal boundary `22:00–24:00`.
- **Payload parsing** (server only): not an array, more than seven days,
  a repeated day, day `7`/`-1`/`1.5`, a period that is a string, a period
  missing a field, string hours, more than 18 periods in a day, and an
  empty week — which is a real state, not an error.
- **Dates.** `parseDateKey` takes `2026-09-12`, refuses `2026-2-3`,
  `12-09-2026`, `2026-02-31`, a number and null; a past date is allowed,
  because correcting last week's roster is a real action.
- **Versions.** `parseExpectedVersion` takes an integer or nothing, refuses
  a negative, a float and a string.
- **Leave.** Dates optional; end before start refused; reason trimmed;
  ending leave clears the whole annotation.
- **Labels.** Weekday and month names are asserted exactly, and again under
  a shifted `TZ`. They are built in the module rather than by Intl because
  Node and Chromium do not agree ("Tuesday 8 September" vs
  "Tuesday, 8 September"), and that disagreement hydration-mismatched every
  exception row.
- **Effective availability.** A date with no exception reads the weekly
  hours; custom hours pin only their own date; an all-day exception empties
  it; a sparse pre-redesign row still resolves correctly; and the result
  agrees with `computeDayAvailability`, which is what the rest of the app
  reads.
- **Conflict detection.** Future non-cancelled sessions inside removed
  hours are found, in the therapist's timezone; cancelled and past ones are
  ignored; widening hours finds nothing.
- **Timezone.** One instant read in `Asia/Kolkata` and in `America/New_York`
  gives different weekdays and dates; a bad zone or a bad date returns null
  rather than guessing.

## 2. SQL — the write functions

`scripts/roster-sql-checks.sql`, run against a scratch database with
`schema.sql` applied. These are the cases the API routes cannot produce,
where the question is whether the database refuses cleanly.

Null payload · a duplicated slot · a full 126-hour week · hour 24 · day 7 ·
a version from another universe · the no-op path against a reordered,
repeated payload · an exception naming one hour twice · replacing a date
whole · clearing it · a blank note · a past date · deleting the therapist.

Two of these were bugs when first run: an exception payload with a repeated
hour raised `ON CONFLICT DO UPDATE command cannot affect row a second time`
in front of whoever pressed Save, and is now deduplicated last-mention-wins;
and the first-ever save for a therapist could race itself into a version
that never incremented, now an upsert-then-lock loop.

Concurrency is not in this file — it needs more than one session. See §3.

## 3. E2E — authorization, concurrency, booking

`e2e/therapist-roster.spec.ts`. Needs a test Supabase project.

**Admin (R-A01…R-A11).** The roster opens on therapists with a filter and a
search, and no hourly grid. A therapist's schedule opens with their timezone
stated. Hours save as ranges and land as the same hour rows; narrowing,
widening and two periods with a gap all persist. Copying a day leaves the
others alone. Turning a day off empties that day only. An exception owns its
own date: custom hours, unavailable all day, removed — with the weekly
schedule untouched throughout and the following week still reading the
weekly hours. Leave empties every date and gives them all back, with the
template intact underneath.

**Therapist (R-T01…R-T06).** Saving their own week, multiple periods, a day
off. Their screen shows their own hours, their timezone, and no grid. A
therapist aiming the admin route at a colleague gets 403; aiming their own
route at a colleague writes their own schedule, because that route reads the
session and never the body.

**Security (R-S01, R-S02).** Signed out, patient, hospital and therapist are
each refused by all three admin routes, and the probe is checked not to have
left leave switched on. Eleven malformed payloads — end before start,
overlap, duplicate, hours outside the day, invalid day, unknown therapist,
malformed date, impossible date, unknown mode, custom hours with none given,
leave ending before it starts — are each refused, and the stored schedule is
compared before and after.

**Concurrency (R-C01…R-C04).** Two identical saves carrying the same version
land as one change and bump the version once. A stale save wanting different
hours is refused with 409 and the winner's hours survive. Two exception
writes for one date leave 18 rows, 18 distinct hours.

Verified locally against Postgres 16 as well: twelve concurrent first-ever
saves serialise to version 13 with no torn state; twelve concurrent saves
carrying the same version give exactly one `ok` and eleven `conflict`;
twenty-four mixed saves, exception writes and clears leave no partial day
and no deadlock; and the lock is per therapist — a second therapist's save
completes in 38ms while another's row is held for five seconds.

**Booking regression (R-B01, R-B02).** Narrowing hours, closing a date and
going on leave each leave a booked appointment row byte-identical. The
patient's time picker offers the same options with the therapist's roster
wiped and the therapist on leave — because availability is a planning record
and the picker is the lead-time rule, and connecting the two would change
who is bookable on a deploy rather than on somebody's decision.

## 4. Browser — accessibility and interaction

Run against the components with fixture data. 23 of 24 checks pass; the one
failure is the pre-launch debug bar's unlabelled "Simulate now" input, which
is not part of this change.

- Every button, input, select and link has an accessible name.
- A day row announces "Monday, working, 9 AM to 1 PM and 2 PM to 6 PM", and
  an off day announces "Wednesday, not working" — not a colour.
- Working/Off is a real `switch` with `aria-checked`, toggles from the
  keyboard, and shows a visible focus state.
- Every status carries a word as well as a colour.
- A triple-clicked Save posts exactly once.
- A rejected save shows the error, never says "Saved", and keeps the
  unsaved-changes state.
- A 409 explains itself and offers to reload rather than overwriting.
- Overlapping periods are refused inline and disable Save; dragging a start
  past its end nudges the end instead of erroring.
- "Add hours" picks a window that is actually free, so it can never be the
  thing that makes a day invalid: on a day running to midnight it fills the
  morning, on a day with a lunch break it goes after the last period, and on
  a full day it is disabled. Spamming it leaves the day valid throughout.
- Twenty rapid toggles of one day land back where they started with nothing
  unsaved.
- Neither screen scrolls horizontally at 360px.

## What is deliberately not tested

- **That availability filters booking.** It does not, and R-B02 is the guard
  on it staying that way.
- **A therapist writing their own date exception.** They cannot; that has
  always been an admin action, and a redesign is not where permissions get
  widened.
- **Leave dates gating anything.** `profiles.on_leave` is the only thing
  that makes a therapist unavailable. The dates beside it are annotation, so
  that going on leave stays a decision somebody makes rather than a date
  passing.
