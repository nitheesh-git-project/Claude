---

## 16. Finance test plan (Money) and payment integrity

### 16.0 Feature guide — the money model

**One word, one money figure.** If a new figure needs a word that is already taken, the figure gets renamed — the word is never overloaded. If two figures end up with the same meaning, one is deleted rather than explained. `MoneyGlossary` renders on **every** Money screen, not only Summary, because an admin reading "Net payable" on Payouts is the one who needs it.

| Word | Means |
| --- | --- |
| **Gross Revenue** | Every paid session in range, before refunds |
| **Refunds** | Refunds that actually processed |
| **Net Revenue** | `Gross − Refunds` |
| **Splittable Net** | The part of Net whose split is **knowable**. Always ≤ Net. |
| **Therapist share** | Earned by **delivering** — completed **and** paid only. Includes a home visit's travel fee in full. |
| **Partner share** | A commission on **net** revenue |
| **Clinic share** | `Splittable Net − Therapist share − Partner share`. A **gross** figure. |
| **Operating profit** | Clinic share **less** the gateway fee and hand-entered business expenses. The only figure that may be called profit — and only because costs exist. |
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

**Different eligibility for revenue and for the split.** Gross, refunds and net count **every** paid session. A session whose split is **unknowable** — no therapist share set, or a hospital-referred patient whose hospital has no share configured — is excluded **from the split alone** and surfaced as a **named count**. **Never guess a percentage to make the numbers tie.**

**Flows are range-scoped; balances are not.** "Owed to therapists" is all-time and net of cash held, matching what the Pay button actually transfers. Scoping it to the range in view once let an admin read "nothing owed" off a quiet week while a real debt sat outside the window. The label has to say which it is.

---

### 16.1 The reference dataset

Build this exact dataset before running §16.2 onward. It is small enough to compute by hand and exercises every rule.

| # | Patient | Therapist | Mode | Paid | Status | Refund | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | A | A (60%) | online | ₹1,999 | completed | — | Ordinary delivered session |
| S2 | A | A (60%) | online | ₹1,799 | confirmed (not completed) | — | Paid, **not delivered** |
| S3 | A | A (60%) | online | ₹1,999 | cancelled | ₹1,999 processed | Refunded outside the window |
| S4 | C (Hospital A, 10%) | A (60%) | online | ₹2,499 | completed | — | Partner attribution |
| S5 | C (Hospital A, 10%) | B (**no share set**) | online | ₹1,999 | completed | — | **Excluded from the split** |
| S6 | A | A (home 65%) | home visit | ₹2,499 | completed | — | Travel fee ₹150, paid online |
| S7 | B | A (home 65%) | home visit | ₹2,499 | completed | — | Travel ₹150, **cash at the door**, not remitted |

Costs: the three expenses from §8.15. Gateway fee: **2%**.

**Hand-computed expectations for the whole range (all figures in rupees):**

* **Gross** = 1999 + 1799 + 1999 + 2499 + 1999 + 2499 + 2499 = **₹15,293**
  *(S7 is a cash home visit: include it only once the cash is recorded as collected — see `FIN-SUM-002`.)*
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
* **Operating profit** = 4,797.60 − 255.88 − 29,000 = **−₹24,458.28** (a loss — which is the honest answer for this dataset)

> Rounding: each per-appointment share is rounded to the nearest paise **individually** before summing. Expect ±1 paise against a spreadsheet that rounds at the end.

---

### 16.2 Money screens

#### `FIN-SUM-001` — Summary and the two identities · P0

**Steps.** Open **Money → Summary**. Set the date range to cover the dataset. Read every figure. Compute the two identities by hand.
**Expected Result.** `net = gross − refunds` and `clinic share = splittable net − therapist share − partner share` **hold exactly**. The figures match §16.1. The excluded count reads `1` with `₹1,999` named. Every screen ends with the **MoneyGlossary**. No figure is labelled "approximate" — the split is exact over a stated subset.

#### `FIN-SUM-002` — Paid vs unpaid, completed vs not · P0
**Steps.** Confirm S2's treatment.
**Expected Result.** S2 (paid, **not** completed) **is** in Gross/Net, and contributes **nothing** to the therapist share. If the therapist share includes S2, the "earned by delivering" rule has regressed — that is a P0.
**Cash check:** S7's cash home visit sits at `payment_status='unpaid'` for its whole life. **Read `payment_mode` first.** It must not be presented anywhere as a failed or outstanding online payment.

#### `FIN-SUM-003` — Date filtering, and what is never filtered · P0
**Steps.** Narrow the range to one day containing only S1. Read every figure on Summary. Then read **Owed to therapists**.
**Expected Result.** Gross, refunds, net, and the split all narrow to S1. **"Owed to therapists" does not change** — it is an all-time balance, net of cash held, matching what the Pay button transfers. Its label says so. If it moves with the range, that is a P0: an admin could read "nothing owed" off a quiet week while a real debt sat outside the window.

#### `FIN-BRK-001` — Breakdown agrees with Summary · P0
**Steps.** Open **Money → Breakdown** for the same range.
**Expected Result.** Every figure and every chart segment matches Summary **exactly** — both come from **one pass** of the same maths. A discrepancy of any size is a P0.

#### `FIN-TXN-001` — Transactions · P1
**Steps.** Open **Money → Transactions**. Reconcile every row against the dataset. Export CSV and PDF.
**Expected Result.** One row per payment, with the order id and payment id. **No payment id appears on two rows.** The CSV and the PDF describe the **same table** — they are generated from one column definition, and the PDF route is sent the exact filtered rows the browser rendered. Both cover the **whole filtered set**. The PDF carries a subtitle naming the scope and the date. **No JSON export exists.**

#### `FIN-PAY-001` — Payouts · P0
**Steps.** Open **Money → Payouts**. Read Therapist A's row.
**Expected Result.** `Owed` matches §16.1's therapist share for A, **less anything already settled**. **The Pay button shows the net figure** — owed minus cash held — not the gross owed. A therapist with **no revenue share set** shows the "not set" state rather than `₹0`; paying them is refused with `Set this therapist's revenue share % before paying out.`

#### `FIN-PAY-002` — Settling a payout · P0
**Steps.** Settle Therapist A's payout. Then attempt to settle again immediately. Then double-click Settle on Therapist B.
**Expected Result.** The transfer amount is recorded, `therapist_payout_paid_at` is stamped on exactly the sessions settled, and a **`payout.settle` audit row** is written **after** the compare-and-swap claim. A second attempt is a no-op or is refused — **no double payout**. The Owed figure drops to zero for the settled sessions.

#### `FIN-PAY-003` — Netting cash off a payout is a remittance · P0

**Purpose.** Without this, the same rupees are deducted again on the next payout and the Cash Ledger goes on asking someone to chase money already recovered.
**Preconditions.** Therapist A is holding S7's cash (₹2,499 + ₹150 travel, per the reconstructed total), un-remitted.
**Steps.** Read the Pay button's figure. Settle. Then open the **Cash Ledger** panel on the same screen. Then run a second payout cycle.
**Expected Result.** The transfer is reduced by the cash held. **The same run marks exactly those visits `cash_remitted_at`.** The Cash Ledger stops listing them. The second payout cycle does **not** deduct that cash again.

#### `FIN-PAY-004` — A therapist holding more cash than they are owed · P0
**Preconditions.** Arrange cash held > amount owed.
**Expected Result.** The transfer **floors at zero** (never negative). The difference is shown as **still owed to the business**, and **those collections deliberately stay open on the Cash Ledger** for a person to chase. They must not be silently marked remitted.

#### `FIN-PAY-005` — Payout requests · P1
**Steps.** With a therapist request outstanding, tap **Start review**, then **Complete**. Then try to complete a request that was never reviewed.
**Expected Result.** The states move `pending → reviewing → completed`. Completing without review is refused with `Start review on this request before marking it completed.` A completed request re-submitted returns `This request is already completed.` A stale action returns `This request is no longer pending — please refresh.` All audited.

#### `FIN-PAY-006` — Correcting a cash amount is the admin's job, not the therapist's · P0
**Steps.** As Admin Full, correct S7's cash amount to `₹2,000` with the reason `Patient short ₹649 at the door; agreed balance next visit.` Then try with a blank reason, then on an **already remitted** visit.
**Expected Result.** Valid: succeeds with a CAS on the figure being replaced, and writes a **`cash.correct_amount`** audit row. Blank reason: refused. Already remitted: **refused** — that transfer has gone out, so the fix is an adjustment against the next payout, not a silent edit of a settled one (`This session isn't a cash-on-visit home visit.` / the remitted refusal). A stale figure returns `Someone else changed this figure. Refresh and try again.`
As Admin Ops (no `money` scope): **403**, and the control does not render.

#### `FIN-COST-001` — Costs · P1
**Steps.** Open **Money → Costs**. Add the three expenses from §8.15. Set the range to September 2026.
**Expected Result.** Only the two September rows count; the 28 August row is excluded — expenses are dated by **when they were incurred**, not when they were typed in. Negatives: `Enter an amount greater than zero.`, `Pick the date this cost was incurred.` Deleting an expense removes it from the total.

#### `FIN-COST-002` — Operating profit and the gateway fee · P0
**Steps.** Read Operating profit. Then change the gateway fee percentage and re-read.
**Expected Result.** The gateway fee is **derived automatically** from what was collected **online**, charged on **gross** (a processor keeps its fee through a refund), and **skipped for cash-on-visit**, which never touches a gateway. Operating profit = clinic share − gateway fee − expenses. Changing the percentage moves it.
**With no costs recorded for a range, Operating profit is a ceiling and the screen must say so** rather than implying a number it cannot know. **Nothing here is post-tax — the label must never read "net profit".**

#### `FIN-REF-001` — Refunds across the screens · P0
**Steps.** Refund S3 in full. Then partially refund another session by `₹500` with the reason `Session cut short by a connection failure.` Then attempt a partial refund of `₹0`, and one with no reason.
**Expected Result.** Full: Gross unchanged, Refunds +₹1,999, Net −₹1,999, **therapist share unchanged**, **partner share reduced**. Partial: the same shape at ₹500. `₹0`: `Enter a refund amount greater than zero.` No reason: `Say why this refund is being made.` A second full refund: `This session has already been refunded in full.`

#### `FIN-REF-002` — Refund failure at the gateway · P1
**Steps.** Force a Razorpay refund failure (use a payment that cannot be refunded in test mode).
**Expected Result.** `Razorpay refused the refund. Nothing was refunded — check Razorpay and retry.` **Nothing is marked refunded locally** — the local state must never claim a refund the gateway did not make.

#### `FIN-REF-003` — A cash refund becomes a manual pending item · P1
**Steps.** Refund a cash-on-visit home purchase.
**Expected Result.** With no Razorpay payment behind it, the refund becomes `refund_status='manual_pending'` and is **surfaced on the admin Cash Ledger** until an admin confirms the cash was handed back. Marking it returned clears it and is audited. Attempting to refund a cash purchase as if it were online: `Cash-on-visit packages have no single payment to refund — cancel visits individually instead.`

#### `FIN-REF-004` — A refund voids available credits, never delivered ones · P0
**Preconditions.** A 6-session purchase with 2 sessions **completed** and 4 available.
**Steps.** Refund the package.
**Expected Result.** The **4 available** credits are voided; the **2 delivered stay delivered**. The ledger records a `void` for exactly 4. The patient's widget shows the programme as refunded with nothing available. **A delivered session is never un-delivered.**

---

### 16.3 Payment integrity (duplicates, concurrency, webhooks)

#### `PAY-DUP-001` — One payment, one appointment · P0
**Steps.** Complete `PAT-BOOK-003`, then reload and inspect Sessions → All Sessions and the `payments` table.
**Expected Result.** Exactly one appointment, exactly one `payments` row. **The appointment is created *before* the order, and the order is minted against it**, so there is no path by which one payment creates two appointments.

#### `PAY-DUP-002` — One order, one purchase · P0 **[SQL]**
**Steps.** Attempt to insert a second `payments` row with an existing `razorpay_order_id`.
**Expected Result.** The unique index rejects it. **Do not drop that index to make an import succeed** — a collision means a duplicate already exists and wants investigating. Repeat for `razorpay_payment_id`.

#### `PAY-DUP-003` — One purchase, one entitlement · P0
**Steps.** After a care-plan purchase, trigger the verify route twice (retry the callback).
**Expected Result.** Exactly one entitlement, `sessions_granted = 6`. The grant function is idempotent.

#### `PAY-DUP-004` — Duplicate webhook · P0
**Preconditions.** `RAZORPAY_WEBHOOK_SECRET` is set.
**Steps.** Capture a real webhook body and its `x-razorpay-signature` header from the Razorpay dashboard's webhook log. POST it to `/api/razorpay/webhook`. POST **the identical body** again.
**Expected Result.** The first is processed. The second collides on `razorpay_event_id` in `payment_webhook_events` and is treated as already-seen — **that insert is the deduplication, and it happens before any work is done**, so a retry arriving mid-flight cannot do the work twice. Money → Transactions shows the payment **once**. Gross Revenue does not double.

#### `PAY-WH-001` — Signature verification · P0
**Steps.** POST a webhook body with (a) no signature header, (b) a wrong signature, (c) the correct signature but a **re-serialised** body (`JSON.parse` then `JSON.stringify`).
**Expected Result.** (a) `400 Missing signature`. (b) `400 Invalid signature`. (c) **`400 Invalid signature`** — and this is correct: the signature is checked against the **raw** body, because a re-serialised body does not round-trip byte-for-byte. **The fix for a legitimate webhook failing here is never to skip the check.**

#### `PAY-WH-002` — Webhook races the browser callback · P0
**Steps.** Complete a payment and, as close to simultaneously as you can manage, POST the webhook body and let the browser callback fire.
**Expected Result.** Whichever arrives first applies the capture; the second finds it captured and **changes nothing**. The appointment is paid once, `payments` has one row, and the Meet event is created **once** (the webhook only creates one if the appointment does not already carry an event id).

#### `PAY-WH-003` — Non-capture events are recorded and ignored · P2
**Steps.** POST a `payment.failed` webhook with a valid signature.
**Expected Result.** The event row is recorded and marked processed. No capture is applied.

#### `PAY-WH-004` — Without the webhook secret, a closed tab loses the confirmation · P0
**Steps.** Unset `RAZORPAY_WEBHOOK_SECRET`, restart, and POST any webhook.
**Expected Result.** `503 {"error":"Webhook not configured"}`. **Consequence to state in your report if you see it in the wild:** a patient who pays and closes the tab before the callback lands leaves a **paid Razorpay order against an unpaid booking**. Restore the secret.

#### `PAY-DUP-005` — Double settle · P0
Covered by `FIN-PAY-002`. **No double payout.**

#### `PAY-DUP-006` — Partner commission is not accumulated twice · P0
**Steps.** Re-run the webhook and the callback for S4, then read Money → Breakdown and the hospital's Earnings.
**Expected Result.** `₹249.90` appears **once** on both.

#### `PAY-DUP-007` — Credit idempotency keys are derived, never random · P0 **[SQL]**
**Steps.** Inspect `session_credit_ledger` for a booked package session.
**Expected Result.** Keys read `reserve:<appointment_id>` and `consume:<appointment_id>`. **A random key would make every retry look like a new event, which is the exact bug the key exists to prevent.** Availability is checked **after** idempotency in the reserve function, deliberately — checking availability first would answer "no credits available" for a booking that in fact succeeded.

#### `PAY-CONC-001` — Twelve concurrent reserves against one credit · P0 **[script]**
**Steps.** With a purchase holding exactly **one** remaining credit, fire twelve concurrent booking requests for distinct slots.
**Expected Result.** **Exactly one succeeds.** The rest are refused. The row lock in the reserve function is real, and the CHECK constraint on the cached counts makes an overdrawn balance impossible rather than merely unwritten.

#### `PAY-CONC-002` — Two admins settle the same payout at once · P0
**Expected Result.** One wins; the other is refused. The audit log records **only the winner** — the log write happens after the CAS claim.

#### `PAY-AMT-001` — The amount is server-derived · P0
**Steps.** Intercept the `create-order` request and change any client-supplied amount or package id. Also attempt `create-order` with another patient's `appointmentId`.
**Expected Result.** The amount charged is **re-derived server-side** from the category or the catalog row. A tampered amount has no effect. Another patient's appointment is **not found** under the caller's own scoped client → `Appointment not found` (404). Attempting to pay an already-paid booking: `This booking is already paid`.

#### `PAY-AMT-002` — A care-plan price cannot be tampered with · P0
**Steps.** Accept a recommendation, intercepting the request to change the package id to a cheaper one.
**Expected Result.** The route **re-derives the price from the plan's own recommended package** and refuses a catalog mismatch (`That recommendation is incomplete.` / a mismatch 409). The programme granted is the one recommended, at the price recommended.
