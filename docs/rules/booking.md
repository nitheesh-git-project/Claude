# Booking a session

Lead time, the whole-hour rule, the one month grid, the service picker, and asking for a named therapist.

**Mostly lives in:** src/lib/bookingSlots.ts · src/components/booking/ · src/app/api/appointments/

> Part of `docs/rules/`. `CLAUDE.md` says which file a task needs; this one
> is the detail. Keep it current in the same change that makes it wrong --
> see the docs rule in `docs/rules/testing.md`.

---

- **A patient holds one session at a time, and the database says so.**
  `/api/appointments/create` checks for an overlapping live session for
  immediate feedback, but a check and an insert two statements apart let two
  requests fired together both pass. `trg_appointments_patient_no_overlap`
  (insert only, per-patient advisory lock) is what binds, raising `23P01`;
  every inserting route maps that to a 409 in words. The same purchase at
  the same instant is exempt - that is a retried booking, and the unique
  indexes' `23505` already answers it as "that visit exists".
- **Booking lead time** is `site_settings.online_booking_lead_time_hours`,
  defaulting to the 12 hours `src/lib/bookingSlots.ts` still holds as
  `BOOKING_LEAD_TIME_HOURS`, and shared by the picker and the validator so
  they cannot drift apart.
  **The constant is the fallback, never the answer, and three surfaces had it
  the wrong way round.** `/api/appointments/create` has read the column since
  it became a setting; `/book`'s Step 1 filtered its calendar on the constant
  and printed the constant in *"at least N hours from now"*, `AssignReferralForm`
  validated against the constant, and `/api/admin/assign-referral` re-checked
  against the constant. So a clinic that widened its window was offered a slot
  by its own picker, and the patient met the refusal at the last step of
  checkout -- the "two answers to when can this be booked" failure this bullet
  is otherwise about, reintroduced one level up the moment the rule became
  configurable. All four read the setting now: `/book` loads it in its own
  isolated query beside the three settings already there, `BookingWizard` takes
  it as `bookingLeadTimeHours` and passes `leadTimeMsFromHours()` through to
  `bookableHoursForDate` / `BookingCalendar`, and `AdminSlotPicker`'s own hint
  reads the hours back off the value in force rather than printing the
  constant. `/book` is ISR-cached, so `update-setting` revalidates it for this
  key as it already did for `booking_languages`. A new surface that judges
  whether a slot is far enough ahead takes the hours as a prop or reads the
  column; there is no third source.
  **An admin screen that sets a session time reads that module too.**
  `AssignReferralForm` used `<input type="datetime-local">` with a
  five-minute floor, so an admin could promise a referred patient a slot the
  platform's own rule refuses - two answers to "when can this be booked", in
  the one flow where the person choosing is not the person who lives with
  it. `AdminSlotPicker` (`src/components/admin/`) is the patient's control,
  inline and compact: the same `BookingCalendar` in its `compact` mode (a
  mode, never a second calendar - forking it is how the two grow different
  ideas of which dates are bookable) plus hour chips from
  `bookableHoursForDate`, and `/api/admin/assign-referral` re-checks the
  lead time server-side rather than trusting the browser. It is deliberately
  **not** a dialog: the slot is chosen against the referral it sits inside.
  **Every screen that picks a session slot now renders that one control**,
  and `BookingCalendar` is the only month grid in the app: the two bulk
  schedulers kept private copies of it for one difference - a dot on days
  already holding a chosen slot - which is a `markedDateKeys` prop now;
  `AdminNewBookingTab` and `EditBookingForm` dropped their native
  date/time/datetime-local inputs; and the therapist's `SuggestSessionControl`
  dropped a date box beside an hour dropdown that could offer a time the
  patient's own screen would then refuse.
  **The lead time is a prop, and zero is the override lane.** `leadTimeMs` on
  `AdminSlotPicker` defaults to the patient's 12 hours; `EditBookingForm`
  passes 0 (moving a session that already exists is not a booking) and
  `AdminNewBookingTab` passes 0 only while its existing
  "book inside the window anyway" box is ticked, so the grid opens up exactly
  when the route would accept it. Zero still cannot reach into the past.
  **The service is chosen before the slot, from one picker.** Both public
  wizards used a native `<select>` of one line per option -- `/book` in Step
  2, so a patient picked a date and an hour while the header still read
  *"pricing shown once you pick a concern"*, and the session length that
  decides whether that slot clashes with anything was not on screen either;
  `/book-home-visit` in Step 3, where `sellablePackages.length > 1` gated it,
  so with one package it never rendered and the patient reached the payment
  screen never having seen what they bought. `ServicePicker`
  (`src/components/booking/ServicePicker.tsx`) is the replacement and it is
  the first block of Step 1 on both. Five rules:
  1. **One dialog, two views, never two dialogs.** *View details* swaps the
     dialog's contents and offers `← Back to all services`. The public
     `src/components/Modal.tsx` is not portalled and sets `backdrop-blur-sm`,
     so a nested `fixed` overlay is measured against that panel's scrolling
     box rather than the viewport -- the failure `OverlayPortal` exists to fix
     elsewhere. It is also the better reading: two stacked sheets leave
     somebody unsure which Escape closes what.
  2. **The cards are `CatalogCard`**, in its select mode (`onSelect`,
     `selected`, `selectLabel`, typed as a union with link mode so a card
     with neither a destination nor a handler cannot compile). A second card
     is how two screens grow two ideas of what the clinic sells. Choosing is
     a **button**, never a link: the patient is inside a wizard holding a
     date, an hour and a language in React state, and navigating throws all
     of it away.
  3. **`src/lib/serviceOptions.ts` maps the rows**, dependency-free and
     unit-tested, because which chips, which price unit and which figures a
     patient reads is a judgement rather than markup. It never defaults a
     focal point to a number: `clampFocal` answers an absent one with dead
     centre, and a `0` handed to it is the top-left corner.
  4. **With exactly one option there is no picker.** It is stated as chosen,
     with its photograph, its price and a way to read the detail -- a dialog
     that opens to show a single card asks somebody to tap twice to confirm
     the only thing on offer. `/book-home-visit` keeps its default-to-first
     initializer, so that case behaves exactly as it did.
  5. **Continue appears once a service is chosen**, which is `serviceChosen`
     in `BookingStepOne`'s `ready`. Step 1 has always revealed it only when
     the screen is complete; a disabled control would be a new pattern there.
     Steps 2 and 3 keep the choice as one read-only line with a Change link,
     never a second control over the same value.
  Only what `isDirectlyPurchasable` allows is ever offered, so a programme
  still reaches a patient through a recommendation alone.
  `e2e/service-picker.spec.ts` is the guard, driven as screens because no
  route, no request body and no row changed.

  **A slot starts on the hour, and the routes say so.** `isWholeHourSlot()` in
  `bookingSlots.ts` refuses anything else at all ten doors that write a slot
  time - `/api/appointments/create`, `book-package-sessions`,
  `book-with-package` (the single-session door, which was the gap),
  `/api/admin/create-booking`, `update-appointment`, `assign-referral`,
  `/api/therapist/suggest-session`, `/api/home-visit/book-visits`,
  `book-cash` and `verify` - with one shared message
  (`NOT_WHOLE_HOUR_ERROR`). Two admin screens used to reach `6:52` through a
  raw `type="time"` / `datetime-local`; they share the picker now, and this
  is the same rule where a request cannot get round it. **It is checked in
  the booking's own timezone, never the server's**: India is UTC+05:30, so 6
  PM IST is 12:30 UTC and reading the minute off the instant would refuse
  every correct booking in the clinic while passing one half an hour out.
  The wizard builds slots in the *patient's* local time and records which
  zone that was, so that column is the one to judge against - `update-
  appointment` reads it off the appointment row, which is why its check sits
  below the fetch rather than beside the other argument validation. An
  unknown IANA zone falls back to `CLINIC_TIMEZONE` rather than passing.
  The rule is enforced where a human *picks* a time, never where one is
  *consumed*: `/api/patient/respond-suggestion` and `register-via-referral`
  book a slot somebody already agreed to, so a legacy row carrying minutes
  is still honoured rather than stranded.
  **A date that is not a session slot picks from the same grid, through
  `DateField`.** Those twenty-eight -- a report's date, a leave range, a promo
  campaign's window, a document's date, the roster's own exceptions, and every
  from/to filter (Metrics, Costs, Activity Log, All Sessions, Payment History,
  Business Health, Earnings, the Finance inputs, the Calendar tab's day) -- used
  to keep `<input type="date">` on the reasoning that they have no hours and no
  lead time, so a control whose disabled state means "too soon to book" would be
  lying on all of them. That reasoning was right about the *rule* and wrong about
  the *control*: the browser's own panel is unstyled, worded differently and
  placed differently on every browser and every phone, and it is the one piece of
  UI in this product nobody designed -- the same objection
  `FormValidationChrome` answers for a blank `required` box one control over.
  `src/components/system/DateField.tsx` is the replacement, and four things hold
  it:
  1. **It extends the one month grid rather than forking it.**
     `buildCalendarMonth` / `isMonthEntirelyUnbookable` take an optional
     `bounds` (`DateBounds` in `bookingSlots.ts`) so the same component can offer
     a past date, which `isDateBookable` cannot express and never should --
     `BookingCalendar` passes no bounds and books exactly as it did. A second
     month grid is how two screens grow two ideas of which dates are pickable.
  2. **`src/lib/dateFieldValue.ts` is the value layer**, dependency-free and
     unit-tested, and it emits **exactly** what the native inputs emitted
     (`YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` with `withTime`). Every one of those
     twenty-eight call sites reads its value straight into a query, an ISO parse
     or a route body, so a control that emitted anything else would be a
     behaviour change dressed as a restyle.
  3. **A clock is read on open, never during render.** `react-hooks/purity`
     refuses `Date.now()` in a render, and a caller that has no "today" of its
     own passes `maxToday` rather than reading one itself.
  4. **It is portalled and uses `useDialogChrome`**, per the nested-overlay rule
     -- every dialog in this app carries `backdrop-blur-sm`, so a `fixed` popover
     opened inside one is measured against that modal's box.
  `src/components/DebugNav.tsx` is the single exemption: the pre-launch bar is
  deleted before launch, is read by no patient and no admin, and is the one place
  somebody genuinely wants to type an instant.
  `src/lib/nativeDateInput.test.ts` walks every `.ts`/`.tsx` in `src/` and fails
  on a native date, time, month or week input -- the same shape and the same
  reasoning as `formatDateTime.test.ts`'s walk for unzoned dates, because this is
  a mistake that produces no error, no failed request and no wrong row. A
  `<select>` is deliberately **not** in scope: eighty-odd of them are this app's
  norm for a bounded choice and they are ordinary form controls rather than an
  OS-drawn panel.
- **A therapist chosen on `/team` is a request, not an assignment.**
  `/book?therapist=<id>` resolves the id against `public_therapist_profiles`
  (client-side, since `/book` is ISR-cached) and writes
  `appointments.preferred_therapist_id` - the same field the wizard's
  "continue with the same therapist" dropdown has always written, read by
  `AssignTherapistForm`. Only the admin can see whether that therapist is
  actually free for the slot, so never word this as a confirmed booking. A
  therapist the public view hides (suspended, unapproved, `visible_on_team`
  off) resolves to nothing and the request is dropped silently rather than
  failing the booking.
- **The way to the payment sheet is kept short, and the exit link is withheld
  until paying has failed.** Three things used to stack on the first tap of Pay.
  `checkout.js` was only downloaded on that tap, then the order was created,
  one after the other -- so both wizards now call `preloadRazorpayScript()`
  (`src/lib/razorpay.ts`) on mount, and `payForAppointment` / `payForHomeVisit`
  start the order request *before* awaiting the script, so a cold load costs the
  slower of the two rather than their sum. `BookingWizard` also no longer runs
  its own overlap query or `auth.getUser()` before `/api/appointments/create`:
  the route (and `trg_appointments_patient_no_overlap`) already answer a clash,
  and `getSession()` reads the stored session without a round trip. Separately,
  the page-level `BookingExitLink` sits outside the wizard, so it showed
  "Back to Dashboard" beside the Pay button of a patient who had not yet tried
  to pay. `src/lib/bookingPaymentTrouble.ts` carries the two facts across
  (`onPaymentStep`, `failedAttempts`); `exitLinkHidden()` hides the link on the
  payment step until `MAX_ATTEMPTS_BEFORE_ESCAPE` (3) failures, which is also
  when the wizard's own dashboard escape appears. Keep both on that one constant.
