# Home visits, and the Google connection

A delivery mode rather than a parallel booking system: service areas, the travel fee, cash at the door - plus calendar events, Meet links and the waiting room.

**Mostly lives in:** src/lib/homeVisitPricing.ts · homeVisitAreaCommitments.ts · googleMeetSpace.ts · meetSyncState.ts

> Part of `docs/rules/`. `CLAUDE.md` says which file a task needs; this one
> is the detail. Keep it current in the same change that makes it wrong --
> see the docs rule in `docs/rules/testing.md`.

---

- **The Google connection says whether it is up, because a dead token looks
  like a handful of unlucky sessions.** Every Calendar and Meet call
  authenticates with one refresh token, and when that token dies -- revoked,
  or, far the commonest cause, the OAuth consent screen left in **Testing**,
  where Google expires refresh tokens after seven days -- every session fails
  at once with `invalid_grant`. Nothing said so. Each failure appeared as its
  own row in Settings -> System Health -> Session Links with a raw error string
  and a Retry button that could never succeed, so the screen read "a few
  sessions failed" when the truth was "no session will get a link again". The
  one line naming the fix was a `console.error` no clinic owner reads.
  `src/lib/googleConnectionHealth.ts` answers it by *spending* the token --
  presence is not the test, since a token can be set and dead -- and three
  things about it are load-bearing. It **never throws**: it runs inside the
  admin dashboard's render, in that page's isolated `Promise.all`, so a
  status panel can cost its own panel and never the screen it sits on. It
  **distinguishes a dead token from a blip** (`deadToken`), because telling
  an owner to re-authorize over a network hiccup teaches them to ignore the
  panel. And a failure is **re-checked far sooner than a success is**
  (60s against 10 minutes), so an owner who has just re-run the token script
  watches the panel go green instead of waiting out a cache. **It reports the shape of
  the credential, never the credential.** `invalid_grant` is Google's answer
  both for a permission that has died and for a server still holding the value
  somebody just replaced -- and the card's numbered steps fix only the first,
  so an owner meeting the second re-pastes the same token and meets the same
  red card. `describeCredential()` gives `HealthCheck.evidence` three facts
  that settle it: the length, an 8-hex SHA-256 prefix (which changes when the
  saved value changes, so one reload after a redeploy answers "did it land?"),
  and whether the stored value carries surrounding whitespace -- that last one
  needs nothing to compare against, since a trailing newline survives a paste
  into most hosting dashboards and Google refuses it outright. It hashes the
  **raw** value rather than a trimmed one, or two values Google treats
  differently would print one fingerprint, which is the confusion the field
  exists to end. The broken status also carries `clientId`, because a refresh
  token is bound to the client that minted it and a deployment carrying a
  different one is refused with the same error and a completely different fix.
  `evidence` is facts and never advice -- it renders above the steps precisely
  because it is what decides whether those steps apply -- and it goes into the
  Copy for my developer text for the same reason. `retryDueMeetSyncs`
  reads the same verdict and returns early while the credential is down:
  retrying cannot fix it, and each attempt spends one of that appointment's
  five capped tries, so without the check the sessions that most needed the
  sweep are already retired to "needs attention" by the time the credential
  comes back. Checked after the backlog query, not before it, so an empty
  backlog still costs no outbound call.

- **Nobody is admitted to a session by hand.** Meet's default access type is
  TRUSTED, which admits only signed-in Google users who are *on the invite*
  and knocks for everyone else -- and a patient registers with whatever email
  they have, so the invite rarely matches the account their browser is signed
  into. Both parties ended up in the waiting room with only the authorizing
  Gmail account able to let them in. `src/lib/googleMeetSpace.ts` switches
  each new session's space to OPEN right after the Calendar event is created
  (a second call, to the Meet REST API -- `conferenceData` has no access-type
  field). Four rules hold it:
  1. **It never fails a booking, and never touches
     `google_calendar_sync_error`.** The event and the link already exist by
     then; only the door is in question. That column is what the sync sweep
     retries on, and it retries by *creating an event*, so recording a
     waiting-room failure there would orphan a second calendar entry for a
     session that already has one. The outcome goes on
     `appointments.meet_access_open` / `meet_access_error` instead, written
     in their own isolated update.
  2. **Its retry is a separate pass with a separate cap.**
     `retryDueMeetAccess()` patches an existing space, which is idempotent
     and cannot orphan anything -- so it needs no claim column, unlike the
     event sweep beside it. `meet_access_attempts` caps it low, because the
     commonest failure (a refresh token predating the
     `meetings.space.settings` scope) is permanent until a person re-runs
     `scripts/get-google-refresh-token.mjs`.
  3. **The scope is `meetings.space.settings`, not
     `meetings.space.created`.** Calendar creates the space, not this app, so
     "spaces this app created" does not cover it.
  4. **OPEN removes the knock; it does not allow anonymous joining.** A
     meeting organized by a personal Gmail account still requires every
     participant to be signed in to some Google account. Only moving the
     organizer to Google Workspace changes that -- do not describe this
     feature to a patient as "no Google account needed".
  One admin switch (`site_settings.meet_open_access_enabled`, on by
  default), because an owner whose Google account cannot grant the scope
  needs a way to stop the attempt and its recorded errors.
- **"No Meet link" does not mean "broken" -- a home visit never has one.**
  `createMeetEventForConfirmedAppointment` passes `withMeet: false` for a home
  visit on purpose: there is nothing to join, the therapist is coming to the
  address. Three readers nonetheless used `meet_link is null` as their
  definition of an unsynced session, and every confirmed home visit therefore
  (1) sat in Settings -> System Health -> Session Links for ever, (2) was
  answered `502 "Retry failed"` by the Retry button -- whose success test was
  also `meet_link` -- on the runs where the event had in fact been created,
  and (3) got a **brand new calendar event on every click**, because
  `createSessionCalendarEvent` only ever creates. Three duplicate invites
  reached one patient and therapist before it was found.
  `src/lib/meetSyncState.ts` is the single answer now: a home visit is synced
  when `google_event_id` exists, an online session when `meet_link` does, and
  a column that was not *loaded* (`undefined`, as opposed to a loaded `null`)
  never counts as evidence of failure -- these columns come from isolated
  migration-tolerant queries, and guessing "absent means empty" restores the
  false positives. Two rules follow from the duplicate events. The refusal to
  create a second event lives in `createMeetEventForConfirmedAppointment`
  itself, keyed on `google_event_id`, so every door gets it -- the sweep, the
  manual Retry and the three booking paths -- rather than each caller
  remembering; the claim columns could not do this job, since they stop two
  callers racing over the same attempt and say nothing about an attempt that
  should never have been made. And a new surface answering "is this session
  synced" reads that module rather than testing a column, or it grows a fourth
  disagreeing opinion.
  **And which kind of event to make is read off the row, never defaulted.**
  `createMeetEventForConfirmedAppointment`'s `visitMode` used to default to
  `"online"`, which was true of the six callers that had the address in hand
  and passed it, and false of the three that did not: `confirmPaidAppointment`
  (a hospital home-visit referral is an ordinary appointment the patient pays
  for, so it reaches the Razorpay path like any other), the webhook that
  stands in for it when the browser never comes back, and
  `/api/admin/mark-paid-by-cash`. All three produced the same wrong event for
  a home visit -- a Meet link for a session nobody joins, and **no street
  address and no access notes** on an invite that is the only outbound
  message this platform sends, so the therapist was handed a video call
  instead of somewhere to drive to. The helper resolves it from
  `appointments.visit_mode` and the `visit_*` columns when the caller says
  nothing, in its own isolated call falling back to online -- same place and
  same reasoning as the duplicate-event guard above: every door gets it. An
  explicit `visitMode` is still never second-guessed, because some callers
  read the address from the patient's own address book rather than the row.

- **Google Calendar/Meet sync must never block a booking.** Failures are
  recorded on the appointment (`google_calendar_sync_error`), re-attempted
  automatically by `src/lib/retryDueMeetSyncs.ts` (a lazy sweep at the top of
  the admin dashboard render - see the no-cron rule below), and retried by
  hand by the admin (`/api/admin/retry-meet-sync`). The automatic sweep is
  capped four ways because, unlike the expiry sweeps, it makes outbound
  Google API calls from inside a page render: a wall-clock timeout per
  attempt, a few appointments per sweep, a minute's minimum gap between
  sweeps that do work - without which each attempt's own write to
  `appointments` refreshed the dashboard that had just swept, and the row's
  five attempts were gone inside a minute - and
  `appointments.google_calendar_sync_attempts` capping attempts per
  appointment so a permanently broken row (revoked credentials, deleted
  calendar) is not retried forever. Both the sweep and the manual Retry
  route claim an appointment through
  `appointments.google_calendar_sync_claimed_at` before calling Google, with
  a staleness window so a render that dies mid-attempt releases its row:
  `createSessionCalendarEvent` only ever creates, so two overlapping
  attempts leave an orphaned event on the calendar under a link the
  appointment no longer points at. At the cap the row stays in the admin's
  Session Links panel flagged as needing a person; a manual Retry resets the
  counter. A home visit still gets a
  calendar event even when `google_meet_enabled` is off - that toggle only
  gates the Meet conferencing, not event creation, since the invite email is
  the only outbound notification this platform sends.
- **"Do you come to me?" has three answers, and every caller asks the same
  way.** `lookupServiceArea` (`src/lib/serviceAreaServer.ts`) returns a
  served area, no area, or *could not ask*; check-area, both checkouts, the
  address book and the waitlist answer the third with a 503 to retry,
  never with "we don't visit that pincode". The waitlist refuses a pincode
  the clinic already serves (409 with `serviceable: true`, and the wizard
  re-runs the check so the patient moves straight on to booking): it is
  where demand for *unserved* areas is read, and served pincodes polluted
  it. Cash checkout still books when saving to the address book fails - the
  visit carries its own copy - but answers `addressNotSaved` so the patient
  is told rather than finding it missing later.
- **Home Visit is a delivery mode, not a parallel booking system.**
  `appointments.visit_mode` (`'online'` / `'home_visit'`) is the only new
  column that matters at read time; everything else about an appointment -
  patient, therapist, payout, rating, refund - works identically either way.
  Anyone can book either mode; there is no "home-visit patient" vs.
  "online patient". A visit's address is snapshotted onto the appointment
  (`visit_address_*`) from the patient's reusable `patient_addresses` book,
  never referenced live, so editing a saved address later can't rewrite a
  visit already delivered. The travel fee (`travel_fee_paise`) is a
  pass-through reimbursement paid to the therapist in full and always
  excluded from revenue (`src/lib/homeVisitPricing.ts`) - never fold it into
  a price or a therapist funds their own transport. `home_visit_areas`
  (pincode → travel fee) gates what can be sold at all:
  `/api/home-visit/check-area` is checked before an address is even
  collected, and re-checked server-side at every purchase route - never
  trust a serviceability answer the browser already has.
  **It gates what can be *sold*, and nothing else. A purchase already made
  is honoured.** A patient who bought six visits and has had two keeps the
  other four even after the clinic stops serving their pincode, at the
  travel fee frozen on their purchase -- so `/api/home-visit/book-visits`
  deliberately does **not** re-check serviceability, and
  `bookHomeVisitSession` reads `purchase.travel_fee_paise` rather than the
  live area row. That was true by omission before it was true by decision,
  which is the dangerous shape: the next reader would reasonably "fix" it by
  adding the check and strand paid visits. The catchment is the clinic's
  choice and not the patient's, and withdrawing treatment somebody has paid
  for is the one outcome a service area must not produce; refunding instead
  is an admin's call per purchase, on the screen that already does refunds.
  The other half is that turning an area off used to say nothing about what
  it did not cancel: `src/lib/homeVisitAreaCommitments.ts` counts the paid
  visits still to deliver in each area, the row states it, and Deactivate
  asks first and names the number. A count it could not read says so rather
  than showing zero -- on the one screen where a zero reads as permission.
  **The master switch is the same shape one level wider, and
  `/api/home-visit/verify` is why it must be.** That route deliberately does
  **not** re-read `home_visit_enabled`: by the time it runs Razorpay has the
  money, so refusing there takes a patient's payment and gives them nothing,
  and the only honest refusal is a refund -- a decision a person takes per
  purchase, not a check a route makes for them. (`create-order` and the
  referral route both *do* check it, which is the whole difference: nothing
  has moved yet.) So the switch gates what can be sold and nothing else, and
  `readHomeVisitCommitmentTotal` is the sentence saying what it does not
  cancel -- a separate read rather than a sum of the per-area map, because it
  has to count a purchase whose address carries **no** area, which the map
  must skip and which is exactly the purchase most likely to be forgotten.
  Settings -> Programmes & Home Visits states it beside the switch and asks
  before it goes off; the confirmation is on the **off** direction only, since
  turning a service on takes nothing from anybody and a prompt there is the
  dialog nobody reads. `describeHomeVisitCommitment` answers three ways rather
  than two, and the confirm is awaited before the transition, per the deadlock
  rule.
  A locked
  therapist's conflict check is padded by
  `home_visit_travel_buffer_minutes` on both sides of the new slot
  (`findTherapistConflict`'s `bufferMinutes` option) since a therapist
  finishing one visit cannot be at another minutes later; online passes 0.
  Cash-on-visit purchases legitimately sit at `payment_status: 'unpaid'`
  for their whole life with real confirmed visits hanging off them - never
  assume `payment_status` reflects whether money changed hands for a home
  visit purchase the way it does everywhere else; check `payment_mode`
  first. Cash collected and not yet remitted is real exposure: it nets off
  what a therapist's payout actually transfers
  (`src/lib/therapistCashLedger.ts`), and a cash refund with no Razorpay
  payment behind it becomes `refund_status: 'manual_pending'`, surfaced on
  the admin Cash Ledger until an admin confirms the cash was handed back.
  `visits_used` counts visits **claimed** (scheduled or completed), never
  completed - identical rule to `sessions_used`, see the counter-semantics
  comment beside `home_visit_package_purchases` in `schema.sql`. See the
  "Home Visit" section in README.md for the full flow.

- **Outside India home visits are not offered, unless an admin allows it.**
  One switch on Catalog -> Countries & currency (`home_visit_outside_india`,
  default off) decides it for every country but India. The routes that sell
  a visit refuse on their own - `home-visit/create-order`, `home-visit/book-cash`
  and a home-visit care plan in `care-plan/create-order` answer 403 with
  `HOME_VISIT_OUTSIDE_INDIA_ERROR` - using the request's country
  (`pricingForRequest`, see `payments.md`). The pages follow: the nav, footer
  and phone book bar drop the link, `/home-visit` and `/book-home-visit`
  render `HomeVisitUnavailable` (pointing to a video session), the booking
  hub hides its Home visits group, and a recommended home-visit plan says
  why it cannot be booked. The public pages stay statically cached; the
  country is read in the browser by `PricingProvider` and the server
  re-checks it at the point of sale. When allowed abroad, a home visit is
  still priced in rupees.
