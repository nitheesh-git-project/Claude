# The money model

The revenue split and its two invariants, payouts, settlements, Business Health, costs, cash, and one word per figure.

**Mostly lives in:** src/lib/adminMetrics.ts · therapistPayouts.ts · financeMetrics.ts · sessionSettlement.ts · moneyTerms.ts

> Part of `docs/rules/`. `CLAUDE.md` says which file a task needs; this one
> is the detail. Keep it current in the same change that makes it wrong --
> see the docs rule in `docs/rules/testing.md`.

---

- **A therapist asserts that money changed hands; the system owns the
  number.** `/api/therapist/record-cash-collection` used to accept
  `amountPaise` from the request body, which meant the person holding the
  cash also decided how much of it the clinic knew about - and that figure
  nets straight off what `therapistCashLedger` says they owe, so
  under-reporting was a one-field withdrawal. The body now carries an
  appointment id and nothing else; the total is reconstructed from the
  purchase with the same per-visit maths `bookHomeVisitSession` used. The
  honest exception is real (a patient short of cash, an adjustment agreed at
  the door) and it belongs to whoever is *not* holding the money:
  `/api/admin/correct-cash-amount`, `requireAdminScope("money")`, a
  mandatory reason, a CAS on the figure being replaced, and a
  `cash.correct_amount` audit row. It refuses a visit whose cash has already
  been remitted - that transfer has gone out, so the fix is an adjustment
  against the next payout rather than a silent edit of a settled one.
  **Cash is recorded at the visit, for a visit that is still on, at a
  price the system could read.** The route refuses a `requested` or
  cancelled visit and a confirmed one before its join window, re-checks
  the status inside the claiming write (a visit cancelled between the read
  and the write is not marked paid), and refuses outright when the
  purchase price cannot be read - it used to fall back to a fee of zero and
  still mark the visit paid.

- **One money word per role.** Money owed *to* someone is **Earnings**
  (therapist and hospital), money going *out* is **Payments** (patient),
  and the clinic's own books are **Money** (admin). The hospital's screen
  was "Revenue & Payouts", which read as a third concept for the same
  thing. This is the sidebar-level counterpart of the "one word, one money
  figure" rule below.
- **One word, one money figure -- and the definition sits beside the
  figure.** "Package cash collected" is what came into the bank up front;
  revenue recognises that same money gradually, one session at a time.
  Gross/Net Revenue keep their standard meanings. If a new figure needs a
  word that is already taken, rename the figure, don't overload the word,
  and if two figures end up with the same meaning delete one rather than
  explaining the difference. (The Costs screen's `Payment fees` was that
  collision: it printed the gateway *percentage* under the name Summary uses
  for the resulting *amount*. It is `Gateway fee %` now.)
  The vocabulary itself lives in `src/lib/moneyTerms.ts`, read by two
  surfaces that must not disagree: `MoneyGlossary` (still at the foot of
  every Money screen) and the `(i)` on each figure (`MoneyFigure` /
  `MoneyTermInfo`). A glossary at the bottom of the screen puts the
  definition as far as the page allows from the number that needs it, so it
  is the fallback for reading the whole set, not the answer. Add a figure by
  adding its term there -- `moneyTerms.test.ts` fails a term with no entry,
  a duplicate name, or a missing scope.
  **`scope` is part of a figure's definition, not a sentence somebody
  remembers to write.** `range` moves with the dates in view, `now` is true
  this instant (a debt does not stop existing outside a filter), `setting`
  is a rate rather than an amount. It prints as a chip -- `StatCell.scopeNote`
  in a strip, `ScopeChip` on a card -- wherever the two kinds sit together,
  because an admin narrowing the range and watching one figure fall while
  the one beside it holds still is reading a screen that looks half-broken.
  **A total can be opened.** Each of Summary's four split figures has a "See
  the sessions" link listing exactly the rows behind it (`explainMoneyLines`
  in `adminMetrics.ts`, rendered by one modal for all four -- four modals
  would be four chances to filter differently from the card that opened
  them). It is derived from `moneyLineFor`, which `moneyByBucketFor` itself
  calls, so the drill-down and the total are the same arithmetic rather than
  two implementations that agree today; `adminMetrics.test.ts` asserts the
  lines sum to the buckets. A drill-down that can disagree with its own total
  is worse than none, because it makes a correct figure look wrong.
  The drill-down exports like every other table (one `CsvColumn[]`, both
  formats), and Net revenue carries `comparePeriod()` against `previousRange()`
  -- the same number of days immediately before, never a calendar month
  against a 30-day window, which would move the figure by the number of days
  rather than by the business. Two refusals in that helper are the point of
  it: a zero baseline yields **no** percentage (`+100%` and `∞` are both
  lies), and a move under half a percent reads "level" rather than drawing an
  arrow over noise an owner will learn to ignore.
  **Money answers "is anything wrong?" too.** `src/lib/moneyAlerts.ts` +
  `MoneyAlertsStrip` sit at the top of all five Money screens: payout
  requests waiting, cash a therapist is holding, refunds to hand back by
  hand, payments attached to nothing. Cash collected a month ago and never
  handed over is not a wrong number on any screen -- it is money that is
  simply not there -- so no figure could have surfaced it. Same rules as the
  admin home's actions: a zero row is dropped, an item whose section this
  scope cannot open is dropped rather than linked into `findTab`'s fallback,
  and every item links to the rows it counted.
  **The strip is work waiting on somebody; System Health is records
  disagreeing.** Two different questions, so they stay two places rather than
  being gathered into a third screen -- a new page listing what both already
  list is a third answer to "is anything wrong", and the first time the three
  disagree the new one is the one nobody trusts. A new finding goes on
  whichever of the two it actually is.
  **A purchase with nothing booked against it is on the strip**, because it
  is a phone call rather than a disagreement. `src/lib/unscheduledPurchases.ts`
  is that judgement, dependency-free and unit-tested since it decides who gets
  rung: still `active`, money **committed** (paid, or a home visit agreed at
  the door -- a cash purchase is `unpaid` for its whole life by design, so
  judging on payment status alone drops every one of them silently), nothing
  booked **ever** rather than "has sessions left" (almost every active
  purchase has sessions left, so that row would count nearly all of them),
  and past a 24-hour grace window so a purchase on its way to the scheduler
  is not a fault seconds after it is made. An unreadable `created_at` is not
  treated as old: inventing an age would put somebody on a call list because
  of a timestamp nobody could read. It is **not urgent** -- nothing has gone
  wrong and nobody is out of pocket, which is the opposite of every other row
  there. It links into **Catalog -> Purchases** with `view=unscheduled`,
  since the section is chosen by where the work is done and not by which
  strip the row sits on; the *Nothing booked yet* filter it applies is
  deliberately distinct from the *Has unscheduled sessions* checkbox beside
  it. The patient was never stranded -- the balance is on their Programmes
  screen and unbooked sessions are pinned on their dashboard -- and that is
  the failure: every mechanism pointed at the patient, so a purchase made by
  somebody who paid and was then distracted waited on exactly the person who
  had already stopped.
  **A figure appears once per screen.** Summary printed Net revenue twice,
  Clinic share three times and Operating profit twice, because its strip
  repeated the chain below it. The strip is the answers now (net revenue,
  operating profit, what is owed, cash collected up front); the two blocks
  under it are the subtraction, where carrying a figure down from the block
  above is the point rather than a repeat.
- **The revenue split has one source and two invariants.**
  `moneyByBucketFor` (`src/lib/adminMetrics.ts`) is the only place the
  clinic's money is divided up, so the strip, the tiles and the breakdown
  chart cannot disagree. Two identities must always hold:
  `net = gross - refunds` and
  `clinic share = splittable net - therapists' share - partners' share`.
  Three rules decide the split, each one a correction of a real
  misstatement:
  1. A therapist's share is earned by **delivering**, not by being booked -
     only a `completed` paid session adds to it, the same rule
     `computeTherapistPayoutSummary` and `settle-therapist-payout` enforce.
     Counting every paid session deducted a share nobody would ever be paid,
     which understated the clinic's take on every forfeited late
     cancellation.
  2. A home visit's **travel fee is part of the therapist's share** and
     never revenue, so the Money screens must be passed the
     payout-enriched appointments (`visit_mode`, `travel_fee_paise`, the
     cash columns) and the per-therapist home-visit rate. Passing the plain
     array silently moved the whole travel bill into the clinic's share.
  3. **Refunds reverse the partner's commission, not the therapist's** - a
     refunded session was cancelled, so it never earned a therapist share,
     and a hospital's cut is taken on net revenue. This is what lets the
     clinic share be exact instead of the "approximate" figure it used to
     be labelled.
  Revenue and the split have **different eligibility**: gross, refunds and
  net count every paid session, while a session whose split is unknowable
  (no therapist share set, or a partner with no share configured) is
  excluded from the split alone and surfaced as a named count. Never guess
  a percentage to make the numbers tie.
- **The seven standard finance figures are a screen, and three of them stand
  on numbers this app cannot know.** Money -> Business Health reports return
  on investment, return on ad spend, working capital, both profit margins,
  EBITDA, break-even and revenue run rate. The maths is dependency-free in
  `src/lib/financeMetrics.ts`; the screen draws what it returns and derives
  nothing of its own. Revenue and the split come from `moneyByBucketFor` and
  `gatewayFeePaise` -- the same functions Summary reads -- so the two screens
  cannot disagree about what the clinic earned. Six rules hold it:
  1. **A figure that cannot be worked out is null, never zero**, and the card
     says which input is missing and links to the screen that takes it. ROI
     with nothing invested, ROAS with nothing traceable, a break-even where a
     session leaves nothing towards the fixed costs: each is a refusal with a
     sentence. A zero is read as a measurement and acted on -- the same
     reasoning `comparePeriod` refuses a percentage off a zero baseline.
  2. **Nothing is inferred from a label.** What kind of cost something is
     (`business_expenses.cost_class`), whether a write-off is depreciation or
     amortization, which campaign a booking came from -- all recorded columns,
     never guessed from wording somebody will reword. `cost_class` defaults to
     `fixed`, which is what every row predating the column already was, so no
     figure moved when it shipped; it is read in its own query and merged, so
     an unmigrated database still lists every cost.
  3. **Advertising revenue is traced or it does not exist.** A campaign is
     traced by a promo code, and is then worth exactly the net revenue of the
     bookings that claimed it -- read off the same `MoneyLine`s the profit
     figures are built from. Untraceable spend is held **out** of the
     division and stated separately, because leaving it in the denominator
     reports a campaign as a failure for the sole reason that nobody tagged
     it. A hand-entered figure is allowed (an ad that makes the phone ring is
     real and invisible here) and is labelled as the owner's own wherever it
     shows. Spend is pro-rated across the campaign's own days; an open-ended
     one runs to today, never to the end of the range in view, or one row
     would read as a different daily budget every time somebody moved the
     dates.
  4. **Working capital counts what the clinic already owes as care.** Money
     taken for sessions not yet delivered is a current liability
     (`unusedPaidValuePaise`, valued at what was actually paid, never at the
     live catalogue price), alongside what therapists are owed, cash they are
     holding and refunds still to hand back. It is a dated snapshot, not a
     period: every hand-entered row sharing an `as_of` is one snapshot and the
     most recent at or before the range end is the one read, so entering this
     month's bank balance does not erase last month's.
  5. **The three `finance_cogs_*` switches change a reading, never a total.**
     Moving the therapists' share, the partners' share or the payment fees
     between cost of delivery and overhead moves the gross-margin line and
     leaves operating income and net profit untouched -- asserted in
     `financeMetrics.test.ts`, because a switch that moved the bottom line
     would be a way to report a different profit.
  6. **A dimension filter narrows revenue, not costs.** Rent is not
     attributable to a therapist, so a filtered profit figure compares one
     slice's revenue with the whole clinic's costs. The screen says so in an
     amber line while any filter is on rather than leaving somebody to read it
     by accident.
  Adding a figure means a `financeMetrics` function with its own test, a
  `MONEY_TERMS` entry carrying `formula` and `source` as well as `meaning`,
  and a card on the screen -- never arithmetic inside the component.

- **Only one figure may be called profit, and only because costs exist.**
  `clinic share` is what net revenue leaves after the therapist and partner
  splits - a gross figure. **Operating profit** is that less the two cost
  lines in `src/lib/operatingCosts.ts`: the payment-gateway fee, derived
  automatically from what was collected online (charged on gross, since a
  processor keeps its fee through a refund, and skipped for cash-on-visit,
  which never touches a gateway), and `business_expenses`, hand-entered on
  Money → Costs and dated by `incurred_on` rather than when someone typed
  it in. Before that table existed no screen could honestly say "profit",
  which is why none of them did. With no costs recorded for a range,
  Operating profit is a ceiling and the screen says so rather than
  implying a number it cannot know. Nothing here is post-tax; don't label
  it "net profit".
- **Money answers financial questions; Sessions answers operational ones.**
  No-show, cancellation and repeat-booking rates and sessions-per-therapist
  live under **Sessions → Delivery**, not Money - a no-show rate is about
  how the clinic runs, not about its books. `AdminMetricsTab` renders all
  three slices (`summary`, `breakdown`, `delivery`) off one pass of the
  same maths, so adding a figure means choosing which question it answers,
  not duplicating a calculation.
- **A balance is never date-filtered.** "Owed to therapists" is all-time and
  net of cash held, matching the Payouts screen and what the Pay button
  actually transfers - scoping it to the range in view let an admin read
  "nothing owed" off a quiet week while a real debt sat outside the window.
  Flows (revenue, refunds, what was settled) are range-scoped; balances are
  not, and the label has to say which it is.
- **A therapist's cut has one implementation, and a walk keeps it that way.**
  `sessionTherapistCutPaise()` (`src/lib/therapistPayouts.ts`) is what one
  delivered session pays its therapist: the home-visit rate where there is
  one, the ordinary share otherwise, plus travel **on top** rather than inside
  the share, and for a **settled** session the figure actually transferred
  rather than a recomputation -- rates can be renegotiated after a payout, and
  recomputing would silently rewrite what somebody was already paid.
  Two screens had their own copy of that multiplication and both had the same
  two holes, because it is the therapist profile's own corrected bug surviving
  where the arithmetic had been duplicated: `/api/therapist/request-payout` let
  a therapist who does home visits **request** a figure disagreeing with Money
  -> Payouts and with what the Pay button transfers (and its
  `payment_status = 'paid'` filter dropped every delivered pay-later session,
  so the one population the clinic carries the gap for came up short), and
  `PatientDetailContent`'s profit chart overstated a home visit's profit by
  exactly the travel fee the clinic passes straight through.
  `duplicatedMoneyRules.test.ts` walks every `.ts`/`.tsx` in `src/` and fails
  on arithmetic with a share percentage outside the four modules that own it,
  each listed with its reason -- the same shape and reasoning as
  `formatDateTime.test.ts`'s walk, because this is a mistake that produces no
  error, no failed request and no wrong row, only a wrong number every screen
  agrees on. Comment lines are skipped, or the walk flags its own
  documentation.
- **Every delivered session writes down what it was worth, beside the figure
  the Money screens work out for themselves.** `session_settlements` is one
  immutable row per completed session, written in the same request that makes
  it payable, carrying the **amounts** rather than the rates -- gross, travel,
  the therapist's share, the partner's and the clinic's -- with the
  percentages along for explanation only. It is the canonical record a
  derivation could not be: a settlement can be queried, it records *when* the
  split was computed, and a payout can reference it.
  **It is written alongside the derivation and nothing reads it yet**, which is
  the `session_credit_ledger` playbook and the whole reason it could land
  without a migration: historical sessions have no row and need no backfill,
  every money figure is unchanged, and `verify_settlement_agreement()` reports
  disagreement on Settings -> System Health -> Settlement record. Making it
  authoritative is a later change behind a switch, and the precondition is that
  reconciliation staying green on real data.
  Four rules. It **never fails the completion** -- closing a session is what
  creates the debt, the revenue and the therapist's pay, and a shadow record
  must not stop it (the opposite of `refund_attempts`, which is written before
  money moves and so must be able to refuse). It stores **amounts, not rates**.
  The therapist's share comes from `sessionTherapistCutPaise()` rather than a
  local multiplication -- the duplication rule in the one place a third copy
  would be written into a permanent record. And the clinic takes the
  **remainder** rather than its own percentage, so the three shares sum to
  gross exactly and rounding can neither invent nor lose a paisa, which is what
  the reconciliation asserts. Append-only by trigger, with `external_reference`
  the one column that may be filled in later and only **once**: a reference
  that can be rewritten is a notes field rather than a reconciliation. Checked
  by `scripts/session-settlement-sql-checks.sql`, both halves plus a negative
  control.
- **A payout settles all of its sessions or none of them.** It used to claim
  each appointment with its own UPDATE inside a `Promise.all` -- every one its
  own transaction -- so a failure part-way left some sessions settled against
  the batch and some not, the route answered 500, and the admin who had just
  been told how much cash to hand over could not tell whether any of it had
  been recorded; a retry then settled the remainder under a *second* batch id.
  `settle_therapist_payout_batch()` does the claims in one statement, so a
  failure rolls the whole thing back and the answer is an honest "try again".
  It is a **writer, not a rule**: the per-session amounts are computed by
  `sessionTherapistCutPaise()` and passed in as jsonb, because a third copy of
  that arithmetic written in SQL is the duplication rule broken in the one
  place where being wrong hands a real person the wrong amount of money. The
  **cash remittance rides in the same transaction** -- deducting the cash *is*
  the remittance, so recording the deduction and then failing to close the
  collections let the next run net the same rupees off again -- and still only
  fires when the payout fully absorbs the cash, since a therapist holding more
  than they are owed keeps that difference on the Cash Ledger as a real debt
  the other way. The compare-and-swap is unchanged: only rows still
  `therapist_payout_paid_at is null` are claimed and the claimed ids come back,
  so the response is what this request won rather than a phantom total.
  Checked by `scripts/payout-atomicity-sql-checks.sql` -- the settlement that
  must land, the second call that must claim nothing, and a malformed payload
  leaving nothing settled -- plus a negative control.
- **What a therapist can request, an admin can settle, and a request is
  only completed by a payout.** `isTherapistShareEarned`
  (`src/lib/therapistPayouts.ts`) is the one eligibility predicate -
  completed, and paid *or* on pay-later terms - read by the summary, by
  `/api/therapist/request-payout` and by `settle-therapist-payout`. The
  settle route used to ask for `payment_status = 'paid'` alone, so delivered
  pay-later sessions were requested and never settleable. The request route
  had selected a column that does not exist (`cash_collected_paise`), dropped
  the error and told every therapist "nothing owed"; every read in both
  routes is now paged and checked, and a failed one is a 503, never a zero.
  The payout batch is **inserted at the amount it is about to settle**, with
  its note written - not at ₹0 and corrected by a second write that could
  fail and leave paid-out sessions behind a ₹0 receipt; it is rewritten only
  when a concurrent settle claimed some sessions first. Settling closes the
  therapist's open request and records `payout_batch_id` on it
  (`linkOpenPayoutRequest`); `/api/admin/complete-payout-request` refuses
  unless a batch created since the request was raised exists to link, so a
  therapist is told they were paid only when a payout was recorded.
- **Netting cash off a payout is a remittance.** `settle-therapist-payout`
  reduces the transfer by the cash a therapist is holding, so it marks
  exactly those visits `cash_remitted_at` in the same run. Without that the
  same rupees were deducted again on the next payout and the Cash Ledger
  went on asking someone to chase money already recovered. The one
  exception is a therapist holding **more** than they are owed: the transfer
  floors at zero, the difference stays as `stillOwedToBusinessPaise`, and
  those collections deliberately stay open on the Cash Ledger for a person
  to chase.
- **A figure a screen reads must have a screen that writes it, and a therapist's
  home-visit share had none.** `profiles.home_visit_revenue_share_percent` is
  read by `computeTherapistPayoutSummary`, by `settle-therapist-payout` and by
  every Money figure that splits a home visit -- and was **written by nothing**
  in `src/`: no route, no form, so the only way to give a therapist a different
  rate for visits was to edit the column by hand in the table editor.
  `/api/admin/update-therapist-home-visit-revenue-share` is that writer,
  `requireAdminScope("money")` with its own audit action
  (`therapist.set_home_visit_revenue_share`, domain `money` in `ACTION_DOMAIN`,
  or `activityScope.test.ts` fails). It differs from the ordinary share route in
  exactly one way, and that difference is the whole reason it is a second route:
  it accepts **clearing** the value. Null means "no separate rate, use the
  ordinary share", which is what every therapist carries today, so a route that
  refused an empty box -- as the ordinary one rightly does -- could set the
  column and never unset it. `TherapistRevenueShareForm` was generalised
  (`endpoint`, `field`, `label`, `clearable`, `fallbackNote`) and rendered twice
  rather than forked, since two copies is how the two grow different range
  checks.
  **The same change corrected the profile's own arithmetic**, which is the
  sharper half: that page computed `owedPaise` and each row's payout from
  `revenue_share_percent` alone, with no home-visit branch and no travel fee --
  so a therapist's own profile disagreed with Money -> Payouts and with what the
  Pay button actually transfers. It routes through
  `computeTherapistPayoutSummary` now, which already held the rule. A figure on
  a profile that disagrees with the Pay button is worse than a missing field.
