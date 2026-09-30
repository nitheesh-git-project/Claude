# The money model

One vocabulary for every figure this product states about money, and the
accounting rules behind them. Written because four of the audit findings were
the same finding: the words were not defined anywhere, so two screens could
use one word for two things and nobody could tell which was wrong.

This is the definition. `src/lib/moneyTerms.ts` is the machine-readable half
that the `(i)` on each figure and the glossary both read; if the two ever
disagree, that file is what renders and this file is what was agreed — fix
whichever is wrong.

---

## 1. The vocabulary

Every noun below means exactly one thing. If a new figure needs a word that
is taken, the figure gets renamed, not the word.

### Money coming in

| Term | Means | Not |
| --- | --- | --- |
| **Gross revenue** | Everything charged for delivered work, before refunds. | Not cash in the bank. |
| **Refunds** | Money handed back, on sessions that were cancelled or partly refunded. | Not a discount. |
| **Net revenue** | Gross less refunds. | Not profit. |
| **Cash collected** | Money that actually arrived, whenever it arrived. | Not revenue. |
| **Package cash collected** | Money taken up front for a programme, before its sessions happen. | Not revenue for those sessions yet. |
| **Receivable** | Work delivered and not yet paid for. Pay-later only. | Not an abandoned checkout. |
| **Unearned revenue** | Money taken for sessions not yet delivered. A liability. | Not revenue. |

### Money going out

| Term | Means |
| --- | --- |
| **Therapist share** | A clinician's cut of a delivered session, plus a home visit's travel fee in full. |
| **Partner commission** | A referring hospital's cut of net revenue on their patients' delivered sessions. |
| **Clinic share** | Net revenue less the therapist and partner shares. A *gross* figure. |
| **Payout** | A transfer actually made to a therapist, net of cash they are holding. |
| **Gateway fee** | What the payment processor kept. Charged on gross, and kept through a refund. |
| **Cost** | A hand-entered business expense, dated by when it was incurred. |
| **Bad debt** | A pay-later session the clinic stopped chasing. A cost, never a revenue reduction. |
| **Operating profit** | Clinic share less gateway fees and costs. |

### Money not taken

| Term | Means |
| --- | --- |
| **List price** | What the session would have cost with no discount. |
| **Discount given** | List price less what was charged, with the rule that produced it recorded. |

**Discounting is reported, never deducted.** A discount means less was
collected, so it is *already inside* gross revenue as a smaller number.
Subtracting it from profit would count it twice and understate profit by
exactly the amount given away. It sits on Money → Costs as a stated figure
answering the one question no revenue line can: what buying those patients
cost.

### Words this product deliberately does not use

- **"Profit"** for anything above operating profit. `clinic share` is what net
  revenue leaves after the splits and has no costs in it.
- **"Net profit"** at all. Nothing here is post-tax.
- **"Paid"** to mean delivered. A session can be paid and not delivered, and
  delivered and not paid (pay later). The audit found both conflated on the
  partner's own screen.
- **"Invite"** for a hospital referral, or **"referral"** for one patient
  telling another. Two different features, two commercial models.

---

## 2. Cash versus accrual

This product reports **accrual**, and states cash separately. Both are true
and they answer different questions, so every figure declares which it is —
that is what `MoneyTerm.scope` is for, and why a `range` figure and a `now`
figure never sit in a strip without a chip saying so.

| Question | Figure | Scope |
| --- | --- | --- |
| What did we earn this month? | Net revenue | `range` |
| What arrived in the bank this month? | Cash collected | `range` |
| What are we owed right now? | Receivables, owed to therapists | `now` |
| What do we owe as care? | Unearned revenue | `now` |
| What rate applies? | Gateway fee %, revenue shares | `setting` |

### Revenue recognition

**Revenue is recognised when the work is delivered.** Not when it is booked,
not when the money arrives.

- **A single session** is recognised on completion.
- **A programme** is recognised one session at a time as its sessions are
  delivered. The cash arrived up front and is reported as *package cash
  collected*; the part not yet delivered is *unearned revenue*, a current
  liability in working capital.
- **A pay-later session** is recognised on completion, like any other —
  before any money has arrived. This is the case that makes the rule worth
  stating: recognising it at collection instead would report a loss in the
  month the work was done and a windfall in the month it was paid, with both
  months wrong for one session.
- **The therapist's share is recognised at the same moment**, for the same
  reason, and is paid without waiting for the patient. They did the work and
  had no say in extending the credit, so the clinic carries the gap.

### The receivable lifecycle

A pay-later session moves through exactly these states, and each is a
separate fact:

```
booked            amount_due_paise stamped. Nothing owed.
delivered         status = completed. NOW owed, revenue recognised,
                  therapist's share payable.
declared          the patient says they have paid. Settles NOTHING.
confirmed         an admin confirms the money arrived. Allocated oldest
                  first, whole sessions only.
settled           amount_paid_paise = amount_due_paise exactly.
written off       the clinic stopped chasing. A bad-debt cost. No money
                  column on the session moves.
```

Two rules hold the whole of it:

1. **Nothing is owed until the work is done.** `amount_due_paise` is stamped
   at booking and *counted* only while `status = 'completed'`. That single
   split is why "a booking owes nothing" and "a late cancellation owes
   nothing" are both true with no special case anywhere — there is no state
   to unwind, because nothing was ever owed.
2. **Settlement writes the session's full price, never the payment's share
   of it.** The therapist's cut is computed from that column, so spreading
   one payment across several sessions would silently shrink their pay on
   sessions the clinic had already paid out on.

---

## 3. Immutability

A figure describing something that already happened does not move.

| Frozen | When | Why |
| --- | --- | --- |
| `package_snapshot` | Purchase | An admin re-pricing a programme must not rewrite what somebody already owns. |
| Purchased terms (duration, gap, weekly cap) | Purchase | Same, for the rules that decide when those sessions may be used. |
| `amount_due_paise` | Booking (pay later) | Settlement must not charge the new price for old work. |
| `therapist_share_percent_at_completion` | Completion | Renegotiating a rate must not rewrite what was already paid on. |
| `hospital_share_percent_at_completion` | Completion | Same, for a partner's commission. |
| `hospital_id_at_completion` | Completion | A referral added later must not retrospectively earn a cut. |
| `list_price_paise` + the three discount facts | Payment | So the books can tell "sold cheap" from "discounted". |
| `payments.amount_paise` | Order creation | What we asked for, kept apart from what the gateway said it took. |
| A `refund_attempts` row | Before the gateway is called | What we asked the gateway to do, kept apart from what it did. |

**An adjustment is a new record, never an edit.** The credit ledger is
append-only; `admin_adjust` is the one entry type with a free-form delta and
the only one requiring a reason. An admin can change any balance and cannot
change any history.

**Money going out has the same shape as money coming in.** A capture is
recorded in `payments` and a refund in `refund_attempts`, and both are
written with the same ordering: the intent first, the outcome second. That
ordering is what makes "we asked for this and never learned what happened"
a state somebody can find rather than an absence nobody can distinguish from
a refund that was never sent. The table is append-only by trigger, permitting
exactly one transition (`processing` → `succeeded` | `failed`), once, plus
the two columns resolution fills in, and nothing is ever deletable — a row
that can be removed makes the stuck-at-processing state meaningless.
`refund_attempt_health()` compares it against the session or purchase it was
for, on Settings → System Health → Refunds. It reports and never repairs: no
screen here can know whether Razorpay took the money, and guessing on a money
record is how a discrepancy becomes permanent.

---

## 4. What is still not canonical

Stated plainly rather than implied, because the audit asked for a single
canonical settlement record and this is how far that has got.

**What exists today.** Money is derived from `appointments` plus the frozen
rates on each row, through one module (`src/lib/adminMetrics.ts`) that every
screen reads. Two invariants are asserted in tests and hold:
`net = gross − refunds`, and
`clinic share = splittable net − therapist share − partner share`. A session
whose split is unknowable is excluded and *counted*, never guessed at.

**What does not exist.** There is no `appointment_settlements` row per
delivered session. The consequences are real and worth naming:

- A settlement cannot be queried directly; every figure is a derivation.
- There is no per-session record of *when* a split was computed, only of the
  rates it would use.
- Payout batches reference appointments rather than settlement rows, so the
  relationship in item 9 of the audit is implied rather than modelled.

**Why it was not built in this pass.** It is a schema-level change to the
one part of the system where a half-finished migration is worst: every money
figure, both exports, the payout run and the partner's own screen would read
from a new table whose backfill has to be exactly right for historical rows
that no longer have the data to reconstruct it. The frozen rates added here
are the prerequisite — they are what a settlement row would have needed to
record — so this is a deliberate first step, not a substitute.

**What it would take.** A settlement row written in the same transaction as
completion, carrying the frozen amounts rather than the rates; the money
modules reading those rows and falling back to derivation for historical
sessions; and the payout batch referencing settlements. That is a piece of
work with its own migration, its own reconciliation report and its own test
plan, and it should be scoped as such.
