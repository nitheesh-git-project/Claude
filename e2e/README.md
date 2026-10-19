# The end-to-end suite

101 spec files, over 500 cases, one worker. `npm run test:e2e` runs all of them;
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

In a sandbox whose egress goes through a TLS-inspecting proxy, that network is
usually there and only the trust is missing: Chromium reads `~/.pki/nssdb`, not
the system bundle, and fails every Supabase call with
`ERR_CERT_AUTHORITY_INVALID`. Add the proxy's CA certificates to that store
with `certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n <name> -i <cert.pem>`
(package `libnss3-tools`) and run with `PLAYWRIGHT_CHROMIUM_PATH` set, which
also routes Chromium through `HTTPS_PROXY`. That is trusting the proxy, never
disabling verification.

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
- **The `gateway-*` specs, `hospital-referral-revenue` and `concurrency` need
  the fake Razorpay** (`e2e/fake-razorpay.mjs`), and skip with the reason
  without it -- they never reach a real gateway. Start it
  (`node e2e/fake-razorpay.mjs`, port 4010), then run **both** `npm run dev`
  and Playwright with `RAZORPAY_API_BASE_URL=http://127.0.0.1:4010` and the
  same `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`; the specs sign
  the checkout callback and the webhook with them. In CI `run-runner.mjs`
  does all of this for every runner. Details: `docs/rules/testing.md`.
- **In CI the suite runs as eight runners split into parallel jobs**, each
  job on its own disposable local Supabase stack
  (`.github/workflows/quality-gate.yml`). Which runner owns which spec is
  `e2e/coverage-manifest.json`; how many jobs a runner gets, and which files
  may be divided between them, is `scripts/ci/runner-shards.json`. A new
  spec must be added to the manifest in the same commit or `check:coverage`
  fails. On that stack the browser
  reaches Supabase, so the no-egress cases above run for real. How to
  reproduce a runner locally: `docs/ci/QUALITY-GATE.md`.

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
| `unscheduled-purchases` | 3 | a paid purchase nobody ever booked anything against, on Programmes -> All Programmes ("Paid - nothing booked", narrowed to the day-old ones the Money alert counts) |
| `session-scheduling` | 6 | booking the sessions a patient paid for, none of which assigns itself even on a locked programme |
| `gateway-payment-capture` | 2 | a session priced by the server, captured at the gateway and verified with a correctly signed callback -- a forged signature, the wrong order or another patient changing nothing, a replay changing nothing (not even `paid_at`), no second checkout; a programme bought the same way granting its credits exactly once. Fake gateway; append-only writes - disposable project only |
| `gateway-webhook-recovery` | 3 | a capture whose verify never ran recovered by a signed `payment.captured` webhook exactly once (forged or unsigned refused before anything is recorded, a retry a duplicate, a second event and a late browser callback no-ops); `payment.authorized` recorded and applying nothing; a programme paid with the tab closed getting its credits from the webhook. Fake gateway; append-only writes - disposable project only |
| `gateway-cancellation-refund` | 2 | a patient's cancellation outside the window refunding the whole charge at the gateway against the paying payment and recording the gateway's refund id and attempt; inside the window no refund call at all, `not_eligible` and the window's own sentence. Fake gateway; append-only writes - disposable project only |
| `gateway-admin-refund` | 3 | an admin's partial session refund and a programme refund reaching the gateway for the route's figure and recorded against the right row; a refused refund recorded as refused (`failed` attempt with the gateway's reason, the row exactly as refundable as before, the admin told why) and the retry going through. Fake gateway; append-only writes - disposable project only |
| `therapist-cash-and-payouts` | 3 | the therapist's Earnings screen and the admin's Payouts row owing the same figure; cash at the door recorded once, by the visit's own therapist, at the system's price, and netted off on Payouts; a payout request for the net figure, a second refused, and settling it clearing both screens with the receipt. Own therapist and patient per run; settles a batch - disposable project only |
| `hospital-referral-revenue` | 3 | a referred patient's paid session earning the partner nothing until delivered, then its share at the rate frozen that day, then less after a gateway refund -- the hospital's Earnings screen and the admin's Partners card agreeing at every step. Own hospital, patient and therapist per run; fake gateway; disposable project only |
| `programme-sessions-via-admin` | 5 | every programme session (booked from credits, an accepted suggestion, a visit on a home-visit programme) waiting `requested` and unassigned; the All Sessions row naming the pre-picked programme therapist; one tap on "Assign <name>" confirming it; and a pre-pick no longer free named rather than offered |

### Authorization, exposure and failure

| Spec | Cases | Covers |
| --- | --- | --- |
| `admin-authz` | 5 | admin route authorization for every role |
| `admin-scoped-dashboard` | 6 | each scope's own landing screen, and Logs refusing all three limited desks at the screen *and* both routes |
| `admin-decline-application` | 3 | declining a signup or a hospital inquiry requires a reason, records it on People -> Declined, and flags the same email returning in Approvals; the route refuses a decline without a reason |
| `admin-approve-therapist` | 2 | approving a therapist asks for the revenue share and writes it with `approved`; the route refuses one without it from a money-scoped admin |
| `admin-payment-search` | 1 | a pasted Razorpay payment or order id finds the patient under People -> Patients and the card says which matched. Leaves one never-captured `payments` row (deletes are refused by trigger) for `npm run clean:e2e -- --apply` |
| `rich-text-profile` | 3 | the admin's display content and the therapist's bio keep headings, bold, paragraphs and lists in the grey saved view and the `/team` popup; Cancel with changes asks first; both routes refuse a body that is not an editor document. Restores the values it changed |
| `therapist-onboarding` | 3 | a patient nobody has onboarded, from the therapist's side: the banner at the top of Home, the "Onboarding needed" strip on the session card, Start onboarding opening the triage (and the `?start=onboarding` it arrived with consumed), the How onboarding works guide stepping through every condition type's real questions, and both gone once a record exists. Wipes and restores QA Patient B's condition record |
| `dashboard-tutorial` | 3 | the first-visit tutorial for a patient, therapist and hospital: opens by itself with dummy data, chapter chips jump, Done or a confirmed Skip records it seen and it stays shut, and a page title's or card's (i) replays just that chapter. Clears and restores `onboarding_seen_at` on the QA account it uses |
| `admin-multi-admin` | 4 | two admins acting at once; an approve and a decline racing on one signup (H-021) |
| `admin-exposure` | 6 | the back office is not named to anyone outside it |
| `admin-account-delete` | 3 | a delete that can only succeed on an account with no history |
| `admin-validation` | 10 | input validation |
| `admin-network` | 7 | network failure |
| `admin-degraded-schema` | 4 | columns and tables dropped and restored. **Point it at a throwaway project only** |
| `admin-debug-reset` | 5 | all four gates on the reset, and what survives it |
| `booking-account-role` | 8 | only a patient account can book; each dashboard's way home |
| `patient-isolation` | 5 | a report uploaded through the real route, typed by its bytes and opened through a short-lived signed link; another patient refused it at the route, at RLS and at Storage, and refused every clinical and money row |
| `patient-saved-addresses` | 3 | saving through the route (a served pincode linked to its area, an unserved one kept with none, the default moving rather than doubling), another patient refused an edit and a remove at the route (404, where remove used to answer 200 having changed nothing) and at their own RLS, and My Addresses removing one as a soft delete. Its own patient account |
| `patient-feedback-ratings` | 2 | only the patient's own completed session can be rated, once, 1-5 with a bounded note (another patient, the therapist, an upcoming session and a no-show all refused, nothing written), the act on All Logs, and the admin reading the score and note in the session drawer from Booking History. Append-only writes - disposable project only |
| `admin-impersonation` | 3 | who may start a swap (Master Admin only; never an admin, a suspended account, themselves, or without a ten-character reason), the row written before it opens, every write inside it logged under the admin as `impersonation.action`, the back office shut while it lasts, Exit from the banner restoring the admin, the proxy ending a lapsed window, and `/dashboard` (never an admin path) for a missing or forged marker. Append-only writes - disposable project only |
| `admin-maintenance-sweep` | 2 | `/api/cron/maintenance` refusing every caller without the shared `CRON_SECRET` (wrong, another scheme, one character more, a GET), and the right one running all seven steps and purging a stale issued credential while keeping a fresh one. Skips itself when `CRON_SECRET` is unset; the gate generates one per run |
| `hospital-isolation` | 5 | a second partner hospital cannot read, enumerate, withdraw or see on its screen another partner's referral, while the owner can |

### What a person reads

| Spec | Cases | Covers |
| --- | --- | --- |
| `footer-social-links` | 3 | the footer's social icons: only filled-in links drawn, each opening in a new tab, the WhatsApp number too; the save route refusing a non-https or wrong-network link |
| `admin-dashboard-ui` | 11 | the dashboard in a real browser |
| `admin-refresh-badge` | 4 | the badge counting other people's changes, not the admin's own taps |
| `admin-detail-overlay` | 4 | the overlay and the real route behind it rendering identically |
| `admin-settings-ia` | 7 | Settings' four captions and per-screen blurbs |
| `dev-reachout` | 4 | the footer's developer credit end to end: Contact me → Say hello → Let's talk → a row, a filled honeypot writing nothing, a Master Admin marking it contacted and keeping a dated thread of notes (add, edit, delete), and the switch asking on **both** directions with cancel changing nothing and the credit, the pages and the route following it |
| `admin-partners-and-credentials` | 6 | the three partner layouts, and a credential still readable after the refresh its own write triggers |
| `admin-profile-session-order` | 3 | a person's sessions ordered by when they are, not when they were booked |
| `admin-programmes` | 4 | Programmes: the pipeline counts and filters (and writes `pg_*` into the URL), a recommendation carries its `PED_PKG001` ID from publish and the purchase copies it, completing a session moves `-0/5` to `-1/5` on the list, All Sessions and the session drawer, the new ID / a copied ID with old progress / the old SP code all find it, and the drawer tells the story. Append-only writes: needs `E2E_ALLOW_APPEND_ONLY_WRITES=1` (or the CI stack); closes its recommendation and deletes its purchase and session after |
| `admin-all-logs` | 3 | Logs -> All Activity shows everyone, not only admins: a patient's real cancel writes a `user_activity_log` row with their role, the Patient filter finds it (chip and all) and narrows the list, and the Programme ID filter finds a fixture entry however it is typed; filters land in the URL as `al_*`. Append-only writes: needs `E2E_ALLOW_APPEND_ONLY_WRITES=1` (or the CI stack); one cancel row per run stays behind by design |
| `logs-subject-timeline` | 1 | tapping a log entry's subject, and the way back |
| `account-created-stamp` | 8 | every account saying when it was created, with the time on it |
| `booking-pay-button-live` | 3 | the pay button tappable while its price loads, with the wait stated rather than enforced |
| `checkout-resume` | 5 | Pay on an unpaid session reopens the wizard's Step 3 for that booking with the earlier promo code applied again (and removable); a changed price mints a new Razorpay order instead of reusing the old amount, and a dropped code is released from the row; a booking whose time has gone asks for a new one; a paid booking is not checked out again; an unpaid checkout shows as Awaiting payment, never in the admin's Needs a therapist queue |
| `booking-retry-after-cancel` | 4 | closing the payment sheet, then Back + Pay or a reload, books again at the same slot: the unpaid draft is replaced, never "You already have a session scheduled around this time"; and a new patient's account stays locked (no dashboard link, no approval) until the try limit, which unlocks it with "Your account is ready"; signing in while locked shows Finish your booking (Pay now, which reopens Step 3, / Pick another time), while a /patient/register signup still sees Approval Pending; the locked account is listed under People -> Abandoned checkouts and never in Pending Approvals (needs browser egress) |
| `activity-timeline` | 2 | a session's history names its booking, payment and assignment with who did each; a patient's Activity log filters by what happened (needs browser egress for the profile screen) |
| `assign-availability` | 2 | an admin cannot assign a therapist who is not working that hour (409 with the reasons), and opening the hour on the roster lets the same request through; the drawer names the session's date, and "Open the roster" closes the dialog and the drawer and lands on that therapist's hours |
| `booking-exit-link` | 2 | the way out of the wizard following the account - and never offering `/pending-approval` mid-booking |
| `checkout-speed` | 5 | create answering with the quote and the Razorpay order in one trip, and the tap-to-sheet timing route |
| `service-picker` | 11 | the service chosen before the slot, on both wizards; the home-visit wizard picking a condition (one visit, no count) and a `?category=` link landing on it |
| `health-profile-showcase` | 2 | a sample patient dashboard per specialty, labelled as a sample, that moves on by itself every five seconds and stops for good once a tab is picked |
| `date-field` | 6 | the clinic's own month grid in place of the browser's panel, including a past date, and Today bringing the grid back to this month |
| `form-validation-chrome` | 2 | the app's own message in place of the OS tooltip |
| `numeric-input` | 1 | a number box refusing `e`, `E` and `+` |
| `navigation-feedback` | 3 | a tap acknowledged, and a screen already rendered not fetched again |
| `realtime-reconnect` | 1 | "Live updates paused" draws once and its Refresh reconnects every channel and clears it (the realtime server is stood in for, since sandbox egress cannot carry the socket) |
| `section-nav` | 7 | the public pages' section rail and scroll arrow |
| `catalog-detail` | 8 | the public catalog's detail dialogs; on `/home-visit` a condition's card at its home-visit price with no count, and its Book button opening the wizard by `?category=` |
| `catalog-cover-image` | 11 | a cover uploaded, positioned and rendering the same on card, dialog and dashboard |
| `splash-screen` | 8 | the brand splash's cold-open, reload and long-absence rules |
| `journey-pace` | 16 | the home walkthrough's admin-configured rotation pace |
| `session-completed-cutoff` | 12 | the cutoff on every surface that lists a session; with no Meet link, "you can join from" gives way to "isn't ready yet" once the join time passes |
| `debug-clock` | 5 | the debug bar's simulated clock moving the completion gate, the session note's start check, Show number and the Pain Map exam's "has a session started" check while the debug bar is on; asserts refusals only, since a successful completion writes append-only settlement rows, a reveal an append-only log row and an exam an append-only pain_assessments row |
| `finish-session` | 6 | a therapist's Done opening the session note with the Pain Map step; the route refusing Done without a note; the not-started line keeping No-show beside Done; a completed session listed under Past (not Upcoming) for both therapist and patient while its slot is still ahead; a neuro patient finishing on the note alone, an orthopaedic one refused without the Pain Map (the last two append-only, disposable project only) |
| `layout-audit` | 81 | every public, patient, therapist, hospital and admin page at 17 viewports covering 20:9, 19.5:9, 22:9, 16:9, 16:10, 5:3, 7:5, 5:4 and the 12.9" iPad: no sideways scroll, nothing off the edge, no clipped text, no text spilling past its own box (a long word in a column squeezed by buttons), no overlaps (a control lying wholly inside the padding an input reserves for it - the password show/hide button - is an adornment, not an overlap). Read-only; `LAYOUT_ONLY=<substring>` narrows it |
| `layout-states` | 7 | the same 17-viewport checks on what only exists after a tap: the public menu, the patient More sheet and the admin menu, booking step 2, the programme scheduler, the therapist's finish dialog with a recommendation open, the admin session drawer. Seeds one confirmed session and deletes it |
| `programme-scheduling-timezone` | 3 | scheduling an owned programme: a zone-less time read in India not the server's zone, an off-the-hour time still refused, and the dashboard scheduler booking a tapped time. Run against a UTC server to reproduce the original bug |
| `session-feedback` | 2 | a patient rating with stars, a quick pick and a note, then the thank-you and, on a later visit, the summary; a therapist's low score offering what could be better and sending a pick alone. Checks the saved text. Leaves a completed session behind |
| `pain-trend` | 1 | "Are you getting better?" keeping two same-day exams as two points. Append-only writes - disposable project only |
| `recommendation-course` | 8 | a recommendation priced as the condition's per-session price x the count; hands-on making it home visits; the patient's card with the condition photo shown whole (not cropped) and no address on a video plan; a paid recommendation keeping the condition's photo and name on Your Programmes; admin Today's Recommendations card pinning one waiting for approval, then showing it with the patient; Accept & pay linking to Review & pay, where a new address with a pincode reaches checkout; the therapist's number field and live total; the Suggested teaser on every other patient screen. Append-only writes - disposable project only |
| `programme-checkout` | 5 | Review & pay for a recommended programme: Accept & pay on the card going to the page with no payment from the card; the server-quoted breakdown and full price with no code; a code valid on programmes taking its share off the programme total, Razorpay opened at exactly that figure and the purchase recording list price, discount and claim (a retry without the code releasing it); a session-only code refused with "This code can't be used on a programme." on the page and as a 409 from create-order; an unknown plan showing a way back and no Pay button. Razorpay is a stand-in that records the amount - nothing is paid. Append-only writes - disposable project only |
| `patient-meet-join` | 1 | the Join button on a patient's session tile with a Meet link seeded on the row (no Google call): shut before the window with when it opens as a clinic clock time, live inside it and opening that session's own link, shut again after it, "Session Completed" past the cutoff - boundaries read from Settings |
| `meet-link-note` | 2 | the note on a patient's and a therapist's online tile saying, as a clock time, when the Meet link shows |
| `patient-cancel-cutoff` | 3 | the online cancel cut-off: the route refusing inside it, the setting moving it (and its range check), the Cancel button hidden inside it |
| `therapist-patient-chart` | 1 | a patient's chart inside the therapist dashboard: no back link, the sidebar keeps My Patients lit |
| `admin-login` | 5 | the real login form: a valid admin, a wrong password (no session handed out), and a patient's, a therapist's or a hospital's credentials sent to `/get-started` with no hop through `/admin/login`. Outside the gate it needs the relay (see `docs/rules/testing.md`) and skips itself otherwise; inside the gate the same dev server serves it and an unreachable form fails the run |

### Clinical, roster and catalogue

| Spec | Cases | Covers |
| --- | --- | --- |
| `health-profile` | 31 | the per-specialty intake, the Pain Map, a free-text answer typed key by key (focus must stay in the field), the body map answered from the keyboard by name, triage refusing "None of these" beside a sign, the double-submit no-op, and clinical access following live or delivered care |
| `mobile-smoke` | 8 | public pages and every role's dashboard at phone width (Pixel 7) - no sideways scroll, navigation reachable; runs in the `mobile` project only |
| `clinical-continuity` | 5 | one patient's record across all three roles: the first fill, the session note (never patient-visible), a recommendation invisible and unbuyable until approved, the approval attributed, and a reopen losing nothing. **Disposable stack only** (`assertDisposableStack`) |
| `admin-care-plans` | 22 | who may write a recommendation on a therapist's behalf, and the whole review step |
| `session-suggestions` | 19 | therapist-suggested sessions, including button spam, concurrent answers, a dropped connection, and a time outside the therapist's own working hours refused up front |
| `risk-sweep-report` | 3 | the Risk screen naming the rules an incomplete sweep missed instead of saying "Nothing waiting", no warning after a complete one, and the report hidden from the anon key |
| `hospital-referrals` | 3 | one open referral per patient under five simultaneous submissions, a withdrawn one freeing the number, and the withdraw control saying so when the connection drops |
| `therapist-roster` | 21 | ranges, exceptions (the admin's and the therapist's own, today onwards), leave, authorization, stale and double-clicked saves, a versionless save refused once a schedule exists, and that no roster change moved a booking |
| `session-assignment` | 3 | an admin assigning, reassigning and being refused a therapist already booked then, each move on the reassignment log and the admin's trail, the session following into the therapist's own RLS; a no-show refused inside the late grace and to anyone but the therapist who ran it, recorded once by them and once by an admin for another therapist (those two append-only - disposable project only) |
| `therapist-leave` | 3 | `/api/therapist/set-on-leave`: only an approved therapist, malformed dates refused with the reason; on leave an admin's assignment is refused 409 naming the leave and its dates while the session they hold and their roster stay put; back from leave the dates clear and the same assignment goes through. Its own therapist and patient accounts |
| `roster-read-write-day` | 7 | the read-only gate, the day view, and the **first** save for a therapist with no state row |
| `therapist-readiness` | 4 | the five things a therapist needs before live patients |
| `therapist-specialty` | 3 | a specialisation as a value rather than a sentence |
| `therapist-request` | 4 | booking a named specialist from `/team` |
| `patient-registration` | 7 | self-signup with no email-confirmation step |
| `consultation-first` | 4 | direct programme purchase is gone, a stale `?package=` is answered, and an old link to the four-visit home programme gets the programme refusal (403) rather than one visit |
| `catalog-home-visit-prices` | 5 | Catalog -> Conditions as the one catalogue (Online sessions, then Home visits; `?tab=packages` lands there); set own price and use clinic-wide each leaving exactly one active price row and moving the wizard's quote; the route's 400s, 404 and 403; two admins at once leaving one price (200/409, either order); a hands-on recommendation written at the own price then the clinic-wide one (that last case append-only - disposable project only) |
| `booking-rules` | 9 | lead time, the cancellation window, and the bulk-scheduler regression |
| `home-visit-disabled` | 2 | the master switch off, flipped in the **database** rather than through the route - the case the cache could not survive |
| `dark-mode` | 4 | the Appearance switch: off stays light on a dark device, on follows the device (and live), the brand button keeps its fill, printing stays light |
| `chrome-and-loader` | 4 | the sign-in nav keeps its buttons, a slow dashboard tab shows the word-roll loader with the sidebar still in place, the admin sidebar is light, and /conditions puts programmes first |
| `impersonation-exit` | 1 | "Exit and go back to admin" restores the admin's own session and lands on the dashboard, not the login page |
| `country-pricing` | 3 | Countries & currency: the screen and its search, a US visitor reading dollars rounded up to .99 while the quote charges the rupee equal, no home visit offered abroad, and no country switched on without a rate |
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
