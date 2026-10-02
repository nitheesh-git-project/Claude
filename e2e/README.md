# The end-to-end suite

54 spec files, ~390 cases, one worker. `npm run test:e2e` runs all of them;
`npx playwright test e2e/<name>.spec.ts` runs one.

This file is the **inventory** - what exists and what each file is for. The
*rules* behind the suite (the two gears, what must not be tested where, and
why a red run is usually the sandbox) live in `docs/rules/testing.md`; read it before
changing how a spec works. `ROSTER-TEST-PLAN.md` beside this file is the one
worked example of choosing a layer per property.

## Before you file a bug against a red run

**Eleven cases cannot pass without browser egress to Supabase**, and all of
them fail identically on an unmodified tree. The specs sign in by injecting a
Node-minted session cookie, which covers authentication but not data: a page
that resolves something with the browser-side client still needs the network
from Chromium.

| Case | Fails as | Why |
| --- | --- | --- |
| `therapist-request` TR-002 | the requested-specialist chip never renders | `BookingWizard` resolves `?therapist=` against `public_therapist_profiles` from the browser, because the page is ISR-cached |
| `booking-rules` BR-CANCEL-001/002 | `Free cancellation` not found | `BookingWizard` reads `isLoggedIn` from its own `auth.getUser()`, so the injected cookie is invisible to it, Step 2 renders signed-out and the walk never reaches Step 3 |
| `pay-later` PL-UI-003 to PL-UI-006 | four money assertions on a booking that was never made | same Step 2 wall; `07-book-step2-filled.png` shows it offering *Create Password* to a patient the spec had just signed in |
| `booking-pay-button-live` (all 3) | the pay button **not found** | same Step 1 → Step 3 path, so it reads as the very regression it guards - a dead button and an absent one are different faults |
| `admin-refresh-badge` RB-002, RB-003 | the badge never reaches 1, ~55s | the badge is driven by `postgres_changes` arriving over the browser's **realtime websocket**, so it needs egress just as much as a fetch does. RB-001 asserts the count is *zero* and so passes for the wrong reason, exactly like TR-003 below |

`node scripts/.qa/egress-check.mjs` settles it in one call: "Failed to fetch"
from inside the page where the same request succeeds from Node is the network
policy. Note `therapist-request` TR-003 asserts that chip is *absent*, so in
the same environment it passes for the wrong reason.

The last full run on `staging` was **343 passed, 9 failed, 11 skipped** -
those nine, and nothing else. A later run in a sandbox without browser
egress read **343 passed, 8 failed, 19 skipped, 6 did not run**: the same
set, with TR-002 skipped rather than failed and the `pay-later` file
stopping at PL-UI-001 on leftover fixture rows (`npm run clean:e2e --
--apply`, which needs a valid `SUPABASE_ACCESS_TOKEN`). The passing total
is the stable number; what moves is how a blocked case is reported. Take the **set** as the invariant, never the
total, which moves with every spec added.

## Running them

- `PLAYWRIGHT_CHROMIUM_PATH` - point it at a Chromium the machine already has.
- `E2E_BASE_URL` - defaults to `http://localhost:3000`; a `webServer` block
  starts `npm run dev` if nothing is listening.
- **Run against `next dev`, not `next start`.** The public pages are
  ISR-cached (`revalidate = 300`), so a production server serves HTML built
  before the fixture row the spec just created. `catalog-detail` fails four
  ways under `next start` and passes 7/7 against `next dev`, and those
  failures look exactly like a broken catalog.
- The timezone is pinned to `Asia/Kolkata` in `playwright.config.ts`. Do not
  move it to an environment variable: on a UTC host the whole-hour slot rule
  takes twenty cases red at once, every one describing a working product.
- `npm run clean:e2e` clears fixture rows earlier runs left in the database.
  Use `--reconcile` first - it releases reserved credits and cancels the
  appointments rather than deleting anything, which is what the ledger's
  append-only trigger asks for. `--apply` deletes outright and is the only
  mode that can clear pay later's fixture money.
- `npm run seed:qa` recreates the fixture accounts after a data reset.

## The inventory

### Money, and anything that moves it

| Spec | Cases | Covers |
| --- | --- | --- |
| `admin-money` | 5 | payout and refund arithmetic, the Money figures |
| `concurrency` | 3 | the CAS-guarded races: refund double-fire, therapist reassignment, referral double-assignment |
| `refund-attempts` | 7 | the record a refund writes **before** the gateway is called. Drives the **database**, not the routes - every refund writer holds the service-role client, so the only guarantee worth testing is that a rewrite raises from the same client the routes hold |
| `pay-later` | 7 | the grant, a booking with no payment screen, completion putting money in three places at once, a declaration that settles nothing, a write-off that costs the clinic without moving a money figure |
| `discounts` | 7 | the four acquisition discounts and what each records |
| `acquisition-codes` | 18 | a promo code quoting with no amount in the request, a redemption cap, a paused campaign, an invite that cannot be self-claimed, and the free-booking path |
| `unscheduled-purchases` | 3 | a paid purchase nobody ever booked anything against |
| `session-scheduling` | 6 | booking the sessions a patient paid for |

### Authorization, exposure and failure

| Spec | Cases | Covers |
| --- | --- | --- |
| `admin-authz` | 5 | admin route authorization for every role |
| `admin-scoped-dashboard` | 6 | each scope's own landing screen, and Logs refusing all three limited desks at the screen *and* both routes |
| `admin-multi-admin` | 3 | two admins acting at once |
| `admin-exposure` | 6 | the back office is not named to anyone outside it |
| `admin-account-delete` | 3 | a delete that can only succeed on an account with no history |
| `admin-validation` | 10 | input validation |
| `admin-network` | 7 | network failure |
| `admin-degraded-schema` | 4 | columns and tables dropped and restored. **Point it at a throwaway project only** |
| `admin-debug-reset` | 5 | all four gates on the reset, and what survives it |
| `booking-account-role` | 8 | only a patient account can book; each dashboard's way home |

### What a person reads

| Spec | Cases | Covers |
| --- | --- | --- |
| `admin-dashboard-ui` | 11 | the dashboard in a real browser |
| `admin-refresh-badge` | 4 | the badge counting other people's changes, not the admin's own taps |
| `admin-detail-overlay` | 4 | the overlay and the real route behind it rendering identically |
| `admin-settings-ia` | 7 | Settings' four captions and per-screen blurbs |
| `admin-partners-and-credentials` | 6 | the three partner layouts, and a credential still readable after the refresh its own write triggers |
| `admin-profile-session-order` | 3 | a person's sessions ordered by when they are, not when they were booked |
| `logs-subject-timeline` | 1 | tapping a log entry's subject, and the way back |
| `account-created-stamp` | 8 | every account saying when it was created, with the time on it |
| `booking-pay-button-live` | 3 | the pay button tappable while its price loads, with the wait stated rather than enforced |
| `booking-exit-link` | 2 | the way out of the wizard following the account - and never offering `/pending-approval` mid-booking |
| `service-picker` | 11 | the service chosen before the slot, on both wizards |
| `date-field` | 5 | the clinic's own month grid in place of the browser's panel, including a past date |
| `form-validation-chrome` | 2 | the app's own message in place of the OS tooltip |
| `numeric-input` | 1 | a number box refusing `e`, `E` and `+` |
| `navigation-feedback` | 3 | a tap acknowledged, and a screen already rendered not fetched again |
| `section-nav` | 7 | the public pages' section rail and scroll arrow |
| `catalog-detail` | 8 | the public catalog's detail dialogs |
| `catalog-cover-image` | 11 | a cover uploaded, positioned and rendering the same on card, dialog and dashboard |
| `splash-screen` | 8 | the brand splash's cold-open, reload and long-absence rules |
| `journey-pace` | 16 | the home walkthrough's admin-configured rotation pace |
| `session-completed-cutoff` | 11 | the cutoff on every surface that lists a session |
| `admin-login` | 4 | the real login form. Needs the relay (see `docs/rules/testing.md`); skips itself otherwise |

### Clinical, roster and catalogue

| Spec | Cases | Covers |
| --- | --- | --- |
| `health-profile` | 28 | the per-specialty intake, the Pain Map, the double-submit no-op, and clinical access following live or delivered care |
| `mobile-smoke` | 8 | public pages and every role's dashboard at phone width (Pixel 7) - no sideways scroll, navigation reachable; runs in the `mobile` project only |
| `admin-care-plans` | 21 | who may write a recommendation on a therapist's behalf, and the whole review step |
| `session-suggestions` | 18 | therapist-suggested sessions, including button spam, concurrent answers and a dropped connection |
| `therapist-roster` | 16 | ranges, exceptions, leave, authorization, stale and double-clicked saves, and that no roster change moved a booking |
| `roster-read-write-day` | 7 | the read-only gate, the day view, and the **first** save for a therapist with no state row |
| `therapist-readiness` | 4 | the five things a therapist needs before live patients |
| `therapist-specialty` | 3 | a specialisation as a value rather than a sentence |
| `therapist-request` | 4 | booking a named specialist from `/team` |
| `patient-registration` | 7 | self-signup with no email-confirmation step |
| `consultation-first` | 4 | direct programme purchase is gone, and a stale `?package=` is answered |
| `package-category-picker` | 1 | a new package's condition is a real picker, not a lock |
| `package-form-flags` | 1 | the placement switches that decided nothing are gone |
| `booking-rules` | 9 | lead time, the cancellation window, and the bulk-scheduler regression |
| `home-visit-disabled` | 2 | the master switch off, flipped in the **database** rather than through the route - the case the cache could not survive |
| `waitlist-serve-area` | 1 | marking an out-of-area request served, both answers |

## Adding one

Updating the suite is part of the change, not part of the merge: a fix that
alters what a person sees, a rule, a route or a row writes or amends its spec
**in the same commit**. Add its row above in the same edit - a spec nobody
can find is one nobody maintains.

Two rules worth knowing before you write a locator:

- **The admin dashboard mounts all 34 screens at once behind `hidden`.** A
  bare `page.locator("ul > li")`, `form` or `getByText(/working/)` matches
  something on a screen nobody is looking at, and the failure reads as a
  broken feature. Locate by role **and name**, or filter
  `{ visible: true }`. `getByRole` skips hidden elements, so a role query
  finding *nothing* here usually means the wrong `?tab=`.
- **`getByRole(name:)` matches the accessible name**, which an `aria-label`
  replaces. A control labelled `aria-label="Choose a date"` is not findable
  by its visible date text through a role query.
