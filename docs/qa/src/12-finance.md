---

## 16. Finance test plan (Money) and payment integrity

### 16.0 Feature guide - the money model

**One word, one money figure.** If a new figure needs a word that is already taken, the figure gets renamed - the word is never overloaded. If two figures end up with the same meaning, one is deleted rather than explained. `MoneyGlossary` renders on **every** Money screen, not only Summary, because an admin reading "Net payable" on Payouts is the one who needs it.

| Word | Means |
| --- | --- |
| **Gross Revenue** | Every paid session in range, before refunds |
| **Refunds** | Refunds that actually processed |
| **Net Revenue** | `Gross − Refunds` |
| **Splittable Net** | The part of Net whose split is **knowable**. Always ≤ Net. |
| **Therapist share** | Earned by **delivering** - completed **and** paid only. Includes a home visit's travel fee in full. |
| **Partner share** | A commission on **net** revenue |
| **Clinic share** | `Splittable Net − Therapist share − Partner share`. A **gross** figure. |
| **Operating profit** | Clinic share **less** the gateway fee and hand-entered business expenses. The only figure that may be called profit - and only because costs exist. |
| **Package cash collected** | What came into the bank up front |
| **Recognised revenue** | The same money, recognised one session at a time |
| **Owed to therapists** | An all-time **balance**, net of cash held. Never date-filtered. |

**The two identities that must always hold:**

```
net           = gross − refunds
clinic share  = splittable net − therapist share − partner share
```

**Three split rules, each a correction of a real misstatement:**

1. **A therapist's share is earned by delivering, not by being booked.** Only a `completed` **and** paid session adds to it. Counting every paid session deducted a share nobody would ever be paid, which understated the clinic's take on every forfeited late cancellation.
2. **A home visit's travel fee is part of the therapist's share and is never revenue.** The Money screens must be passed the payout-enriched appointments (visit mode, travel fee, the cash columns) and the per-therapist home-visit rate. Passing the plain array silently moved the whole travel bill into the clinic's share.
3. **Refunds reverse the partner's commission, not the therapist's.** A refunded session was cancelled, so it never earned a therapist share; a hospital's cut is taken on net.

**Different eligibility for revenue and for the split.** Gross, refunds and net count **every** paid session. A session whose split is **unknowable** - no therapist share set, or a hospital-referred patient whose hospital has no share configured - is excluded **from the split alone** and surfaced as a **named count**. **Never guess a percentage to make the numbers tie.**

**Flows are range-scoped; balances are not.** "Owed to therapists" is all-time and net of cash held, matching what the Pay button actually transfers. Scoping it to the range in view once let an admin read "nothing owed" off a quiet week while a real debt sat outside the window. The label has to say which it is.

---

### 16.1 The reference dataset

Build this exact dataset before running §16.2 onward. It is small enough to compute by hand and exercises every rule.

| # | Patient | Therapist | Mode | Paid | Status | Refund | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | A | A (60%) | online | ₹1,999 | completed | - | Ordinary delivered session |
| S2 | A | A (60%) | online | ₹1,799 | confirmed (not completed) | - | Paid, **not delivered** |
| S3 | A | A (60%) | online | ₹1,999 | cancelled | ₹1,999 processed | Refunded outside the window |
| S4 | C (Hospital A, 10%) | A (60%) | online | ₹2,499 | completed | - | Partner attribution |
| S5 | C (Hospital A, 10%) | B (**no share set**) | online | ₹1,999 | completed | - | **Excluded from the split** |
| S6 | A | A (home 65%) | home visit | ₹2,499 | completed | - | Travel fee ₹150, paid online |
| S7 | B | A (home 65%) | home visit | ₹2,499 | completed | - | Travel ₹150, **cash at the door**, not remitted |

Costs: the three expenses from §8.15. Gateway fee: **2%**.

**Hand-computed expectations for the whole range (all figures in rupees):**

* **Gross** = 1999 + 1799 + 1999 + 2499 + 1999 + 2499 + 2499 = **₹15,293**
  *(S7 is a cash home visit: include it only once the cash is recorded as collected - see `FIN-SUM-002`.)*
* **Refunds** = **₹1,999** (S3)
* **Net** = 15,293 − 1,999 = **₹13,294**
* **Excluded from the split**: S5 → count `1`, excluded revenue **₹1,999**
* **Splittable Net** = 13,294 − 1,999 = **₹11,295**
* **Therapist share** (completed **and** paid only):
  * S1 `1999 × 60% = 1,199.40`
  * S4 `2499 × 60% = 1,499.40`
  * S6 `2499 × 65% + 150 = 1,774.35`
  * S7 `2499 × 65% + 150 = 1,774.35`
  * S2 (not completed) → **0**; S3 (cancelled) → **0**; S5 (excluded) → **0**
  * **Total ≈ ₹6,247.50**
* **Partner share** (10% of **net**, hospital-referred, non-excluded): S4 only → `2499 × 10% = ₹249.90`. S5 is excluded entirely, so it contributes nothing.
* **Clinic share** = 11,295 − 6,247.50 − 249.90 = **₹4,797.60**
* **Gateway fee** (2% of **online** collections, charged on **gross**, **skipped for cash-on-visit**): online gross = 15,293 − 2,499 (S7 cash) = 12,794 → `≈ ₹255.88`
* **Expenses in a September range** = 25,000 + 4,000 = **₹29,000** (the ₹6,000 August row is **outside** and must not be counted)
* **Operating profit** = 4,797.60 − 255.88 − 29,000 = **−₹24,458.28** (a loss - which is the honest answer for this dataset)

> Rounding: each per-appointment share is rounded to the nearest paise **individually** before summing. Expect ±1 paise against a spreadsheet that rounds at the end.

---

### 16.2 Money screens

#### `FIN-NAV-001` - Each Money screen says what it is, and holds what it claims · P1

**Steps.** Open each of the seven Money screens in turn: Summary, Business Health, Transactions, Payouts, Costs, Breakdown, Your Numbers. Read the line under each heading. Then open **Settings → Offers & Discounts**, read its "Looking for promo codes?" note, and follow it.
**Expected Result.** Every screen prints its own one-line description plus a **For example:** line under the heading, in place of the section's own blurb - the same treatment the Settings screens get, and for a sharper reason: five screens named with abstract nouns ("Summary", "Breakdown") make an owner open three to find the one answering their question. **Promo codes are on Costs**, beside the *Discounts given* figure they produce - which is where the Offers note, the README and `ADM-PROMO-001` have always sent people.
**Negative:** they used to render on **Summary**, so following that note landed on a screen with no promo codes anywhere on it and no way to tell whether the feature existed at all.

#### `FIN-SUM-001` - Summary and the two identities · P0

**Steps.** Open **Money → Summary**. Set the date range to cover the dataset. Read every figure. Compute the two identities by hand.
**Expected Result.** `net = gross − refunds` and `clinic share = splittable net − therapist share − partner share` **hold exactly**. The figures match §16.1. The excluded count reads `1` with `₹1,999` named. Every screen ends with the **MoneyGlossary**. No figure is labelled "approximate" - the split is exact over a stated subset.
**No figure appears twice on the screen.** The strip carries Net revenue, Operating profit, Owed to therapists and Package cash collected; the two blocks below it are the subtraction chain, where Clinic share is deliberately carried down from *Where the money went* into *What it cost to run*. Before this, Net revenue was printed twice, Clinic share three times and Operating profit twice, because the strip repeated the chain under it.

#### `FIN-SUM-004` - Every figure says what it means and when it is measured · P1

**Steps.** On **Money → Summary**, tap the **i** beside Net revenue, Clinic share and Owed to therapists. Read the chip on each. Then open the glossary at the foot of the screen and compare the sentences. Then check the **Gateway fee %** tile on Costs.
**Expected Result.** The **i** expands one sentence beside the figure, and it is **word-for-word** what the glossary prints - both read `src/lib/moneyTerms.ts`. Clinic share's says in place that it is **not** profit. Chips: `These dates` on the flows, `Right now` on Owed to therapists (amber) and on the Payouts heading, `A setting` on Gateway fee %. **That tile used to be called "Payment fees"** - the same name Summary gives the rupee amount derived from it, which is the one-word-two-figures collision the vocabulary exists to prevent.

#### `FIN-SUM-002` - Paid vs unpaid, completed vs not · P0
**Steps.** Confirm S2's treatment.
**Expected Result.** S2 (paid, **not** completed) **is** in Gross/Net, and contributes **nothing** to the therapist share. If the therapist share includes S2, the "earned by delivering" rule has regressed - that is a P0.
**Cash check:** S7's cash home visit sits at `payment_status='unpaid'` for its whole life. **Read `payment_mode` first.** It must not be presented anywhere as a failed or outstanding online payment.

#### `FIN-SUM-003` - Date filtering, and what is never filtered · P0
**Steps.** Narrow the range to one day containing only S1. Read every figure on Summary. Then read **Owed to therapists**.
**Expected Result.** Gross, refunds, net, and the split all narrow to S1. **"Owed to therapists" does not change** - it is an all-time balance, net of cash held, matching what the Pay button transfers. Its label says so. If it moves with the range, that is a P0: an admin could read "nothing owed" off a quiet week while a real debt sat outside the window.

#### `FIN-SUM-005` - Opening a figure, and what needs you · P1

**Steps.** On **Money → Summary**, tap **See the sessions** on Net revenue, then on Therapists' share, Partners' share and Clinic share. Add up the last column by hand in each. Then leave S7's cash un-remitted and a payout request pending, and open each of the five Money screens.
**Expected Result.** The modal lists exactly the sessions behind that figure and its footer **equals the card**, to the rupee - both come from `moneyLineFor`, which the totals themselves accumulate. A session paid for but **not delivered** appears under Therapists' share with **nothing** against it rather than being hidden. A session left out of the split is not counted in the two share modals. Partners' share offers no link when nothing was referred in range.
Every Money screen opens with a **needs-you strip**: `N things need you` over one row per item - payout requests waiting, cash a therapist is holding, refunds to hand back by hand, payments attached to nothing - each linking to the rows it counted. With nothing outstanding it reads `Nothing in Money needs you`. A **Finance** admin (no `settings`) sees the first three and **not** payments-attached-to-nothing, whose fix is on a screen they cannot open.

#### `FIN-SUM-006` - Exporting a figure's sessions, and last period's comparison · P1

**Steps.** Open **See the sessions** on Clinic share and export both CSV and PDF. Then set the range to September, read the line under **Net revenue**, and re-run with an August that has no paid sessions in it.
**Expected Result.** The export covers the **same rows the modal listed** and both formats come from one column definition, so they describe the same table; the PDF's subtitle names the date range. The strip's Net revenue carries a comparison against **the same number of days immediately before** the range in view - never a calendar month against a 30-day window, which would move the figure by the number of days rather than by the business. Up is green, down is red, and a move under half a percent reads **Level with the N days before** rather than drawing an arrow over noise. With nothing in the previous period it reads **Nothing in the N days before** - it must **never** print `+100%` or `∞` from a zero baseline.

#### `FIN-BH-001` - Business Health agrees with Summary, and the chain adds up · P0

**Steps.** Open **Money → Business Health** for the same range as `FIN-SUM-001`. Read the profit chain top to bottom and check every subtraction by hand.
**Expected Result.** Net revenue is **the same figure Summary prints**, to the rupee - both come from `moneyByBucketFor`. The chain holds exactly: `net revenue − cost of delivering sessions = gross profit`; `gross profit − running the clinic − depreciation − amortization = operating income`; `operating income + depreciation + amortization = EBITDA`; `operating income − interest − tax = net profit`. Gross margin and net margin are each their figure over net revenue. With **no** revenue in the range both margins read `-`, never `0%`.

#### `FIN-BH-002` - A figure that cannot be worked out says which input is missing · P0

**Steps.** With **nothing** recorded on **Money → Your Numbers**, read the Return on investment, Return on ad spend and Working capital cards. Then record one investment, one campaign with no promo code, and one bank balance, and read them again.
**Expected Result.** Each card first shows `-` with a sentence naming the missing input and a link to Your Numbers - **never** `0%`, `0×` or `₹0`, which read as measurements. After recording: ROI fills in from net profit ÷ what was invested; the second ROI figure stays `-` until an investment carries a **present value with a date**, and the card says how many are valued and how many are not; ROAS still shows `-` because the campaign cannot be traced, and its spend is listed as **not traced** rather than counted against a return.

#### `FIN-BH-003` - Advertising is traced by promo code, and spend is pro-rated · P1

**Steps.** On **Your Numbers → advertising**, record a campaign of ₹31,000 running 1–31 March, traced by a promo code. Book and pay for a session claiming that code. Read Business Health with the range 1–10 March, then 1 March–30 April. Then record a second campaign with no code and no figure.
**Expected Result.** The 1–10 March range counts **₹10,000** of the spend (ten of the campaign's thirty-one days) and the row says `10 of 31 days`; the wider range counts the whole ₹31,000. Revenue traced equals the **net revenue** of the bookings that claimed the code - the same money Summary reports. The untraced campaign's spend is shown, excluded from the ratio, and named in the "not traced to anything" line. A campaign carrying a figure the owner entered is labelled **Your figure**, never presented as traced.

#### `FIN-BH-004` - Working capital is a dated snapshot, and counts unused paid sessions · P0

**Steps.** Record a bank balance as of the 28th and a GST liability on the same date. Record a different bank balance a month later. Leave a patient holding unused sessions on a paid, active programme, a therapist holding cash, and a payout unsettled. Read the card with the range ending between the two snapshot dates, then after both.
**Expected Result.** Only the **most recent snapshot at or before the range end** is read; the older rows are listed and marked as older. On top of it, four app-known lines appear: what therapists are owed, cash they are holding, refunds still to hand back, and **sessions paid for and not used** - valued at what the patient actually paid, pro-rated over the sessions bought, never at the current catalogue price. Switching *Include the balances this app already knows* off on Your Numbers removes all four and leaves only the entered figures. With nothing owed, the ratio reads `-`, never `∞`.

#### `FIN-BH-005` - Break-even, and the reading switches · P1

**Steps.** Read the Break-even card. Then on **Your Numbers**, switch *Payment fees are a cost of delivering a session* off and read the whole chain again. Then enter a break-even price and delivery cost by hand.
**Expected Result.** Break-even is `costs that do not move ÷ left over per session`, **rounded up** - three-and-a-bit sessions reads as four. The bar shows sessions delivered against the line, and says how many past or short. Flipping the payment-fees switch moves the figure between *cost of delivering sessions* and *running the clinic*, changes gross profit and gross margin, and leaves **operating income and net profit identical** - a switch that moved the bottom line would be a way to report a different profit. With a price and cost entered by hand, the card says it is using your figures rather than what the sessions did. Where a session leaves nothing towards the fixed costs, the card refuses a number and says the price or the delivery cost has to move.

#### `FIN-BH-006` - Filters narrow revenue, not costs · P1

**Steps.** Filter Business Health to one therapist. Read the profit card. Then set the chart step to Weekly and to Monthly, and filter by delivery mode and by how it was paid.
**Expected Result.** An **amber line** on the profit card says a filter is on, that rent and every other running cost belongs to the whole clinic and is shown in full, and that the profit figures are therefore not that slice's profit. Revenue, the therapists' share and the delivery costs do narrow. Every chart redraws at the chosen step. A period with no revenue leaves a **gap** in the margin lines rather than a point at zero.

#### `FIN-BRK-001` - Breakdown agrees with Summary · P0
**Steps.** Open **Money → Breakdown** for the same range.
**Expected Result.** Every figure and every chart segment matches Summary **exactly** - both come from **one pass** of the same maths. A discrepancy of any size is a P0.

#### `FIN-TXN-001` - Transactions · P1
**Steps.** Open **Money → Transactions**. Reconcile every row against the dataset. Export CSV and PDF.
**Expected Result.** One row per payment, with the order id and payment id. **No payment id appears on two rows.** The CSV and the PDF describe the **same table** - they are generated from one column definition, and the PDF route is sent the exact filtered rows the browser rendered. Both cover the **whole filtered set**. The PDF carries a subtitle naming the scope and the date. **No JSON export exists.**

#### `FIN-PAY-001` - Payouts · P0
**Steps.** Open **Money → Payouts**. Read Therapist A's row.
**Expected Result.** `Owed` matches §16.1's therapist share for A, **less anything already settled**. **The Pay button shows the net figure** - owed minus cash held - not the gross owed. A therapist with **no revenue share set** shows the "not set" state rather than `₹0`; paying them is refused with `Set this therapist's revenue share % before paying out.`

#### `FIN-PAY-002` - Settling a payout · P0
**Steps.** Settle Therapist A's payout. Then attempt to settle again immediately. Then double-click Settle on Therapist B.
**Expected Result.** The transfer amount is recorded, `therapist_payout_paid_at` is stamped on exactly the sessions settled, and a **`payout.settle` audit row** is written **after** the compare-and-swap claim. A second attempt is a no-op or is refused - **no double payout**. The Owed figure drops to zero for the settled sessions.

#### `FIN-PAY-003` - Netting cash off a payout is a remittance · P0

**Purpose.** Without this, the same rupees are deducted again on the next payout and the Cash Ledger goes on asking someone to chase money already recovered.
**Preconditions.** Therapist A is holding S7's cash (₹2,499 + ₹150 travel, per the reconstructed total), un-remitted.
**Steps.** Read the Pay button's figure. Settle. Then open the **Cash Ledger** panel on the same screen. Then run a second payout cycle.
**Expected Result.** The transfer is reduced by the cash held. **The same run marks exactly those visits `cash_remitted_at`.** The Cash Ledger stops listing them. The second payout cycle does **not** deduct that cash again.

#### `FIN-PAY-004` - A therapist holding more cash than they are owed · P0
**Preconditions.** Arrange cash held > amount owed.
**Expected Result.** The transfer **floors at zero** (never negative). The difference is shown as **still owed to the business**, and **those collections deliberately stay open on the Cash Ledger** for a person to chase. They must not be silently marked remitted.

#### `FIN-PAY-005` - Payout requests · P1
**Steps.** With a therapist request outstanding, tap **Start review**, then **Complete**. Then try to complete a request that was never reviewed.
**Expected Result.** The states move `pending → reviewing → completed`. Completing without review is refused with `Start review on this request before marking it completed.` A completed request re-submitted returns `This request is already completed.` A stale action returns `This request is no longer pending - please refresh.` All audited.

#### `FIN-PAY-006` - Correcting a cash amount is the admin's job, not the therapist's · P0
**Steps.** As Admin Full, correct S7's cash amount to `₹2,000` with the reason `Patient short ₹649 at the door; agreed balance next visit.` Then try with a blank reason, then on an **already remitted** visit.
**Expected Result.** Valid: succeeds with a CAS on the figure being replaced, and writes a **`cash.correct_amount`** audit row. Blank reason: refused. Already remitted: **refused** - that transfer has gone out, so the fix is an adjustment against the next payout, not a silent edit of a settled one (`This session isn't a cash-on-visit home visit.` / the remitted refusal). A stale figure returns `Someone else changed this figure. Refresh and try again.`
As Admin Ops (no `money` scope): **403**, and the control does not render.

#### `FIN-COST-001` - Costs · P1
**Steps.** Open **Money → Costs**. Add the three expenses from §8.15. Set the range to September 2026.
**Expected Result.** Only the two September rows count; the 28 August row is excluded - expenses are dated by **when they were incurred**, not when they were typed in. Negatives: `Enter an amount greater than zero.`, `Pick the date this cost was incurred.` Deleting an expense removes it from the total.

#### `FIN-COST-002` - Operating profit and the gateway fee · P0
**Steps.** Read Operating profit. Then change the gateway fee percentage and re-read.
**Expected Result.** The gateway fee is **derived automatically** from what was collected **online**, charged on **gross** (a processor keeps its fee through a refund), and **skipped for cash-on-visit**, which never touches a gateway. Operating profit = clinic share − gateway fee − expenses. Changing the percentage moves it.
**With no costs recorded for a range, Operating profit is a ceiling and the screen must say so** rather than implying a number it cannot know. **Nothing here is post-tax - the label must never read "net profit".**

#### `FIN-REF-001` - Refunds across the screens · P0
**Steps.** Refund S3 in full. Then partially refund another session by `₹500` with the reason `Session cut short by a connection failure.` Then attempt a partial refund of `₹0`, and one with no reason.
**Expected Result.** Full: Gross unchanged, Refunds +₹1,999, Net −₹1,999, **therapist share unchanged**, **partner share reduced**. Partial: the same shape at ₹500. `₹0`: `Enter a refund amount greater than zero.` No reason: `Say why this refund is being made.` A second full refund: `This session has already been refunded in full.`

#### `FIN-REF-002` - Refund failure at the gateway · P1
**Steps.** Force a Razorpay refund failure (use a payment that cannot be refunded in test mode).
**Expected Result.** `Razorpay refused the refund. Nothing was refunded - check Razorpay and retry.` **Nothing is marked refunded locally** - the local state must never claim a refund the gateway did not make.

#### `FIN-REF-003` - A cash refund becomes a manual pending item · P1
**Steps.** Refund a cash-on-visit home purchase.
**Expected Result.** With no Razorpay payment behind it, the refund becomes `refund_status='manual_pending'` and is **surfaced on the admin Cash Ledger** until an admin confirms the cash was handed back. Marking it returned clears it and is audited. Attempting to refund a cash purchase as if it were online: `Cash-on-visit packages have no single payment to refund - cancel visits individually instead.`

#### `FIN-REF-004` - A refund voids available credits, never delivered ones · P0
**Preconditions.** A 6-session purchase with 2 sessions **completed** and 4 available.
**Steps.** Refund the package.
**Expected Result.** The **4 available** credits are voided; the **2 delivered stay delivered**. The ledger records a `void` for exactly 4. The patient's widget shows the programme as refunded with nothing available. **A delivered session is never un-delivered.**

#### `FIN-REF-005` - A refunded session says so wherever it is listed · P0
**Preconditions.** One session refunded in full, one refunded partially, one cash home visit at `manual_pending`, one refund that failed at the gateway, and one cancelled inside the window with no refund due.
**Steps.** Open **People → Patients → the patient's profile** and read the session rows. Then **Sessions → All Sessions**, then open each session's detail drawer. Export All Sessions as CSV **and** as PDF.
**Expected Result.** Every one of the five carries a refund chip beside its payment chip, reading `Refunded ₹1,200` / `Refunded ₹500` / `Hand back ₹500` / `Refund failed` / `No refund due` respectively, in that wording and nothing else. A session that was never refunded carries **no chip at all** - an empty refund column reading "-" on every ordinary session is noise. A partial refund states the amount refunded, not the amount paid. The drawer adds a **Refunded** panel above the partial-refund form giving when, the reason, and the gateway reference where there is one. Both exports carry a `Refund` column and a `Refunded on` column agreeing with the chips. **A refund is as visible as a payment on every surface that lists a session** - a refund that happened and left no trace on the session is the failure this case exists to catch.

#### `FIN-REF-008` - A refund the clinic owes is counted, and the count opens it · P0
**Preconditions.** One cash home visit at `manual_pending`, one **session** at `manual_pending`, and one session whose refund `failed` at the gateway.
**Steps.** As **Master Admin**, read the alerts strip at the top of any Money screen and the Today inbox. Tap each refund row. Then repeat as **Finance**, **Operations** and **Clinical**.
**Expected Result.** *Refunds to hand back* reads **2** - cash visits and sessions together, because both are money a patient is owed with no card payment to reverse; counting only the visits is the bug this case exists to catch. *Refunds that failed* reads **1** and is its own row, because the work is different. Tapping it lands on **Sessions → All Sessions** filtered to exactly that one session, with every other filter cleared. Finance see the hand-back row and **not** the failed one: they read Sessions without being able to change one, so a figure nothing they could do would bring down does not belong on their screen. Operations and Clinical open no Money screen at all. Every row is **urgent** - this is money the clinic has agreed to return and has not returned.

#### `FIN-REF-011` - A cash home visit is counted once, not twice · P0
**Preconditions.** Exactly **one** cash home visit at `manual_pending` and no other refund owed anywhere.
**Steps.** Read *Refunds to hand back* on the Money alerts strip and on the Today inbox, then open **Money → Payouts → Cash Ledger** and count the rows.
**Expected Result.** Every one of them reads **1**. It must not read 2: the dashboard's home-visit query and its main appointments query are the **same table** (`appointments`, one of them filtered to `visit_mode = 'home_visit'`), so a count that adds the two counts every cash visit twice and puts a figure on the strip the ledger underneath it disagrees with. Repeat with one failed refund on a home visit for *Refunds that failed*.

#### `FIN-REF-012` - The All Sessions export carries no money to a desk that cannot see it · P1
**Steps.** As **Operations**, then as **Clinical**, open **Sessions → All Sessions** and export both CSV and PDF. Repeat as **Master Admin** and as **Finance**.
**Expected Result.** The limited desks' files contain **no** `Amount (INR)`, `Refund` or `Refunded on` column at all - not a blank one. Those three never render in this table on screen, so a desk that cannot read them there must not be able to download them; every other column is present and the row count is identical. Master Admin and Finance get all three.

#### `FIN-REF-009` - The All Sessions refund filters · P1
**Steps.** On **Sessions → All Sessions**, take the payment filter through **Refunded**, **Refund to hand back** and **Refund failed**.
**Expected Result.** Each returns exactly the sessions in that state. **Refunded** in particular must return rows: `payment_status` is CHECKed to `unpaid` / `paid` / `failed` and can never hold `refunded`, so this option previously matched nothing and quietly returned an empty table - a filter that always looks like "no refunds have ever happened". A refund lives on `refund_status`.

#### `FIN-REF-010` - Every refund says why · P1
**Steps.** Cancel a paid session **outside** the window giving the reason `Therapist unwell, rescheduling next week.` Cancel a second one outside the window giving **no** reason. Cancel a paid **home visit** **inside** its own window (which differs from the online one). Read each session's admin drawer and each one on the patient's Payments screen.
**Expected Result.** The first carries the cancellation's own words on both surfaces. The second carries `Cancelled outside the refund window` rather than a blank line - a "Why:" with nothing after it is the failure this case exists to catch. The forfeiture carries `Cancelled within N hours of the slot, so no refund was due` with **N being the home-visit window**, never the online constant, and **never** the cancellation's own reason: that line answers "why this money moved" and no money moved. The patient's card shows the forfeiture as `No Refund` with that sentence on hover and **no refund line** - a forfeiture is not announced to them as a refund.

#### `FIN-REF-006` - A refund issued before the columns existed · P1
**Steps.** Against a database whose `appointments` rows predate `refunded_at` / `refunded_by`, open a session refunded before the migration.
**Expected Result.** The chip still reads the refund from `refund_status` and `refund_amount_paise`; **the date reads `-`** rather than guessing one, and the drawer's panel omits the "when" line. The columns are deliberately **not** backfilled - a stamped date nobody recorded is worse than an absent one. Nothing on the screen errors, and `Refunded on` is blank in both exports for that row.

#### `FIN-REF-007` - Finance and the desks that cannot see money · P1
**Steps.** As **Finance**, open a refunded patient's profile and All Sessions. Then repeat as **Operations** and as **Clinical**.
**Expected Result.** Finance reads the refund chips everywhere (Money is theirs at `manage`, Sessions at `view`). Operations and Clinical see **no refund chip** on either the patient profile or All Sessions - `canSeeMoney` gates it exactly as it gates the amount paid, so a desk that cannot read what was paid cannot read what was given back either. The `paid` / `unpaid` word itself is unchanged for them: whether a session is paid for is operational, and how much is not.

---

### 16.3 Payment integrity (duplicates, concurrency, webhooks)

> **Posting a webhook without a terminal.** The webhook cases below need a signed request, not a signed-in one: `/api/razorpay/webhook` authenticates the **body**, never a cookie. Sign and send it from DevTools → Console on any page of the app (§5.1a). Paste the raw body you copied from the Razorpay dashboard's webhook log, and the same `RAZORPAY_WEBHOOK_SECRET` the server has:
>
> ```js
> const secret = "<the RAZORPAY_WEBHOOK_SECRET the server is running with>";
> const raw = '<paste the exact raw JSON body, unmodified>';
>
> const key = await crypto.subtle.importKey(
>   "raw", new TextEncoder().encode(secret),
>   { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
> );
> const sig = [...new Uint8Array(
>   await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw))
> )].map((b) => b.toString(16).padStart(2, "0")).join("");
>
> const r = await fetch("/api/razorpay/webhook", {
>   method: "POST",
>   headers: { "Content-Type": "application/json", "x-razorpay-signature": sig },
>   body: raw,
> });
> ({ status: r.status, body: await r.text() });
> ```
>
> **`raw` must be the byte-for-byte body.** Do not paste it through `JSON.parse`/`JSON.stringify` to tidy it - that is exactly what `PAY-WH-001` (c) proves must fail, and doing it by accident turns a passing signature into `400 Invalid signature` with nothing to say why. To run the (b) case, change one character of `sig`; for (a), delete the `x-razorpay-signature` header line. To send the **same** webhook twice (`PAY-DUP-004`), re-run the last `fetch` - the body and signature are already in scope.

#### `PAY-DUP-001` - One payment, one appointment · P0
**Steps.** Complete `PAT-BOOK-003`, then reload and inspect Sessions → All Sessions and the `payments` table.
**Expected Result.** Exactly one appointment, exactly one `payments` row. **The appointment is created *before* the order, and the order is minted against it**, so there is no path by which one payment creates two appointments.

#### `PAY-DUP-002` - One order, one purchase · P0 **[SQL]**
**Steps.** Attempt to insert a second `payments` row with an existing `razorpay_order_id`.
**Expected Result.** The unique index rejects it. **Do not drop that index to make an import succeed** - a collision means a duplicate already exists and wants investigating. Repeat for `razorpay_payment_id`.

#### `PAY-DUP-003` - One purchase, one entitlement · P0
**Steps.** After a care-plan purchase, trigger the verify route twice (retry the callback).
**Expected Result.** Exactly one entitlement, `sessions_granted = 6`. The grant function is idempotent.

#### `PAY-DUP-004` - Duplicate webhook · P0
**Preconditions.** `RAZORPAY_WEBHOOK_SECRET` is set.
**Steps.** Capture a real webhook body and its `x-razorpay-signature` header from the Razorpay dashboard's webhook log. POST it to `/api/razorpay/webhook`. POST **the identical body** again.
**Expected Result.** The first is processed. The second collides on `razorpay_event_id` in `payment_webhook_events` and is treated as already-seen - **that insert is the deduplication, and it happens before any work is done**, so a retry arriving mid-flight cannot do the work twice. Money → Transactions shows the payment **once**. Gross Revenue does not double.

#### `PAY-WH-001` - Signature verification · P0
**Steps.** POST a webhook body with (a) no signature header, (b) a wrong signature, (c) the correct signature but a **re-serialised** body (`JSON.parse` then `JSON.stringify`).
**Expected Result.** (a) `400 Missing signature`. (b) `400 Invalid signature`. (c) **`400 Invalid signature`** - and this is correct: the signature is checked against the **raw** body, because a re-serialised body does not round-trip byte-for-byte. **The fix for a legitimate webhook failing here is never to skip the check.**

#### `PAY-WH-002` - Webhook races the browser callback · P0
**Steps.** Complete a payment and, as close to simultaneously as you can manage, POST the webhook body and let the browser callback fire.
**Expected Result.** Whichever arrives first applies the capture; the second finds it captured and **changes nothing**. The appointment is paid once, `payments` has one row, and the Meet event is created **once** (the webhook only creates one if the appointment does not already carry an event id).

#### `PAY-WH-003` - Non-capture events are recorded and ignored · P2
**Steps.** POST a `payment.failed` webhook with a valid signature.
**Expected Result.** The event row is recorded and marked processed. No capture is applied.

#### `PAY-WH-004` - Without the webhook secret, a closed tab loses the confirmation · P0
**Steps.** Unset `RAZORPAY_WEBHOOK_SECRET`, restart, and POST any webhook.
**Expected Result.** `503 {"error":"Webhook not configured"}`. **Consequence to state in your report if you see it in the wild:** a patient who pays and closes the tab before the callback lands leaves a **paid Razorpay order against an unpaid booking**. Restore the secret.

#### `PAY-DUP-005` - Double settle · P0
Covered by `FIN-PAY-002`. **No double payout.**

#### `PAY-DUP-006` - Partner commission is not accumulated twice · P0
**Steps.** Re-run the webhook and the callback for S4, then read Money → Breakdown and the hospital's Earnings.
**Expected Result.** `₹249.90` appears **once** on both.

#### `PAY-DUP-007` - Credit idempotency keys are derived, never random · P0 **[SQL]**
**Steps.** Inspect `session_credit_ledger` for a booked package session.
**Expected Result.** Keys read `reserve:<appointment_id>` and `consume:<appointment_id>`. **A random key would make every retry look like a new event, which is the exact bug the key exists to prevent.** Availability is checked **after** idempotency in the reserve function, deliberately - checking availability first would answer "no credits available" for a booking that in fact succeeded.

#### `PAY-CONC-001` - Twelve concurrent reserves against one credit · P0 **[script]**
**Steps.** With a purchase holding exactly **one** remaining credit, fire twelve concurrent booking requests for distinct slots.
**Expected Result.** **Exactly one succeeds.** The rest are refused. The row lock in the reserve function is real, and the CHECK constraint on the cached counts makes an overdrawn balance impossible rather than merely unwritten.

#### `PAY-CONC-002` - Two admins settle the same payout at once · P0
**Expected Result.** One wins; the other is refused. The audit log records **only the winner** - the log write happens after the CAS claim.

#### `PAY-AMT-001` - The amount is server-derived · P0
**Steps.** Intercept the `create-order` request and change any client-supplied amount or package id. Also attempt `create-order` with another patient's `appointmentId`.
**Expected Result.** The amount charged is **re-derived server-side** from the category or the catalog row. A tampered amount has no effect. Another patient's appointment is **not found** under the caller's own scoped client → `Appointment not found` (404). Attempting to pay an already-paid booking: `This booking is already paid`.

#### `PAY-AMT-002` - A care-plan price cannot be tampered with · P0
**Steps.** Accept a recommendation, intercepting the request to change the package id to a cheaper one.
**Expected Result.** The route **re-derives the price from the plan's own recommended package** and refuses a catalog mismatch (`That recommendation is incomplete.` / a mismatch 409). The programme granted is the one recommended, at the price recommended.

---

### 16.4 Pay later

#### Feature guide - what this arrangement is, and the one rule behind it

A handful of long-standing patients are **treated first and settle afterwards** - weekly, monthly, or right after a session. An admin creates the account, hands over the credentials and grants the privilege on the patient's own profile. That patient books an online session through the ordinary wizard with **no payment step**, and pays later.

**The whole design rests on one sentence: nothing is owed until the work is done.** `amount_due_paise` is frozen when the session is **booked** and counted only once the session is **completed**. That single split is what makes "booking owes nothing" and "a late cancellation owes nothing" true with **no special case anywhere** - there is no state to unwind, because nothing was ever owed.

Four consequences worth holding in mind while testing:

1. **`payment_status = 'unpaid'` already means "somebody abandoned a checkout".** So `payment_terms` (`prepaid` | `pay_later`) is a **second axis**, and telling the two apart is what stops an abandoned cart being counted as a debt. A pay-later session sits at `unpaid` for its whole life and is **not** a failed payment.
2. **Revenue is recognised at completion, not at collection** - because the therapist's share is. On completion the frozen price appears in **three places at once**: what the patient owes, the clinic's revenue, and the therapist's share. The therapist is deliberately **not** made to wait on the patient: they did the work and had no say in extending the credit, so **the clinic carries the gap**.
3. **There is no ceiling, by choice.** So the two figures at the top of **Money → Owed by Patients** - the total, and how long the oldest unsettled session has been owed - are the **entire** early warning. Test them as though they were the only safety net, because they are.
4. **Online sessions only.** Never a home visit (travel is a pass-through paid to the therapist in full), never a session drawn from a programme already paid for, and never when a discount has already taken the total to nothing - a free booking is not a debt of zero.

**Vocabulary.** Patient screens say *You owe so far*, *We're checking your payment*. They never say **debt**, **outstanding**, **invoice** or **balance** - that last one is already the patient's word for unspent session credits, and one dashboard cannot have it meaning two things. Admin screens say **Pay later**, **Owed by patients**, **Payments waiting**.

**Prerequisite for everything below:** the master switch is **off by default**. Turn it on at **Money → Owed by Patients** (not Settings - it sits beside the figures it governs, the same placement rule promo codes follow). Use **Patient E** (§8.3), who is created for this section precisely because Patients A and B have both paid for sessions by now and the first-session offer is once-ever. **Patient C** is the one to point `PL-GRANT-003` at, since a hospital-referred patient can never be granted terms. Turn the switch **off again** when you finish.

---

#### `PL-GRANT-001` - The privilege is granted, with a reason, by a money desk · P0

**Steps.** As Master Admin, open a patient's profile and find the **Pay later** card. Try to save with a 9-character reason. Then save with a real one, e.g. `Patient of six years, settles monthly by bank transfer`. Re-read the card.
**Expected Result.** Nine characters is refused by **the route and a CHECK constraint** - both, because a route check is true only for as long as every caller remembers it. Ten or more saves, the card reads back **Why:** with the reason, and an audit entry `patient.set_pay_later` is written. The button reads **Allow this patient to pay later**; once granted it reads **Stop pay later**.
**Why a reason to grant and none to stop:** this is the **opposite** split from the care-plan review. The thing being explained is the **risk**, and here the risk is the grant. Revoking leaves the reason in place - the CHECK is vacuous while disabled, and why terms were given stays on the record after they are stopped.

#### `PL-GRANT-002` - Operations and Clinical cannot reach it at all · P0

**Steps.** As **Operations**, then as **Clinical**, open the same patient profile. Then POST `/api/admin/set-patient-pay-later` directly with a valid session cookie for each.
**Expected Result.** The card **does not render** for either, and both routes answer **403**. Extending credit is a **money** capability whatever screen the button sits on. **Finance can do it** - they manage Money.
**Negative:** the card must compute `scopeCanManage(scope, "money")` of its own, **not** reuse the patient page's looser `canSeeMoney` - that one is `scopeCanOpen`, and using it would offer the control to a desk the route then refuses with nothing on screen to explain it.

#### `PL-GRANT-003` - A hospital-referred patient is refused, with the reason named · P0

**Steps.** Try to grant terms to a patient carrying `referred_by_hospital_id`.
**Expected Result.** Refused, and the card states it in place: the partner earns a share of the revenue **as soon as a session is delivered**, so terms would have the clinic paying that share out of money nobody has been given.
**Why not the alternative:** deferring the partner's cut to settlement would break `clinic share = net − therapist − partner`, the identity §16.0 says must always hold - which is worse than the problem.

#### `PL-GRANT-004` - With the master switch off, a grant says so rather than looking saved · P1

**Steps.** With `pay_later_enabled` **off**, open the card.
**Expected Result.** One line: *"Pay later is switched off for the whole clinic, so this would do nothing yet."* The save button is disabled. Calling the route directly answers *"Pay later is switched off for the whole clinic. Turn it on under Money - Owed by Patients first."*
**Expected Result (the setting's own toast).** Switching it on says *"Trusted patients can now be treated first and settle afterwards."*; off says *"Nobody new can be put on pay later. Anything already owed is still owed, and can still be settled."* **The switch gates granting only** - never stopping, and never a debt already owed.

---

#### `PL-BOOK-001` - Booking on terms, with no payment screen · P0

**Steps.** As the trusted patient, book an **online** session through the ordinary wizard. Read the final step.
**Expected Result.** The primary button reads **Confirm booking - pay later**, with a secondary link under it reading **Or pay ₹X now instead** - secondary weight, because settling later is why they were given terms. Confirming produces a session at `status = 'confirmed'`, `payment_terms = 'pay_later'`, `payment_status = 'unpaid'`, `paid_at` **never stamped**, a therapist assigned or queued as usual, and a **Meet link**. No Razorpay sheet opens and no `payments` row is written.
**Expected Result (the confirmation names the figure).** A line reading *"After your session you'll owe"* with the frozen amount under it - the figure the route just wrote, **never a re-read**. Reading the price once to quote and again to render is how the two come to differ.

#### `PL-BOOK-002` - Paying now is never taken away · P1

**Steps.** On that same screen follow **Or pay ₹X now instead** and complete a real test payment.
**Expected Result.** An ordinary **prepaid** session that touches none of this machinery: paid, `payment_terms = 'prepaid'`, nothing added to what they owe. Switching this arrangement on for somebody must not remove a choice they already had.

#### `PL-BOOK-003` - Immediately after booking, nothing is owed · P0

**Steps.** With the session booked and not yet delivered, read the patient's dashboard and **Money → Owed by Patients**.
**Expected Result.** The patient's widget is **absent** - not showing ₹0 - and the admin total is unchanged. A card reading ₹0 is a card telling somebody about a thing that is not happening.

#### `PL-BOOK-004` - A late cancellation owes nothing, with no special case · P0

**Steps.** Cancel that session inside the cancellation window.
**Expected Result.** **Nothing is owed and nothing is forfeited.** Different from a prepaid patient, who forfeits - accepted deliberately, because these are patients the clinic would forgive anyway. There is no state to unwind: the money is filtered on `status = 'completed'`, and the session never reached it.

#### `PL-BOOK-005` - Four refusals, all re-derived server-side · P0

**Steps.** POST `/api/appointments/confirm-pay-later` four ways: with the master switch off; as a patient **without** the grant; for a **home visit**; and for a session drawn from a **programme** purchase.
**Expected Result.** All four refused, each from the server's own reading - the browser sends an appointment id and nothing else. The home visit says *"Home visits are paid for when they're booked. You can book an online session to pay later."*; the programme says *"This session comes out of a programme you've already paid for, so there's nothing to settle."*
**The two refusals about the patient say the same sentence on purpose** - *"This booking needs to be paid for now."* - so somebody who was never granted terms does not learn the arrangement exists and that they are not in it.

#### `PL-BOOK-006` - The price is frozen at booking · P0

**Steps.** Book on terms against a category priced ₹1,200. Re-price the category to ₹1,500. Complete the session.
**Expected Result.** The session still owes **₹1,200**. Resolving the price again at settlement would charge the new price for work already delivered - the same reason a purchase reads its frozen `package_snapshot` rather than the live catalogue row.

#### `PL-BOOK-007` - A discount applies exactly as it does to any other booking · P1

**Steps.** With the **first-session offer** on, book two sessions on terms for one brand-new trusted patient.
**Expected Result.** The offer applies to the **first only**. The confirmation names what was frozen **and what came off it**; **Money → Owed by Patients** prints the struck-through list price and the rule beside any session owed less than it.
**Negative - the bug this replaced.** "Is this patient new" was asked in three places and all three asked `payment_status = 'paid'`. A session on terms is never paid, so a trusted patient read as **brand new on every booking they ever made**: the offer fired on sessions two, three and four, a first-session-only promo code was claimable repeatedly, and an invite welcome was claimable after they had already been treated. Silently, in all three.
**Also check the cap.** A promo code claimed by a pay-later booking counts against its cap **permanently** - the discount has been given and can never be taken back - while an abandoned **prepaid** checkout of the same age still gives its claim back after the thirty-minute hold.

#### `PL-BOOK-008` - A free booking is not a debt of zero · P1

**Steps.** Apply a 100%-off code to a booking for a patient on terms.
**Expected Result.** The quote resolves to **free**, not to pay-later, and the confirmation goes through `/api/appointments/confirm-free`: no gateway order, **no `payments` row**, `amount_paid_paise = 0` with all four discount facts recorded. Nothing is added to what they owe.

---

#### `PL-DONE-001` - Completion makes the money appear in three places at once · P0

**Steps.** Have the therapist complete the session. Then read, in order: the patient's dashboard, **Money → Owed by Patients**, **Money → Summary**, and the therapist's **Earnings**.
**Expected Result.** The frozen price appears in **all three** at the same moment - what the patient owes, the clinic's **gross and net revenue**, and the therapist's **share**. Nothing waits on the patient paying.
**Hand-check the month.** A session delivered in January and paid in February must read: **January** revenue ₹1,200, therapist ₹720, **profit ₹480** - not a loss. **February: nothing moves.** Counting at collection instead reports a loss in the month the work was done and a windfall in the month it was paid - both months wrong for one session.

#### `PL-DONE-002` - The therapist may complete it, and sees nothing to chase · P0

**Steps.** As the treating therapist, open the session card before and after completing it.
**Expected Result.** Completion is **allowed** - it is the fourth allowance beside paid, programme and cash, because completing is precisely what **creates** the debt, and refusing would make the one session that must be closed the one that cannot be. The card reads as an **ordinary session**: no "Unpaid", no amount, and **no instruction to collect cash** at a video call. Chasing a trusted patient at a door that does not exist is what the platform's own communication rules exist to prevent.

#### `PL-DONE-003` - A prepaid unpaid session is still refused · P0

**Steps.** As a therapist, try to complete an ordinary **prepaid** session sitting at `unpaid`.
**Expected Result.** Still **409**, exactly as before. The new allowance is keyed on `payment_terms`, so it is inert on every session that is not on terms.

#### `PL-DONE-004` - No risk signal, no System Health row · P0

**Steps.** After completing a pay-later session, open **Today → Risk** and **Settings → System Health**.
**Expected Result.** **No** `completion_without_payment` signal, and **no** `sessions_without_backing` row. A session on terms **is** backed: the sale is recorded, the revenue counted, and the debt is on its own screen. Without these two exclusions every session one of these patients ever has would be a high-severity signal and a permanent red row.

#### `PL-DONE-005` - The patient's feed does not say their booked session isn't booked · P1

**Steps.** Read the patient's dashboard feed with a booked, undelivered pay-later session.
**Expected Result.** No item titled *"Payment not completed"* over *"This session isn't booked until payment goes through."* The replacement is **informational and never `needsYou`** - there is nothing for them to do, and pinning it would put a permanent to-do on the dashboard of the patients the clinic trusts most.

#### `PL-DONE-006` - Every chip reads the terms, not the raw column · P0

**Steps.** Open the same delivered session on **People → the patient's profile**, in the **Sessions → All Sessions** drawer, and in the All Sessions export.
**Expected Result.** None of them prints **"Unpaid"**. All three read one shared module, so the chip, the drawer and the file cannot describe it three ways. "Unpaid" against a patient of two years is both wrong and, on the screen an admin chases people from, actively misleading. The `pay_later` filter and `?view=` preset select exactly these rows, and the `unpaid` preset is narrowed to **prepaid**-unpaid so the two counts cannot overlap.

#### `PL-DONE-007` - A session that happened and was never closed is named · P0

**Steps.** Leave a pay-later session past its slot time without completing it. Open **Money → Owed by Patients** and **Settings → System Health**.
**Expected Result.** It is listed under **Sessions that were never closed**, and the System Health check turns **amber** naming the count. **This is the one place in the whole design where money can silently fail to exist** - debt, revenue and the therapist's pay all appear at completion, so a session nobody closed produces none of the three and no screen has anything to show. Every other failure here is a *wrong* number, which a check can catch; this is an *absent* one, which nothing else would.

#### `PL-DONE-008` - The patient reads it in their own voice · P0

**Steps.** As the patient, open **Your Sessions** for a session on terms that has been delivered, and again for one that was cancelled. Then write a delivered session off from the back office and look at the patient's list again.
**Expected Result.** The delivered one reads **Owed** and offers **no Pay Now button** - paying there is refused by the checkout route anyway, so the button did not merely read wrong, it led nowhere. The cancelled one shows **no payment chip at all**: the cancelled card already explains itself, and a chip beside it announces an arrangement that never came into play. And the written-off one reads **"Nothing to pay"**, never **"Written off"** - that is the clinic's accounting word for a debt it decided to stop chasing, a decision about them taken without them, and on their own card it reads as having been given up on. The admin screens still say "Written off", because the admin needs exactly that word.

---

#### `PL-OWED-001` - The two figures that are the whole early warning · P0

**Steps.** Open **Money → Owed by Patients** with several delivered, unsettled sessions across two patients. Read **Total owed** and **Owed longest**. Change the date range on any other Money screen and come back.
**Expected Result.** Both figures are `now`-scoped - **right now, all time** - and do **not** move with a date filter. A debt does not stop existing outside a filter. Each patient card names the session count, the oldest date and the age in days, and each session line carries **the price agreed on the day**.

#### `PL-OWED-002` - The ageing threshold, and seeing it work before saving · P1

**Steps.** As Master Admin, read the ageing control beside the figures. Type `30`, `45`, `60` without saving and watch the live count. Save `7`. Then try `0` and `400`.
**Expected Result.** The default is **60 days**. The field says **"N of M patients would show as worth chasing"**, recomputed live from the ages already on the page - nothing is fetched and nothing is saved to find out. Saving `7` turns a 10-day balance amber that was green at 60, and the Today alert count moves with it. `0` and `400` are refused by **the route and the column's CHECK**. The toast reads *"A patient who has owed for more than 7 days now shows as worth chasing."*
**Why there is no zero:** it reads as "chase everything" to one person and "never warn me" to another, and a warning whose meaning depends on who set it is worse than no setting.

#### `PL-OWED-003` - Turning the warning off keeps the totals · P1

**Steps.** Switch **pay_later_age_warning_enabled** off.
**Expected Result.** *"Ageing warnings are off. You will still see what every patient owes."* Nothing turns amber, **Owed longest** goes slate, the aged/recent filter chips drop out, and the Today alert **Patients who have owed for a while** counts **zero rather than hiding** - an alert row nothing can bring down is worse than no row. The number itself is **kept**, so switching back on restores what the clinic chose rather than the default.

#### `PL-OWED-004` - A stored number the app cannot use is named on screen · P2 **[SQL]**

**Steps.** Set `pay_later_aged_after_days` to `3650` directly in SQL, past the route and the CHECK. Reload the screen.
**Expected Result.** The screen states that **3,650 days is saved but cannot be used, so the built-in 60 days is in force**, and says to save a number between 1 and 365. The screen and the database disagreeing with nothing reconciling them is exactly the failure the data-load banner exists for, one setting down.

#### `PL-OWED-005` - Finance reads the rule instead of meeting a gap · P1

**Steps.** Open the same screen as **Finance**.
**Expected Result.** A plain sentence - *balances turn amber after N days, only a Master Admin can change this* - where the control sits. Finance manages **Money** but holds **settings** at `none`, so the save route would refuse them; a control a scope cannot call must not render, and an absence reads as a half-built screen.

---

#### `PL-PAY-001` - Paying online settles in one transaction · P0

**Steps.** As the patient with ₹4,800 owed across four delivered sessions, tap **Pay ₹4,800 now** and complete a test payment.
**Expected Result.** All four settle at once and the widget reads nothing owed. The capture **confirms the payment row and allocates in one database transaction** - it either confirms and closes the sessions it covers, or does neither. `payments.purpose` reads `pay_later_settlement` with `target_pay_later_payment_id` set, so it is **not** reported as an unmatched payment on System Health.

#### `PL-PAY-002` - The amount comes from the server · P0

**Steps.** Intercept `/api/patient/pay-later/create-order` and raise the amount above what is owed.
**Expected Result.** Capped at the server's own figure, re-derived through the same balance the admin screen reads. Asking for more than is owed answers *"That's more than you owe at the moment. Enter the amount owed or less."* **This route deliberately does not go through the checkout quote** - it is a payment against a debt already recorded, so there is nothing to quote, claim or discount. Money off was decided when each session was booked and is already inside the frozen price; resolving it again here would take it twice.

#### `PL-PAY-003` - A part payment settles whole sessions, oldest first · P0

**Steps.** With ₹4,800 owed across four ₹1,200 sessions, pay **₹2,000**.
**Expected Result.** **Exactly one** session settles, in full, at **its own** frozen price. **₹800 stays unallocated** and is stated on both screens - the patient's reads *"₹800 of your last payment is held against your next session"*, the admin card reads *"received and not yet applied"*. The widget reads **₹3,600**, not ₹4,800. **No session is part-settled.**
**Why whole sessions only:** the therapist's cut is computed from `amount_paid_paise`, so spreading ₹500 across four ₹1,200 sessions would silently shrink it on sessions the clinic had **already paid out on**.

#### `PL-PAY-004` - No money figure moves either side of a settlement · P0

**Steps.** Record every figure on **Money → Summary**, **Breakdown**, **Business Health** and the therapist's **Earnings** and **Payouts** before the settlement above. Compare after.
**Expected Result.** **Byte-identical.** Settlement writes `amount_paid_paise = amount_due_paise` **exactly** - never the payment's share - so recognised revenue and every therapist's pay are the same number before and after the money arrives. This is the single most important assertion in the feature; if it fails, stop and report it.

#### `PL-PAY-005` - The pool is fungible across payments · P1

**Steps.** With ₹800 unallocated, have a **fifth** session complete. Then pay a further **₹400**.
**Expected Result.** The completion re-runs allocation and the ₹800 still settles **nothing** (₹1,200 is needed). The further ₹400 pools with it and settles the next session **in full**. Requiring one payment to cover one whole session reads tidier and strands money for ever - two ₹800 instalments would leave ₹1,600 in the clinic's hands and a ₹1,200 session nothing could close.

#### `PL-PAY-006` - One receipt per payment, not one per session · P1

**Steps.** Open the patient's **Payments** screen after a ₹4,800 payment closed four sessions.
**Expected Result.** **One** receipt listing the four. Four receipts for one transfer reads as four payments.

#### `PL-PAY-007` - Reconciliation holds · P0 **[SQL]**

**Steps.** After each of the cases above, compute `sum(confirmed payments)` against `sum(settled session amounts) + unallocated`.
**Expected Result.** Equal, every time. **Settings → System Health → Pay Later** says *"Money in matches money accounted for"*. A disagreement is this feature's **only red state**, and it **reports and never repairs** - a silent auto-fix on a money record is how a discrepancy becomes permanent.

---

#### `PL-DECL-001` - A declaration settles nothing · P0

**Steps.** As the patient, tap **I've already paid**, choose UPI, enter the full amount with a reference and a note, and submit. Then read what they owe, on both the patient's screen and the admin's.
**Expected Result.** A **pending** row is written and **the figure does not move by a paisa**, on either screen. The patient's card reads *"We're checking your payment."* with what they told the clinic and when - informational, never a to-do. **A patient who could clear their own total by typing into a box is a patient who can.**

#### `PL-DECL-002` - The clinic answers it, and the two outcomes differ · P0

**Steps.** As Finance, open **Payments waiting** on Money → Owed by Patients. Confirm one. On a second, tap **Could not find it** and try a 9-character reason, then a real one.
**Expected Result.** **Confirm is one tap and needs no reason** - it is the outcome this queue exists to reach, and taxing it with a sentence meaning "the money is there" is how a reason column fills with "ok". **Rejecting needs ten characters**, enforced by the route **and** a CHECK, and the reason reaches the patient on their own dashboard: *"We couldn't find the ₹X you told us about"* followed by what the admin wrote. Confirming reaches the allocator; rejecting settles nothing and un-settles nothing.

#### `PL-DECL-003` - One waiting at a time, and a rejection unblocks · P1

**Steps.** Declare a payment, then try to declare a second before it is answered. Then have the admin reject the first and declare again.
**Expected Result.** The second is refused: *"We're already checking a payment from you. We'll confirm it shortly."* After a rejection, declaring is allowed again.

#### `PL-DECL-004` - Two admins answering one declaration · P0

**Steps.** Open the queue in two browsers as two admins and confirm the same row at once.
**Expected Result.** Exactly **one** wins; the other gets **409** *"Somebody else confirmed this payment a moment ago."* The audit entry records **only the winner** - the log write happens after the CAS claim. The pool is not spent twice.

#### `PL-DECL-005` - An online payment is never "pending" · P1 **[SQL]**

**Steps.** Try to insert a `pay_later_payments` row with `method = 'online'` and `status = 'pending'`.
**Expected Result.** Refused by a CHECK. The gateway **is** the confirmation, so a pending online row would be a queue entry nobody could ever action.

#### `PL-DECL-006` - The table is append-only · P0 **[SQL]**

**Steps.** Try to DELETE a confirmed row; try `confirmed → pending`; try to rewrite an amount, method or note.
**Expected Result.** All refused by trigger. `pending → confirmed|rejected` is permitted **one way**, plus the two columns allocation moves. RLS is not the guarantee here - every route writes with the service-role client, which bypasses it entirely.

#### `PL-DECL-007` - Waiting too long is amber, on two screens · P1

**Steps.** Leave a declaration unanswered for more than **three days**.
**Expected Result.** The queue card turns amber and names the wait; **System Health → Pay Later** reads *"1 payment is waiting to be checked, the oldest for 4 days"* with steps naming the bank statement; the Money alerts strip carries **Payments waiting to be checked**. Until it is answered, **both** screens overstate what is owed, and the patient cannot tell "being checked" from "forgotten".

#### `PL-DECL-008` - Declaration spam is throttled without blame · P2

**Steps.** Submit declarations rapidly until refused.
**Expected Result.** A `429` whose message carries **no numbers and no blame** - a limit is reached by a shared office address or a retrying connection far more often than by anybody doing anything wrong. The concrete wait is composed separately from `Retry-After` and is the half allowed to be specific, because it is measured.

---

#### `PL-WOFF-001` - Writing a session off is a cost, not a reduction · P0

**Steps.** Record every figure on **Money → Summary** and the therapist's **Earnings**. On **Money → Owed by Patients**, find an owed session and tap **Write it off**, enter a real reason, and tap **Write it off** again. A confirmation names the figure (*"Stop chasing ₹1,200?"*) - read it and tap **Yes**. Compare the figures. Then open **Money → Costs**.
**Expected Result.** **Revenue does not move. The therapist's share does not move.** `clinic share = net − therapist − partner` still holds. The session leaves the owed total, and **one Bad debt row** appears on Costs for exactly the amount forgiven, dated **today**.
**Why:** the clinic **earned** the ₹1,200 at completion and **failed to collect** it - and the therapist has already been paid, because they did the work and had no say in extending the credit. Reducing the session's amount instead would pull revenue down **and claw their share back off money already handed over**.
**Where it lands in the books:** a bad debt is an **operating expense** - below the gross-profit line, inside what break-even has to cover, and **not** added back in EBITDA. Check **Business Health**: gross margin must be unchanged, EBITDA and net profit each down by exactly the amount written off.

#### `PL-WOFF-002` - Both directions need a reason, and it can be undone · P1

**Steps.** Try to write one off with a 9-character reason. Then write it off properly, find it under **Written off**, and tap **Ask for it again** with a real reason.
**Expected Result.** Nine characters refused. The reversal brings the session back as **owed** and **removes the Bad debt row with it**. Both directions need a sentence - writing off gives money away, and reversing re-imposes a debt on a patient who has been told it was forgiven.
**Why the list exists at all:** written-off sessions are dropped from every balance, so without their own list the undo would be reachable only in the database - which would make it a claim rather than a control.

#### `PL-WOFF-003` - One cost row per session, however many taps · P0

**Steps.** Double-tap the write-off button. Then check **Money → Costs**.
**Expected Result.** **One** Bad debt row. The appointment is claimed first and only the caller whose claim lands writes the loss, with a partial unique index behind it for the callers a route check cannot see.
**Order matters, and this is why:** a session written off with **no cost row behind it** overstates profit by exactly the amount forgiven and says so on **no screen**. So a cost row that will not write **reverts the write-off** rather than leaving that state.

#### `PL-WOFF-004` - The cost cannot be deleted out from under the session · P1

**Steps.** On **Money → Costs**, try to delete the Bad debt row.
**Expected Result.** Refused, naming where to reverse it: *bring the session back on Money → Owed by Patients and this goes with it.* Ordinary hand-typed costs delete exactly as before.

#### `PL-WOFF-005` - The books are checked, and null is not zero · P1

**Steps.** Open **Settings → System Health → Pay Later** with a write-off in place.
**Expected Result.** The evidence reads *"Every written-off session has its loss recorded as a cost"*. A disagreement is **red**. On a database that has not had the migration applied it reads **"could not be checked"** - never as agreement, because a read that failed is not a read that came back empty.

#### `PL-WOFF-006` - Refusals name the alternative · P2

**Steps.** Try to write off: a prepaid session; a session not yet delivered; one already settled; one already written off.
**Expected Result.** Each refused with its own sentence, and the first two **name the lane that would work** rather than stopping at "no" - an admin who has opened this control has decided not to collect, and a bare refusal leaves them looking for another way to do the same thing off the books.

---

#### `PL-REF-001` - Refunding a settled session is handed back by a person · P0

**Steps.** Settle a session, then open it in the **Sessions → All Sessions** drawer and refund part of it. Read the confirmation wording. Then open **Money → Owed by Patients**.
**Expected Result.** The confirmation says the money is **recorded as owed back**, not sent "via Razorpay". No gateway call is made. The session lands at `manual_pending` and appears under **Refunds to hand back** with the amount, the reason and how long it has waited. **Confirm handed back** clears it.
**Why every settled pay-later session takes this lane, whatever it was settled with:** the money arrived into a **pool** covering several sessions, and an online settlement's gateway id sits on the payment row rather than the session - so "this session's share of that payment" is not something a gateway refund can express safely.

#### `PL-REF-002` - Refunding an unsettled session is not a refund · P1

**Steps.** Try to refund a session the patient has **not** settled.
**Expected Result.** Refused, and the message names the write-off: *"Nothing has been paid for this session yet, so there is nothing to refund. To stop chasing it, write it off on Money → Owed by Patients."* A dead-end refusal here is the whole failure this replaces.

#### `PL-REF-003` - Each refund count links to a screen that can clear it · P1

**Steps.** With both a cancelled **cash home visit** refund and a **pay-later** refund waiting, read the Money alerts strip and follow each row.
**Expected Result.** **Two** rows: *Refunds to hand back by hand* → Payouts → the Cash Ledger, and *Refunds owed to trusted patients* → Owed by Patients → the hand-back list. The two sum to every `manual_pending` refund there is.
**Negative:** as one row it linked to the Cash Ledger, which lists **home visits** - so a pay-later refund was counted on a screen that could not act on it, and **an alert nothing can bring down is worse than no alert**.

#### `PL-REF-004` - Gateway refunds on ordinary sessions are untouched · P0

**Steps.** Refund a prepaid, gateway-paid session.
**Expected Result.** Entirely unchanged: a real Razorpay refund, `processed`, with the refund id recorded. The by-hand lane is keyed on the terms, so it is inert everywhere else.

---

#### `PL-RISK-001` - Trusted patients get their own heading, and a flag is never an accusation · P1

**Steps.** Open **Today → Risk** with an aged balance.
**Expected Result.** The findings sit under **Trusted patients - follow up**, with a line saying these are **reminders, not concerns**. A patient of two years appearing unexplained under a heading called "Risk" reads exactly wrong - to whoever opens the screen, and to the patient if it ever reaches them. Nothing is suspended, held or hidden; the signal links to the rows behind it and carries **no action buttons**.
**Defaults.** `pay_later_aged` ships **enabled** - unusual for a threshold with no clinic baseline, and justified because the population is tiny and hand-picked so it cannot fire on everyone, and because it is the only automatic warning an arrangement with no ceiling has. It reads **the admin's own threshold**, so the amber on the screen and the signal can never disagree about what "a while" means. `pay_later_balance_high` ships **disabled**. `pay_later_declaration_rejected` is **enabled**, threshold **2** - it fires on the second rejection, not the first.

#### `PL-HEALTH-001` - Owing money is never a fault · P0

**Steps.** Read **Settings → System Health → Pay Later** in four states: switch off and nobody on terms; money owed, all recent, nothing waiting; a declaration waiting six days; the reconciliation disagreeing.
**Expected Result.** In order: **`off`** (*"Pay later is not in use."*) - **not** a fault and not red; **Healthy**; **Needs a look**; **Needs you now**. A patient owing a large sum with nothing overdue is **not red** - that is the arrangement working, and painting it red is how red stops meaning anything. Every non-healthy state carries **steps an owner can follow alone**, and the sidebar badge rises by **at most one**, because it counts checks rather than rows.

#### `PL-HEALTH-002` - An unapplied migration becomes a line on a screen · P1

**Steps.** Point the app at a database missing the pay-later columns.
**Expected Result.** The check reads **"Not set up"** with the steps to apply the schema, and **nothing else on the screen breaks**. Every pay-later column is read in its **own isolated query** and merged by id - never folded into a shared select, which would take the whole dashboard down over one column.

---

#### `PL-EDGE-001` - Revoking terms does not disturb what is already booked · P1

**Steps.** With sessions booked and money owed, stop the patient's terms.
**Expected Result.** **New** pay-later bookings are refused. Sessions already booked **keep their frozen terms** and still enter the owed list when completed; everything already owed stays owed, listed and **settleable**. Retroactively demanding payment for sessions already agreed is the wrong behaviour.

#### `PL-EDGE-002` - The master switch never strands money · P0

**Steps.** With money owed, switch `pay_later_enabled` **off**.
**Expected Result.** Nobody new can be put on terms, and nobody can book on them - but every existing balance is **still fully settleable**, online and by declaration. The stop must never strand money owed to the clinic.

#### `PL-EDGE-003` - Reopening a settled session is refused · P0

**Steps.** As an **Operations** admin, try to reopen a settled pay-later session, and one whose therapist has been paid out.
**Expected Result.** Both refused **by the route**, not merely hidden on the screen - reopen is guarded by the Sessions scope, so an Operations admin reaches it. An unsettled, unpaid-out one may be reopened, and debt, revenue and the therapist's share all come off **together**, because all three key on the single word `completed`.

#### `PL-EDGE-004` - Deleting a patient with money history · P1

**Steps.** Try to delete a trusted patient's account.
**Expected Result.** Refused **in plain words naming the counts**, grouped the way a person describes them, with **suspension offered beside it** - never a raw Postgres foreign-key string.

#### `PL-EDGE-005` - Impersonation records the patient, not the admin · P2

**Steps.** As Master Admin, open the patient's dashboard through impersonation and submit a declaration.
**Expected Result.** The widget renders exactly as the patient sees it, and the declaration is recorded as **theirs**, inside the impersonation window - that window is the only thing a later reader can intersect the action against.

#### `PL-EDGE-006` - Every date is in the clinic's zone · P2

**Steps.** Read every date on the widget, the queues and the owed cards from a machine set to a different timezone.
**Expected Result.** All rendered in the clinic's zone, except a **session slot**, which is shown in the zone the patient booked it in. Nothing prints "Invalid Date".

#### `PL-EDGE-007` - The dashboard does not rebuild twice for one confirmation · P2

**Steps.** With the admin dashboard open in a second browser, confirm a declaration.
**Expected Result.** `pay_later_payments` is on the **30-second catalog channel**, not the operational one, so one Confirm does not rebuild the dashboard twice. On the admin dashboard the channels **count** rather than rebuild: the Refresh button turns teal and says how many changes are waiting.
