# Programmes and purchases

Consultation first, how a course of treatment is bought, the therapist lock, what happens after paying, and hospital referrals.

**Mostly lives in:** src/lib/consultationFirst.ts · bookPackageSession.ts · sessionRhythm.ts · unscheduledPurchases.ts · programmeId.ts · programmePipeline.ts · adminProgrammesServer.ts

> Part of `docs/rules/`. `CLAUDE.md` says which file a task needs; this one
> is the detail. Keep it current in the same change that makes it wrong --
> see the docs rule in `docs/rules/testing.md`.

---

- **A programme has one ID from the recommendation to its last session,
  and it reads done over bought: `PED_PKG001-2/6`.** A programme used to
  have no code while it was a recommendation and then one of two once it
  was bought (`SP0001` online, `HS0001` home visits), neither saying what
  it was for, so the owner could not tell one paediatric course from
  another or follow one from "suggested" to "four done". Now:
  1. **The condition gives the prefix.** `treatment_categories.short_code`
     is 2-4 capitals, unique, made from the name when blank (first three
     letters of the first word, then initials, then four letters, then
     letter combinations -- `condition_short_code_candidates()` in
     `schema.sql` and `conditionCodeCandidates()` in
     `src/lib/programmeId.ts` walk the same list, pinned by a unit test) and
     editable on Catalog -> Conditions (*Programme code*; blank means "make
     one"). `checkConditionCode` (`src/lib/conditionCodeServer.ts`) refuses
     a malformed or taken one with a sentence before anything is written.
     A programme with no condition (an old generic package, a clinic-wide
     home-visit rate) uses `GEN`.
  2. **The database mints the number, never the app.** `PKG` for video
     sessions, `HV` for home visits, counted per (prefix, kind) in
     `programme_code_counters` by `next_programme_code()` with
     `INSERT ... ON CONFLICT DO UPDATE`, which takes the row lock -- two
     programmes written at once cannot draw the same number. It is minted
     when a recommendation's version is first published (a trigger on
     `care_plans.current_version_id`), copied onto the purchase the
     recommendation becomes (and re-synced when it is paid, so a checkout
     started on an older version still lands on the plan's ID), and minted
     fresh for a purchase with no recommendation. A single home visit is a
     consultation and gets none. An unbought recommendation rewritten onto
     another condition or mode is re-issued an ID, the old one kept in
     `previous_programme_codes`; once accepted it never moves. Changing a
     condition's code later keeps every ID already issued.
  3. **The "-2/6" is derived, never stored.** Completed sessions over
     sessions (or visits) bought, from the rows (`programmeTag`,
     `programmeProgress`), clamped so a bad count cannot print 7/6. Every
     surface shows it through `ProgrammeIdChip`: admin All Programmes, All
     Sessions rows and the session drawer ("Part of ..."), a patient's
     admin page (Programmes card and Booking History), a therapist's admin
     page, Money -> Transactions, Today's recommendation pulse, the
     review queue, the patient's Your Programmes and session cards, and the
     therapist's session cards and Programmes view. On a database without
     the columns every reader falls back to the old code.
  4. **Old codes still find it.** `SP`/`HS` codes are on receipts already
     sent, so every search -- Programmes, All Sessions' Programme filter,
     People search (`paymentSearch.ts`), Money's receipts filter, the global
     search -- matches the new ID, a copied ID whose progress has since
     moved (`PED_PKG001-0/6` finds `PED_PKG001`), and the old code.
  Existing rows were backfilled in the order they happened, so each
  condition's oldest programme is `_001`. Guard: `e2e/admin-programmes.spec.ts`.
- **Programmes is one admin section, and a programme is one row in it.**
  Sessions -> Recommendations and Catalog -> Purchases are gone (old links
  land on Programmes through `LEGACY_SCREENS`). **All Programmes** joins
  each recommendation with the purchase it became
  (`src/lib/adminProgrammesServer.ts`) and decides one stage per row in
  `programmeStage` (`src/lib/programmePipeline.ts`): the pipeline
  *Waiting approval -> With patient -> Paid - nothing booked -> In progress
  -> Completed*, and the stops *Declined, Not approved, Withdrawn, Lapsed,
  Expired, Refunded*. A purchase's own state wins over its plan's, and an
  abandoned checkout is not a programme. The pipeline tiles count over
  every filter but the stage, so a tap never lands on an empty list; the
  filters (search, status, condition, therapist, mode, start-date range,
  and the "paid N hours ago" age the Today and Money counts link with) live
  in the URL as `pg_*`. The drawer is the programme's whole story
  (`buildProgrammeTimeline`), its sessions, its money (Money scope only)
  and the controls its scope can call: approve / turn down, withdraw,
  change therapist or extend expiry (the existing purchase modals), refund
  what is left (Money's own route), and a link to its sessions in All
  Sessions. **Recommendations** (manage only) is the approval queue that
  used to be on Sessions, unchanged apart from carrying the ID.
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

- **A programme the patient owns shows its condition's photo and name.**
  A recommendation is bought against a hidden `care_plan_course` package row
  with no photo and an internal title, so Your Programmes showed a
  placeholder and "<condition> - recommended course" right after the patient
  paid for a card carrying the condition's photograph. `programmeDisplay`
  (`src/lib/programmeDisplay.ts`) names a course "<condition> programme" and
  pictures it from `loadConditionCovers` (`catalogImageServer.ts`); a catalog
  package keeps its own. Photos on programme cards go through
  `ProgrammeCover`, which shows the photo whole over a blurred copy of
  itself - a fixed-height `object-cover` strip cut the subject in half.
- **A programme keeps one therapist, and every one of its sessions still
  goes through the admin.** The first therapist assigned to any session on a
  purchase sets `locked_therapist_id` (online: when the package and the
  site-wide **Therapist lock** switch allow it; a recommendation sets it at
  purchase). That lock **pre-picks** the admin's choice; it never assigns.
  Every session booked against a programme -- the patient's own
  (`book-with-package`, `book-package-sessions`), a therapist's suggestion
  the patient accepted (`respond-suggestion`), and a visit on a home-visit
  programme (`book-visits`) -- is inserted `requested` and unassigned by
  `bookPackageSession` / `bookHomeVisitSession` and lands in "Sessions with
  no therapist". It used to reserve the locked therapist (or the suggester),
  confirm the session and make its Meet link on the spot, so no person ever
  looked at a programme session; the owner's call is that they all reach the
  admin. `programmeTherapistFor` (`src/lib/sessionAssignQueue.ts`) reads the
  purchase's lock **at render time** -- never copied onto the session -- so
  a programme reassigned through `/api/admin/reassign-package-therapist`
  moves the pre-pick of every session still waiting. The All Sessions and
  calendar rows read "Tap to assign · <name>"; the drawer leads with one
  primary **Assign <name>** (`ProgrammeTherapistAssign`) above the ordinary
  picker, which also pre-selects them as "Programme therapist". Assigning is
  the ordinary `/api/admin/assign-appointment`: it confirms a paid session and
  makes the Meet link or the home visit's calendar invite, and still does not
  confirm an unpaid cash visit. **No slot is held while it waits** -- a hold
  needs a release and a sweep, and there is no worker -- so the page checks
  the roster it already has (`assignabilityFromRoster`,
  `src/lib/therapistAssignability.ts`) and, when the therapist can no longer
  take that time, the row says "<name> not free" and the drawer "<name> is no
  longer free at this time - pick someone else or move it" in place of the
  one tap; the assign route re-checks regardless. Payment is untouched: a
  prepaid session is `paid` from the purchase, a cash visit `unpaid`. The
  patient reads **"Booked - confirming your therapist"** on the session card,
  the Sessions list, the Home feed and the scheduler's result rows
  (`patientSessionStatus` / `isBookedAwaitingTherapist`,
  `src/lib/sessionRowStatus.ts`). A single first consultation is not a
  programme session and keeps today's optional auto-assign
  (`autoAssignTherapist.ts`).
  `sessions_used` counts sessions **claimed** (scheduled or completed), not
  completed - see the counter-semantics comment beside
  `patient_package_purchases` in `schema.sql`. Reassigning a whole programme
  only ever touches future sessions - completed ones keep whoever actually
  ran them. A patient can schedule several remaining sessions in one request
  via `/api/appointments/book-package-sessions`, which loops
  `bookPackageSession()` per slot after enforcing the package's own
  minimum-gap/max-per-week rules and the bulk limit - it's the batch-level
  rules layer, not a second booking implementation. Guard:
  `e2e/programme-sessions-via-admin.spec.ts`, and SCH-001 in
  `session-scheduling`.
- **A programme's expiry is said only near its end, as a date.** Every
  purchase keeps the clinic's validity (`package_default_validity_days`,
  `home_visit_default_validity_days`) so unused credits cannot sit for ever,
  and the routes still refuse a slot past it. But "Valid 90 days", "Use them
  within 90 days" and an "N days left" countdown from the day of payment read
  as a clock the patient never agreed to race, so no patient or therapist
  surface prints a validity in days: not the recommendation card, the Review
  & pay page, the therapist's recommendation form, the catalog cards, the
  programme widgets or their detail modals. The one thing said is
  `patientExpiryNotice` (`src/lib/packageProgress.ts`): "3 sessions left -
  book by 12 Nov", only while `computePackageExpiryState` is `expiring_soon`
  (inside `package_expiry_reminder_days`) **and** something is left to book,
  dated through `formatDateTime.ts`. The detail modals get it from their
  routes (`/api/packages/purchase-detail`, `/api/home-visit/purchase-detail`
  return `expiryNotice`) so it reads the clinic's window. Admin screens keep
  the full expiry date and countdown - the clinic needs it.
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
  patient who needs to be seen at home with **no entry point at all**. One
  home visit of a condition is that patient's consultation and stays
  purchasable, at the condition's home-visit price (`home-visit.md`); an old
  link to a `visit_count > 1` row is refused with the programme sentence by
  both `/api/home-visit/create-order` and `/api/home-visit/book-cash`
  (paying at the door is a payment method, not a different product).
  Both wizards **answer** a stale `?package=` link rather than ignoring it -
  taking a different amount of money than somebody came for is the one
  outcome a removed checkout must not produce. Existing purchases are
  untouched and keep booking to exhaustion.
  A recommended home visit collects an address at checkout
  (`src/lib/homeVisitAddress.ts`, shared with the direct route) - the
  Review & pay page adds its own **Pincode** field above the shared
  `AddressForm`, which leaves the pincode to the wizard's area step; without
  it a new address could never be complete and every pay attempt said "Add
  the address these visits should come to" (`e2e/recommendation-course.spec.ts`)
  - and sets `default_address_id` and `travel_fee_paise`. The page quotes the
  fee for that address through `/api/care-plan/quote` and shows
  programme + travel + total, because travel is charged **per visit** and the
  card once printed the programme price on a button that charged more
  - a four-visit programme in a ₹150 area was ₹600 out. Quoting a different
  figure than you charge is the one thing a payment screen must never do.
  `/api/care-plan/create-order` also re-checks `home_visit_enabled`: an admin
  who switches home visits off has stopped the service, and a recommendation
  written before that must not stay purchasable. Without them
  `/api/home-visit/book-visits` refuses outright and the therapist funds
  their own transport - both were missing while a programme could still be
  bought the old way, and neither is optional now that it cannot.

- **A recommendation is paid for on its own Review & pay page, never from
  the card.** "Accept & pay" on the Suggested card used to open Razorpay
  directly, so a patient holding a promo code had nowhere to type it and read
  the total for the first time inside the payment sheet. It is now a link to
  `/patient/dashboard/suggested/checkout?plan=<version id>`
  (`ProgrammeCheckout`), built to read like step 3 of the booking wizard:
  the programme, the address for a home visit, *Have a promo code?*, a
  **Your total** box, and Back / **Pay ₹<total>**. Four rules hold it:
  1. **Every figure is the server's.** `/api/care-plan/quote` (a read) and
     `/api/care-plan/create-order` (the authority) resolve the plan through
     `programmeCheckoutServer.ts` and the price through the dependency-free
     `programmeCheckoutQuote.ts`, so the page cannot print a total the order
     does not charge, and refuses the same plans (not this patient's, not
     current, answered, lapsed, re-priced). The body names the version, a
     code and an address; never an amount.
  2. **A code comes off the programme, never travel**, and only a code whose
     **Valid on recommended programmes** switch is on (see
     `docs/rules/discounts.md`). A code that would leave less than the gateway
     minimum on the programme is refused with a sentence: a programme has no
     free-confirmation path, and a purchase "paid" with no payment would mint
     credits from nothing.
  3. **The purchase records what was charged.** `amount_paid_paise` is the
     programme after the code (travel still kept apart), with
     `list_price_paise`, `discount_paise` and `promo_code_id` beside it. Each
     session booked against it is `amount_paid_paise / count`
     (`bookPackageSession`, `bookHomeVisitSession`), so revenue and the
     therapist's share read the discounted figure exactly as a discounted
     single session's do.
  4. **A retry reuses an order only at the price just resolved** - the
     `mintAppointmentOrder` rule. An unpaid purchase for the version is
     reused and its figures, address and travel rewritten; its Razorpay order
     is reused only when the amount matches, a new one minted otherwise, 409
     while a payment on the old one is in flight, and "already paid" (the
     webhook fulfils it) when Razorpay says the old one was paid. A retry
     with no code releases the earlier claim.
  The paid confirmation and scheduler (`PaidAndUnscheduled`) render on the
  page itself, through the same component even after the realtime refresh
  marks the plan accepted, so the scheduler is not unmounted under the
  patient. Suggested keeps showing "Your programme is ready".

- **A referral is checked by the server the way a booking is.** Over-long
  text is refused with a sentence, never cut (`REFERRAL_LIMITS` in
  `src/lib/referralLimits.ts`, which the form also applies as `maxLength`);
  the route used to slice the medical history silently. The preferred
  language must be one the clinic books in (the form is a picker). A home
  visit needs a real address and a pincode the clinic serves
  (`lookupServiceArea`) - a pincode alone used to be enough, and
  conversion then booked a visit at "Address on file with referring
  hospital". And one partner cannot hold two open referrals
  (`OPEN_REFERRAL_STATUSES`) for the same phone number -- held by the
  partial unique index `patient_referrals_one_open_per_phone`, not only by
  the route's check. The check then insert were two statements, so
  simultaneous submissions all passed the check; the route now reads the
  index's 23505 as the same "already referred" 409. Keep the index's status
  list in step with `OPEN_REFERRAL_STATUSES`.
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
- **A partner withdrawing a referral is `withdrawn`, not `declined`.**
  `declined` is the clinic's decision and carries the clinic's reason;
  the withdraw route used to write it with no reason, actor or time, and
  the partner's own Withdrawn filter matched nothing. The status now has
  `withdrawn_at` / `withdrawn_by` beside it (schema.sql, appended), counts
  as closed (`isReferralClosed`), and on a database without it the route
  falls back to `declined` with the reason "Withdrawn by the referring
  partner." The partner's filters list every real status, including
  Registration link sent.
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
