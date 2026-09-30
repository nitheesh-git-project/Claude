# Lifecycle states

Every state machine in this product, written down once.

The audit asked for this because the states were real and the *definitions*
were not: `patient_referrals.status` is CHECKed to five values and the
partner's own dashboard filtered for two that do not exist, so two counts
read zero for every partner permanently. Nothing failed, because nothing
declared what the states were.

Where a grouping is worth asking (`isReferralAccepted`, not
`status === "accepted"`), the helper is named here and lives beside the
labels. A screen that compares a status string itself is a screen that can
silently go stale.

---

## Appointment

`appointments.status` — `requested` | `confirmed` | `completed` | `cancelled`

```
requested ──assign + paid/terms──> confirmed ──complete──> completed
    │                                  │                      │
    └──────── cancel ─────────────────┴──── cancel ───────────┘
                     │                                        │
                     ▼                                    reopen
                 cancelled                                    │
                                                              ▼
                                                          confirmed
```

- **`requested`** — booked and waiting on somebody. Either unpaid, or paid
  with no therapist assigned yet.
- **`confirmed`** — a therapist is on it *and* it is paid, on pay-later terms,
  drawn from a programme, or cash-on-visit. Only a confirmed session can be
  completed.
- **`completed`** — delivered. This is the state that makes the therapist's
  share payable, recognises revenue, and creates a pay-later debt. It stamps
  `completed_at` and the frozen split rates.
- **`cancelled`** — never delivered. Gives its slot back (the conflict check
  and the one-therapist-per-slot index both exclude it) and, inside the
  refund window, refunds.

**Reopening** moves `completed` back to `confirmed`. Three downstream effects
reverse automatically because they are keyed on state rather than on an event
— revenue, the pay-later debt, and the credit balance (`sessions_used` counts
a session *claimed*, and reopening does not unbook it). Two reverse by hand:
the ratings and the frozen rates. One does not reverse at all: a settled
payout, because money has left the clinic — that is refused rather than
unwound.

**Payment is a separate axis, not a status.** `payment_status`
(`unpaid`/`paid`/`failed`) and `payment_terms` (`prepaid`/`pay_later`) are
orthogonal to the lifecycle, which is the whole reason `payment_terms` exists:
`unpaid` alone cannot tell an abandoned checkout from a trusted patient's
booked session.

---

## Referral

`patient_referrals.status` — five values, and the groupings are in
`src/lib/referralStatus.ts`.

```
pending_review ──assign therapist──> therapist_assigned
      │                                     │
      │                                send link
      │                                     ▼
      │                               invite_sent ──patient registers──> converted
      │                                     
      └──── decline (reason required) ──> declined
                     ▲
                     └──── from therapist_assigned
```

| State | Label shown | `withClinic` | `accepted` | `closed` | `withdrawable` |
| --- | --- | --- | --- | --- | --- |
| `pending_review` | Pending Review | ✓ | | | ✓ |
| `therapist_assigned` | Therapist Assigned | ✓ | ✓ | | ✓ |
| `invite_sent` | Registration Link Sent | | ✓ | | |
| `converted` | Registered | | ✓ | ✓ | |
| `declined` | Declined | | | ✓ | |

- **`therapist_assigned` counts as accepted.** From the partner's side, a
  clinician being on it *is* the acceptance; waiting for the patient to
  register is not their business.
- **`invite_sent` holds a therapist's slot** even though no appointment row
  exists yet, which is why both slot-claim functions check it.
- **Withdrawal stops at `invite_sent`.** Once the patient holds a link,
  withdrawing it behind their back is not the partner's call.
- **Declining requires a ten-character reason**, enforced by the route and by
  a CHECK. It is the one outcome here that takes something away.

---

## Payment

`payments.status` — `created` | `captured`

One row per Razorpay order, unique on both the order id and the payment id.
The transition is one-way and append-only by trigger: a captured payment's
two gateway ids are frozen and the row is never deletable, because the row
*is* the record that money moved.

`amount_paise` is what the order was created for. `captured_amount_paise` is
what the gateway said it took. They are kept apart deliberately — the capture
used to overwrite the order amount, which erased the only evidence that the
two had ever differed.

---

## Refund

`appointments.refund_status` — read through `src/lib/refundState.ts`, never
raw. Five readings, and the difference is *who is waiting for what*:

| State | Means | Waiting on |
| --- | --- | --- |
| `none` | Nothing refunded. Renders nothing at all. | nobody |
| `processed` | Done. | nobody |
| `manual_pending` | Cash, or a pay-later settlement, to hand back by a person. | the clinic |
| `failed` | The gateway refused. Most urgent, because nothing was watching it. | the clinic |
| `not_eligible` | A decision that nothing is owed. Recorded, not blank. | nobody |

`not_eligible` says **nothing** to the patient: the cancelled card already
explains the window, and announcing a refund to somebody who is not getting
one is worse than silence.

---

## Programme purchase

`patient_package_purchases.status` / `home_visit_package_purchases.status` —
`active` | `exhausted` | `expired` | `refunded` | `cancelled`

`active` ⇄ `exhausted` is arithmetic and moves with the balance.
`expired`, `refunded` and `cancelled` are decisions somebody made and are
never moved by arithmetic. Expiry is a lazy sweep at the top of a relevant
render, because there is no worker here.

---

## Session credits

`session_credit_ledger` is append-only; the counts on
`session_entitlements` are a cache the ledger maintains by trigger.

```
reserve ──consume──> consumed
   │
 release ──> available again
```

Reserve and consume both reduce `available`, which is why reopening a session
needs no credit reversal: the balance is the same either way.

Every movement goes through an RPC holding a real row lock, keyed for
idempotency on **the thing that happened** (`reserve:<appointment_id>`), never
on a random value — a random key makes every retry look like a new event,
which is the bug the key exists to prevent.

---

## Care plan

`care_plans.status` — `pending_review` | `active` | `accepted` | `rejected` |
`withdrawn`

```
                    ┌── approve ──> active ──patient pays──> accepted
pending_review ─────┤
                    ├── approve with changes ──> new version, active
                    └── reject (reason) ──> rejected
                    
active / pending_review ──withdraw (reason)──> withdrawn
```

Versions are append-only by trigger; only `is_current` may change. At most
one **open** plan per patient (`active` or `pending_review`) — scoping that to
`active` alone is how a queued plan could go live beside a published one.
An `accepted` plan is never re-versioned: a later recommendation opens a new
thread with `supersedes_id` set.

---

## Payout

`payout_requests` → payout batch → per-appointment settlement.

A therapist requests, an admin reviews, the transfer is made net of cash the
therapist is holding — and that netting marks exactly those visits
`cash_remitted_at` in the same run, or the same rupees are deducted again next
time. A therapist holding *more* than they are owed floors the transfer at
zero and the difference stays open on the Cash Ledger for a person to chase.

**The relationship is implied rather than modelled.** See
`docs/MONEY-MODEL.md` §4: a payout batch references appointments, not
settlement rows. That is audit item 9, and it is open.

---

## Pay-later settlement

`pay_later_payments.status` — `pending` | `confirmed` | `rejected`

Append-only by trigger, permitting exactly `pending → confirmed|rejected`
one way plus the two columns allocation moves, and never a delete.

An **online** row is never `pending` (a CHECK): the gateway is the
confirmation. A **declaration** lands `pending` and settles nothing — the
owed figure does not move until an admin confirms the money arrived, because
a patient who could clear their own total by typing into a box is a patient
who can.

---

## Account

`profiles.approved` and `profiles.active` are two independent flags, not a
state machine, and both are enforced in two places: the proxy for dashboard
navigation, and `getProfileStanding` / `requireActiveProfile` inside the API
routes — because a valid session cookie can call a route directly around the
UI.

| | `approved` | `active` |
| --- | --- | --- |
| Means | An admin has vetted this account | The account is not suspended |
| Set by | The approvals queue, or a genuine payment attempt | An admin, deliberately |
| Admin exception | **Not checked** — an admin is promoted by hand, so gating on it locks out the people it protects | Checked |

Suspension reaches the database, not only the app: `is_admin()` refuses a
suspended admin at the policy layer, and the four `set-*-active` routes end
the account's sessions through `revoke_user_sessions(uuid)`.
