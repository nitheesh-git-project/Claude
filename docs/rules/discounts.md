# Discounts and the checkout quote

The four acquisition discounts, promo codes, patient invites, and the one module that resolves what a booking costs for three callers that must never disagree.

**Mostly lives in:** src/lib/discounts.ts · promoCodes.ts · inviteRewards.ts · checkoutQuote.ts

> Part of `docs/rules/`. `CLAUDE.md` says which file a task needs; this one
> is the detail. Keep it current in the same change that makes it wrong --
> see the docs rule in `docs/rules/testing.md`.

---

- **A discount is a rule an admin configured, never a number a browser
  sent.** The same reasoning that keeps a therapist picking a package rather
  than a price: an amount that can be posted is an amount that can be posted
  wrong. There are exactly four, and the two that arrived last are the two
  where something the patient sends is involved - which is why each of them
  sends a **name**, never a figure.
  1. **The first-session offer** is standing configuration
     (`first_session_offer_enabled` / `_type` / `_value`, Settings → Offers
     & Discounts, off by default). Eligibility is `has this patient ever
     committed to paying for a session`, asked of the database in
     `/api/razorpay/create-order` -
     so it cannot be claimed twice, asked for, or sent from a browser, and a
     patient is only new once. **Committed, not paid**, and the word is
     load-bearing: it was `payment_status = 'paid'` until pay later existed,
     and a session on terms is never paid - so that test read every trusted
     patient as brand new on *every* booking they ever made and handed the
     offer out again each time. A confirmed booking on terms is not an
     abandoned checkout, because its price and its discount are frozen on it
     and can never be taken back; a **cancelled** one was never delivered and
     leaves them new. `countPriorCommittedSessions`
     (`src/lib/priorSessionsServer.ts`) is the one query all three readers of
     that question share - the offer, a `first_session_only` promo code and
     `claim_invite()` - and `priorSessions.test.ts` fails when a reader grows
     its own copy back. It fails **closed**: an unreadable answer
     means list price, because charging somebody who was owed an offer is a
     complaint while discounting everybody forever is a hole in the revenue
     nobody notices for a month. Video consultations only; a programme comes
     from a recommendation and a home visit carries travel.
  2. **The goodwill adjustment** is one admin, one session, one reason -
     `/api/admin/apply-goodwill-discount`, `requireAdminScope("money")`, a
     ten-character reason enforced by the route *and* a CHECK, and a
     `payment.goodwill_discount` audit row. Only **before** payment: a
     discount on something already paid for is a refund, and refunds have
     their own route, their own Razorpay call and their own audit.
     **Every route that later collects reads it.** `create-order` always
     did, through `checkoutQuote`; `/api/admin/mark-paid-by-cash` did not,
     and wrote the full category price as the cash taken -- so a goodwill
     adjustment given and then collected at the door overstated the cash
     ledger and gross revenue by exactly the amount given away, with the
     discount facts on the row describing a reduction the recorded amount
     did not reflect. It subtracts `discount_paise` now and records the
     list price beside it, like every other collecting path.
  3. **The promo code** (`src/lib/promoCodes.ts`, `promoCodesServer.ts`,
     `promo_codes`, `promo_codes_enabled` off by default) is a campaign an
     admin sets up on Money → Costs, beside the figure it produces -
     `/api/admin/save-promo-code` and `delete-promo-code`, both
     `requireAdminScope("money")` with `promo.*` audit rows. Five things
     hold it together:
     - **The code is an identifier.** The browser sends its name; the kind,
       the amount, the window and the caps are read from the row. That is
       what keeps the rule above true for a discount the patient triggers.
     - **The cap is enforced under a row lock**, by `claim_promo_code()` in
       `schema.sql`, not by a count taken a moment before an update - two
       patients at one checkout each are a race, and "100 uses" has to mean
       100 while forty of them are open. `previewPromoCode` counts the same
       way and is deliberately *not* the authority: a preview being a moment
       stale costs nothing, because nothing has been promised yet.
     - **A claim that is never paid for stops counting** after a checkout
       hold computed at read time (`PROMO_HOLD_MS`, matching `v_hold`).
       Nothing writes an "expired" status, for the reason a pending session
       suggestion does not: a status recording the passage of time needs a
       sweep, and there is no worker here to run one.
     - **The claim lives on the booking**, `appointments.promo_code_id` +
       `promo_claimed_at`, not in a redemptions table. A second place the
       same claim is written is two places that can disagree about how many
       times a code was used, which is the bug a cap exists to prevent.
     - **A refused code refuses the checkout.** `/api/razorpay/create-order`
       answers 409 rather than quietly charging list price: the patient was
       shown a figure with the code applied, and taking more money than they
       were quoted is the one outcome a payment screen must never produce.
       A code that is claimed but then loses to a larger discount is
       *released*, so it does not count against its own cap for nothing.
     `promo_codes` has no patient select policy - a patient who can list it
     reads every campaign the clinic has ever scheduled, including the ones
     not yet running. A **claimed** code is never deleted, only paused: a
     paid session pointing at a campaign nobody can name cannot answer which
     rule gave the money away.
  4. **The patient invite** (`src/lib/inviteRewards.ts`,
     `inviteRewardsServer.ts`, `patient_invites`, `profiles.invite_code`,
     `invite_rewards_enabled` off by default) is two halves: a **welcome**
     off the invited friend's first booking, and a **reward** off the
     inviter's next one. Six rules:
     - **"Invite" is not "referral".** A referral is a hospital sending a
       patient under a commercial agreement, with its own table, dashboard
       and revenue share. One back office cannot have two things called an
       invite, so the referral flow's own strings now say *registration
       link* - this is the "one word for one concept" rule applied before
       the second meaning got in rather than after.
     - **The reward is earned by a paid session, never a signup.**
       `grant_invite_reward()` fires from both capture paths (idempotent, so
       the browser callback and the webhook racing produce one reward). A
       reward that pays out on signups is a reward for creating accounts,
       and somebody will.
     - **A patient is new exactly once**, the same test the first-session
       offer uses - and that phrase was a comment in `claim_invite()` while
       the two had silently parted: an invite is claimable only before that
       patient's first **committed** session (paid, or standing on pay-later
       terms - see the first-session rule above), at most once ever (a unique
       index on `invitee_id`, not a route check), and never their own code
       (`claim_invite()` and a CHECK).
     - **Amounts are snapshotted at claim.** Lowering the reward next month
       must not lower what was already promised - the same reason a
       purchased entitlement reads its package snapshot rather than the live
       catalog. An unspent half is honoured even after the feature is
       switched off; the switch stops new claims, it does not withdraw a
       promise.
     - **A half is spent once**, attached to a booking by
       `claim_invite_half()` and made final by `settle_invite_half()` on
       capture. The same checkout hold the promo claim uses stops one reward
       being quoted on two open checkouts, which would otherwise spend it
       twice.
     - **A ceiling per inviter** (`invite_max_rewards_per_patient`, 10).
       Someone who genuinely sends ten patients is worth ten rewards;
       someone sending a hundred is running a scheme, and the refusal is
       worded so it does not tell the invitee about somebody else's account.
  They never stack (`resolveDiscount`), and where more than one applies the
  patient pays the lowest - the clinic agreed to every one of those prices,
  so charging a higher one because an admin tried to help would be perverse.
  A tie goes to the more deliberate decision: goodwill, then the code the
  patient typed, then a campaign that runs itself.
  Three rules are load-bearing:
  - **Travel is never discounted.** It is a pass-through reimbursement paid
    to the therapist in full, so discounting it makes them fund their own
    transport to subsidise the clinic's marketing. Discounts apply to the
    service line; every caller adds travel back afterwards.
    **It is refunded, though, and `amount_paid_paise` is the wrong figure to
    refund.** Travel is deliberately kept out of that column (it is not
    revenue -- see `bookHomeVisitSession`), while
    `/api/razorpay/create-order` charges the service line *plus* travel. So
    a directly-paid home visit -- which is only ever a hospital home-visit
    referral, since every other one is paid on its purchase -- was refunded
    the service line alone and the patient went on paying for a journey
    nobody made. `cancelAppointmentAndRefund` and
    `/api/admin/refund-session-partial` both add the travel back now, the
    second as the ceiling on what an admin may hand over, so the automatic
    and the typed refund agree about what the gateway is still holding.
  - **All four facts are recorded** - `list_price_paise`, `discount_paise`,
    `discount_source`, `discount_reason` - because a discount implemented by
    simply charging less leaves the books unable to tell "we sold this
    cheap" from "we discounted it", and that difference is the one number
    that decides whether an offer continues. `amount_paid_paise` keeps its
    existing meaning: what was collected.
  - **`sumDiscountsGiven` is reported, never deducted.** A discount means
    less was collected, so it is already inside gross revenue as a smaller
    number; subtracting it from operating profit would count it twice and
    understate profit by exactly the amount given away. It sits on Money →
    Costs as a stated figure answering the question no revenue line can -
    what buying those patients cost.
  Every **configured** amount - the offer, a promo code, either invite half
  - is floored at **zero**, and a total of zero is a free booking rather than
  a gateway order. That floor used to be `MINIMUM_CHARGE_PAISE`, which meant
  a clinic advertising a free first session charged ₹1: the quote-versus-
  charge bug again, in the place it matters most. The constant now means only
  "the least a Razorpay order may be" and `isGatewayPayable` is the test
  callers use to choose between paying and
  `/api/appointments/confirm-free`. A goodwill
  amount at or above the session price is **refused** instead - that one is a number a person typed with the price
  on screen beside it, so more than the price is a typo, and quietly
  charging ₹1 because of it is far worse than saying no.

- **One resolution, three callers, and a total of zero is free.**
  `src/lib/checkoutQuote.ts` is the only place a booking's price and
  discounts are worked out, because three things need that answer and must
  not be able to disagree: `/api/appointments/quote` (what the payment screen
  prints), `/api/razorpay/create-order` (what the patient is charged), and
  `/api/appointments/confirm-free` (what happens when there is nothing to
  charge). Before it, `BookingWizard` printed the category price on its own
  Pay button while create-order silently resolved a first-session offer
  behind it, so a patient owed ₹499 read "Pay ₹1,200 Now" and watched a
  different figure open in the Razorpay sheet.
  **A quote may be unidentified, and that is the case that matters.** At step
  3 a self-signup patient has no account yet - the account, the booking and
  the payment are all created by one tap further down the same screen - and
  that visitor is exactly who a first-session offer is for. So
  `/api/appointments/quote` and `/api/patient/promo-code/preview` both accept
  a **category-only** request with no session, answering for a new patient:
  the offer applies, and the three things needing an identity (a goodwill
  adjustment, an invite half, a promo code's per-patient cap) are simply not
  part of it. Naming an actual booking still requires being its patient. It
  is never authoritative - the wizard re-quotes against the real appointment
  the moment the account exists, and `create-order` resolves everything again
  under a row lock - so the worst an anonymous quote can do is promise
  something checkout then reports rather than silently charging. Refusing
  these callers, which is where this landed first, means showing list price
  and charging the offer: the same bug, on the one path the offer exists for.
  It has two modes and the difference is only whether anything is claimed:
  `claim: false` is a read (being a moment stale costs nothing, nothing has
  been promised), `claim: true` claims the promo code under
  `claim_promo_code()`'s row lock, attaches an invite half, and releases
  whichever candidate lost.
  **A free booking never touches a gateway.** Five rules hold
  `/api/appointments/confirm-free`:
  1. **The browser never says it is free.** The route re-resolves everything
     through the same module and answers 409 when `isGatewayPayable` is still
     true. A route that trusted a `free: true` flag would be a way to book
     anything for nothing.
  2. **No `payments` row.** That table is the record of money that moved,
     keyed on Razorpay's own order and payment ids; a collection of zero has
     neither, and inventing them would put a fiction in the one place the
     books are reconciled from.
  3. **`amount_paid_paise = 0` with all four discount facts**, written inside
     the same claim, so the giveaway is still nameable and a fact can never
     be recorded against a booking whose claim was lost.
  4. **Idempotent by that claim.** A double tap finds the row paid and
     answers success rather than confirming twice.
  5. **Everything else still happens** - auto-assignment, the Meet event, the
     invite halves settling, the patient's approval. A free session is a
     session, and `confirmPaidAppointment()` is that sequence shared with
     `/api/razorpay/verify` so the two cannot drift.
  `create-order` answers a zero total with `409 {free: true}` rather than
  minting an order Razorpay would refuse, and `payForAppointment`'s `onFree`
  callback turns that into the confirmation - so a quote that goes stale
  between render and tap still lands correctly instead of erroring.
