# Programmes and purchases

Consultation first, how a course of treatment is bought, the therapist lock, what happens after paying, and hospital referrals.

**Mostly lives in:** src/lib/consultationFirst.ts · bookPackageSession.ts · sessionRhythm.ts · unscheduledPurchases.ts

> Part of `docs/rules/`. `CLAUDE.md` says which file a task needs; this one
> is the detail. Keep it current in the same change that makes it wrong --
> see the docs rule in `docs/rules/testing.md`.

---

- **A purchase ends in booked sessions, not in a balance.** What a patient
  buys is appointments; a credit balance is an accounting fact about that
  purchase, not the thing itself. Paying for a recommendation used to
  `router.refresh()`, which removed the offer card (the plan was accepted,
  so it no longer rendered) and put nothing in its place -- the highest
  intent moment in the product, and the screen went blank. Three things now
  hold the other half of the flow together:
  1. **Payment lands on a confirmation and one next step.** What arrived,
     what they own, then the scheduler. "I'll do it later" is a real,
     unpunished option, because (3) keeps asking.
  2. **The calendar opens answered, not empty.** `src/lib/sessionRhythm.ts`
     proposes the whole run from what the clinician already decided --
     `frequency_per_week` (captured since care plans shipped and, until
     this, read by nothing), the programme's `min_gap_hours` and
     `max_sessions_per_week`, the lead time, and the purchase's validity.
     It is strictly a **proposal**: every slot still goes through
     `/api/appointments/book-package-sessions`, which re-checks all of it
     server-side, so this module being wrong can only produce a worse
     suggestion and never a booking that should not exist. The gap and
     weekly cap are checked by one function, `checkPackageSpacing`
     (`src/lib/packageTerms.ts`), at **every** door that adds a session to
     a programme: the bulk scheduler, `book-with-package`, a therapist's
     suggestion (when it is made) and its acceptance. The last two used to
     skip both, and the suggestion's clash check assumed every session was
     60 minutes rather than the length the patient bought. Two rules inside
     it are load-bearing. A day that cannot take the run's hour is
     **skipped rather than substituted** -- someone who asked for five
     o'clock and was handed nine in the evening because it was the only
     slot clearing the lead time has been given a schedule they did not ask
     for, and a day later there is a five o'clock free. And it **stops at
     the validity**, returning fewer than asked rather than proposing
     sessions the patient would lose.
  3. **The dashboard keeps asking.** Sessions paid for and not in the diary
     are a `needsYou` feed item until the balance is spent. It is the one
     thing a patient can buy and then receive nothing for, and the only
     step between them and their treatment is a calendar on a screen they
     have to think to visit. Derived from rows `patientDashboardData`
     already loads, so it cannot claim a balance the Programmes screen
     disagrees with.
  A failed slot is fixable in place rather than a list that can only be
  closed: a patient whose third pick clashed used to start the whole flow
  again from a screen that had forgotten why.

- **Session packages lock to one therapist by default.** The first therapist
  assigned to any session on a `patient_package_purchases` row sets
  `locked_therapist_id`; every later session on that purchase auto-assigns,
  auto-confirms, and gets its own Meet link via
  `src/lib/bookPackageSession.ts`, never through the normal per-session admin
  assignment flow. `sessions_used` counts sessions **claimed** (scheduled or
  completed), not completed - see the counter-semantics comment beside
  `patient_package_purchases` in `schema.sql`. A scheduling conflict on the
  locked therapist never fails the booking; the session lands `requested`
  and unassigned in the admin queue instead. Reassigning a whole programme
  (`/api/admin/reassign-package-therapist`) only ever touches future
  sessions - completed ones keep whoever actually ran them. A patient can
  schedule several remaining sessions in one request via
  `/api/appointments/book-package-sessions`, which loops
  `bookPackageSession()` per slot after enforcing the package's own
  minimum-gap/max-per-week rules and the bulk limit - it's the batch-level
  rules layer, not a second booking implementation.
- **Treatment volume is never sold before an assessment.** The rule lives in
  `src/lib/consultationFirst.ts` and is a property of the thing being sold,
  not a feature flag: a catalog row may be bought directly only when it is a
  **single** session or visit. One session is a consultation - there is
  nothing to assess before selling somebody one appointment - and two or
  more is a programme, which comes from a care plan a therapist wrote after
  a session they ran.
  Direct session-package purchase is **gone**: `/api/packages/create-order`,
  `/api/packages/verify`, `packagePayment.ts` and `BuyPackageButton` are
  deleted, and `/book` sells one consultation against a treatment category.
  So is the **advertising** of one. `/` and `/conditions` no longer query or
  render session packages at all, the programme dialog's price list of
  courses is gone, `/home-visit` filters to single visits, and
  `home/SessionPackages.tsx` is deleted. `show_programme_prices` /
  `session_packages_visible` are retired rather than defaulted off - a
  toggle somebody can flip back on is not the rule being gone, and a price
  list of programmes is exactly what a patient must not shop from. Both
  columns are **dropped** at the end of `schema.sql` now: leaving a column
  nothing reads is only free while nothing touches it, and ten successive
  re-declarations of `debug_reset_all_data()` kept resetting one of them
  while an e2e `beforeAll` kept writing it, so the next reader of either had
  to trace a column to its absence before learning it was dead. `drop column
  if exists` is re-runnable, which is what made the original "a drop cannot
  be undone by re-running the file" reasoning true of the data and not of
  the statement.
  The home-visit exception is load-bearing rather than a compromise: every
  home visit in this app is a `home_visit_packages` purchase and
  `/api/appointments/create` books `visit_mode: 'online'` only, so applying
  "no direct package purchase" literally to both catalogs would leave a
  patient who needs to be seen at home with **no entry point at all**. A
  one-visit home package is that patient's consultation and stays
  purchasable; `visit_count > 1` is refused by both
  `/api/home-visit/create-order` and `/api/home-visit/book-cash` (paying at
  the door is a payment method, not a different product).
  Both wizards **answer** a stale `?package=` link rather than ignoring it -
  taking a different amount of money than somebody came for is the one
  outcome a removed checkout must not produce. Existing purchases are
  untouched and keep booking to exhaustion.
  A recommended home visit collects an address at checkout
  (`src/lib/homeVisitAddress.ts`, shared with the direct route) and sets
  `default_address_id` and `travel_fee_paise`. The offer card quotes the fee
  for that address through `/api/home-visit/check-area` and shows
  programme + travel + total, because travel is charged **per visit** and the
  card previously printed the programme price on a button that charged more
  - a four-visit programme in a ₹150 area was ₹600 out. Quoting a different
  figure than you charge is the one thing a payment screen must never do.
  `/api/care-plan/create-order` also re-checks `home_visit_enabled`: an admin
  who switches home visits off has stopped the service, and a recommendation
  written before that must not stay purchasable. Without them
  `/api/home-visit/book-visits` refuses outright and the therapist funds
  their own transport - both were missing while a programme could still be
  bought the old way, and neither is optional now that it cannot.

- **A referral is checked by the server the way a booking is.** Over-long
  text is refused with a sentence, never cut (`REFERRAL_LIMITS` in
  `src/lib/referralLimits.ts`, which the form also applies as `maxLength`);
  the route used to slice the medical history silently. The preferred
  language must be one the clinic books in (the form is a picker). A home
  visit needs a real address and a pincode the clinic serves
  (`lookupServiceArea`) - a pincode alone used to be enough, and
  conversion then booked a visit at "Address on file with referring
  hospital". And one partner cannot hold two open referrals
  (`OPEN_REFERRAL_STATUSES`) for the same phone number.
- **Converting a referral either completes or leaves nothing behind.**
  `/api/patient/register-via-referral` checks everything that can refuse
  it (a home visit's address and a served area) *before* writing
  anything, then claims the referral, creates the account, links
  `converted_patient_id`, sets `referred_by_hospital_id` and books the
  session. If any of the last three fails, the new account is deleted and
  the referral released, so the patient's link works again. It used to
  mark the referral converted first and treat the rest as best-effort: a
  failed booking left the referral converted with no session and the link
  burned; a failed attribution earned the partner nothing; an
  unserviceable pincode booked a visit with no travel fee. The System
  Health attribution check now also counts converted referrals with **no**
  patient linked, which it could not see before.
- **A referral carries a phone number, because the clinic rings before it
  links.** `patient_referrals.patient_phone` is collected on the hospital's
  own form (required, validated through `PhoneNumberField` /
  `isValidStoredPhone` like every other number in the app) and rendered with
  `preferred_language` directly under the patient's name on Admin → People →
  Partners → Patient Referrals. A referral is the one flow where the clinic
  must reach someone who has no account yet: the admin agrees a time with
  them and only then sends the registration link. The column is nullable -
  every referral already on file predates it - and is read in its **own
  isolated query** on the admin dashboard, so a database without the
  migration loses the number on the card rather than the capacity note
  beside it or the referral list itself.
