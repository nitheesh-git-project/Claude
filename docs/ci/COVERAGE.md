# Quality-gate coverage

<!-- Generated from e2e/coverage-manifest.json by `node scripts/ci/check-coverage-manifest.mjs --write-doc`. Do not edit by hand. -->

What each runner's specs exercise, at which level, and what nothing proves yet.
`browser` is a real Chromium page. `api` is the app's HTTP routes from Node.
`db` is SQL or the service-role client directly. A flow listed only at
`api` or `db` level has no browser journey behind it.

Statuses:
- **covered**: specs exercise the flow as described.
- **partial**: specs exercise some of it. The limitation says which part is missing.
- **gap**: nothing exercises it.
- **blocked**: it cannot be exercised without infrastructure or an owner decision.

A green gate means these tests passed. It does not prove the application has no bugs.

## patient

Patient booking, intake, checkout, discounts, pay later, isolation and the patient's phone view

| Flow | Status | Req. | Level(s) | Specs / scripts | Limitation |
| --- | --- | --- | --- | --- | --- |
| `patient.registration` Self-signup returns a session with no email step, lands unapproved, and waits on the admin | covered | yes | browser | `patient-registration.spec.ts` | - |
| `patient.health-profile` Per-specialty intake, Pain Map, re-triage, and clinical access following live or delivered care | covered | yes | browser | `health-profile.spec.ts` | - |
| `patient.booking-rules` Lead time, bulk-schedule limit, cancellation window and the unserviceable-pincode refusal | covered | yes | api | `booking-rules.spec.ts` | - |
| `patient.booking-account-role` Only a patient account can book; every other role is told why and offered its way home | covered | yes | browser | `booking-account-role.spec.ts` | - |
| `patient.booking-wizard` The booking wizard: service picker, deep links, named specialist, exit link, a pay button that stays tappable, a cancelled payment retried at the same slot, and a new account locked until it pays or runs out of tries | covered | yes | browser | `service-picker.spec.ts`, `therapist-request.spec.ts`, `booking-exit-link.spec.ts`, `booking-pay-button-live.spec.ts`, `booking-retry-after-cancel.spec.ts` | - |
| `patient.consultation-first` Consultation first: direct programme purchase is gone and a stale link is answered | covered | yes | api | `consultation-first.spec.ts` | - |
| `patient.checkout-quote` Checkout answers with the quote and the Razorpay order in one trip, and records timing without identity | covered | yes | api | `checkout-speed.spec.ts` | Needs Razorpay test keys (RAZORPAY_TEST_KEY_ID/SECRET): CS-001 creates a real test-mode order. |
| `patient.promo-and-invite` Promo codes quote with no amount in the request, caps hold, paused codes do nothing, invites cannot be self-claimed | covered | yes | api | `acquisition-codes.spec.ts`, `discounts.spec.ts` | - |
| `patient.free-booking` A 100%-off booking resolves to zero, confirms with no payment row, and refuses anything still owed | covered | yes | api | `acquisition-codes.spec.ts` | - |
| `patient.pay-later` Pay later end to end: grant, a booking with no payment screen, completion, declaration, settlement, write-off | covered | yes | browser | `pay-later.spec.ts` | - |
| `patient.unscheduled-purchases` A paid purchase nobody booked against is counted and opens exactly the rows it counted | covered | yes | browser | `unscheduled-purchases.spec.ts` | - |
| `patient.home-visit-switch` The home-visit master switch and the serve-area waitlist | covered | yes | browser | `home-visit-disabled.spec.ts`, `waitlist-serve-area.spec.ts` | - |
| `patient.payment-capture` A patient pays through Razorpay Checkout and the capture is verified (signature, webhook, idempotent re-delivery) | blocked | no | - | - | No spec drives the hosted Checkout sheet or posts a signed verify/webhook payload. Needs Razorpay test-mode checkout automation or a signed-webhook fixture built from a generated RAZORPAY_WEBHOOK_SECRET; neither exists yet. |
| `patient.cancellation-refund` A patient cancels and the automatic refund (outside the window) or no refund (inside it) reaches the gateway | gap | no | - | - | The cancellation window copy and setting are covered (booking-rules); a cancellation that triggers a gateway refund is not exercised because it needs a captured test-mode payment. |
| `patient.document-upload` A patient uploads a report through the route; it is typed by its bytes, stored in a private bucket and opened through a short-lived signed link | covered | yes | api | `patient-isolation.spec.ts` | - |
| `patient.cancel-cutoff` A patient can't cancel an online session inside the clinic's cut-off | covered | yes | browser | `patient-cancel-cutoff.spec.ts` | - |
| `patient.isolation` Another patient can neither open nor delete a patient's report, and their own RLS client reads none of the patient's clinical or money rows or export | covered | yes | db | `patient-isolation.spec.ts` | - |
| `patient.saved-addresses` Saved addresses: save, remove, and another patient refused | gap | no | - | - | No spec drives /api/patient/addresses/save or /remove yet. Feasible on the local stack; not yet written. |
| `patient.feedback-ratings` A patient rates a completed session and leaves feedback | gap | no | - | - | No spec drives the rating/feedback write; admin-money only reads rating exclusions. Feasible; not yet written. |
| `patient.meet-join-rules` The Meet link is shown only inside the join window | gap | no | - | - | Meet links need GOOGLE_CALENDAR_* (forbidden in CI); the join-window rule has unit tests in src/lib but no browser journey. |
| `patient.package-purchase` A patient buys a programme through Razorpay and receives session credits | gap | no | - | - | Needs the Razorpay test checkout sheet driven in a browser or a signed verify payload; consultation-first only proves the refusal path. Needs a provider-sandbox decision. |

Specs owned (19): `acquisition-codes.spec.ts` (api/db, desktop, provider-sandbox), `booking-account-role.spec.ts` (browser/api, desktop, local), `booking-exit-link.spec.ts` (browser/db, desktop, local), `booking-pay-button-live.spec.ts` (browser, desktop, local), `booking-retry-after-cancel.spec.ts` (browser/db, desktop, provider-sandbox), `booking-rules.spec.ts` (browser/api/db, desktop, local), `checkout-speed.spec.ts` (api/db, desktop, provider-sandbox), `consultation-first.spec.ts` (browser/api, desktop, local), `discounts.spec.ts` (api/db, desktop, provider-sandbox), `health-profile.spec.ts` (browser/api/db, desktop, local), `home-visit-disabled.spec.ts` (browser/api/db, desktop, local), `patient-cancel-cutoff.spec.ts` (api/browser, desktop, local), `patient-isolation.spec.ts` (api/db, desktop, local), `patient-registration.spec.ts` (browser/api/db, desktop, local), `pay-later.spec.ts` (browser/api/db, desktop, local), `service-picker.spec.ts` (browser/db, desktop, local), `therapist-request.spec.ts` (browser/db, desktop, local), `unscheduled-purchases.spec.ts` (browser/db, desktop, local), `waitlist-serve-area.spec.ts` (browser/db, desktop, local)

## therapist

Therapist roster, readiness, specialty and the therapist's phone view

| Flow | Status | Req. | Level(s) | Specs / scripts | Limitation |
| --- | --- | --- | --- | --- | --- |
| `therapist.roster` Roster: ranges, exceptions, leave, authorization, stale and double-clicked saves, first save, day view | covered | yes | api, browser | `therapist-roster.spec.ts`, `roster-read-write-day.spec.ts` | - |
| `therapist.readiness-and-specialty` A therapist's readiness checklist and specialisation as a value | covered | yes | browser | `therapist-readiness.spec.ts`, `therapist-specialty.spec.ts` | - |
| `therapist.earnings-and-payouts` A therapist's own earnings and payout history match the admin's figures | gap | no | - | - | Payout arithmetic is covered from the admin side (admin.money-maths) and in payout-atomicity-sql-checks.sql; the therapist's own earnings screen has no spec. |
| `therapist.patient-chart-in-shell` A patient's chart sits inside the therapist dashboard with My Patients lit and no back link | covered | yes | browser | `therapist-patient-chart.spec.ts` | - |
| `therapist.session-assignment` Assignment, reassignment and no-show handling through the admin and therapist routes | partial | no | api | `assign-availability.spec.ts` | assign-availability.spec.ts drives the admin assign route (availability refusal and the assignment it allows); reassignment and no-show handling are still proven only at the RPC (therapist-slot-sql-checks.sql, concurrency-checks.mjs). |
| `therapist.cash-and-payout-requests` A therapist records cash collected at the door and requests a payout | gap | no | - | - | No spec drives /api/therapist/record-cash-collection or /request-payout; payout atomicity is proven in SQL only. Feasible; not yet written. |
| `therapist.leave` Going on leave blocks new bookings without moving existing ones | gap | no | - | - | therapist-roster covers leave on the roster screen; /api/therapist/set-on-leave itself has no spec. |

Specs owned (6): `assign-availability.spec.ts` (api/db, desktop, local), `roster-read-write-day.spec.ts` (browser/api/db, desktop, local), `therapist-patient-chart.spec.ts` (browser, desktop, local), `therapist-readiness.spec.ts` (browser/db, desktop, local), `therapist-roster.spec.ts` (browser/api/db, desktop, local), `therapist-specialty.spec.ts` (browser/db, desktop, local)

## session

Session lifecycle: scheduling, suggestions, completion, clinical continuity, care-plan review

| Flow | Status | Req. | Level(s) | Specs / scripts | Limitation |
| --- | --- | --- | --- | --- | --- |
| `session.scheduling` Booking the sessions a patient paid for: five in one request, programme rules, lead time, expiry, ownership | covered | yes | api | `session-scheduling.spec.ts` | - |
| `session.suggestions` Therapist-suggested sessions: suggesting spends nothing, accepting books once, races settle on one answer | covered | yes | api | `session-suggestions.spec.ts` | - |
| `session.completion-cutoff` The Session Completed cutoff on every surface that lists a session | covered | yes | browser | `session-completed-cutoff.spec.ts` | - |
| `session.meet-link-note` Patient and therapist session tiles say when the Meet link shows | covered | yes | browser | `meet-link-note.spec.ts` | - |
| `session.finish-with-note` A therapist's Done opens the session note with the Pain Map and needs both | covered | yes | browser | `finish-session.spec.ts` | Asserts refusals and the dialog only: a successful completion writes append-only settlement rows. |
| `session.debug-clock` The debug clock moves the completion gate only while the debug bar is on | covered | yes | api | `debug-clock.spec.ts` | Asserts refusals only: a successful completion writes append-only settlement rows (those are exercised by clinical-continuity on the disposable stack). |
| `session.care-plan-review` A therapist's recommendation is queued and invisible, refused at checkout, then approved, declined or approved with changes | covered | yes | api | `admin-care-plans.spec.ts` | - |
| `session.meet-link` A confirmed session gets a Google Calendar event and Meet link | blocked | no | - | - | GOOGLE_CALENDAR_* must be unset in CI, so the app runs in its 'not configured' mode and no event is created. Real Meet creation needs a provider-sandbox check done by hand. |
| `session.notifications` Reminders, confirmations and other outbound messages | gap | no | - | - | The codebase has no email, SMS or WhatsApp provider; GoTrue mail goes to the local Mailpit only. Nothing to test until a provider exists. |
| `session.clinical-continuity` Health profile, session note and recommendation carried across therapist, admin and patient: access limited to the treating therapist, notes never patient-visible, a queued plan invisible and unbuyable until approved, approval attributed, and a reopen losing nothing | covered | yes | browser, db | `clinical-continuity.spec.ts`, `clinical-continuity.spec.ts` | - |
| `session.payment-webhook-recovery` A captured payment whose verify call was lost is recovered by the webhook, exactly once | gap | no | - | - | Needs signed Razorpay webhook payloads (RAZORPAY_WEBHOOK_SECRET) posted to the local app; the idempotency is proven in booking-idempotency-sql-checks.sql only. Needs an owner decision on a webhook test secret. |

Specs owned (8): `admin-care-plans.spec.ts` (browser/api/db, desktop, local), `clinical-continuity.spec.ts` (browser/api/db, desktop, local), `debug-clock.spec.ts` (api/db, desktop, local), `finish-session.spec.ts` (api/browser, desktop, local), `meet-link-note.spec.ts` (browser, desktop, local), `session-completed-cutoff.spec.ts` (browser/api/db, desktop, local), `session-scheduling.spec.ts` (browser/api/db, desktop, local), `session-suggestions.spec.ts` (browser/api/db, desktop, local)

## admin

The back office: authorization, exposure, money screens, validation, navigation, lifecycle

| Flow | Status | Req. | Level(s) | Specs / scripts | Limitation |
| --- | --- | --- | --- | --- | --- |
| `admin.route-authorization` Every admin route refuses anonymous and non-admin callers; a limited scope cannot cross sections; scoped landing screens | covered | yes | api, browser | `admin-authz.spec.ts`, `admin-scoped-dashboard.spec.ts` | - |
| `admin.exposure` The back office is not named to anyone outside it | covered | yes | browser | `admin-exposure.spec.ts` | AE-002 skips itself while the debug bar is on (it lists admin routes by design). |
| `admin.money-maths` Payout and refund arithmetic: travel fee, cash netting, unconfigured share, refund window setting, activity-log attribution | covered | yes | api | `admin-money.spec.ts` | - |
| `admin.input-validation` Admin routes answer malformed bodies with a 400, never leak a stack, and bound every setting | covered | yes | api | `admin-validation.spec.ts` | - |
| `admin.dashboard-navigation` Dashboard sections, deep links, overlays, failure handling and the refresh badge | covered | yes | browser | `admin-dashboard-ui.spec.ts`, `admin-detail-overlay.spec.ts`, `admin-network.spec.ts`, `admin-refresh-badge.spec.ts`, `realtime-reconnect.spec.ts`, `activity-timeline.spec.ts` | - |
| `admin.multi-admin` Two admins at once: realtime coverage, inbox removal, racing approve/decline, double assignment | covered | yes | api | `admin-multi-admin.spec.ts` | - |
| `admin.account-lifecycle` Account creation stamps, deletion only with no history, partner layouts and credential reset | covered | yes | browser | `admin-account-delete.spec.ts`, `account-created-stamp.spec.ts`, `admin-partners-and-credentials.spec.ts` | - |
| `admin.settings-and-catalogue` Settings information architecture, the booking lead time reaching the patient picker, package form switches | covered | yes | browser | `admin-settings-ia.spec.ts`, `package-category-picker.spec.ts`, `package-form-flags.spec.ts` | - |
| `admin.session-order-and-logs` A person's sessions ordered by session date, and the log's subject timeline | covered | yes | browser | `admin-profile-session-order.spec.ts`, `logs-subject-timeline.spec.ts` | - |
| `admin.risk-report` The Risk screen names the rules an incomplete sweep missed and the report is admin-only | covered | yes | browser | `risk-sweep-report.spec.ts` | - |
| `admin.login-form` The real admin login form: valid, wrong password, a patient's credentials | partial | no | browser | `admin-login.spec.ts` | Runs only when the app answers at E2E_LOGIN_BASE_URL; the admin runner points it at the same dev server because the CI browser reaches the local stack directly. If that variable is dropped the spec skips itself. |
| `admin.refund-gateway` An admin refund reaches Razorpay and the result is recorded against the right session | gap | no | - | - | Refund arithmetic and the attempt record are covered (admin.money-maths, integrity.refund-attempt-ledger); a refund that actually calls the gateway needs a captured test-mode payment. |
| `admin.maintenance-sweeps` The scheduled maintenance sweeps (risk, retention, balance verification) run on a cron | gap | no | - | - | maintenance.yml calls the sweeps on a schedule against the hosted project; no spec drives the sweep routes with CRON_SECRET. |
| `admin.impersonation` Support impersonation: who may start it, what it may do, and the audit row it leaves | gap | no | - | - | No spec drives /api/admin/start-impersonation or /stop-impersonation. Needs the impersonation rules in docs/rules/ops-security.md turned into cases; not yet written. |

Specs owned (22): `account-created-stamp.spec.ts` (browser/db, desktop, local), `activity-timeline.spec.ts` (browser/api/db, desktop, local), `admin-account-delete.spec.ts` (browser/db, desktop, local), `admin-authz.spec.ts` (browser/api/db, desktop, local), `admin-dashboard-ui.spec.ts` (browser/db, desktop, local), `admin-detail-overlay.spec.ts` (browser/db, desktop, local), `admin-exposure.spec.ts` (browser, desktop, local), `admin-login.spec.ts` (browser, desktop, local), `admin-money.spec.ts` (api/db, desktop, local), `admin-multi-admin.spec.ts` (browser/api/db, desktop, local), `admin-network.spec.ts` (browser, desktop, local), `admin-partners-and-credentials.spec.ts` (browser/api/db, desktop, local), `admin-profile-session-order.spec.ts` (browser/db, desktop, local), `admin-refresh-badge.spec.ts` (browser/db, desktop, local), `admin-scoped-dashboard.spec.ts` (browser/api/db, desktop, local), `admin-settings-ia.spec.ts` (browser/api/db, desktop, local), `admin-validation.spec.ts` (api/db, desktop, local), `logs-subject-timeline.spec.ts` (browser, desktop, local), `package-category-picker.spec.ts` (browser, desktop, local), `package-form-flags.spec.ts` (browser, desktop, local), `realtime-reconnect.spec.ts` (browser, desktop, local), `risk-sweep-report.spec.ts` (browser/api/db, desktop, local)

## hospital

Hospital (B2B) referrals and tenant isolation

| Flow | Status | Req. | Level(s) | Specs / scripts | Limitation |
| --- | --- | --- | --- | --- | --- |
| `hospital.referrals` One open referral per patient under five simultaneous submissions; a withdrawn one frees the number; a dropped connection is said | covered | yes | api | `hospital-referrals.spec.ts` | - |
| `hospital.referral-revenue` A referred patient's paid session accrues the hospital's revenue share and the figure matches the admin's | gap | no | - | - | Needs a captured payment on a referred patient; the share arithmetic is in admin-money and the SQL checks but not driven through a referral end to end. |
| `hospital.org-isolation` A second partner hospital cannot read, enumerate, withdraw or see on its screen another partner's referral; the owning hospital can | covered | yes | browser | `hospital-isolation.spec.ts` | - |

Specs owned (2): `hospital-isolation.spec.ts` (browser/api/db, desktop, local), `hospital-referrals.spec.ts` (browser/api/db, desktop, local)

## platform

The public site and shared UI: navigation, splash, catalog, form controls, mobile smoke

| Flow | Status | Req. | Level(s) | Specs / scripts | Limitation |
| --- | --- | --- | --- | --- | --- |
| `platform.public-navigation` The public pages' section rail, scroll arrow, and a tap acknowledged on real navigation | covered | yes | browser | `section-nav.spec.ts`, `navigation-feedback.spec.ts`, `health-profile-showcase.spec.ts` | - |
| `platform.splash` The brand splash's cold-open, reload and long-absence rules and its admin settings | covered | yes | browser | `splash-screen.spec.ts` | - |
| `platform.catalog` The public catalog's dialogs and covers render the same on card, dialog and booking screen | covered | yes | browser | `catalog-detail.spec.ts`, `catalog-cover-image.spec.ts` | - |
| `platform.journey-pace` The home walkthrough's admin-configured rotation pace | covered | yes | browser | `journey-pace.spec.ts` | - |
| `platform.form-controls` The clinic's own date field, numeric box and validation messages in place of the browser's | covered | yes | browser | `date-field.spec.ts`, `numeric-input.spec.ts`, `form-validation-chrome.spec.ts` | - |
| `platform.dev-reachout-and-footer` The footer's developer credit end to end and the footer's social links | covered | yes | browser | `dev-reachout.spec.ts`, `footer-social-links.spec.ts` | - |
| `platform.mobile-smoke` Public pages and every role's dashboard fit a phone | covered | yes | browser | `mobile-smoke.spec.ts` | - |

Specs owned (13): `catalog-cover-image.spec.ts` (browser/api/db, desktop, local), `catalog-detail.spec.ts` (browser/db, desktop, local), `date-field.spec.ts` (browser, desktop, local), `dev-reachout.spec.ts` (browser/api/db, desktop, local), `footer-social-links.spec.ts` (browser/api/db, desktop, local), `form-validation-chrome.spec.ts` (browser, desktop, local), `health-profile-showcase.spec.ts` (browser, desktop, local), `journey-pace.spec.ts` (browser/api/db, desktop, local), `mobile-smoke.spec.ts` (browser, mobile, local), `navigation-feedback.spec.ts` (browser, desktop, local), `numeric-input.spec.ts` (browser, desktop, local), `section-nav.spec.ts` (browser, desktop, local), `splash-screen.spec.ts` (browser/api/db, desktop, local)

## integrity

Storage-layer and destructive checks: SQL check files, authorization and concurrency scripts, live grants, refund ledger, degraded schema

| Flow | Status | Req. | Level(s) | Specs / scripts | Limitation |
| --- | --- | --- | --- | --- | --- |
| `integrity.refund-attempt-ledger` The refund attempt is written before the gateway is called and cannot be rewritten from the service-role client | covered | yes | db | `refund-attempts.spec.ts`, `refund-attempt-sql-checks.sql` | - |
| `integrity.concurrency-routes` CAS-guarded races at the routes: one refund reaches the gateway, one reassignment wins, one referral books the slot | covered | yes | api | `concurrency.spec.ts` | The refund race calls Razorpay with a fake payment id, so it needs Razorpay test keys. |
| `integrity.debug-reset-unarmed` With ALLOW_DEBUG_DATA_RESET unset the reset is refused to everyone and cannot leave no admin | covered | yes | api | `admin-debug-reset.spec.ts` | - |
| `integrity.degraded-schema` A missing migration-dependent column or table empties its own panel and nothing else | covered | yes | browser | `admin-degraded-schema.spec.ts` | - |
| `integrity.storage-guards` Append-only triggers, the ledger, settlements, payouts, rate limits, promo caps, roster payloads and slot claims at the storage layer | covered | yes | db | `append-only-sql-checks.sql`, `audit-fix-sql-checks.sql`, `booking-idempotency-sql-checks.sql`, `care-plan-review-sql-checks.sql`, `clinical-access-sql-checks.sql`, `pay-later-sql-checks.sql`, `payout-atomicity-sql-checks.sql`, `promo-invite-sql-checks.sql`, `rate-limit-sql-checks.sql`, `refund-attempt-sql-checks.sql`, `roster-sql-checks.sql`, `session-settlement-sql-checks.sql`, `therapist-slot-sql-checks.sql` | - |
| `integrity.authorization-below-routes` Cross-tenant isolation, IDOR, enumeration and suspension asserted below the routes with real user tokens | covered | yes | db | `authorization-checks.mjs` | - |
| `integrity.concurrency-rpc` Parallel RPCs at claim_therapist_slot, the rate limiter and the invite cap return exactly one winner | covered | yes | db | `concurrency-checks.mjs` | Guards the verdicts, not serialisation (see the caveat at the top of the script). |
| `integrity.live-grants` The live database's function grants and RLS agree with schema.sql (three outcomes: pass, fail, not proven) | covered | yes | db | `check-live-grants.mjs` | - |
| `integrity.debug-reset-armed` The armed reset truncates only what it should and keeps the admin | gap | no | - | - | ALLOW_DEBUG_DATA_RESET must stay unset everywhere, including CI, and debug-reset-sql-checks.sql takes AccessExclusiveLock on every table. It is deliberately not run by the gate. |

Specs owned (4): `admin-debug-reset.spec.ts` (api/db, desktop, local), `admin-degraded-schema.spec.ts` (browser/api/db, desktop, local, destructive), `concurrency.spec.ts` (api/db, desktop, provider-sandbox), `refund-attempts.spec.ts` (db, desktop, local)

