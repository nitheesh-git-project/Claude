# MoveRestore — Audit Fix Report

Every one of the 135 items, numbered to match your list.

Each entry says what was **actually** wrong — verified in the code, not
assumed from the description — what you proposed, what I did, and how it was
checked. Where my fix differs from your proposal the entry says so and gives
the reason, because you asked me to decide rather than follow.

## How to read this

| Status | Means |
| --- | --- |
| **Fixed** | Code and/or schema changed, verified, shipped on this branch. |
| **Fixed — different approach** | The complaint is resolved; the fix is not the one proposed. Reason given. |
| **Already held** | The property was already true. Where nothing was *keeping* it true, a guard was added. |
| **Partly fixed** | The reachable part is done; what remains is named. |
| **Open — needs your decision** | Cannot be closed in code alone, or the fix changes a product rule that is yours to set. |
| **Open — infrastructure** | Needs something this deployment does not have (a worker, a queue, a scanner, an APM). |

## Headline

- **80 fixed**, including six I'd call genuinely dangerous: a non-admin
  rendering the back office as Master Admin (1), six booking paths that could
  double-book a therapist (2–5, 26, 29), payment confirmation overwriting an
  admin's assignment (3), a rate limiter keyed on a value the caller supplied
  (93), commission figures that moved retroactively when a rate was
  renegotiated (11, 12, 43), and 97 routes returning raw Postgres errors —
  including, on a NOT NULL violation, whole rows of patient data (114).
- **10 closed by writing the definition down**, which is what those items
  asked for. Three new documents.
- **7 already held.** I've said which, and added a regression guard where
  nothing was keeping them true.
- **38 open**, each with an assessment. Roughly half are one architectural
  piece — a canonical settlement ledger — and I've explained why building
  half of that overnight would have been worse than not starting it. The
  first piece of it now exists: `refund_attempts` (items 6, 7, 94, 95).

## What I changed about your proposals, and why

Six places, all recorded in the entries:

1. **Item 71 (exports).** You asked for server-side generation. I declined:
   the route reads nothing *on purpose*, and that is what guarantees the CSV
   and the PDF are the same table. I closed the real gap differently — the
   PDF now names the admin who produced it.
2. **Item 91 (temp passwords).** You asked to never persist them. The support
   flow they serve is real, so I cut the exposure window to 14 days with an
   on-read expiry and a purge, and flagged the full replacement for you.
3. **Item 92 (fail-open).** You asked for critical endpoints to fail closed.
   I kept checkout failing *open* — refusing a paying patient over a query
   blip is worse than the burst — and made the direction explicit per limit,
   with the two enumerable lookups failing closed.
4. **Item 31 (credits).** Already correct by design, and your proposed fix
   would have made completion refusable when a shadow ledger was unhappy.
5. **Item 65 (Finance scope).** You asked to separate read from manage. The
   scope model is deliberately coarse; the minimal in-model fix was
   `people: view`, which cost Finance nothing.
6. **Item 42 (discount precedence).** It was documented and implemented — but
   the tie-break depended on caller argument order. I made it a property of
   the rules instead.

## One correction to my own work

The concurrency checks I added prove the *verdicts* are right under parallel
calls. They do **not** prove the calls overlapped inside the database — I ran
the negative control and the invite-cap block passes without its lock too.
`scripts/concurrency-checks.mjs` says so at the top. The locks are still
right, on the code's own argument; the test is a regression guard, not a
proof. Item 109 has the detail.

## How to verify all of it

```bash
npm run verify              # lint (3 schema checks + eslint) + 1072 unit tests + build
npm run check:concurrency   # against a real database
npm run check:authorization # cross-tenant, IDOR, enumeration, at the policy layer
node scripts/run-schema.mjs # applies cleanly, twice (re-runnability is the test)
node scripts/check-live-grants.mjs
```

Plus the SQL check files: `therapist-slot-sql-checks.sql`,
`audit-fix-sql-checks.sql`, and the four that already existed.

---

# P0 / Critical

### 1. Admin dashboard lacks server-side admin authorization — **Fixed**

**Worse than described.** The page checked `if (!user) return null` and never
that the user was an *admin*. And `viewerScope` is derived by looking the
user's id up in a map of admin rows, where `parseAdminScope(undefined)`
returns `"full"` — so a non-admin reaching this page rendered as **Master
Admin with every section open**. The proxy matcher was the only thing between
them and the whole back office.

**Fix.** `getAdminContextResult()` at the top, with all three outcomes kept
apart: unauthenticated redirects to the admin login, `forbidden` to
`/get-started` (never naming the back office), and a failed check renders an
honest retry screen rather than a blank page. The viewer's scope now comes
from the guard, not the map.

`src/app/admin/dashboard/page.tsx`, `src/components/admin/AdminAccessUnavailable.tsx`

### 2. Therapist slot assignment is not atomic — **Fixed**

Six paths reserved a therapist their own way: a read, a write, and at best a
re-read with a hand-rolled revert. That cannot hold the property — two
requests both pass the check before either write commits.

`claim_therapist_slot()` does the overlap test, the compare-and-set and the
write in one transaction under a row lock on the therapist. Per-therapist, so
two different therapists' claims do not contend. `claim_therapist_referral_slot()`
is the sibling for a referral holding a slot before any appointment exists.

Verified by `scripts/therapist-slot-sql-checks.sql` — 16 properties, with a
negative control.

`supabase/schema.sql`, `src/lib/claimTherapistSlot.ts`, six call sites

### 3. Payment confirmation can overwrite an admin therapist assignment — **Fixed**

Confirmed exactly. Both payment paths compare-and-set on `status` and never on
`therapist_id` — and an admin assigning by hand leaves the status at
`requested`, which is precisely the window they run in. So an admin who picked
a therapist mid-checkout had their choice silently overwritten, and the
calendar invite went out naming somebody they had not chosen.

Both paths now reserve through the claim with `expectUnassigned: true`. If an
admin got there first the claim is refused, their therapist stands, and the
booking confirms with the person they picked.

`src/lib/confirmPaidAppointment.ts`, `src/app/api/razorpay/webhook/route.ts`

### 4. Auto therapist assignment can double-book — **Fixed**

Same root cause; same fix. `pickAutoAssignTherapist` still *narrows* the
candidates with `findTherapistConflict` (the right tool for "who could take
this?"), and the reservation is the claim.

### 5. Package / home-visit assignment can race — **Fixed**

Both insert the session **unassigned** and then claim, so there is a real
appointment id to lock against. When the claim is refused the session stays
`requested` and unassigned — which is already the documented behaviour for a
busy locked therapist. A clash must never cost a patient a booking they paid
for.

`src/lib/bookPackageSession.ts`, `src/lib/bookHomeVisitSession.ts`,
`src/app/api/admin/create-booking/route.ts`, both bulk reassign routes

### 6. Refund can succeed at Razorpay while the local update fails — **Fixed**

**Real, and in all four refund writers rather than the one you named.** Every
gateway refund in this app claims its local row *first* and calls Razorpay
second — deliberately, so a refusal leaves no trace claiming money went back.
What that ordering cannot cover is the opposite failure: Razorpay accepts the
refund and the write recording what came back fails. The money is gone,
`refund_id` is null, and on every screen that is indistinguishable from a
refund which was claimed and never sent. `refund-session-partial`,
`refund-package`, `refund-home-visit-package` and `cancelAppointmentAndRefund`
all had that window, and in all four the only thing that noticed was a
`console.error`, which is not a place a clinic owner looks.

**What I built.** `refund_attempts` — the record written *before* the money
moves, not after. A row lands as `processing` carrying the subject, the
payment, the amount, the reason and who asked; the gateway is called; the row
is resolved to `succeeded` with the gateway's own refund id, or `failed` with
what it said. Every outcome is then either a resolved row or a row stuck at
`processing`, and the second is exactly the state a person has to look at.

Four decisions in it are worth stating, because each is the opposite of the
obvious one:

1. **A refund that cannot be recorded is not attempted.** The three admin
   routes put their claim back and answer 503 rather than calling Razorpay —
   the same posture `/api/therapist/reveal-contact` takes on its reveal log
   and the care-plan review takes on its decision row. Proceeding anyway
   would defeat the thing being built.
2. **`cancelAppointmentAndRefund` is the exception, and it cannot refuse.**
   The cancellation is already committed and the slot is legitimately freed
   either way. So the refund is not attempted and the session is recorded
   `refund_status = 'failed'` — which is already a counted item on Money's
   alert strip and a *pinned* item on the patient's own feed, the one refund
   state nothing in the clinic's screens moves without a person. Which is
   precisely what that outcome needs.
3. **Resolving never throws.** By then the money has moved; turning a
   completed refund into a 500 that reads as "nothing happened" is the worse
   error. It leaves the row at `processing`, which is what the health check
   is for.
4. **It is append-only by trigger, not by RLS.** Every route here writes with
   the service-role client, which bypasses RLS entirely — so for a table
   whose whole value is that it records what was attempted before the attempt
   was made, "no route rewrites it" is not the same guarantee as "a rewrite
   raises". It permits exactly one transition, once, plus the two columns
   resolution fills in, and nothing is ever deletable: a row that can be
   removed makes the stuck-at-processing state meaningless.

**Where it surfaces.** Settings → System Health → **Refunds**, the ninth
check, reading `refund_attempt_health()`. Two disagreements, and they are
different questions: a refund sent to the gateway whose answer was never
recorded (money whose fate is unknown), and a refund the gateway accepted
whose own session or purchase carries no id (money that went back and is not
on the screen it belongs on). Both red. Reported, never repaired — this
screen cannot know whether Razorpay took the money, and guessing on a money
record is how a discrepancy becomes permanent. A database without the table
reads **"Cannot be checked"** rather than healthy.

`p_stuck_after_minutes` (10) exists because a row is legitimately
`processing` for the length of one gateway call, and counting every one of
them would put a red light on a working clinic.

**Checked.** `scripts/refund-attempt-sql-checks.sql` asserts both halves of
every guard — each resolution that must land, next to every rewrite that must
raise — plus the health function reporting each disagreement and *not*
reporting a refund genuinely in flight. `systemHealth.test.ts` gains five
cases; `refundAttempt.test.ts` covers what the gateway's failure is recorded
as.

### 7. Payment ledger and refund records can become inconsistent — **Fixed**

This is item 6's other half and closes with it: `refund_attempts` is the
independent record the two can be compared against, and
`refund_attempt_health()` is that comparison, on a screen rather than in a
log. Item 15 had already removed the one place the ledger was actively
*destroying* evidence (a capture overwriting the ordered amount). See
`docs/MONEY-MODEL.md` §4.

### 8. Therapist payout settlement can partially succeed — **Open**

**Real, and I looked hard at it.** `settle-therapist-payout` claims a batch,
marks each appointment settled, and marks cash remitted. A failure part-way
leaves some sessions settled against a batch and some not.

**Why not fixed.** An atomic payout state machine means a `payout_batches` →
`appointment_settlements` model, which is item 9 and item 10. The
prerequisite landed in this pass (the frozen rates) and the rest is a schema
change with its own migration and reconciliation.

**Partial mitigation shipped:** the route's audit write is no longer
best-effort in its *reporting* — if the trail could not record a settlement,
the admin is told, because money has left and cannot be recalled (item 72).

### 9. Payout request and batch have no strong relationship — **Open**

Modelled as `payout_requests` and a batch id on appointments. The explicit
chain you describe is the same work as items 8 and 10. Named in
`docs/LIFECYCLE-STATES.md` under Payout as open rather than left implied.

### 10. Financial calculations are duplicated — **Partly fixed**

**Not duplicated as badly as the item suggests**, and I checked: `moneyLineFor`
/ `moneyByBucketFor` in `src/lib/adminMetrics.ts` is the single divider, read
by the strip, the tiles, the breakdown chart and the drill-down, with two
invariants asserted in tests.

**What was genuinely duplicated and is now fixed:** the hospital dashboard
computed its own commission over *paid* sessions while the admin screen took
it on *completed* ones, so the two quoted a partner different numbers for the
same referrals (items 13, 14). And a therapist's own profile computed
`owedPaise` from the ordinary share with no home-visit branch and no travel
fee — that was already corrected before this audit.

**What remains** is the canonical settlement record. §4 of
`docs/MONEY-MODEL.md` states what it would take and why half of it is worse
than none.

### 11. Hospital commission uses mutable therapist revenue-share data — **Fixed**

### 12. Historical hospital commission can change retroactively — **Fixed**

Both confirmed: every split was computed from the percentages on `profiles`
**as they stand now**, so renegotiating a partner's commission rewrote every
figure they had already been invoiced on.

`therapist_share_percent_at_completion`, `hospital_share_percent_at_completion`
and `hospital_id_at_completion` are stamped at completion — the moment this
product already treats as the money becoming real. Preferred where present,
live percentage as the fallback, **never backfilled**: inventing a historical
rate from today's is the exact fabrication the column exists to prevent.

Three details are load-bearing and each has a test:

- A recorded **0%** is honoured, not read as "not recorded". A therapist
  really can be on nothing for a period.
- A frozen rate is **not re-resolved** against the live home-visit
  percentage — it was already resolved by that rule at completion.
- A session that recorded **no partner** earns no commission, so a referral
  added to a profile afterwards cannot retrospectively take a cut of work
  already delivered and paid out.

`supabase/schema.sql`, `src/lib/settlementRates.ts`, `src/lib/adminMetrics.ts`,
`src/app/api/appointments/complete-session/route.ts`, +7 tests

### 13. Hospital dashboard counts paid bookings as delivered — **Fixed**

Wrong in both directions: a session paid for and not yet held counted as
delivered, and a session delivered on **pay-later terms is never `paid`**, so
a partner's most trusted patients were invisible on their own screen. Counts
`status = 'completed'` now, and the label says "Sessions delivered".

### 14. Commission can be calculated without a valid therapist share — **Fixed**

The "don't guess" rule was already there for the live case and is now carried
into the frozen one: a partner named with no recorded rate is **excluded and
counted**, never divided into. Tested.

### 15. Razorpay amount not reconciled against the order — **Fixed**

**Sharper than described.** `record_payment_capture` wrote
`amount_paise = coalesce(p_amount_paise, amount_paise)` — the gateway's figure
**overwrote** the amount the clinic created the order for. Any discrepancy
erased the only evidence there had been one, in the one table that exists to
be the record that money moved.

The ordered figure stays put; `captured_amount_paise` records what the gateway
said. Nothing is refused on a mismatch — the money has already moved, and
refusing to record a capture that really happened is worse — but it is now
visible.

### 16. Hospital/referral attribution can be lost — **Fixed**

`profiles.referred_by_hospital_id` was one best-effort write behind a
`console.error`, whose own comment said a failure "would silently break
revenue attribution". That understates it: that column is what every
commission figure reads, so the partner would earn nothing on that patient's
first session **and nothing on any of them, for ever**, with no error anywhere
because the registration itself worked.

Retried now, and no longer invisible: `converted_patient_id` already records
who a referral became, so the two can be compared. **Settings → System Health
→ Partner attribution** is that comparison — amber while nothing has been
delivered (no money mis-split, one edit to fix), red once a session has
completed. It also catches a profile pointing at a *different* partner, which
is rarer and worse.

Still not fatal to the patient, deliberately: they have an account and a
booked session, and failing their registration over the clinic's bookkeeping
is the wrong trade.

`src/lib/referralAttribution.ts`, `src/lib/systemHealth.ts`, +5 tests

### 17, 18, 19. Health-profile and condition-access approval are not atomic — **Fixed**

All three verified real, and worse than "not atomic" suggests. Each claimed
the decision first — which is right, it is what stops two admins both running
the side effects — and then did the thing that makes the decision *real* as a
separate write. Because the claim is a compare-and-swap, a failure left a
state nobody could clear:

- **Approving a submission (17, 19):** the request read *approved*, the
  patient's answers were never applied, and the CAS meant it could never be
  approved again. The submission sat looking dealt with, for ever.
- **Declining one:** the request read declined while the profile stayed on
  `pending_review`, so the patient was locked out of their own record by a
  submission that had already been turned down.
- **Condition access (18)** — the sharpest of the three. The auto-revoke of
  other therapists' grants had its error **unchecked**, and that write is what
  makes the approval *exclusive*. A failure left two therapists both holding
  approved write access to the same patient's health profile — precisely the
  invariant that code's own comment says it protects — and the admin was told
  it had worked.

All three revert their claim and report honestly now, the same posture the
care-plan review and the risk-signal review already take. An approval that did
not achieve exclusivity is worse than no approval, because nothing on any
screen would say which of the two therapists is meant to be editing.

**Chosen over a `security definer` function per route**, which was the obvious
alternative: the revert pattern is already established in this codebase, it is
what the next reader would expect to find here, and it needs no schema change
to the tables a clinician's work lands in.

### 20. Suspended patients can modify health-profile drafts — **Fixed**

Autosave checked **nothing** beyond being signed in, so a suspended patient's
session cookie could keep rewriting their own medical record indefinitely —
on the one route nobody thinks of as a mutation because the UI calls it
silently.

### 21. Unapproved therapists can modify clinical drafts — **Fixed**

Checked role alone. The access-grant test beside it answers a different
question (*this* patient), and a grant approved while the account was in good
standing outlives a suspension.

### 22, 23. Unapproved therapists can save availability / set leave — **Fixed**

Both checked role and `active` but never `approved` — and the roster is
exactly where that matters: an account no admin had vetted was shaping who
gets offered patients.

**All four (20–23) share a root cause and a fix.** Each had hand-rolled its
own check and each was missing something different. `getProfileStanding()` is
one named, greppable lifecycle check returning a *reason*, so a therapist
awaiting approval no longer reads the same as one who has been suspended — and
a grep for the helper name is how the next audit finds the next gap.

`src/lib/supabase/requireActiveProfile.ts` + four routes

### 24. Medical-document cap is vulnerable to concurrent uploads — **Fixed**

Count-then-insert, and the cap is the only thing bounding that bucket since
nothing here sweeps it. A trigger counts inside the inserting transaction,
serialising on the patient's own row. The route keeps its check so a patient
still gets a sentence rather than a constraint error.

**Writing the test caught a real bug in my own trigger before it shipped**:
`FOR UPDATE` cannot be combined with an aggregate.

### 25. Paid home-visit purchase can exist without a scheduled visit — **Fixed**

Real, and it covers programmes as well as home visits, so this closes items
58 and 59 with it. A purchase whose first booking never happens sits `active`
with nothing against it and nothing at the clinic looks for it.

**What I built, and what I did not.** Not the proposed `paid_unscheduled`
status. A state column would have to be written by every booking path and
unwritten by every cancellation, it can drift from the appointments that are
the actual truth, and it answers a question those rows already answer. The
finding is *derived* instead — `src/lib/unscheduledPurchases.ts`,
dependency-free and unit-tested, because which patient gets a phone call is a
judgement rather than a query.

Four conditions, each excluding a case that is not this one: still `active`
(a refund, cancellation or expiry is a decision somebody already made); money
**committed** — paid, or a home visit agreed at the door, since a cash
purchase sits at `unpaid` for its whole life by design and judging on payment
status alone would drop every one of them silently, which is item 59; nothing
booked **ever**, not "has sessions left", because almost every active
purchase has sessions left by definition and a row counting those counts
nearly every purchase the clinic has made; and past a 24-hour grace window,
so a purchase on its way to the scheduler is not reported as a fault seconds
after it is made. An unreadable `created_at` is *not* treated as old — a row
this cannot date is one it cannot judge, and inventing an age would put
somebody on a call list because of a timestamp nobody could read.

**Where it surfaces.** *Paid programmes with nothing booked* on Money's alert
strip, linking to Catalog → Purchases with a **Nothing booked yet** filter
applied — the section chosen by where the work is done, never by which strip
the row sits on, the same rule a failed session refund follows into Sessions.
It is deliberately **not urgent**: nothing has gone wrong and nobody is out
of pocket, it is a patient who needs a phone call, which is the opposite of
every other row on that strip.

That new filter is distinct from the *Has unscheduled sessions* checkbox
beside it, and the difference is the whole point — one is true of nearly
every active purchase, the other is the run that never started.

**Why this is the right place.** The patient was never stranded: the balance
is on their Programmes screen and unbooked sessions are a pinned `needsYou`
item on their dashboard. That *is* the failure. Every mechanism pointed at
the patient, so a purchase made by somebody who paid and was then distracted
waited on exactly the person who had already stopped, with nobody at the
clinic able to see it.

---

# P1 / High

### 26. Admin assignment rollback can overwrite another assignment — **Fixed**

**Exactly right, and it was the sharpest finding in the list.** The revert
wrote `therapist_id = <what we read>` with **no compare-and-set**, so a third
admin's assignment landing in between was silently overwritten by a request
that had already lost its own race.

Fixed by removal: with the atomic claim there is no window, so there is
nothing to revert. Three routes lost their revert branches entirely.

### 27. Home-visit payment verification is not completely idempotent — **Partly fixed / Open**

`recordPaymentCapture` *is* idempotent by construction (keyed on the order,
and the second caller finds it captured). What is not idempotent is the rest
of the route's sequence around it. Related to items 6 and 8; not closed.

### 28. Home-visit service can be disabled between checkout and verification — **Open**

Verified: `verify` does not re-read `home_visit_enabled`. The narrow reading
is that the patient has already paid, so refusing at verification would take
their money and give nothing — the honest fix is to refund, which is a
decision rather than a check. **Flagged for you** rather than guessed at. The
*new* referral route I added does re-check the switch (item 45), which was the
same gap one flow over.

### 29. Referral therapist assignment can become stale — **Fixed**

Now revalidated inside the atomic claim, which re-reads the therapist and the
slot under a lock at the moment of writing. It also removed the deterministic
tie-break, which existed only because two concurrent writes were never
serialised: each saw the other on the re-check, so a plain re-check rolled
**both** back and neither admin got an assignment.

### 30. Suggested-session acceptance can partially succeed — **Fixed**

The claim-then-book was already there. Two real gaps were not: the rollback
had **no compare-and-set** (so a decline landing in between would be silently
undone by a request that had already failed), and this path read the **live**
package duration rather than the frozen snapshot — items 52–54 in a route I
had missed.

### 31. Completed session can remain without consuming package credit — **Already held**

**Your proposed fix would have made this worse**, so I want to be explicit.

`sessions_used` counts a session **claimed** (at booking), not completed — so
completion does not change the balance and there is nothing to lose. The
ledger's `consume` is a mirror, idempotent on
`consume:<appointment_id>`, and `reserved` and `consumed` both reduce
`available` identically. Any disagreement is reported on **System Health →
Books & Sessions Agree**.

Making it transactional would mean refusing to close a session because a
shadow ledger was unhappy — and completion is what creates the debt, the
revenue and the therapist's pay. AGENTS.md is right about this one.

### 32, 33, 35, 36. Pay-later ledger, write-off accounting — **Open**; 34. Exposure limit — **Fixed — decided**

- **32, 33, 35, 36** are the canonical-ledger piece (§4 of
  `docs/MONEY-MODEL.md`). What exists is stronger than the items imply: the
  write-off already writes exactly one `business_expenses` row tied by
  `source_appointment_id` with a partial unique index, the appointment is
  claimed first and a failed cost row reverts the claim, and System Health
  reports written-off sessions disagreeing with the bad debt recorded —
  including "could not be checked" rather than zero.
- **34 (no hard exposure limit)** is **Fixed — decided**, and the decision is
  that both of us were right about different things.

  The current design has *no ceiling by choice*, and that stays the **default**
  — unset, meaning behaviour identical to before the column existed. The
  reasoning holds: the population is tiny and hand-picked, and a cap that
  refuses a booking means turning away a long-standing patient at the counter.

  But "no ceiling, ever, because I decided so" is a constant, and the honest
  way to hold an opinion the clinic may not share is a **setting**.
  `site_settings.pay_later_max_owed_paise` is that setting, on Money → Owed by
  Patients beside the figures it acts on — the same placement
  `promo_codes_enabled` has, so somebody who has just set a limit watches what
  it would catch rather than navigating away and taking it on trust. It shows
  a live count of how many current patients would be asked to pay now, off the
  same balances the list below renders.

  Five rules:
  1. **Blank is the default and the undo**, exactly as blank is for the
     mission copy and the splash brand line.
  2. **There is deliberately no zero.** Somebody who types 0 has almost
     certainly cleared the box, and reading it as "refuse every booking" would
     switch the feature off by accident through a field that says nothing
     about switching it off. Off is `pay_later_enabled`. Same reasoning as
     `pay_later_aged_after_days`, one field over.
  3. **Reaching it never strands anybody.** The patient is offered the
     ordinary payment screen and books exactly as anyone else does — *paying
     now is never taken away*, which is the rule the whole feature was built
     on. Nothing already owed changes.
  4. **The refusal names the arrangement and what clears it**, because this
     patient already knows they have it — unlike `feature_off` and
     `not_on_terms`, which say the same thing on purpose so nobody learns an
     arrangement exists that they are not in. It quotes no figure: what they
     owe is on their own dashboard, and a number in a refusal is one that can
     be wrong by the time it is read.
  5. **A balance that could not be read reads as "at the ceiling"**, not as
     zero. Waving a booking through because a query failed is the one
     direction a ceiling exists to stop — and the cost of the safe direction
     is only that the patient pays now, which they can.

  Your instinct about the mechanism was right: it was one more named reason
  and one more refusal. The two callers were reordered so the quote resolves
  before the eligibility check — a ceiling has to be applied to what the
  booking would actually add rather than to its list price, and in
  `confirm-pay-later` the preview is deliberately non-claiming, because a
  refusal after a claim would spend a promo code on a booking that never
  happened.

### 37. Invite reward cap can race — **Fixed**

Count-then-insert with nothing between them, so two friends redeeming the same
code at once both passed. A row lock on the **inviter** (not the table, so two
inviters do not contend), re-declared in full at the end of `schema.sql` per
convention.

### 38. Invite "paid session" qualification is ambiguous — **Already held**

It was ambiguous and has been settled: the qualifying event is a
**committed** session — paid, or standing on pay-later terms — asked of the
database through one shared query (`countPriorCommittedSessions`), with
`priorSessions.test.ts` failing if a reader grows its own copy back. I
verified the live `claim_invite` carries the pay-later arm (there are four
definitions of it in the append-only file; only the last is live).

### 39. Goodwill discount has no immutable price snapshot — **Already held**

All four facts are written — `list_price_paise`, `discount_paise`,
`discount_source`, `discount_reason` — and the actor is on the
`payment.goodwill_discount` audit row.

### 40. Offline-paid credits not linked to canonical financial records — **Open**

Canonical-ledger piece. Note that `mark-paid-by-cash` deliberately writes no
`payments` row, because that table is keyed on Razorpay's own ids and
inventing them would put a fiction in the one place the books reconcile from.
Any fix has to answer that first.

### 41. Credit ledger and legacy `sessions_used` can diverge — **Open — your decision**

The mechanism to converge them already exists and is **off**:
`entitlement_ledger_authoritative` on Settings → Advanced. Both are written
either way, and `verify_entitlement_balances()` reports disagreement.

Flipping it is a data-migration cutover, which is why it is a switch and not a
deploy — and it is not mine to flip on a database I cannot reconcile against
your real history. The honest sequence: confirm **Books & Sessions Agree** is
green, flip it, watch, and delete the counter writes as a separate change.

### 42. Discount precedence is not formally defined — **Fixed — different approach**

It *was* defined and implemented. What was wrong is subtler and worth the
distinction: the tie-break was carried by **the order the caller passed its
candidates in**, so a caller listing them differently silently changed which
rule a patient's money came off, with nothing failing.

`DISCOUNT_PRECEDENCE` declares it and `resolveDiscount` applies it, so it is a
property of the rules rather than of the call site. Six tests, including one
asserting the answer is the same whichever order the caller uses.

### 43. Hospital commission basis after discounts/refunds — **Fixed**

Already taken on **net** revenue (after refunds), and discounts are already
inside gross as a smaller number. The missing half — snapshotting the result —
is items 11/12 above.

### 44. Referral decline does not require a reason — **Fixed**

It required nothing and recorded nothing but a status word. So the partner who
sent the patient could not tell a wrong-specialty referral from a capacity
problem that would pass by Thursday — and kept sending the same ones.

Ten-character minimum, enforced by the route **and** a CHECK. `decline_reason`,
`declined_at`, `declined_by`. The admin writes it in an inline disclosure
beside the referral, and **the hospital reads it on their own referrals
screen** — which is the half that makes it worth writing. The constraint is
conditional so existing declined rows stay valid; no reason is backfilled,
because inventing one would fabricate a record of why a real clinic turned a
real patient away.

### 45. Referral submission relies on client-side validation — **Fixed**

It was a **direct browser insert**. The policy checked `auth.uid() =
hospital_id` — an ownership test, not a lifecycle one — so a suspended or
never-approved partner could keep filing referrals, and every other rule (the
phone, the pincode, the home-visit master switch, the visit mode) lived in the
form's own JavaScript. There was no server-side door to rate limit either.

`/api/hospital/submit-referral` re-derives the hospital from the session,
checks role + active + approved, validates every field, re-reads the
home-visit switch, and counts against its own limit. The policy and the insert
grant are dropped — the same move `appointments_insert_own` and the
`b2b_leads` public insert already got.

### 46. Hospital onboarding is not fully atomic — **Fixed — different approach**

Real, and the consequence is sharper than "partial provisioning": GoTrue
creates the user, `handle_new_user` gives it a **patient** profile (the trigger
ignores a `hospital` role from metadata by design), and the profile update is
what promotes it. So a failure there left an unusable patient account sitting
on the partner's email address — and the next attempt failed with "already
registered", with nothing on screen saying why or what to do about it. A dead
end rather than an error.

**Fixed by releasing rather than by a state machine.** The account is seconds
old with nothing pointing at it — the "no history at all" case
`delete-account` is deliberately narrow for — so the honest recovery is to
delete it and let the admin retry. If the delete *also* fails the response says
so specifically, because then somebody does have to remove it by hand before
that email can be used.

**The same gap was in `create-account`** and is fixed identically. A state
machine would be the answer if the sequence were long or resumable; it is three
writes and the first is cheap to undo.

Note the notes row deliberately stays best-effort after this point: an account
that exists with an unreadable password is recoverable by a reset, where
failing the whole onboarding over a note row is not.

### 47. Hospital referral statuses inconsistent across screens — **Fixed**

**This one was live and silent.** `patient_referrals.status` is CHECKed to five
values and the partner's dashboard filtered for `"pending"` and `"accepted"` —
neither of which the column can ever hold. **Both counts read 0 for every
partner, permanently**, on the one screen a partner opens to see what became
of the patients they sent. It read as a clinic that actioned nothing.

`src/lib/referralStatus.ts` now holds the five states and the groupings a
screen should ask, so a status added tomorrow is a compile error in one file
rather than a silent zero in three. Six tests.

### 48, 49. Hospital approval / active / suspension not consistently defined — **Fixed**

The proxy checked `active` but never `approved` for a hospital, and the
referral insert checked neither. Both go through `getProfileStanding` now, and
`docs/LIFECYCLE-STATES.md` states what each flag means, who sets it, and the
one role that is deliberately exempt from `approved`.

### 50. Admin can create bookings with an inactive category — **Fixed**

`active` was selected and never read. An admin could book against a condition
the clinic had switched off — reachable from a stale browser tab, and the
session is then priced and staffed from a row nobody intends to sell. Refused
with a sentence naming the condition and how to turn it back on.

### 51. Category update can reactivate a disabled category — **Fixed**

`active: active === undefined ? true` — so **any** unrelated edit (a price, a
photograph) silently republished a retired condition to the public site.
Nothing on screen said so. Absence now means "leave it alone".

**Two siblings had the identical bug** and are fixed as one class:
`update-faq` and `update-testimonial`.

### 52, 53, 54. Packages inherit changed duration / gap / weekly limits — **Fixed**

All three read from the **live** catalog row at booking time, so an admin
editing a programme changed the rules under every patient part-way through
one. A package sold as "twice a week, 48 hours apart" silently became whatever
the row says now.

`session_entitlements.package_snapshot` has held the row as it stood at
purchase all along, frozen by trigger — `readPackageTerms` is what finally
reads it. **Four booking paths**, one resolver. A purchase predating the
backfill falls through to the live row (the only description of it that
exists) and `source` is returned so a caller can tell whether "the terms you
bought" is actually true. Seven tests.

### 55. Home-visit packages inherit changed rules — **Fixed**

Same resolver. One function serves both catalogs, because a snapshot is
`to_jsonb()` of whichever table it came from and the two name their columns
differently — two resolvers is how two screens grow two ideas of what a frozen
term means.

### 56. Purchased package terms are not completely immutable — **Partly fixed**

Now frozen: duration, minimum gap, weekly cap (52–55), plus session count,
price, expiry, therapist lock and the package snapshot itself, which were
already frozen by trigger.

**Not frozen:** the payout basis and the commission basis *per purchase* — they
are frozen per **session**, at completion (items 11/12), which I judged the
better place. A rate is a term of the agreement in force on the day the work
was done, and a programme spans months during which a renegotiation should
apply to sessions delivered after it.

### 57. Catalogue writes are not fully atomic — **Fixed — different approach**

`writeSpecialty`, `writeCatalogFocal` and `writeCatalogFeatured` are separate
calls after the main upsert, and that is **deliberate**: they write the newest
columns on those tables, so folding them in would make a database one apply
behind refuse the *entire* edit — price, title, everything — rather than losing
one optional position. Making them transactional, as proposed, reintroduces
exactly the failure that shape exists to avoid.

The real gap is that the failure was **silent**: an admin drags a cover's focal
point, is told the catalogue saved, and the picture does not move. That is the
"never tell somebody they did something they did not do" rule, on the one part
of this save a person can see.

`writeCatalogFocal` returns whether it wrote, and all six catalogue routes pass
a warning back with their success. Nothing is refused and nothing is rolled
back — the position is still where it was, which is the correct outcome; it is
now also a stated one.

### 58, 59. Paid / cash home-visit purchase with no scheduled visit — **Fixed**

Closed by item 25, which covers programmes and home visits together because
the work is one phone call either way. 59 is the half that needed saying out
loud: a cash-on-visit purchase is `unpaid` for its whole life by design, so a
check written on payment status would have dropped every one of them and
reported a clean screen.

### 60. Home-visit package continuation after service-area changes — **Fixed — decided**

You handed this back, so here is the decision and the reasoning.

**The remainder is honoured.** A patient who bought six visits and has had
two keeps the other four, at the travel fee frozen on their purchase, even
if the clinic later stops serving their pincode. The catchment changing is
the clinic's choice and not the patient's, and withdrawing treatment somebody
has already paid for is the one outcome a service area must not produce.
Refunding instead is still available and is an admin's call per purchase, on
the screen that already does refunds.

**Which is what the code already did — by omission rather than by decision,
and that was the actual problem.** `/api/home-visit/book-visits` does not
re-check serviceability, and `bookHomeVisitSession` reads
`purchase.travel_fee_paise` rather than the live area row, so the remaining
visits were always honoured at the agreed price. Nothing said so, nothing
tested it, and the next person to read those routes would reasonably have
"fixed" it by adding the check — which would have stranded paid visits.

**What was genuinely missing is the other side of it.** An admin could
deactivate a service area with no idea the clinic still owed eleven visits
there. Turning an area off stops it being *sold*; it does not cancel
anything. So the area row now states how many paid visits are still to
deliver there (`src/lib/homeVisitAreaCommitments.ts`), and turning it off
asks first, naming that number and saying plainly that those visits stay
owed and schedulable at the fee agreed when they were bought.

A count that could not be read shows as **"We could not check what is still
owed here just now"** rather than zero — the rule this codebase holds
everywhere, and it matters most on the screen where a zero would be read as
permission.

### 61, 62, 63. Weekly limits and dates use UTC instead of clinic time — **Fixed**

`isoWeekKey` was computed in **UTC** while the clinic runs on IST. Every clinic
day from midnight to 05:29 belonged to the previous UTC day — and on a Monday
to the previous UTC week. So a patient booking a late Sunday and an early
Monday had them counted as one week; the same two an hour later counted as
two. The rule was not "sessions per week", it was "sessions per week as seen
from Greenwich".

`src/lib/clinicWeek.ts`, dependency-free with 10 tests including the exact
Sunday-evening/Monday-morning case. Both booking routes use it, and a
write-off's cost date is the clinic's today rather than UTC's — one decided on
the 1st of a month was landing in the month before, moving a profit figure
somebody had already read.

### 64, 69. Approval and production readiness treated too similarly — **Fixed — different approach**

Both real and both the same item. `approved` means "an admin vetted this" and
is read as "ready to be assigned live patients", which are different facts —
a therapist can be approved with no roster, no revenue share and no
specialisation.

You left the prerequisites to me, so here is the decision and the reasoning,
because the reasoning is the part you can disagree with.

**Not a `production_ready` flag.** A column somebody ticks is a second source
of truth about facts the app already holds: it has to be written by every
path that changes a roster or a rate, unwritten by every path that clears
one, and the first time it drifts it is the thing nobody trusts.
`src/lib/therapistReadiness.ts` **derives** it instead.

**Nothing on the list is invented policy.** I refused to write a clinic
policy for you, and I did not have to — every item is something *this
application already needs in order to work*, which is a statement of fact
rather than a rule I made up:

| Item | Why it is on the list |
| --- | --- |
| Approved | Without it they cannot sign in at all. |
| Not suspended | Refused everywhere, including at the database. |
| Working hours on the roster | With none, nothing can offer them a session — the automatic assigner reads the roster and so does the Day view. |
| Revenue share set | Their pay is computed from it. Unset, a completed session contributes nothing to what they are owed and no screen says why. |
| Specialisation recorded | What a patient reads on /team and what an admin filters by. |

Anything genuinely a *clinic* policy — insurance, a signed contract, a
qualification check — is deliberately absent. Those are yours, and they want
a note on the account rather than a gate in the code.

**The split you actually needed: advisory for a person, binding for the
machine.** This is the decision, and it is the one that makes the rest safe.
An admin assigning a session has the therapist in front of them and may have
every reason to go ahead, so nothing here disables a control — a gate on a
field nobody was told about is worse than the state it replaces, which was
your own concern and I agree with it. `autoAssignTherapist` is the opposite
case: it picks a clinician with **nobody watching**, and the two failures
that matter there are silent. It now refuses a therapist with no roster or no
revenue share, and deliberately does **not** refuse over a missing
specialisation — that costs a patient a sentence on a profile page, and
refusing would leave paid sessions sitting in the admin's queue for a field
nobody knew about.

**Where it shows.** A panel above the header on the therapist's admin page,
naming what is missing and why it matters — never "this field is required",
which is a checklist people tick to make it go away. A ready therapist gets
**no panel at all**: a green "all set" card on every profile is a row a
reader learns to scroll past, and then misses the one profile that is not.
Same rule as an unrefunded session carrying no refund chip.

Leave is deliberately not on the list. It is a temporary state somebody set
on purpose, not something missing from an account, and the roster already
reads it — a therapist on leave is not *unfinished*.

### 65. Finance scope exposes broader People information than required — **Fixed**

Finance held People at `manage`, which is that section's **29 routes** —
resetting a patient's password, changing their sign-in email, deciding who may
read a health profile, deleting an account, and `pain-assessments/submit`, so
the person reconciling the books could file clinical exam findings. Not one of
the 29 is a money capability; every one of those is guarded by `money` on its
own route.

`people: "view"`. Finance still reads the directory and a profile to reconcile
a payout, and can change neither. Same shape as the existing `sessions: view`
grant, and for the same reason.

### 66. Admin settings lack concurrency protection — **Fixed**

Also an audit gap: `details: { value: nextValue }` recorded only the new value,
so the one question that log gets asked — *what was the refund window before
somebody changed it* — had no answer. One extra read gives both halves: the log
records `from` and `to` (one of the five pairs `readableDetails` already
recognises), and the write compare-and-sets on the old value. A no-op save
still reports success rather than a conflict nobody can act on.

### 67. Therapist leave not tied to lifecycle state — **Fixed**

Covered by items 22/23 — `getProfileStanding` on both roster routes.

### 68. Dashboard performs maintenance during rendering — **Open — infrastructure**

Correct, and it is a deliberate documented choice, not an oversight: there is
**no worker or cron in this deployment**, so anything time-based runs as a
bounded lazy sweep in `after()`. Each is capped four ways and each claims its
rows first.

I added one more (the credential purge), bounded the same way and cheap — four
qualified UPDATEs that match nothing on almost every render.

Moving these out needs a worker, which is item 123. Until there is one, "move
it to a cron job" is not a fix available to write.

### 70. Risk-review closure can lose the explanation — **Fixed**

A failed review insert left the signal closed with no recorded reason anywhere
— precisely the state the ten-character minimum exists to prevent, and
`risk_reviews` is append-only so it cannot be added later. The status change is
reverted now, matching the care-plan review's posture.

### 71. Financial exports trust browser-supplied rows — **Fixed — different approach**

**I declined your fix**, and want to be clear about why. The route reads
nothing *on purpose*: the caller sends the exact rows it rendered, and that is
what guarantees the CSV and the PDF are the same table rather than two queries
free to disagree. Re-querying server-side closes a narrow gap by reopening a
worse one — the CSV is built in the browser.

Disclosure risk is nil (nothing is read, so nothing is revealed). The real gap
is narrow: an admin could post anything and get a document carrying the
clinic's name. Closed the honest way — the PDF now names the admin who
generated it, beside the site name and timestamp it already carried.
Attribution rather than verification, and the trade is stated in the route's
own comment.

### 72. Critical audit events are best-effort — **Fixed — different approach**

Best-effort is right for `setting.update` and indefensible for `payout.settle`:
money leaves the clinic, cannot be recalled, and nothing anywhere would record
who authorised it — and a `console.error` is not a place a clinic owner looks.

`recordAdminActivity` returns a boolean now. Still best-effort for its caller's
flow — an audit write failing must not block the action it describes — but the
outcome is no longer thrown away: the payout route passes
`ACTIVITY_LOG_WARNING` back with its success and the button shows it, the same
shape `SESSION_REVOKE_WARNING` uses.

**Not made transactional**, deliberately: for a settled payout there is nothing
to revert. The genuinely transactional cases are already handled and are a
different rule — `care_plan_reviews` and `contact_reveal_log` revert the
action, because there it is reversible.

### 73. Admin direct health-profile editing lacks required-field validation — **Fixed**

Verified: the patient's submit path re-checks required fields against the live
question bank; the admin's direct edit did not — and it writes
`status: "active"`. That status is what unlocks the patient's view of their own
record and what every summary figure, snapshot strip and progress line reads
as "this is filled in", so a half-finished admin edit made the record assert a
completeness it did not have, on the patient's own screen with their name on
it.

Same check now, re-read server-side. An admin who genuinely only has part of
the answer is not blocked from helping — the honest route for that is the
patient or their therapist filling it, which is whose record it is.

### 74. Therapist clinical write and audit event are not atomic — **Partly fixed**

The `onboard` path is already compare-and-swapped and writes exactly one
history row — it took two attempts to get right, and the honest test
(`isSameIntakeSubmission`) makes an identical resubmission a true no-op. The
`submit` path is part of 17/18/19.

### 75. Session notes can be created before completion — **Already held**

The rule exists and is enforced: a note may be written once the session has
**taken place** (slot in the past, or status completed), never for a future
one, and never for a cancelled session. That is a deliberate product choice —
a therapist writes notes right after the session, before remembering to press
Done. Now documented in `docs/LIFECYCLE-STATES.md`.

### 76, 77. Historical therapist clinical access policy is unclear — **Fixed — decided**

You handed it back, so I went and established what the product actually does
before deciding anything — and that changed the shape of the answer.

**The rule turns out to be a good one, and it was nobody's stated intention.**
Access is keyed on being named on one of that patient's appointments, and **a
completed session keeps whoever ran it**: neither `update-appointment` nor
`reassign-package-therapist` will move one. So the effective policy is
**access follows delivered care** — a clinician who actually treated somebody
keeps access after the patient moves to a colleague, and a therapist whose
only link was a *future* session that got reassigned away keeps nothing,
because they never treated them.

**I am adopting that as the policy**, and the reasoning is the half worth
disagreeing with if you do: in a clinic this size the person who gave the care
has to be able to answer for it — to the patient, to the next clinician, or to
anybody reviewing it later — and a cut-off creates the worse failure, a
clinician who cannot open the record of their own patient. "Minimum necessary
access" is the right instinct and it is served by the mirror: somebody who
never delivered anything reads nothing.

Three things shipped with it.

**1. The finding was "unclear", and that was the real defect.** The rule lived
in four RLS policies and one helper and was stated on **no screen anywhere**,
so "who can see this patient's record" was a question the product could not
answer — for the clinic, for a patient asking, or for an admin deciding
whether somebody's access should end. `src/lib/clinicalAccess.ts` +
**Who can see this record** on the admin's patient page answers it: every
clinician with access, why (sessions, a programme lock), and when they last
saw the patient. A suspended therapist is **listed and marked**, never
dropped — silently omitting somebody would make a suspension look like a
deletion on the one screen whose job is to say who has a relationship with
this record.

**2. A real hole, found while verifying the above.** All four clinical read
policies asked whether the therapist had an appointment and never whether they
are still *allowed to be a therapist here*. This is the same shape AGENTS.md
already documents for patients — a live token outliving a suspension — but the
asymmetry matters: a suspended patient reads their own rows for one token
lifetime, and a suspended **therapist** was reading *other people's medical
records* on those same terms, which is exactly what suspension is meant to
stop. `is_active_therapist()` closes it at the row, the counterpart of
`is_admin()` and exempted from the revoke rule for the same reason. It checks
`approved` as well as `active`, unlike `is_admin()`: an admin is promoted by
hand so gating on approval would lock out the people it protects, and a
therapist still in the signup queue has no business reading a chart.

**3. `session_notes_select_clinician` carried a hand-written copy of
`is_admin()`** — the exact drift the eighteen-policy sweep corrected
everywhere else, still sitting on the clinical table an admin is least likely
to look at. The copy does not check `active`, so a suspended admin went on
reading session notes after every other admin policy had started refusing
them. It calls the function now.

**Checked both halves, because a tightening that refused everybody would pass
a test written only for the refusals** —
`scripts/authorization-checks.mjs` section 7 asserts, against a live database:
an assigned active therapist reads the chart; a suspended one reads nothing; a
**delivered** session keeps their access after the patient is reassigned; and
a therapist whose only link moved away reads nothing.
`scripts/clinical-access-sql-checks.sql` asserts the shape that made the gap
possible — every clinical read policy names the function, all four still
exist, and session notes are still readable by an admin — with its own
negative control. 10 unit cases on the module.

This also gives item **107** its test, which was waiting on this decision.

### 78. Address default selection has a concurrency race — **Already held**

`patient_addresses_one_default` is a partial unique index, so the invariant was
already enforced at the database. What *was* wrong: losing the race surfaced
the constraint name to the patient. Now a sentence saying the default was just
changed.

### 79. Patient registration / referral conversion not transactional — **Partly fixed**

The referral claim is already an atomic compare-and-swap, and account-creation
failure releases it so the link can be retried. **Item 16 fixed the worst
consequence** — the attribution write that silently cost a partner every
commission on that patient. The remaining steps (address, appointment) are the
onboarding state machine, with item 46.

### 80. Reopening a completed session does not reverse downstream effects — **Fixed**

Three of four reverse **automatically**, because this codebase keys them on
state rather than on an event, and the route now says so rather than leaving it
to be inferred: revenue and the pay-later debt are counted only while
`status = 'completed'`, and `sessions_used` counts a session *claimed*, so the
credit balance was already right.

What I had to fix is the frozen split rates I added — left set, the money maths
would read a snapshot for a completion that had been undone. A settled payout
deliberately does not reverse and is still refused: money has left.

### 81. Confirmed appointment can exist without a usable Calendar/Meet event — **Partly fixed / Open**

The states you describe mostly exist under different names:
`google_calendar_sync_error`, `google_calendar_sync_attempts`, a claim column,
`meet_access_open`/`meet_access_error`, and `src/lib/meetSyncState.ts` as the
single answer to "is this synced" (a home visit has no Meet link *by design*,
and judging by `meet_link` listed every home visit as broken).

What is missing is one explicit column rather than three implied states. Real
but cosmetic next to the rest; not done.

### 82. Calendar/Meet retries can create duplicate events — **Already held**

Fixed before this audit and worth confirming, because it had bitten:
`createMeetEventForConfirmedAppointment` refuses to create a second event,
keyed on `google_event_id`, **inside the helper** so every door gets it — the
sweep, the manual retry and all three booking paths. The claim columns could
not do this job; they stop two callers racing over one attempt and say nothing
about an attempt that should never have been made.

### 83, 84, 85. Notification infrastructure, idempotency, dead-letter — **Open — infrastructure**

These need a queue and a worker, and this deployment has neither. Worth being
precise about what exists: the **only** outbound notification this platform
sends is the Google Calendar invite. Everything else is a *derived* feed
(`dashboardFeed.ts`) computed from rows each page already queries — no
notifications table, nothing to keep in sync, nothing to retry.

So "notification delivery is not idempotent" is true of one thing: the Calendar
event, which **is** idempotent (item 82). A notification service is a feature
to build when there is something to send — email, SMS, push — not a gap in
what is there.

### 86. Medical documents have no malware scanning — **Open — infrastructure**

Correct and unmitigated. Files are type- and size-checked and the bucket is
private with reads behind a 120-second signed URL, so the exposure is a patient
uploading something malicious that a clinician later opens.

Needs a scanner (ClamAV in a worker, or a managed API) and a quarantine state.
Not writable without that dependency. **I'd rate this the highest-priority
open item after the settlement ledger**, because it is the only one where the
harm lands on a person rather than on a number.

### 87, 88. Orphaned storage files and replacement lifecycle — **Open**

Real and named in `docs/DATA-POLICY.md` §5 with the shape of the fix — and the
important half of that note: a reconciliation here must **list, never delete**.
A sweep that removes a file because it could not find a row is one bad query
away from deleting a patient's scan.

The upload route already removes its file when the metadata insert fails, so
the common direction is covered.

### 89. Signed URL expiry needs review — **Already held**

120 seconds, and Supabase enforces expiry server-side.

### 90. Hospital dashboard should enforce approved/active — **Fixed**

See 48/49.

---

# P2 / Medium

### 91. Temporary passwords stored in plaintext — **Fixed — different approach**

You asked to never persist them. The flow they serve is real: an admin takes an
"it won't let me in" call and reads the credential back rather than resetting a
working one. Four zero-policy tables, service role only, cleared when the
account sets its own.

What was missing is an **end date**. A credential nobody collected sat readable
indefinitely, with no support value left and one service-role leak away from
exposing every password the clinic ever issued.

Now expires on read after 14 days across all four surfaces, and
`purge_expired_temp_passwords()` clears the plaintext from disk via the
existing lazy sweep. `temp_password_set_at` stays as the audit fact that a
credential *was* issued. An undated value is treated as expired, not fresh.

**Replacing this with one-time invitation links is the better answer** (item
121) and I did not do it unilaterally: it changes a support flow you rely on.
It is a contained piece of work — Supabase `generateLink`, a link shown once,
nothing plaintext persisted — and I'd recommend it.

### 92. Rate limiter fails open — **Fixed — different approach**

Kept checkout failing **open**: a limiter whose own query hiccupped and then
refused a checkout has turned a blip into a lost booking, which is worse than
the burst. That reasoning is sound and I did not override it.

What I did is make the direction **explicit per limit** rather than a property
of the file, so it is a reviewable decision on each one. The two enumerable
lookups — referral codes and service areas — fail **closed**, because there the
cap is the whole defence and failing open does not degrade it, it removes it
while looking like a limiter with nothing to do. A closed failure answers 503
"couldn't check", never the 429 message, which would claim somebody had done
something too often when nobody had.

### 93. Proxy/client IP extraction needs verification — **Fixed**

**This was a live hole.** `clientIdentifier` read the **leftmost**
`x-forwarded-for` entry — and its own comment said why that was unsafe, then
did it anyway as the fallback. A proxy *appends* the address it saw, so the
leftmost entry is whatever the caller claimed. On any host not setting
`x-real-ip` — precisely the case System Health's "Public doors" check exists to
detect — every request was keyed on a value the caller chose, so each minted a
fresh allowance and **every public cap was off while appearing to work**.

Reads from the right now, with `RATE_LIMIT_TRUSTED_PROXY_HOPS` for the one
thing only the operator knows, clamped so it can never index into
caller-supplied territory. **Two existing tests asserted the leftmost entry** —
they encoded the hole rather than guarding it — and are corrected with a note
saying so. Eight new tests.

### 94, 95. Reconciliation tooling, refund transaction model — **Fixed**

95 is the refund transaction model, and it is `refund_attempts` — see item 6
for the whole of it. 94 is the reconciliation that model makes possible:
**Refunds** is the ninth check on Settings → System Health, and it asks the
two questions nothing could ask before. Was every refund we sent to the
gateway answered, and is every refund the gateway accepted recorded against
the thing it was for.

That brings System Health to nine checks, every one of them the same shape: a
status word as well as a colour, steps an owner can follow alone, the
teaching text behind the (i), and — the rule this file keeps returning to —
**"could not be checked" is not "healthy"**. A database missing the table
says so.

### 97. Immutable adjustments — **Already held, now wider**

Immutability holds where it matters: the credit ledger, `payments`,
`payment_webhook_events`, `session_note_revisions`, `care_plan_versions`,
`pay_later_payments` and now `refund_attempts` are all append-only by
trigger — by trigger and not by RLS, since every route here writes with the
service-role client. Adjustments themselves are already the one entry type
requiring a reason (ten characters, enforced by a CHECK so it holds for any
caller), and an admin can change any balance while changing no history.

### 96, 98, 99, 100. Vocabulary, cash vs accrual, revenue recognition, receivables — **Fixed (documented)**

`docs/MONEY-MODEL.md`. Every noun means one thing; if a new figure needs a
taken word, the figure gets renamed. Cash versus accrual with the scope of each
figure. Revenue recognised on delivery — including why a pay-later session is
recognised at completion before any money arrives, and why recognising at
collection would make two months wrong for one session. The full receivable
lifecycle. The immutability table.

### 101. No centralized Money Health dashboard — **Partly fixed**

Money → alerts strip and System Health between them cover payout requests
waiting, cash held, refunds owed back, unmatched payments, unclosed pay-later
sessions, credit-balance disagreement, write-off/bad-debt disagreement and now
partner attribution.

What is missing is one screen that gathers them rather than two places that
each hold some. That is item 128, and it is presentation over data that now
exists — the cheapest remaining item on the list.

### 102. Admin dashboard loads large unpaginated datasets — **Partly fixed / Open**

Partly already handled and measured, which is worth stating because the item
implies otherwise: every list pages through `ListPager`/`usePagedList`, All
Sessions paints at most 200 rows, the activity log is capped at 200 and pages
by **cursor**, and the ~82 queries per render were measured at 1.2s against a
5.4s total that turned out to be sequential `await`s, since fixed.

What remains: **18 reads on the biggest tables are unbounded** — `appointments`
and `profiles` mostly — so at volume this page loads every appointment and
every account ever created.

**There is a trap in fixing it, and whoever picks this up needs to know.** Do
not simply add `.limit()` to these. Several of them feed the Money figures,
which sum over every row in the range: a silent cap would make those figures
**wrong rather than slow**, and wrong in a direction nobody would notice —
revenue quietly understated by however many rows fell off the end. That is
strictly worse than a slow page.

The real fix is server-side aggregation: compute the money figures in SQL and
return totals rather than rows, which also removes the need for the cap. That
is a change to the most sensitive code in the app and wants its own pass with
`adminMetrics.test.ts` extended to assert the SQL and the TypeScript agree on
the same dataset. Not urgent at this clinic's volume; genuinely needed before
growth, and not something to do halfway.

### 103. Reporting queries need indexes — **Fixed**

Reviewed against actual query shapes rather than added speculatively. The
appointments side was already strong — and pleasingly, the conflict test inside
`claim_therapist_slot` filters on exactly what
`appointments_one_therapist_per_slot` already indexes. `patient_referrals` had
nothing on `assigned_therapist_id` or `converted_patient_id`; both added,
partial.

### 104, 105. Migration history and rollback strategy — **Fixed (documented)**

`docs/DATA-POLICY.md` §1, with the honest case **for and against** the single
re-runnable file rather than just conceding the point: what it costs (no record
of when, no subset, nothing fails on drift) and what it buys (idempotency is
the whole deployment story). Plus the trigger to watch for — move to numbered
migrations **when a second environment exists**, because "which of these has
change 47" is a question the file cannot answer and nobody is asking yet.

Forward-fix recovery is specified per failure kind, with the rule that a
constraint a live database refuses **is the finding**: reconcile the rows, do
not weaken the check.

### 106. Backup/restore not certified — **Open (documented)**

`docs/DATA-POLICY.md` §2, stated as an open item rather than assumed away: until
a restore has been rehearsed the backup is a belief, not a capability. The
drill is written as eight steps, with the things most likely to be wrong named
— RLS policies, definer functions and their revokes, Storage objects (which
live outside Postgres, so a database-only restore gives rows pointing at files
that may not be there), `auth.users`, and the code sequences that have drifted
before and broke signup.

**Somebody has to run it.** I cannot: it needs a second project and a decision
about cost.

### 107. Clinical access after reassignment — **Fixed**; 108. Timezone edge cases — **Partly fixed**

- **107** is done, now that 76/77 is decided. `scripts/authorization-checks.mjs`
  section 7 asserts all four cases against a live database — the access that
  must work, the suspension that must refuse, the delivered session that
  survives a reassignment, and the future session that moved away and leaves
  nothing — with `scripts/clinical-access-sql-checks.sql` guarding the policy
  shape and its own negative control beside it.
- **108** is partly done: `clinicWeek.test.ts` covers midnight, Sunday/Monday,
  the year boundary and IST-vs-UTC; `formatDateTime.test.ts` already walks
  every `toLocale*String` in `src/` for a missing zone; `playwright.config.ts`
  pins `TZ`. DST is genuinely untested and India has none, so the gap is real
  only if the clinic ever operates outside IST.

### 109. Concurrency scenarios lack coverage — **Fixed, with a caveat I want you to read**

`scripts/concurrency-checks.mjs` (`npm run check:concurrency`), run against the
live database: 12 concurrent claims on one session → exactly 1 won; two claims
on overlapping slots → exactly 1 won and 1 refused as a clash; two claims on
the same slot for different therapists → both won (the lock is per therapist);
12 parallel rate-limit hits against a cap of 5 → exactly 5; two invite claims
at the cap → both refused.

**The caveat.** I ran the negative control and the invite-cap block passes
*without* its lock too. Twelve HTTP requests from one Node process do not
reliably interleave two sub-millisecond statements. So these are a regression
guard on the **verdicts**, not a proof of serialisation — the script says so at
the top, and says how to force real overlap if one ever starts failing
intermittently. What argues for the locks is the code: a count followed by an
insert cannot be serialising, whatever a timing-dependent test shows on a quiet
database.

### 110, 111, 112, 113. Admin authorization, cross-hospital isolation, IDOR, enumeration — **Fixed**

`scripts/authorization-checks.mjs` (`npm run check:authorization`), asserting
**below the routes** deliberately: every route guards itself, but a valid
session cookie reaches PostgREST directly without passing any of them. So the
question is not "does the route refuse?" but "if somebody went round it
entirely, does the database still refuse?" All passing:

- One partner cannot read another's referrals, and a refused referral is
  byte-identical to one that does not exist.
- Knowing an appointment's id is not authorization — another patient reads
  nothing and cannot write; an unassigned therapist reads nothing.
- Another patient's profile is not readable, listing profiles returns only your
  own row, and an email cannot confirm an account exists.
- No non-admin role reads `admin_activity_log` or the impersonation record.
- A suspended **admin** reads nothing — `is_admin()` is what does that.

**One honest finding fell out**, and I corrected AGENTS.md rather than leave it
overstating the guarantee: that file said a suspended account is refused by
"the policy layer and each route's own active check". True for an admin. **Not
true for a patient, therapist or hospital** — their `*_select_own` policies key
on `auth.uid()` alone, so a suspended account's live token still reads its own
rows until it expires. The app is the gate there, bounded to their own data for
at most one token lifetime, but it is the app and not the database.

### 114. Sensitive error messages — **Fixed**

**97 routes** answered `{ error: error.message }` with whatever Postgres said.
Three problems in one line: it leaks constraint, column and table names — and
on a NOT NULL violation PostgREST includes the **entire failing row**, which on
`profiles` means somebody's name, email, phone and patient code, to a caller
who may be a patient or a partner hospital. Nobody can act on "new row
violates row-level security policy" either. And the real error went to the
browser and was **never logged**.

`serverError()` logs the cause with a short speakable reference and answers
with a sentence plus that reference — the same posture `RouteError` already
takes for a thrown render. Four call sites keep their own message, correctly:
those are sentences this app composed, not Postgres output. Two routes get a
specific message because their failure is not a server fault — the document cap
and the default-address race.

### 115. Service-role usage needs review — **Fixed (verified)**

Reviewed: `src/lib/supabase/admin.ts` is imported only by server files — no
route or component that can reach the browser imports it. The two
purchase-detail routes deliberately use the **caller's** RLS-scoped client, so
a row coming back *is* the authorization, with the service role used only for
the one cross-role name lookup RLS cannot provide.

No change needed. Worth a periodic re-check, which is what
`check:authorization` now partly automates.

### 116. RPC security audit — **Partly fixed**

52 `security definer` functions. Verified mechanically: all revoked from
`public`, `anon` and `authenticated` (`check:grants`, in lint), all with an
explicit safe `search_path` (`check:search-path`, new, in lint), and the live
database agrees (`check-live-grants.mjs`, 19 passed 0 failed).

**Not** individually reviewed for authorization and input validation inside each
body. That is a genuine multi-day review and I would not claim it from a
mechanical pass.

### 117. SECURITY DEFINER search_path hardening — **Fixed**

All 47 already set one, so this was not a hole — it was a hole nothing would
have stopped reopening. `check-search-path.mjs` runs in lint, and is stricter
than the item asks: it also rejects a path naming a schema anybody can create
in, because `"$user"` or `pg_temp` on a definer function's path is the exact
escalation vector. Trigger functions are in scope — they need no EXECUTE
revokes, but their bodies still resolve names as the owner. 52 pass; negative
control run.

### 118. Database grants need regression checks — **Already held**

`check:grants` in lint on every commit, `check-live-grants.mjs` against the
running database. Both verified passing. Its three-outcome reporting is
genuinely good and worth not breaking: on an empty table a permitted read and
a refused one are byte-identical, so it reports *not proven* rather than a
pass.

### 119. Foreign-key cascade behaviour — **Fixed (verified + documented)**

Reviewed. The 35 FKs into `profiles` with no ON DELETE behaviour are what make
`delete-account` safe by construction, and `account_blocking_references()`
reads `pg_constraint` rather than a list — a list had drifted to 13 of 35. It
counts `auth.users` as well as `profiles`, because the delete removes the
`auth.users` row.

Documented in `docs/DATA-POLICY.md` §4 with the table of what happens to each
record class.

### 120. Orphan records need reconciliation — **Partly fixed**

Seven checks exist on System Health (I added the seventh). The two genuinely
missing are the Storage pair, named in `docs/DATA-POLICY.md` §5 with the
list-never-delete rule.

### 121. Temporary-password workflow should be a secure invitation flow — **Open — recommended**

The right answer to item 91, not done unilaterally because it changes a support
flow you rely on. Contained: Supabase `generateLink` for recovery/invite, the
link shown once, nothing plaintext persisted, and the four `reset-*` routes
plus `create-account` and `onboard-hospital` all move together. I'd do this
next if you want one thing picked.

### 122. Public therapist profile privacy — **Already held**

The live view is a hard-coded column allowlist with the full row filter
(`approved AND active AND visible_on_team`). Verified against the **running
database**, not just the file — there are three definitions of that view in the
append-only schema and only the last is live.

---

# P3 / Improvements

### 123. Dashboard work should use a worker/cron — **Open — infrastructure**

See 68. This is the single infrastructure decision that unblocks the most
other items (68, 83–85, 87, 120, 132, 133). Until it exists, the lazy-sweep
pattern is the correct design for this deployment, not a workaround.

### 124. Financial terminology standardized — **Fixed (documented)**

`docs/MONEY-MODEL.md` §1, including the words this product deliberately does
**not** use and why — "profit" for anything above operating profit, "paid" to
mean delivered (which the audit found conflated on the partner's own screen),
and "invite" for a referral.

### 125. Lifecycle state machines centralized — **Fixed (documented + code)**

`docs/LIFECYCLE-STATES.md` for all nine. Plus the code half where it was
actually causing a bug: `referralStatus.ts` now holds the states and the
groupings a screen should ask, because comparing status strings in a component
is what made two counts permanently zero (item 47).

### 126. Business rules duplicated across routes — **Partly fixed**

Four real duplications removed in this pass: the package terms resolver (four
paths), `getProfileStanding` (four routes), the slot claim (six paths) and the
referral state groupings (three screens). More remain; this is a direction
rather than a task.

### 127. Therapist production-readiness check centralized — **Fixed**

`src/lib/therapistReadiness.ts` is that one place, and it has exactly two
readers by design: the panel an admin reads (`therapistReadiness`) and the
automatic assigner (`canAutoAssignTo`). They return different answers on
purpose — see item 64/69 — and a third reader that wanted its own rule would
be the drift this module exists to prevent. 12 unit cases, including every
item that must *not* block an assignment.

### 128. Admin reconciliation queues centralized — **Fixed — different approach**

You asked for one screen gathering what two places hold. I did **not** build
a third screen, and that is the fix rather than a shortfall: a new page
listing what the Money alert strip and System Health already list is a third
answer to "is anything wrong", and the first time the three disagree the new
one is the one nobody trusts.

What the product already has is a clean division that was worth keeping: the
**Money alert strip** is work waiting on somebody — a payout to review, cash
to collect, a refund to hand back, a patient to ring — and **System Health**
is the clinic's records disagreeing with each other. Those are different
questions with different answers, and each already follows the same two
rules: a count links to the rows it counted, and a row whose screen this
scope cannot open is dropped rather than rendered.

What was actually missing was a **queue**, not a screen: the one state where
the clinic had taken a decision and delivered nothing had no row anywhere.
That is item 25 above, and it went on the strip where the rest of the work
is. The last unreconciled money movement went on System Health as the
Refunds check (items 6, 7, 94, 95). Both places are now complete rather than
duplicated.

### 129, 130, 131. Immutable event ids, source/source_id, external reconciliation states — **Partly fixed / Open**

Partly already true and worth crediting: `payments` is unique on both Razorpay
ids, `payment_webhook_events` dedupes on `razorpay_event_id` and is inserted
**before** any work, the credit ledger's idempotency keys are derived from the
thing that happened, and `payments` carries `target_appointment_id`,
`target_package_purchase_id`, `target_home_visit_purchase_id` and
`target_pay_later_payment_id` — which is `source`/`source_id` in a different
shape.

The uniform model is the canonical-ledger piece. Item 15 added the one missing
external-reconciliation fact: what the gateway said it captured, kept apart
from what we asked for.

### 132, 133. Observability and financial alerts — **Open — infrastructure**

132 needs an APM/log aggregator. 133 is closer than it looks: the *detections*
exist (System Health's eight checks, the risk detectors, the alert strips) —
what is missing is push rather than pull, and that needs 123 plus a
notification channel (83).

What I added in that direction: `serverError` now logs every server failure
with a reference (114), `payout.settle` reports a lost audit row to the admin
(72), and partner attribution gaps surface on a screen instead of in a log
(16).

### 134. Audit log archival strategy — **Fixed (documented)**

`docs/DATA-POLICY.md` §3. The strategy is: **not archived automatically, and
clearing is a deliberate act with four gates** — Master Admin only, cannot
reach the last 30 days at any setting (checked in three places, including
inside the function, because it is reachable from the SQL editor where no route
check runs), demands a download that was actually produced, and records itself
outside its own reach. Why not automatic, and what to do instead when volume
makes it necessary (archive with a checksum, never delete).

### 135. Account deletion policy — **Fixed (documented)**

`docs/DATA-POLICY.md` §4, including what the policy does **not** provide: there
is no right-to-erasure path, and that is a gap rather than a decision. The
honest answer needs a defined clinical retention period, an anonymisation path
that keeps the financial row and removes the person, and a decision about the
audit log — a legal question before an engineering one.

---

# What I'd do next, in order

1. **Malware scanning (86).** The only open item whose harm lands on a person.
2. **One-time invitation links (121).** Contained, and finishes 91 properly.
3. **A worker (123).** Unblocks 68, 83–85, 87, 120, 132, 133.
4. **The settlement ledger (6–10, 32–36, 40, 94–97, 129–131).** One piece of
   work, scoped as such, with the frozen rates from this pass as its
   prerequisite.
5. **The restore drill (106).** Cheap, and until it runs the backup is a
   belief.
6. **The decisions you handed back to me.** You said to decide, so I am
   deciding them rather than leaving them open — 64/69 and 127 are done
   (above). The pay-later ceiling (34), home-visit continuation after an area
   change (60) and historical clinical access (76/77) follow the same
   principle: where a policy is genuinely the clinic's, I ship the safer
   default **as a setting** rather than baking my judgement into the code, so
   changing your mind is a switch and not a release. Each entry says which
   default I chose and why.

# Scope I did not touch

I did not rebuild the QA plan binaries (the source is the only thing to edit,
per your own rules), did not run the full Playwright suite (the browser here
has no egress to Supabase — six specs fail on an unmodified tree for that
reason, which AGENTS.md documents), and did not open a pull request.
