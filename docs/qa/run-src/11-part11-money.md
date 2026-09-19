## 12. Part 11 - The books

**What this part does.** Reads everything the run has earned and paid out, and checks the figures agree with each other and with the rows behind them. By now there is real money in the database: two consultations, a programme, two home visits, a referral, a refund and a cash collection.

**Who you are.** The Master Admin.

**Time.** About 50 minutes.

---

### Step 11.1 - Read the Money screens in order

**Do this.** Open each Money screen and read the whole of it before moving on: **Summary**, **Breakdown**, **Costs**, **Payouts**, **Business Health**.

**Expect, on every one of them**

* An **alerts strip** at the top: payout requests waiting, cash a therapist is holding, refunds to hand back by hand, payments attached to nothing. A zero row is **dropped**, not shown as a zero.
* A **glossary** at the foot, and an **(i)** on each figure giving the same definition beside the number that needs it.
* Each figure carries a **scope chip** saying whether it moves with the dates in view (`range`), is true this instant (`now`), or is a rate (`setting`). Narrowing the date range and watching one figure fall while the one beside it holds still is correct **only** if the chips say so.
* A figure appears **once per screen**. Summary printing Net revenue twice is the defect this rule exists for.

---

### Step 11.2 - Check the two identities hold

These must be true on every range you pick. Check them on at least two: all time, and this month.

```
net revenue   = gross revenue - refunds
clinic share  = splittable net - therapists' share - partners' share
```

**Do this.** Read the figures off **Summary** and do the arithmetic by hand.

**Expect.** Both hold exactly. Not approximately - **exactly**. If the clinic share is labelled "approximate", or if the numbers only tie after rounding, something is being guessed, and guessing a percentage to make the numbers tie is the thing this part exists to catch.

**Then check the three split rules**, each on a real row in your data:

| Rule | Check it with |
| --- | --- |
| A therapist's share is earned by **delivering**, not by being booked | The forfeited late cancellation from Step 9.8 - it is paid and not completed, so it adds **nothing** to any therapist's share |
| A home visit's **travel fee is part of the therapist's share**, never revenue | The ₹150 from Step 9.1 |
| **Refunds reverse the partner's commission, not the therapist's** | Patient C's refunded session from Step 10.6 - the therapist never earned a share on it, and the hospital's cut reverses |

---

### Step 11.3 - Open a total

**Do this.** On **Summary**, tap **See the sessions** on each of the four split figures.

**Expect**

* A list of **exactly** the rows behind that figure.
* The lines **sum to the total** that opened them. A drill-down that disagrees with its own total is worse than none - it makes a correct figure look wrong.
* It exports like every other table, in both CSV and PDF, and the two describe the same rows.
* Net revenue carries a comparison against **the same number of days immediately before** - not last calendar month against a 30-day window, which would move the figure by the number of days rather than by the business.
* With a **zero baseline** there is **no percentage** at all. `+100%` and `∞` are both lies.
* A move under half a percent reads **level** rather than drawing an arrow over noise.

---

### Step 11.4 - Pay a therapist

**Do this**

1. As **QA Therapist A**, open **Earnings** and request a payout.
2. As the admin, open **Money → Payouts**, read what Therapist A is owed, and settle it.

**Expect**

* What is owed counts **completed, paid** sessions only, at 60% for online and **65%** for their home visits, plus travel in full.
* **The cash they are holding is netted off the transfer.** Therapist A collected cash at Step 9.5: the amount actually transferred is reduced by it, and **those visits are marked remitted in the same run**. If they are not, the same rupees are deducted again on the next payout and the Cash Ledger goes on asking somebody to chase money already recovered - **P1**.
* "Owed to therapists" is **all-time and not date-filtered**. Scoping a balance to the range in view lets an admin read "nothing owed" off a quiet week while a real debt sits outside the window.
* The settlement is recorded in **Logs → All Activity**, and the log row was written **after** the claim - so a settlement that lost a race can never appear in the log.

**Then the edge case.** Have a therapist hold **more cash than they are owed** (record a large cash collection against Therapist B).

**Expect.** The transfer **floors at zero**, the difference stays as an amount still owed **to the clinic**, and those collections stay open on the Cash Ledger for a person to chase. A negative transfer is a **P0**.

---

### Step 11.5 - Work the refund queues

**Do this.** Open **Money** and **Today**, and read the counts.

**Expect**

* **Refunds to hand back by hand** counts **cash visits and sessions alike**. A session refunded by hand used to be work no screen could see.
* **Failed refunds** are counted **separately** - the gateway said no, and nothing in the clinic's screens will move that without the patient. The two are separate because the work is: one is "go and hand over cash", the other is "find out why the gateway refused".
* Tapping either count opens **exactly** the rows it counted.
* A **failed** refund is also a pinned item on the patient's own dashboard, because they are the one out of pocket.

**And check the count is not double-counting.** The Money strip and the Cash Ledger beneath it must agree on how much cash is outstanding. A strip reading twice the ledger's figure means cash home visits are being counted in two places - **P1**.

**Then check the export follows the scope.** Sign in as **QA Admin Operations**, open All Sessions, and export it.

**Expect.** The amount and the refund columns are **absent from the file**, exactly as they are absent from the screen. A scope enforced in the markup and not in the file the markup produces is not enforced.

**And one filter worth checking by name.** On All Sessions, set the payment filter to **Refunded**.

**Expect.** Rows come back. If it silently returns an empty table, the filter is matching a value the column can never hold - a refund lives on its own field, not on the payment status.

---

### Step 11.6 - Record costs and read the profit

**Do this.** Open **Money → Costs** and add three expenses:

| Description | Kind | Amount (₹) | Incurred on |
| --- | --- | --- | --- |
| `QA Clinic rent September` | pick the rent/premises category, fixed | `25000` | the 1st of this month |
| `QA Software subscriptions` | software/tools, fixed | `4000` | the 3rd of this month |
| `QA Marketing test spend` | marketing, fixed | `6000` | **last** month, deliberately outside a this-month range |

**Expect**

* Each cost carries a **kind**, deciding whether it sits above or below the gross-profit line and whether it is added back inside EBITDA. Nothing is inferred from the wording.
* Set the range to this month: the third row is **excluded**, because it is dated by when it was incurred rather than when somebody typed it in.
* **Operating profit** appears - clinic share less the gateway fee and these costs. It is the **only** figure allowed to be called profit, and nothing here is post-tax: a figure labelled "net profit" is a **P2**.
* With **no** costs recorded for a range, Operating profit is stated as a **ceiling** and the screen says so, rather than implying a number it cannot know.

**Also read the discount line.** *Discounts given* is **reported, never deducted**. A discount means less was collected, so it is already inside gross revenue as a smaller number; subtracting it from profit would count it twice. If Operating profit falls when you give a discount at Part 12, that is a **P0**.

---

### Step 11.7 - Read Business Health

**Do this.** Open **Money → Business Health**.

**Expect**

* Seven figures: return on investment, return on ad spend, working capital, gross and net margin, EBITDA, break-even and revenue run rate.
* **A figure that cannot be worked out is a sentence, not a zero.** With nothing invested, ROI says which input is missing and links to the screen that takes it. A zero here would be read as a measurement and acted on.
* Each carries its **formula** and **where each input came from** behind its (i).
* Revenue and the split match **Summary** exactly - both read the same source.

**Then give it the three things it cannot derive.** Open **Money → Your Numbers** and enter:

| What | Value |
| --- | --- |
| Invested | `500000`, life `36` months |
| Ad spend | one campaign, `6000`, this month |
| What the clinic owns and owes | a dated snapshot, today |

**Expect**

* ROI and EBITDA now compute.
* **Advertising revenue is traced or it does not exist.** A campaign is worth the net revenue of bookings that claimed **its promo code**. Spend nobody can trace is stated **separately** and held out of the division - leaving it in the denominator reports a campaign as a failure purely because nobody tagged it.
* **Working capital counts money taken for sessions not yet delivered** as a liability, valued at what was **actually paid**, never at the live catalogue price. Patient A's unbooked session from Step 7.9 is in there.
* A snapshot is dated: entering this month's figures does not erase last month's.

**Then narrow by a dimension** - filter to one therapist.

**Expect.** An amber line saying the costs are **not** narrowed with the revenue. Rent is not attributable to a therapist, so a filtered profit figure compares one slice's revenue with the whole clinic's costs, and the screen says so rather than leaving somebody to work it out by accident.

---

### Step 11.8 - Flip the ledger switch

**Do this**

1. Note Patient A's programme balance on all four surfaces from Step 7.9.
2. Open **Settings → Programmes & Home Visits** and switch **Session Balances From The Ledger** **on**.
3. Read the same four surfaces again.

**Expect.** Every one of them reads the **same balance as before**. The switch changes which record the app believes, and both are written either way - so flipping it must move nothing. A surface that disagrees after the flip is a **P0**, and it is exactly the disagreement the switch exists to make visible.

**Then check the reconciliation report.** Open **Settings → System Health → Books & Sessions Agree**.

**Expect.** It **reports** and never repairs. A silent auto-fix on a money record is how a discrepancy becomes permanent. If it lists a disagreement, that disagreement is the finding - write it up rather than clearing it.

Leave the switch **off** when you are done, unless you were asked to leave it on.

---

### Step 11.9 - Adjust a balance, and try to adjust history

**Do this**

1. Open **Catalog → Purchases** and find Patient A's programme.
2. Grant 2 extra sessions with the reason `Goodwill` (seven characters).
3. Then with the reason `Goodwill after a cancelled session.`
4. Then try to **reverse** one, and to **revive** an expired entitlement.

**Expect**

* The seven-character reason is **refused** - a free-form adjustment is the only kind requiring a reason, and the floor is **ten characters**, enforced deep enough that no caller can get round it.
* The valid one succeeds and **appends** a row. The balance moves.
* An admin can change **any balance** and **cannot change any history**. The ledger only ever grows.
* Every adjustment is in **Logs → All Activity**.

---

### Step 11.10 - Read System Health

**Do this.** Open **Settings → System Health** and read all five checks.

**Expect**

* Each has a **word** as well as a colour: `Healthy`, `Needs a look`, `Needs you now`, `Not set up`, `Not checked`.
* **`Not set up` and `Not checked` are not faults.** An owner who never wired Google up has not got a problem, and painting that red is how red stops meaning anything.
* **Anything not healthy carries numbered steps** the owner could follow alone. A red card with no way out is a **P1**.
* The teaching text is behind the **(i)**, not on the card.
* The sidebar badge **counts checks, not rows** - so a failure with no rows behind it (a missing webhook secret, a dead Google credential) still badges 1 rather than 0.
* A **red** check puts one line on the admin's Today screen. An amber one does not - a banner that is usually there is a banner nobody reads.
* The Google card prints **when it was last checked**, and that relative time is rendered after the page loads rather than on the server.

**One check worth reading closely.** If `RAZORPAY_WEBHOOK_SECRET` is unset, System Health says so - and it matters: without it, a patient who pays and closes the tab leaves a paid order against an unpaid booking, and nothing else in the app will notice.

---

### Step 11.11 - Payment integrity

Money can arrive twice, arrive late, or not really arrive at all. Three
checks, all from the Razorpay dashboard's own webhook log.

**An authorization is not a payment.** Razorpay can *authorize* a card - a
hold - and capture it seconds later. A hold that is never captured is voided
and refunded a few days on, so nothing may be fulfilled against one.

**Do this.** From the Razorpay test dashboard, send a **`payment.authorized`**
event for a booking that is still unpaid, then look at the booking.

**Expect**

* The booking is **still unpaid**. Nothing is confirmed, no calendar event is
  made, no invite reward is settled.
* The event **is** recorded in the webhook trail even so - the record is worth
  more than the one saved delivery.
* Then send **`payment.captured`** for the same order: *now* everything
  happens. If the authorization alone marked it paid, that is a **P0** - the
  app would be delivering care against money that can still evaporate, and
  nothing walks it back.

**A duplicate webhook changes nothing twice.**

**Do this.** Re-send the same `payment.captured` event two or three times.

**Expect.** One payment recorded, one booking confirmed, **one** calendar
event. The second delivery finds the order already captured and does nothing.
Two `payments` rows for one order, or two calendar invites reaching the
patient, is a **P0**.

**And the callback and the webhook must agree on the figure.** Pay for a
**home visit** in the browser and let the callback confirm it, then read the
recorded amount.

**Expect.** It is the **whole** of what the gateway took - the visit **plus
travel**, `₹2,649` at Step 9.1's prices - not the service line alone. One
booking recorded two different ways depending on which arrived first is the
disagreement this record exists to settle.

**Finally, check the unmatched-payment alert.** Money's alerts strip counts
payments attached to nothing. It should read **zero** unless you have
deliberately made one.

---

### Step 11.12 - Checkpoint

| | Should be |
| --- | --- |
| Identities | Both hold exactly, on two ranges |
| Payout | One settled, cash netted off, those visits marked remitted |
| Costs | Three recorded, one correctly outside a this-month range |
| Business Health | Seven figures, with the three typed inputs in place |
| Ledger switch | Flipped and flipped back, no balance moved |
| Adjustments | One refused for a short reason, one applied |

---
