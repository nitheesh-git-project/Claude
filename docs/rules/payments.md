# Payments, captures and refunds

Razorpay verification, the one capture path, booking idempotency, every refund state, the cancellation window, and the record a refund writes before the money moves.

**Mostly lives in:** src/app/api/razorpay/ · src/lib/refundState.ts · src/lib/refundAttempt.ts · src/lib/recordPaymentCapture.ts

> Part of `docs/rules/`. `CLAUDE.md` says which file a task needs; this one
> is the detail. Keep it current in the same change that makes it wrong --
> see the docs rule in `docs/rules/testing.md`.

---

- **Payments** must be verified server-side: `/api/razorpay/verify` checks the
  signature before anything is confirmed. Never confirm on a client callback.
  **A capture is applied in exactly one place**: `record_payment_capture` in
  `schema.sql`, called through `src/lib/recordPaymentCapture.ts` by the three
  verify routes and by `/api/razorpay/webhook`. It is a database function
  rather than TypeScript because supabase-js cannot express a transaction,
  and a capture has to move a `payments` row and the row it paid for
  together under a real `select ... for update`. It is idempotent by
  construction - the second caller for an order finds it captured and
  changes nothing - which is what makes duplicate webhooks, Razorpay's
  at-least-once retries, a webhook racing the browser callback and a
  double-clicked Pay button all safe without any of them knowing about the
  others. It deliberately does **not** confirm an appointment or create a
  Meet event (those need an outbound Google call, so they stay in the
  route), and it never revives a cancelled booking. Add a new payment
  purpose by extending its `purpose` check, not by writing a second
  fulfilment path.
  **The webhook's signature is checked against the raw body.** `await
  request.text()`, never a re-serialised parse: `JSON.parse` then
  `JSON.stringify` does not round-trip byte-for-byte, so verifying a
  re-serialised body rejects legitimate webhooks and tempts someone to
  "fix" it by skipping the check. The webhook inserts its
  `payment_webhook_events` row **before** doing any work, because that
  insert colliding on `razorpay_event_id` is the deduplication; processing
  first and recording after would let a retry arriving mid-flight do the
  work twice. **A failed attempt is written on that row, never deleted
  from it** - the row cannot be deleted (`trg_payment_webhook_events_identity`),
  and the old "delete so the retry gets a real attempt" path raised, so the
  retry was acknowledged as a duplicate and a paid booking stayed unpaid.
  A retryable failure sets `processing_error` with the `retryable: ` prefix;
  `webhookRetryVerdict` (`src/lib/webhookRetry.ts`) then answers a repeat
  delivery as `retry` (reprocess on the same row), `in_flight` (409, a
  live attempt under two minutes old), or `duplicate` (200).
  **`payment.captured` is the only event that applies anything, and
  `payment.authorized` is not a capture.** An authorization is a hold, not
  money taken: Razorpay voids one that is never captured and auto-refunds
  it a few days later. The webhook used to treat the two alike, so an
  authorization marked the booking paid, confirmed the session, created the
  Calendar event and settled an invite half against money that could still
  evaporate -- and nothing in the app walks any of that back. Under
  auto-capture, which is what this account runs, `payment.captured` follows
  within seconds and does all of it correctly; under manual capture the
  authorization genuinely is not a payment yet. The event is still recorded
  in `payment_webhook_events` either way, so the trail keeps it. Both events
  stay subscribed in the Razorpay dashboard on purpose -- the trail is worth
  more than the one saved delivery.
  **The amount is passed to `record_payment_capture`, not inferred.** Left
  out, the function falls back to `appointments.amount_paid_paise`, which is
  the service line alone -- travel is deliberately off that column -- so a
  home visit's `payments` row recorded less than the gateway took, and only
  on the browser-callback path, since the webhook carries Razorpay's own
  figure. One booking recorded two different ways depending on which arrived
  first is the kind of disagreement this table exists to settle.
  `/api/razorpay/verify` passes the figure `create-order` built the order
  from. The two purchase verify routes still rely on the fallback: their
  travel is per-visit and gated by the package's own `travel_fee_included`,
  so reconstructing it there would be a second implementation of
  `computeHomeVisitTotal` to drift from the first, and `payments.amount_paise`
  is read only by the unmatched-payment check on System Health, never by the
  revenue maths.
  **`payments` has unique indexes on `razorpay_order_id` and
  `razorpay_payment_id`, and they are the point of the table.** Nothing in
  this database previously stopped one payment id being recorded against
  two rows. The per-table payment columns on `appointments` and the two
  purchase tables are unchanged and still answer "is this paid for";
  `payments` is the record of money. Don't drop those indexes to make an
  import succeed - a collision means a duplicate already exists and wants
  investigating.
  For a single online session, `/api/razorpay/create-order` flips the paying
  patient's `profiles.approved` to `true` the moment they genuinely attempt
  checkout (`approvePatientForGenuinePaymentAttempt` in
  `requireActiveProfile.ts`) - deliberately on the attempt, not a completed
  payment, so a patient who fails or abandons checkout after repeated tries
  still lands straight in their dashboard via BookingWizard's escape hatch,
  appointment showing pending, rather than being bounced to
  `/pending-approval`. The pre-payment appointment row that order is minted
  against is created by `/api/appointments/create`, which gates on plain
  `isProfileActive` for the same reason - a self-signup patient is
  unapproved by definition, and that row (always unpaid, unassigned,
  `requested`, `online`) grants nothing on its own. **Appointments are never
  inserted by the browser**, same rule as home visits: that route re-derives
  concern, duration, lead time and the therapist preference from the session
  and the category row. It replaced a direct client-side insert whose only
  validation was the `appointments_insert_own` RLS policy - which made one
  policy in a live database, reachable only by running
  `scripts/run-schema.mjs`, the single point of failure for the whole
  booking funnel, and failed real bookings with a raw Postgres
  "new row violates row-level security policy" string at the last step of
  checkout. The policy and its insert grant are now dropped at the end of
  `schema.sql`. Home-visit and package purchases keep the stricter "only a
  *completed* payment vets you" rule instead (`/api/home-visit/create-order`
  uses plain `isProfileActive`, no auto-approve). Standalone patient
  registration (`/patient/register`, no booking involved) always waits on a
  human admin - the point of gating on genuine payment intent is to keep a
  bare signup from being a free way to skip that queue.
- **A refund is shown wherever a payment is.** Money going out was recorded
  and never displayed: an admin refunded a session from a patient's profile,
  the route worked, the audit row was written, and the session row went on
  looking exactly as it had -- `ProfileSessionList` rendered `payment_status`
  and nothing about `refund_status` at all. The one question that screen
  could not answer was whether the patient had had their money back.
  `src/lib/refundState.ts` is the single reading of those columns -- state,
  label, tone, whether anybody is waiting -- so the chip on a row, the panel
  in the drawer and the export column cannot describe it four ways. Four
  states, and the difference is who is waiting for what: `processed` is done,
  `manual_pending` is cash somebody has to hand over, `failed` is the gateway
  refusing and is the most urgent precisely because nothing was watching it,
  and `not_eligible` is a decision that nothing is owed -- recorded rather
  than left blank, because "no refund due" and "we never looked" read
  identically when both are empty and mean opposite things. `none` renders
  **nothing**, not an empty chip on every unrefunded session.
  **`refunded_at` and `refunded_by` are the other half.** `paid_at` has
  existed since the first payment shipped; money going out had no equivalent,
  so "when was this refunded, and by whom" was answerable only from the audit
  log, which no session screen reads. Every writer stamps them --
  `cancelAppointmentAndRefund` on all four outcomes, including the failure
  and the forfeiture, because those are decisions too; `refund-session-
  partial`; and `mark-cash-refund-returned`, which stamps the moment the cash
  actually changed hands rather than when it became owed. Neither column is
  backfilled: a refund issued before they existed has no recorded time, and
  inferring one from `updated_at` would put a confident wrong date on a money
  record. They are the newest columns on `appointments`, so they are read in
  their own isolated query and merged, per the migration-dependent rule.
  **The patient reads the same refund in a different voice.**
  `describeRefundForPatient()` is the `voice` rule applied to money: the two
  readings differ in what they are *for*, not only in register. The admin
  chip answers "what happened to this money"; the patient's line answers "am
  I getting my money back, and when" -- so `manual_pending` is a work queue
  to one and a promise to the other, `failed` is a broken row to one and
  "please contact us" to the person who is out of pocket, and `not_eligible`
  says **nothing** to the patient, because the cancelled card already
  explains the window and repeating it as a refund line announces a refund to
  somebody who is not getting one. It renders on the session card (with the
  date and the clinic's own stated reason), on every Payments row and in that
  receipt's detail, and a failed refund is a pinned `needsYou` feed item --
  the one refund state nothing in the clinic's screens will move without the
  patient. A **partial** refund on a completed session reached none of these
  before, because `BookingReceipt.stage` has no honest value for a delivered
  session that was partly refunded; the refund is its own field beside the
  stage rather than folded into it, or a delivered session would read
  "Refunded".
  **A refund that is owed is a queue, and both tables are in it.** Money ->
  the alerts strip and Today's inbox count `manual_pending` across **cash
  visits and sessions alike** -- the count was home-visit rows only, so a
  session refunded by hand was work no screen could see -- and they count
  `failed` as its own row, which nothing in the app was watching at all. The
  two are separate because the work is: one is "go and hand over cash", the
  other is "find out why the gateway said no". A failed refund's row belongs
  to **Sessions**, not Money, because that is where it is fixed, which is
  also why `MoneyAlertsStrip` takes `workableSections` rather than
  `allowedSections`: Finance reads Sessions without being able to change one,
  so counting a failed session refund on their strip would put a figure on
  their screen that nothing they could do would bring down -- the same rule
  `visibleQueueTotal` already follows. Both counts run over the **appointments
  read alone**: `homeVisitRows` is that same table with a `visit_mode` filter,
  not a second table, so summing the two counted every cash home visit twice
  and put a figure on the Money strip that the Cash Ledger beneath it
  disagreed with -- the "a count agrees with the rows it counted" rule broken
  by arithmetic rather than by filtering. `refund_status` lives on the
  appointment for both delivery modes; nothing writes it on a purchase row.
  `AdminAllSessionsTab` takes
  `refunded`, `refund_pending` and `refund_failed` presets so each count
  opens exactly the rows it counted. **Its export follows `canSeeMoney` too.**
  The amount and the refund never render in that table at all, so Operations
  and Clinical could not read either on screen and could download both: a
  scope enforced in the markup and not in the file the markup produces is not
  enforced, and an export is the easiest place to forget it. Its **Refunded** payment-filter option
  matched nothing at all before this: `payment_status` is CHECKed to
  `unpaid` / `paid` / `failed` and can never hold `refunded`, so the filter
  silently returned an empty table. A refund lives on `refund_status`.
  **Every refund states why.** `refund_reason` was written by the partial
  refund route alone, so the commonest refund in the app -- a cancellation
  outside the window -- reached both the patient's Payments screen and the
  admin's drawer with that line blank. `cancelAppointmentAndRefund` records
  one on all four outcomes: the cancellation's own reason where the person
  cancelling gave one, and otherwise a sentence naming the rule that produced
  the outcome, matching what the credit ledger already writes for the same
  event. The **forfeiture** is the exception and takes the rule's sentence
  *always*, never the cancellation's reason -- this line is read as "why this
  money moved" and no money moved, so the answer has to be the window that
  withheld it, which is also the thing a patient disputes. It names the
  window that actually applied, which is why the patient card's no-refund
  hover reads it rather than printing `CANCELLATION_FULL_REFUND_HOURS`: a
  home visit has its own window, so the constant was quoting the wrong number
  of hours on every cancelled visit.
- **A refund records what it is about to do, before the gateway is called.**
  Every gateway refund here claims its local row *first* and calls Razorpay
  second, deliberately: a refusal must leave no trace claiming money went
  back, and every one of these routes reverts its claim when Razorpay says
  no. What that ordering cannot cover is the opposite failure -- Razorpay
  accepts the refund and the write recording what came back fails. The money
  is gone, `refund_id` is null, and on every screen that is indistinguishable
  from a refund which was claimed and never sent. All four refund writers had
  that window -- `refund-session-partial`, `refund-package`,
  `refund-home-visit-package` and `cancelAppointmentAndRefund` -- and in all
  four the only thing that noticed was a `console.error`, which is not a
  place a clinic owner looks.
  `refund_attempts` closes it, through `src/lib/refundAttempt.ts`: a row
  lands as `processing` carrying the subject, the payment, the amount, the
  reason and who asked; the gateway is called; the row is resolved to
  `succeeded` with the gateway's own refund id, or `failed` with what it
  said. Every outcome is then either a resolved row or a row stuck at
  `processing`, and the second is exactly the state a person has to look at.
  Six rules:
  1. **A refund that cannot be recorded is not attempted.** The three admin
     routes put their claim back and answer 503 rather than calling Razorpay
     -- the same posture `/api/therapist/reveal-contact` takes on its reveal
     log and the care-plan review takes on its decision row. Proceeding
     anyway defeats the thing being built.
  2. **`cancelAppointmentAndRefund` is the one exception, and it cannot
     refuse.** The cancellation is already committed and the slot is
     legitimately freed either way, so the refund is *not attempted* and the
     session is recorded `refund_status = 'failed'` -- already a counted item
     on Money's alert strip and a pinned item on the patient's own feed, the
     one refund state nothing in the clinic's screens moves without a person.
  3. **Resolving never throws.** By then the money has moved, and turning a
     completed refund into a 500 that reads as "nothing happened" is the
     worse error. It leaves the row at `processing`, which is what the health
     check is for.
  4. **Append-only by trigger, not by RLS.** Every route here writes with the
     service-role client, which bypasses RLS entirely, so for a table whose
     whole value is that it records what was attempted *before* the attempt
     was made, "no route rewrites it" is not the guarantee. It permits
     exactly one transition (`processing` -> `succeeded` | `failed`), once,
     plus the two columns resolution fills in, and nothing is ever deletable:
     a row that can be removed makes the stuck-at-processing state
     meaningless.
  5. **Every foreign key is `on delete restrict`**, including `requested_by`.
     Not symmetry -- `set null` is an UPDATE on this table, which the trigger
     above refuses, so the row's own subject could never be deleted and the
     refusal would name a trigger rather than the record standing in the way.
     `cascade` would silently destroy the record of money moving.
     `account_blocking_references()` counts restrict keys, so a delete is
     refused with this table named and suspension offered beside it.
  6. **A new refund writer opens an attempt.** There is no second way to
     record one, the same rule `record_payment_capture` holds for the other
     direction of money.
  Checked by `scripts/refund-attempt-sql-checks.sql` (both halves of every
  guard, plus a negative control) and `e2e/refund-attempts.spec.ts`, which
  drives the database rather than the routes because the routes are what was
  wrong.
- **One purchase cannot hold two sessions at the same instant.**
  `record_payment_capture` is idempotent by construction; the booking *below*
  it was not, so a retried `/api/home-visit/verify` -- a double-tapped Pay, a
  resent browser callback, Razorpay's own at-least-once delivery racing the
  webhook -- booked a second visit at the same slot and spent a second credit
  against the same purchase. `appointments_one_per_home_visit_purchase_slot`
  and `appointments_one_per_package_purchase_slot` are partial unique indexes,
  never a check in the route, for the reason `session_suggestions` already has
  one: a double tap defeats SELECT-then-INSERT, and every writer here holds the
  service-role client so RLS is not the guarantee. They key on the purchase and
  the **instant** (two visits from one purchase at two different times is
  ordinary; two at the same time is a person booked against themselves) and
  they exclude cancelled rows, since cancelling and rebooking the same slot is
  something patients do and refusing it would turn an idempotency guard into a
  scheduling rule nobody asked for.
  **A refusal from one of them is not a failure to report.** Both helpers
  return a named `duplicate` outcome on `23505` and the claimed credit is given
  back by the revert already there, so `verify` answers **success** and
  `respond-suggestion` leaves the suggestion accepted rather than reverting it
  and asking somebody to accept a time they already have. Telling a patient
  whose money has moved that their session was not booked is the one thing
  these routes must never say wrongly; the bulk scheduler reports per slot, so
  there the plain sentence is honest. `home_visit_purchase_events`' `purchased`
  row is guarded the same way -- two of them read as two purchases on the
  timeline an admin opens to find out what happened. Checked by
  `scripts/booking-idempotency-sql-checks.sql`, both halves plus a negative
  control.
- **Cancellation/refund**: full refund only outside the 24-hour window in
  `src/lib/pricing.ts`; inside it, none. That constant is the **fallback**,
  never the answer -- the live window is
  `site_settings.online_cancellation_refund_hours`, and a screen printing the
  constant quotes the wrong number at every patient the moment a clinic
  changes it. Home visits use their own window
  instead (`home_visit_cancellation_refund_hours`, `cancelAppointmentAndRefund`) -
  see the Home Visit bullet below.
  **The payment screen names the deadline, not the rule**, and that is the
  difference between a policy and something a patient can act on.
  `describeCancellationWindow` (`src/lib/cancellationWindow.ts`) is
  the one judgement, dependency-free because it is a promise about money with
  a boundary: it answers `deadline` (free until an instant the screen prints
  through `formatClinicDateTime`), `already_inside`, or `rule_only` when no
  slot is chosen. Two rules hold it. It is judged against the wizard's own
  `nowMs` -- the same clock the picker measures the lead time from, and the
  one the debug bar's simulate-time box moves -- so the screen cannot offer a
  slot as bookable and describe its terms against a different "now". And it
  is refundable at **exactly** the boundary, because `cancelAppointment.ts`
  refuses on `hoursUntilSlot < refundWindowHours`; a screen that said "no
  refund" one millisecond early would promise less than the route delivers.
  `already_inside` is not an edge case: the booking lead time is 12 hours and
  this window defaults to 24, so **every booking made between those two is
  non-refundable from the moment it is made**, and the old sentence told
  exactly those patients they had free cancellation. They read it at the
  point where they can still pick another slot.
  A **free** booking and a **pay-later** one get their own sentences ahead of
  all three, the same rule `describeRefundForPatient` follows: a refund
  window is not a fact about a session nobody paid for, and quoting one
  describes money the patient never handed over.
  `cancellationWindow.test.ts` holds the boundary; `e2e/booking-rules.spec.ts`
  BR-CANCEL-001/002 hold what is on the screen, because none of the three
  regressions here (a fused "24hours", a constant quoted in place of the
  setting, a false promise of free cancellation) produces an error, a failed
  request or a wrong row.
