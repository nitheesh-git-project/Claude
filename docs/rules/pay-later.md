# Pay later

A trusted patient treated first and settling afterwards: the grant, the booking path, the pool, write-offs, and the seven guards that shipped before any of it could be used.

**Mostly lives in:** src/lib/patientBalances.ts · payLaterBooking.ts · payLaterWriteOff.ts · sessionPaymentState.ts

> Part of `docs/rules/`. `CLAUDE.md` says which file a task needs; this one
> is the detail. Keep it current in the same change that makes it wrong --
> see the docs rule in `docs/rules/testing.md`.

---

- **Pay later: a trusted patient is treated first and settles afterwards.**
  `appointments.payment_terms` (`prepaid` | `pay_later`) is the new axis, and
  it exists because `payment_status = 'unpaid'` already means *"somebody
  abandoned a checkout"*. Without a second column those two are
  indistinguishable and three things break at once: an abandoned cart counts
  as a debt, `dashboardFeed`'s "Payment not completed / this session isn't
  booked" item scolds a patient whose session **is** booked, and
  `detectCompletionWithoutPayment` raises a high-severity signal on every
  session these patients ever have. Five rules:
  1. **Nothing is owed until the work is done.** `amount_due_paise` is stamped
     at booking and **counted** only once `status = 'completed'`. That one
     split is what makes "booking owes nothing" and "a late cancellation owes
     nothing" true with no special case anywhere -- there is no state to
     unwind, because nothing was ever owed. Everything in
     `src/lib/patientBalances.ts` filters on that one word.
  2. **The price is frozen at booking**, for the reason `package_snapshot` is
     frozen by trigger: `checkoutQuote` reads the **live** category price, so
     resolving it again at settlement charges the new price for work already
     delivered.
  3. **Revenue is recognised at completion, not at collection**, because the
     therapist's share is. `moneyLineFor` counts a completed pay-later session
     and reads its amount as the frozen price; settlement writes
     `amount_paid_paise` equal to it, so recognised revenue never moves.
     Counting at collection instead reports a loss in the month the work was
     done and a windfall in the month it was paid -- both months wrong for one
     session. `gatewayFeePaise` is deliberately **not** changed: a gateway fee
     is a real cost only when a gateway took money.
  4. **`sessionAmountPaise` takes its fallback as an argument**, and that is
     load-bearing. The three readers do not share one -- `adminMetrics` falls
     back to `SESSION_FEE_PAISE`, `therapistPayouts` to `0`,
     `therapistEarnings` to a value its caller passes. A shared helper
     hard-coding the session fee would make every already-paid session with a
     null amount start contributing the full fee to a therapist's payout where
     it contributes nothing today, changing what the clinic owes real people on
     sessions unrelated to this feature. The frozen price slots in **before**
     each caller's fallback and leaves it untouched.
  5. **There is no ceiling by default, by choice** -- and it is a setting
     rather than a constant, because holding an opinion the clinic may not
     share belongs in a switch. `site_settings.pay_later_max_owed_paise` is
     null unless somebody sets it, and null is behaviour identical to before
     the column existed: the population on terms is tiny and hand-picked, and
     a cap that refuses a booking means turning away a long-standing patient
     at the counter. Set, it is one more named reason (`over_limit`) out of
     `decidePayLaterBooking` and nothing else changes. Five rules hold it:
     blank is the default **and the undo**; there is deliberately **no zero**,
     since somebody who types 0 has almost certainly cleared the box and
     reading it as "refuse every booking" would switch the feature off through
     a field that says nothing about switching it off (off is
     `pay_later_enabled`); reaching it **never strands anybody**, because the
     ordinary payment screen is still there and *paying now is never taken
     away*; the refusal names the arrangement and what clears it, since this
     patient already knows they have it, and quotes **no figure**, because a
     number in a refusal is one that can be wrong by the time it is read; and
     a balance that **could not be read reads as at the ceiling**, never as
     zero -- waving a booking through on a failed query is the one direction a
     ceiling exists to stop, and the cost of the safe direction is only that
     the patient pays now. Both callers resolve the quote **before** the
     eligibility check, since a ceiling applies to what the booking would add
     rather than to its list price, and `confirm-pay-later`'s preview is
     deliberately non-claiming: a refusal after a claim would spend a promo
     code on a booking that never happened.
     With no ceiling set, the two figures on Money -> Owed by
     Patients are the whole of the early warning: the total, and
     `oldestOwedAgeDays` against `site_settings.pay_later_aged_after_days`.
     That threshold is configurable where one in this codebase normally is not,
     precisely because it is the only automatic warning the feature has -- a
     clinic settling weekly wants it far below the 60-day default, one settling
     quarterly above it, or the warning is on permanently and becomes the badge
     nobody reads. `PAY_LATER_AGED_AFTER_DAYS` stays as the default and
     `describeAgedAfterDays` is the judgement with the database taken out, so an
     unset, unreadable or hand-edited value resolves back to it rather than to
     a bound -- there is no safe direction to fail in when the thing being
     decided is the colour of a warning. `resolveAgedAfterDays` is that
     function's `.days` and keeps its exact old signature, which is what makes
     adding the reason provably behaviour-free: every one of its existing tests
     passes unmodified. There is deliberately **no zero**,
     unlike `splash_revisit_minutes` and `journey_step_seconds`: here it reads
     as "chase everything" to one person and "never warn me" to another, and a
     warning whose meaning depends on who set it is worse than no setting --
     so "off" is its own switch, `pay_later_age_warning_enabled` (on by
     default), which keeps the number while it is off so switching back on
     restores what the clinic chose rather than the default. `isAgedBalance` is
     the one answer its three readers share -- the total's colour, each patient
     card's amber, and the `patients_owing_aged` count on Today -- so a count
     cannot disagree with the rows it links to; with the warning off that count
     is **zero rather than hidden**, since an alert row nothing can bring down
     is worse than no row. Three things the screen used to know and not say, it
     says now: a stored value that could not be used is named beside the number
     in force (the screen and the database disagreeing with nothing
     reconciling them is the failure `AdminDataLoadBanner` exists for, one
     setting down), the days field carries a live "N of M patients would show
     as worth chasing" computed from the ages already on the page, and a scope
     that cannot manage settings gets `PayLaterAgeNote` -- the rule plus who
     owns it -- rather than an absence that reads as a half-built screen. Its
     control sits on Money -> Owed by Patients beside the figure it colours
     rather than in Settings -- the `promo_codes_enabled` placement rule -- but
     is gated on `scopeCanManage(scope, "settings")`, **not** money: Finance
     manages Money and holds settings at `none`, so `/api/admin/update-setting`
     would refuse them. `unclosedPayLaterSessions` is the other half -- debt,
     revenue and the therapist's pay all appear at completion, so a session
     nobody closed produces none of the three and no screen has anything to
     show. Every other failure here is a wrong number; that one is an absent
     number, which nothing else would catch.
  6. **The privilege is granted, never inferred, and every guard ships before
     it can be used.** `/api/admin/set-patient-pay-later` takes
     `requireAdminScope("money")` -- extending credit is a money capability
     whatever screen the control sits on, which is also why
     `PatientDetailContent` computes `scopeCanManage(viewer.scope, "money")`
     for the card rather than reusing that page's `canSeeMoney`, which is the
     looser `scopeCanOpen`. A ten-character reason is required to **grant**
     and not to stop: this is the opposite split from the care-plan review,
     because the thing being explained is the risk, and here the risk is the
     grant. It is enforced by the route and by
     `profiles_pay_later_needs_reason`, and revoking leaves the reason in
     place -- the CHECK is vacuous while disabled, and why terms were given
     stays on the record after they are stopped. A **hospital-referred**
     patient is refused outright: a partner's commission is taken on net
     revenue and revenue is recognised at completion, so terms would have the
     clinic owing a cut on money it has not received, and deferring the
     partner's share to settlement instead would break
     `clinic share = net - therapist - partner`, which is worse than the
     problem. One master switch, `site_settings.pay_later_enabled`, off for
     its first release, read in its own call and failing **closed** -- the
     opposite direction from the ageing threshold beside it, because that one
     decides the colour of a warning where neither direction is safe, and this
     one decides whether work may be delivered without money. It gates
     **granting** and never stopping, and never a debt already owed.
     Seven guards land in the same change and are **inert by construction** on
     the day they land, since nothing can carry `pay_later` until the booking
     path exists -- which is the point of the ordering: each guard is in place
     before the thing it guards can exist, so the feature never has a window
     where it looks broken. `detectCompletionWithoutPayment` and
     `readSessionsWithoutBacking` both stop counting a session on terms
     (it **is** backed: the sale is recorded, the revenue counted and the debt
     on its own screen -- without this every session one of these patients
     ever has is a high-severity signal and a permanent red row);
     `complete-session` gains a fourth allowance beside paid, programme and
     cash, because completing is what *creates* the debt and refusing would
     make the one session that must be closed the one that cannot be;
     `assign-appointment` confirms on terms as well as on payment, or the row
     never leaves `requested` and can never be completed; `TherapistSessionCards`
     drops `cashDue`, since chasing a trusted patient at a door that does not
     exist is what the platform's own communication rules exist to prevent;
     `dashboardFeed` branches its "Payment not completed" item, which was
     telling a patient their booked session was not booked, and the
     replacement is informational and **never** `needsYou` -- there is nothing
     for them to do, and pinning it would put a permanent to-do on the
     dashboard of the patients the clinic trusts most. And every chip reads
     `src/lib/sessionPaymentState.ts`, shaped on `refundState.ts` for the same
     reason: three surfaces printed `payment_status` raw, so a delivered
     session on terms said **"Unpaid"** beside an abandoned checkout saying the
     same word, on the screen an admin chases people from.
     **And the patient reads the same session in a different voice**, through
     `describeSessionPaymentForPatient()` -- `describeRefundForPatient`'s rule
     applied to the other direction of money. Two states genuinely differ.
     **"Written off" must never reach the patient**: it is the clinic's own
     accounting word for a debt it decided to stop chasing, a decision about
     them taken without them, and on their own session card it reads as the
     clinic having given up on them -- what is true for *them* is that there
     is nothing to pay, which is what it says. And a **cancelled** session on
     terms says nothing at all, exactly as `not_eligible` says nothing on a
     refund: the cancelled card already explains itself, and a payment chip
     beside it announces an arrangement that never came into play. Everything
     else is the admin's own wording, because those readings are already true
     for both. The card also stopped offering **Pay Now** on a session on
     terms: `create-order` refuses one outright, so the button did not merely
     read wrong, it led nowhere. `payment_terms` is
     added to every reader through an **isolated** read merged by id, never to
     a shared select -- verified against a live database missing the columns:
     PostgREST answers `42703`, supabase-js resolves rather than rejects, the
     `Promise.all` survives, the card reads "off" and the switch fails closed.
     **System Health carries its own check for this**, `pay_later`. `off` when the
     switch is off and nobody is on terms, and **owing money is never a
     fault** -- a patient on terms owing a large sum is the arrangement
     working. Its one amber state that matters is `unclosedSessions`: a
     session that happened and was never marked done produces no debt, no
     revenue and no therapist pay, and no screen has anything to show, which
     is the only place in this design where money can silently fail to exist.
     Its input is null on an unmigrated database and the check reads
     **"Not set up"**, so an unapplied migration becomes a line on a screen
     somebody already reads. **Risk carries two rules**, both
     `RISK_RULE_DOMAIN: "money"`, under their own heading *Trusted patients --
     follow up*: `pay_later_aged` ships **enabled** despite the no-baseline
     rule that keeps `plan_conversion_low` off, because the population is tiny
     and hand-picked so a threshold cannot fire on everyone, and it is the
     only automatic warning an arrangement with no ceiling has -- it reads the
     admin's own threshold rather than its own config, so the amber on the
     screen and the signal can never disagree about what "a while" means;
     `pay_later_balance_high` ships **disabled**. A third rule counting
     rejected declarations waits for the phase that builds them, because a
     rule that can never fire is a queue nobody reads.
  7. **Booking on terms is its own confirmation route, and it claims
     discounts like any other booking.**
     `/api/appointments/confirm-pay-later` is the sibling of `confirm-free`
     and deliberately the same shape: re-resolve server-side, refuse on the
     state, then confirm through the sequence the paid path uses.
     `confirmPaidAppointment` was split for it --
     `runConfirmation()` holds the roster read, the atomic claim and the Meet
     event, and the two exports differ only in which payment columns the
     claim writes. A `markPaid: false` flag was **rejected**: it reads as a
     lie at the call site, and the callers want different columns rather than
     one write with a field suppressed. `payment_status` stays `unpaid` and
     `paid_at` is never stamped, which is the whole reason `payment_terms`
     exists as a second axis.
     Four refusals, all re-derived and never sent: the switch, the patient's
     grant, a **home visit** (travel is a pass-through paid to the therapist
     in full -- deferring it has them funding their own transport until the
     patient settles) and a **programme** session (drawn from the credit
     ledger, which this feature never touches). `decidePayLaterBooking` in
     `src/lib/payLaterBooking.ts` is that judgement with the database taken
     out, returning a **named reason** rather than a boolean so the route and
     the wizard cannot grow two answers to "why not" -- and the two reasons
     that are about the patient say the *same* sentence on purpose, since
     somebody never granted terms must not learn the arrangement exists and
     they are not in it.
     **A free booking is not a debt of zero**: a discount reaching zero hands
     the caller back to `confirm-free`, and the quote's `settlement` is a
     named three-way (`gateway` | `free` | `pay_later`) rather than a second
     boolean beside `free`, since two booleans can contradict each other.
     `canPayNow` is separate because it answers a different question --
     **paying now is never taken away**, and choosing it produces an ordinary
     prepaid session touching none of this. Once confirmed on terms,
     `create-order` refuses: paying there would mark it paid outside the
     settlement path and skip the allocation deciding which delivered
     sessions the money covers.
     **The price is frozen inside the same claim that confirms**, so no row
     is ever pay-later-but-unconfirmed or confirmed-with-no-figure, and the
     route **returns the figure it wrote** rather than a re-read -- reading
     the price once to quote and again to render is how the two come to
     differ.
     **Discounts apply exactly as they do on every other booking**, which is
     a decision with a database consequence. Both claim functions counted a
     claim as spent only while the booking was `paid` or inside a
     thirty-minute checkout hold -- and a pay-later booking is `unpaid` for
     its whole life, so thirty minutes after booking its promo claim stopped
     counting against the cap while `promo_code_id` still pointed at the
     campaign and the discount stayed frozen into what was owed: a cap of 100
     handing out more than 100, which is the exact failure the cap exists to
     prevent. `claim_invite_half` had the mirror -- the booking stopped
     *holding* its half, so the same half could be spent twice. Both now
     count a confirmed pay-later booking permanently, exactly as a paid one:
     the discount has been given and can never be taken back. Re-created in
     full at the end of `schema.sql` with **their three revokes each**, since
     a re-created function arrives carrying `anon` and `authenticated` grants
     again. `scripts/pay-later-sql-checks.sql` asserts both halves of each --
     the pay-later claim still counting *and* an abandoned prepaid checkout
     of the same age still giving its claim back, without which a function
     that counted every claim forever would pass.
     `settleInvitesOnCapture` is **not** called: an inviter's reward is
     earned when their friend's first session is paid for, and nothing has
     been.
     **And the same decision had a second consequence, one layer up in
     eligibility rather than in a cap.** "Is this patient new" was asked in
     three places -- the standing first-session offer, a `first_session_only`
     promo code, and `claim_invite()`, whose own comment said it was "the
     same test the first-session offer uses" -- and all three asked
     `payment_status = 'paid'`. A session on terms is never paid, so a
     trusted patient read as brand new on **every** booking they ever made:
     the offer did not fire once, it fired on sessions two, three and four,
     and an invite welcome was claimable after they had already been
     treated. Silently, in all three. They now count a **commitment** rather
     than a capture, through one shared query
     (`countPriorCommittedSessions`, `src/lib/priorSessionsServer.ts`), and
     `priorSessions.test.ts` fails when a reader grows its own copy back.
     Two details are load-bearing. The `status <> 'cancelled'` exclusion
     applies to the terms arm **alone**: a cancelled pay-later booking was
     never delivered and owes nothing, while widening the paid arm the same
     way would hand the offer back to everybody who ever paid and then
     cancelled. And the terms half is a **second, isolated** count rather
     than one `or(...)`, because `payment_terms` is migration-dependent and
     this count fails closed -- folded into one query, an unapplied
     migration would quietly withdraw the first-session offer from
     everybody.
     What the decision also needs is for the discount to be **visible**,
     since a pay-later booking was the one checkout ending in this app that
     showed no figure at all: the confirmation names what was frozen and
     what came off it (the route already returned both and the wizard
     dropped them), and Money -> Owed by Patients states the list price and
     the rule beside any session owed less than it -- an unexplained ₹499
     against a ₹1,200 session, on the screen an admin chases people from,
     reads as an error.

  8. **Settling is a pool, and a payment never touches a session.**
     `pay_later_payments` is one row per **payment**;
     `allocate_pay_later_payment()` covers that patient's delivered,
     unsettled sessions **oldest first, whole sessions only**, under a
     `select ... for update` on the patient -- two admins confirming two
     payments at once is exactly what races. Six rules:
     - **Settlement writes `amount_paid_paise = amount_due_paise` exactly**,
       never the payment's share of it. That is the whole safety case: the
       therapist's cut is computed from that column, so spreading 2,000
       across four 1,200 sessions as 500 each would silently shrink it on
       sessions the clinic had already paid out on. `adminMetrics.test.ts`
       asserts every money figure is byte-identical either side of a
       settlement, and that is the first test written.
     - **The pool is fungible across payments, each payment is not.**
       Requiring one payment to cover one whole session reads tidier and
       strands money for ever: two 800 instalments leave 1,600 in the
       clinic's hands and a 1,200 session nothing can close. The session is
       stamped with the payment that **completed** it, since
       `pay_later_payment_id` holds one -- which is why a settlement receipt
       lists the sessions a payment closed rather than claiming its amount
       is the sum of their prices.
     - **Allocation runs at two moments**, a payment being confirmed and a
       session being completed, so a remainder is picked up without anything
       having to remember it. It reads the whole pool rather than one
       payment, which is also what makes it idempotent.
     - **A declaration settles nothing.** `/api/patient/declare-payment`
       writes a `pending` row and the owed figure does not move; only
       `/api/admin/confirm-pay-later-payment` reaches the allocator. One
       waiting at a time. **Confirming needs no reason and rejecting needs
       ten characters** -- the opposite split from the grant, because here
       the outcome that takes something away is the refusal, and its reason
       is the only half the patient can act on.
     - **An online row is never `pending`** (a CHECK): the gateway is the
       confirmation. So `record_payment_capture`'s fourth branch claims it on
       `razorpay_payment_id is null` rather than on the status -- a status
       guard could never match, and the allocator would never run on the one
       path it was written for. That bug was found by
       `scripts/pay-later-sql-checks.sql`, which asserts both halves: the
       capture closes the session, **and** a retried webhook closes nothing
       twice.
     - **The table is append-only by trigger**, permitting exactly
       `pending -> confirmed|rejected` one way plus the two columns
       allocation moves, and never a delete. `payments.purpose` is widened to
       `pay_later_settlement` and `payments.target_pay_later_payment_id`
       added, so a settlement is not reported as captured money attached to
       nothing -- read in its **own isolated query** in
       `readUnmatchedPayments`, since folding the column into the existing
       one would take the whole check to "unknown" on an unmigrated
       database. One receipt per payment, not one per session: four receipts
       for one transfer reads as four payments.

  9. **Money out is a cost, and a refund is a hand-back.** Two paths, and
     both were half-wired before they existed: `pay_later_outcome =
     'written_off'` was read in six places and written by nothing, and
     `refund-session-partial` refused every settled pay-later session
     because it requires `razorpay_payment_id` **on the appointment**.
     - **A write-off is a cost, not a revenue reduction.** Completion
       already counted the revenue and already paid the therapist, so
       `/api/admin/write-off-pay-later-session` touches **no** money column
       on the appointment: `amount_due_paise`, `amount_paid_paise` and
       `payment_status` stay exactly as they are, the session leaves the
       owed figure through `pay_later_outcome` alone, and the loss is one
       `business_expenses` row. Reducing the session's amount instead would
       pull revenue down *and* claw the therapist's share back off money
       already handed to somebody who had no say in extending the credit.
       `adminMetrics.test.ts` asserts every figure is byte-identical either
       side, the same shape as the settlement-invariance test.
     - **Its cost class is `fixed`, which is the accounting answer rather
       than the convenient one.** Bad debt is an operating expense: below
       the gross-profit line, inside break-even's "what has to be covered",
       and **not** added back in EBITDA. It is also `DEFAULT_COST_CLASS`, so
       the unmigrated-database fallback insert lands it in the same place.
       `BAD_DEBT_EXPENSE_CATEGORY` is deliberately **not** in
       `EXPENSE_CATEGORIES`: that list is what an admin may type by hand, and
       keeping bad debt out of it is what makes "written-off sessions equal
       the bad-debt rows" a reconciliation rather than a coincidence.
       `incurred_on` is the day it was decided, never the session's own date
       -- back-dating a cost into a month somebody has already read moves a
       profit figure under them.
     - **The order of the two writes is the safety case.** The appointment is
       claimed first (`pay_later_outcome is null`, so a double tap writes one
       cost row), the cost row second, and a failure on the second **reverts
       the first** -- same posture as `refund-session-partial` reverting its
       claim when Razorpay refuses. A session written off with no cost behind
       it overstates profit by exactly the amount forgiven and says so on no
       screen, which is worse than a write-off that failed.
       `business_expenses.source_appointment_id` plus a partial unique index
       is what ties the two together, and it is what
       `/api/admin/expenses/delete` refuses to break.
     - **It is reversible, and reversing needs a reason too.** The opposite
       split from the grant: there the risk is all on one side, here writing
       off gives money away and reversing re-imposes a debt on a patient who
       was told it was forgiven. Written-off sessions get their own list on
       Money -> Owed by Patients precisely so the undo is a control rather
       than a claim -- every balance drops them.
     - **A refund on a settled session is handed back by a person.** The
       money arrived into a **pool** covering several sessions and an online
       settlement's gateway id is on the `pay_later_payments` row, so "this
       session's share of that payment" is not something a gateway refund can
       express safely. Every settled pay-later session takes the
       `manual_pending` lane whatever it was settled with, on the same claim
       and the same ceiling, and is worked from **Refunds to hand back** on
       Money -> Owed by Patients through the existing
       `mark-cash-refund-returned`. An **unsettled** session is not a refund
       at all and the route says so rather than dead-ending: it is the
       write-off. A session paid by `mark-paid-by-cash` is the same shape and
       is deliberately left alone -- it has no figure of its own that an
       unrecorded hand-back would falsify.
     - **`manual_refunds` splits in two.** It counted every `manual_pending`
       row and linked to Money -> Payouts, whose Cash Ledger lists home
       visits -- so a pay-later refund would be counted there and actionable
       nowhere. `pay_later_refunds` is its own key linking to Owed by
       Patients; the two sum to the old total, so no count moved.
     - **System Health gains two states**: refunds owed back and not sent
       (amber -- a patient is out of pocket and nothing automatic will move
       it), and written-off sessions disagreeing with the bad debt recorded
       (red, and **null is not zero** -- a database without
       `source_appointment_id` reads "could not be checked").
