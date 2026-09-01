---

## 9. Payment test data and the payment model

### 9.1 Razorpay test mode — credentials

> **Use Razorpay Test Mode only.** Test cards fail in live mode with an "invalid card issuer" error, which is the intended safety net. Before executing this section, re-confirm the values against Razorpay's own pages, because Razorpay changes them from time to time:
> * Test cards: `https://razorpay.com/docs/payments/payments/test-card-details/`
> * Test UPI: `https://razorpay.com/docs/payments/payments/test-upi-details/`
>
> The values below were confirmed against those pages at the time of writing. **Do not substitute invented numbers.** If a value no longer works, take the current one from the pages above and note the change in your defect report.

**Test UPI IDs (India / domestic)**

| Purpose | UPI ID |
| --- | --- |
| Payment **succeeds** | `success@razorpay` |
| Payment **fails** | `failure@razorpay` |

**Domestic test card**

| Field | Value |
| --- | --- |
| Card number | `4111 1111 1111 1111` |
| Expiry | Any **future** date, e.g. `12 / 30` |
| CVV | Any 3 digits, e.g. `123` |
| Name on card | `QA Patient A` |
| OTP on the simulated 3-D Secure page | Any random 4–10 digit number, e.g. `1111` |

**International / US test cards** (only if the account is configured for them)

| Network | Number |
| --- | --- |
| Visa (International) | `4239 5360 0631 5640` |
| Mastercard (International) | `5421 1393 0609 0628` |
| Amex (International) | `3779 849088 69514` |
| Discover | `6011 0833 2733 7267` |
| Visa (US) | `4384 7968 2770 3274` |
| Mastercard (US) | `5312 6865 5677 9641` |
| Amex (US) | `3782 8224 6310 005` |
| Diners (US) | `6594 7300 0000 0001` |

**The Razorpay checkout in test mode also shows explicit Success / Failure buttons** on the card and netbanking flows. Where a test says "force a failure", using the checkout's own **Failure** button is equivalent to using `failure@razorpay` and is the quickest route.

### 9.2 How money actually moves in this application

Understanding this model is what makes a payment defect report useful.

**One row per Razorpay order.** The `payments` table has **unique indexes on `razorpay_order_id` and on `razorpay_payment_id`**. Nothing else in the database previously stopped one payment id being recorded against two rows. A unique-violation on either is not a bug to work around — it means a duplicate already exists and wants investigating.

**A capture is applied in exactly one place.** The database function `record_payment_capture` moves the `payments` row and the row it paid for **together**, under a real `select … for update`. It is called by the three verify routes and by the webhook. It is **idempotent by construction**: the second caller for an order finds it already captured and changes nothing. That single property is what makes all four of these safe without any of them knowing about the others:

1. a duplicate webhook,
2. Razorpay's at-least-once retries,
3. a webhook racing the browser callback,
4. a double-clicked **Pay** button.

**Two confirmations, whichever arrives first.** A payment is confirmed by *either* the browser callback (`/api/razorpay/verify`) *or* the server webhook (`/api/razorpay/webhook`). Both go through the same capture function.

**The webhook checks its signature against the raw body** (`await request.text()`), never a re-serialised parse. It inserts its `payment_webhook_events` row **before** doing any work — that insert colliding on `razorpay_event_id` *is* the deduplication.

**Without `RAZORPAY_WEBHOOK_SECRET`, the webhook half does not exist.** The route answers `503`. A patient who pays and closes the tab before the callback lands leaves a **paid Razorpay order against an unpaid booking**. Test `PAY-WH-004` covers exactly this.

**Meet/Calendar creation is deliberately outside the capture function**, because it needs an outbound Google call. Confirmation of the appointment and the Meet link stay in the route.

**Cash-on-visit is real, and breaks the usual assumption.** A cash home-visit purchase sits at `payment_status: 'unpaid'` for its whole life with real confirmed visits hanging off it. **Never read `payment_status` as "did money change hands" for a home visit — check `payment_mode` first.**

### 9.3 The payment surfaces

| Flow | Order route | Verify route | What it buys |
| --- | --- | --- | --- |
| Single online session | `/api/razorpay/create-order` | `/api/razorpay/verify` | One appointment |
| Home visit (prepaid) | `/api/home-visit/create-order` | `/api/home-visit/verify` | A `home_visit_package_purchases` row |
| Home visit (cash at the door) | *(none)* | `/api/home-visit/book-cash` | Same, `payment_mode='cash'`, `payment_status='unpaid'` |
| Care-plan programme | `/api/care-plan/create-order` | `/api/care-plan/verify` | A `patient_package_purchases` or home-visit purchase, plus session credits |
| Webhook (all of the above) | — | `/api/razorpay/webhook` | Confirms whichever the order pointed at |

**Direct programme checkout no longer exists.** `/api/packages/create-order` and `/api/packages/verify` are deleted. `/book?package=<id>` shows a "Programmes come from your therapist now" page instead of quietly selling one session to somebody who came to buy six.

### 9.4 Refunds

| Path | Route | Behaviour |
| --- | --- | --- |
| Patient cancels outside the refund window | `/api/appointments/cancel` | Full refund via Razorpay |
| Patient cancels inside the window | `/api/appointments/cancel` | **No refund.** The confirm dialog says so before you commit. |
| Admin refunds a package | `/api/admin/refund-package` | Voids **available** credits only; delivered sessions stay delivered |
| Admin partial refund on a session | `/api/admin/refund-session-partial` | Requires an amount > 0 and a mandatory reason |
| Cash refund with no Razorpay payment behind it | `/api/admin/refund-home-visit-package` | Becomes `refund_status: 'manual_pending'`, surfaced on the admin Cash Ledger until an admin confirms the cash was handed back |

**A refund never touches a therapist's cut** — a refunded session was cancelled, so it never earned one. It **does** reverse the hospital's commission, because that is a commission on net revenue.

### 9.5 What a single payment must never produce

Every one of these is a separate test in Section 15:

| Must never happen | Guarded by | Test |
| --- | --- | --- |
| Two appointments from one payment | The appointment is created before the order; the order is minted against it | `PAY-DUP-001` |
| Two purchases from one payment | Unique index on `razorpay_order_id` | `PAY-DUP-002` |
| Two entitlements from one purchase | `ensure_entitlement_for_purchase` is idempotent | `PAY-DUP-003` |
| Double revenue on the Money screens | One `payments` row per order | `PAY-DUP-004` |
| Double therapist payout | `therapist_payout_paid_at` CAS on settle | `PAY-DUP-005` |
| Double partner commission | Commission derived from net revenue per appointment, not accumulated | `PAY-DUP-006` |
| A ledger credit granted twice | Idempotency key derived from the appointment/payment id, never random | `PAY-DUP-007` |
