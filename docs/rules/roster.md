# Therapists: roster, readiness and assignment

Availability as periods over hour rows, specialisation as a value, what readiness means, automatic assignment, therapist-suggested sessions, and completing one.

**Mostly lives in:** src/lib/availabilityRanges.ts · therapistSpecialties.ts · therapistReadiness.ts · autoAssignTherapist.ts · sessionSuggestions.ts

> Part of `docs/rules/`. `CLAUDE.md` says which file a task needs; this one
> is the detail. Keep it current in the same change that makes it wrong --
> see the docs rule in `docs/rules/testing.md`.

---

- **Availability** = weekly template + per-date exceptions + leave flag, then
  a conflict check (`src/lib/therapistAvailability.ts`,
  `src/lib/checkTherapistConflict.ts`). It is the clinic's planning record -
  who can be *offered* - and it deliberately does **not** filter the
  patient's `/book` picker, which is the lead-time rule alone. Connecting
  the two is a product decision with a deploy-sized blast radius, not a
  refactor; `e2e/therapist-roster.spec.ts` R-B02 is the guard.
- **Nobody edits an hour.** The roster is managed as working *periods*
  ("Monday 9 AM – 1 PM and 2 PM – 6 PM") on one shared editor
  (`WeeklyScheduleEditor`, used by the therapist's own screen and the
  admin's Roster), and `src/lib/availabilityRanges.ts` converts between those
  periods and the hour rows the tables store. The storage model is
  unchanged and must stay that way: every existing schedule, including a
  sparse exception written one cell at a time by the old grid, reads back as
  exactly the same hours. Six rules hold this together:
  1. **The three concepts stay separate.** A weekly schedule is what
     somebody normally works; an exception is one date that differs; leave
     takes them off entirely. Leave never clears the schedule -- there is
     nothing to restore on the way back because nothing was removed -- and
     an exception never edits the weekly template.
  2. **Availability never touches an appointment.** Removing hours a session
     is booked into names who is affected and says the session stays as
     booked. Nothing here cancels, moves or flags one; the two systems are
     separate and the booking wins.
  3. **A weekly save is a compare-and-swap under a real row lock**
     (`save_therapist_weekly_schedule`, versioned by
     `therapist_schedule_state`), and a date exception replaces its whole
     day in one function (`set_therapist_date_exception`). A stale save
     asking for different hours is refused with 409; a double-clicked Save
     -- two identical requests carrying the same stale version -- is a
     no-op success, because it is one logical change. Never go back to the
     unlocked delete-then-insert this replaced.
     **A therapist with no `therapist_schedule_state` row asks for no
     compare-and-swap, and that is `null` rather than `0`.** Both readers
     defaulted the absent row to version `0` while
     `lock_therapist_schedule_state` creates it at `1` and returns 1 -- so the
     **first** save for every therapist read `0 <> 1`, and the screen answered
     "This schedule was changed by someone else" on a schedule nobody had ever
     touched. It was reported as an error on every add, and it was: the guard
     fired on exactly the case it exists to permit. The SQL already treats a null
     expected version as "no CAS asked for" (`if p_expected_version is not null
     and ...`), so `initialVersion` is `number | null` through
     `WeeklyScheduleEditor` -> `saveWeeklySchedule` -> both routes and no schema
     change was needed. The guard is unchanged for the case it was written for:
     two admins editing a therapist who already has a state row still get the 409
     and the reload offer. Never default a missing version to a number -- `0` is
     a version somebody could hold, and absence is not.
     **Null is a claim, and the database checks it.** Null also used to be what
     a screen sent when its read *failed* and it drew an empty week -- and that
     save wrote straight through, replacing the real roster with nothing. The
     newest `save_therapist_weekly_schedule` reads whether a state row exists
     *before* the lock creates one: null with no row is a first save, as above;
     null with a row is treated like a stale version (no-op if identical,
     otherwise the 409). And the therapist's screen never offers the editor on
     a failed read in the first place: `availabilityLoadFailed` swaps it for an
     error card (`therapistDashboardData.ts`), because an empty week from a
     read that never happened is indistinguishable from "no hours set".
  4. **The editor opens read-only, with an Edit button.** Every day row used to
     render live `<select>`s and a Working/Off switch from the moment the screen
     opened, so reading somebody's hours and changing them were the same act and
     a mis-tap on a picker was a change. The read view is
     `WeekScheduleSummary` -- the component the roster list and the admin's own
     card already use, never a second read-only layout -- and the edit branch
     keeps all of the existing machinery unchanged: the `saved`/`draft` pair, the
     `dirty` test, the sticky unsaved-changes bar, the `beforeunload` guard, the
     `inFlight` ref and the removed-hours conflict panel. Only the gate is new,
     and saving closes it. Exceptions and Time off already require an explicit
     **Add**, so they keep their shape.
  5. **The roster reads both ways round, and the second is a view switch.**
     Therapists / Day on `AdminRosterTab`, per the "a different arrangement of
     the same rows is a toggle, not a sidebar entry" rule. Day view answers "who
     is free on Thursday", which the screen next door could not answer at all --
     an admin taking a call opened each therapist in turn and held the answer in
     their head. `src/lib/rosterDay.ts` is the judgement, dependency-free and
     unit-tested: it **composes** `computeDayAvailability` rather than
     re-deriving the template-plus-override precedence, counts an hour busy when
     a session *overlaps* it rather than starts on it (a 90-minute session at 2 PM
     takes 3 PM with it, judged the way `checkTherapistConflict` does), names the
     **earliest** of two clashing sessions so a double booking is visible, and
     returns **every** hour of the day -- `off` and `free` are different words,
     because a strip showing the survivors alone makes a therapist who works
     mornings look identical to one who is fully booked. It is a
     **route** (`/api/admin/roster-day`, `requireAdminScope("sessions")`) rather
     than more server-render work: the dashboard already fires ~82 queries a
     render and a date an admin picks is fetched on demand. A failed read is a
     503 and says so, never a day with nobody working.
  6. **Selecting a therapist moves the reader to the schedule.** The detail card
     is a sibling below the list and usually below the fold, so a tap changed a
     screen nobody could see. `scrollIntoView` keyed on the selection, skipped on
     first mount (the screen opens with one preselected, and scrolling on arrival
     moves a page nobody asked to move), `behavior: "auto"` under
     `prefers-reduced-motion`, and focus moved to the region so the change is
     announced rather than only animated.
  **Day view is read-only by design, and so is the day itself.** Nothing on
  either roster screen books, moves or frees an hour: the roster is the clinic's
  planning record and it does not filter the patient's own picker. A free hour
  there means "nobody has it and she works then", never "sell it" --
  `e2e/therapist-roster.spec.ts` R-B02 is the guard and stays exactly as it is.
  **A therapist writes their own date exceptions**, the way they already set
  their weekly hours and their leave -- the owner's decision, made explicitly
  (it used to be admin-only, and the screen said so). Both doors go through
  `src/lib/dateException.ts` and the same locked `set_therapist_date_exception`:
  `/api/admin/set-availability-exception` (scope `sessions`, any date, logged
  to admin activity) and `/api/therapist/set-availability-exception`, which
  takes **no therapist id** (it writes the signed-in therapist's own),
  requires an active, approved therapist like the weekly and leave routes, and
  refuses a date before the therapist's own local today -- a past date is
  history the clinic planned against; an admin can still correct one. Like
  everything else on the roster, an exception never touches a booked session.
- **A specialisation is a value, not a sentence.** `profiles.specialization`
  was free text: one line of prose written on the therapist's own profile
  screen and printed raw on /team. That was enough until an admin needed to
  answer "who do we have for a stroke patient?", at which point "Neuro
  rehab", "neurological physiotherapy" and "Neuro" are three strings and no
  filter can be built out of them.
  `src/lib/therapistSpecialties.ts` is the list and the judgements; the
  column is unchanged and still text, and is deliberately **not** CHECKed
  against that list. Five rules:
  1. **What is stored is the canonical label** (`"Orthopaedic"`, never
     `"ortho"`). That is what keeps every surface which already printed the
     column raw -- a profile change-request card, an export, a screen nobody
     has touched -- correct with no edit, and it is why a therapist already
     described as "Orthopaedic" needs no backfill. The key exists for
     filtering and for the chip's colour, and is derived on read.
  2. **Free text is honoured, never blanked.** `specialtyLabel` prints an
     unrecognised value exactly as its author wrote it and
     `normalizeSpecialty` answers null for it; the filter files it under
     *Something else*, separately from *Not set*, because the two ask for
     different work -- one is a value to tidy up, the other one to collect.
     The alias table is explicit on purpose: guessing that "sports injury
     clinic - neuro trained" is one of the eight is how somebody ends up
     filed under a specialty nobody chose.
  3. **Nothing is shown for nobody having said.** `SpecialtyChip` renders
     null rather than "Unknown" -- a label on an absence, on every such
     profile, buries the ones carrying a fact.
  4. **It is asked for where an account is made**, both doors: the public
     application form (required, carried in the signup's own metadata and
     copied onto the profile by `handle_new_user` beside `credentials`) and
     User Access's create-account form (optional -- they can set it
     themselves). `/api/admin/create-account` re-derives it through
     `storableSpecialty` rather than storing what the browser sent.
     **Years of experience is asked at both doors too**, and it is a number
     rather than a sentence for the same reason the specialty is a value:
     `profiles.years_experience` existed and nothing wrote it, so the one figure
     a patient uses to judge a clinician was never collected.
     `src/lib/therapistExperience.ts` is the judgement --
     `MAX_YEARS_EXPERIENCE` is 60, and `parseYearsExperience` returns three
     outcomes rather than two: a number, `null` for "not given", and
     `undefined` for "given and unusable", which is what somebody typing a
     *year* (`2024`) produces and is not the same fact as not answering.
     `handle_new_user` clamps it server-side behind a digit regex, per the rule
     that signup metadata is never trusted -- the same reason `v_role` is
     clamped there.
  5. **The therapist's own editor is a dropdown that includes their current
     value** when it is not one of the eight. Without that second half a
     legacy value has no matching `<option>`, the browser shows the first
     one instead, and the screen misreports what is stored -- on a field
     that goes to patients and through admin review.
  A new surface showing a therapist shows the chip; a new list of
  therapists takes the filter. `e2e/therapist-specialty.spec.ts` is the
  guard, driven as screens because none of this changes what a route
  answers.
- **Completing a session is a financial write with a clinical name.**
  `status = 'completed' && payment_status = 'paid'` is the exact and only
  condition making a therapist's revenue share payable, so
  `/api/appointments/complete-session` gates the therapist's own path two
  ways (and an admin's neither, since a backfill or a correction is exactly
  what the override lane is for): nothing may be completed with no payment,
  no programme behind it and no cash recorded - a cash home visit collects
  first, which is the right order anyway - and nothing may be closed
  before it could have happened: **Done** opens at the scheduled start,
  and **No-show** only once the patient is past the late-arrival grace
  (`join_window_after_minutes`; `src/lib/sessionCompletion.ts`). Both used
  to open at "slot minus join window", so a no-show could forfeit a
  patient's programme credit and create earnings before the patient could
  possibly have been late. A "not yet" refusal answers 409 with
  `notYet: true`, which the buttons show without refreshing the card.
  **The admin half of it is a Sessions write, and asks for `manage`.** This
  is the one route shared between a therapist and an admin, so it cannot
  call `requireAdminScope("sessions")` outright -- it has to tell "an admin
  who may not" from "not an admin at all", and only the second falls through
  to the owning-therapist check. It reads `getAdminContext()` and applies
  `scopeCanManage(scope, "sessions")` itself, which is the same answer
  `requireAdminScope` gives. It used to take `getAdminUser()`, meaning any
  desk at all: Finance holds Sessions at `view` precisely so the person
  reconciling the books cannot change what they are reconciling, and this
  route let them close a session -- creating the payout obligation, exempt
  from both gates above. `ProfileSessionList` hides the two buttons on the
  same test, per the "a control an admin's scope cannot call must not
  render" rule.

- **A paid session assigns itself when the answer is unambiguous, and
  otherwise waits exactly as it did.** `src/lib/autoAssignTherapist.ts`,
  called from `/api/razorpay/verify` and `/api/razorpay/webhook` -- both, so
  a patient who pays and closes the tab gets the same outcome as one who
  waits for the page. It reads the roster (template + that date's
  exceptions + `on_leave`) and `findTherapistConflict`, and assigns only
  when **exactly one** eligible therapist is free, or when the patient's own
  `preferred_therapist_id` is among the free ones. Zero or two-or-more
  returns null and the appointment stays `requested` and unassigned in the
  admin queue -- the pre-existing behaviour, and deliberately the fallback,
  because assigning the wrong clinician is far worse than the wait this
  removes. `decideAutoAssignment()` is that rule with the database taken
  out, so the judgement is unit-tested rather than only integration-tested.
  It never throws: this runs inside payment confirmation and a booking must
  never fail for it. The roster's date and hour are **clinic-local**
  (`clinicDateKey` / `clinicHour`) - they were read off the server's clock,
  so on a UTC host a 9:00 IST booking looked for a 03:00 slot and every
  session stayed unassigned. Gated by `site_settings.auto_assign_therapist_enabled`,
  read in its own call and failing **closed**.
  **This is not the roster filtering the patient's picker** -- that
  separation stays, and `e2e/therapist-roster.spec.ts` R-B02 still guards
  it. The roster's own job is who can be *offered* a session, which is
  exactly what is being read.
  **And the machine holds itself to a higher bar than a person does.** It
  applies `canAutoAssignTo` (`src/lib/therapistReadiness.ts`) on top of the
  roster, refusing a therapist with no working hours or **no revenue share**
  -- an assignment made with nobody watching whose failure is silent, since
  the session is delivered and the therapist is then owed nothing for it
  with no screen saying why. It deliberately does *not* refuse over a
  missing specialisation, which costs a patient a sentence on a profile page
  rather than making an assignment wrong; refusing there would leave paid
  sessions in the admin's queue for a field nobody was told about.

- **Approved is not ready, and the difference is derived rather than
  flagged.** `profiles.approved` means "a person vetted this account" and
  the product reads it as "ready to be assigned", which are different facts.
  `src/lib/therapistReadiness.ts` holds the five things this app itself
  needs -- approved, not suspended, hours on the roster, a revenue share, a
  specialisation -- and it is a **derivation, never a column**: a
  `production_ready` flag somebody ticks is a second source of truth about
  facts the app already holds, written by every path that changes a roster
  or a rate and unwritten by every path that clears one, and the first time
  it drifts it is the thing nobody trusts. Three rules:
  1. **Nothing on the list is invented policy.** Every item is something the
     code already requires. A genuine clinic policy -- insurance, a signed
     contract, a qualification check -- is deliberately absent and wants a
     note on the account rather than a gate here.
  2. **Advisory for a person, binding for the machine.** Nothing disables a
     control: an admin assigning has the therapist in front of them, and a
     gate on a field nobody was told about is worse than the state it
     replaces. The automatic assigner is the opposite case, above.
  3. **A ready therapist gets no panel at all.** A green "all set" card on
     every profile is a row a reader learns to scroll past, and then misses
     the one profile that is not -- the same reason an unrefunded session
     carries no refund chip.
  Leave is not on the list: it is a temporary state somebody set on purpose
  rather than something missing from an account, and the roster reads it
  already. A therapist on leave is not *unfinished*. A new reader of
  "is this therapist ready" takes one of that module's two answers rather
  than growing a third.

- **A therapist suggests; the patient books.** A therapist can propose the
  next session on a programme locked to them
  (`/api/therapist/suggest-session`), and the patient accepts or declines
  (`/api/patient/respond-suggestion`). Three rules hold the design together
  and none of them is optional:
  1. A suggestion is its own row (`session_suggestions`), never an
     appointment in a new status. `sessions_used` counts sessions *claimed*;
     a suggestion claims nothing, and storing it as an appointment would
     either spend a session every decline had to refund or leave a row the
     counter deliberately ignores. Only acceptance calls
     `bookPackageSession()`, which is what makes the count move.
  2. No slot is held. A hold needs releasing, releasing needs a sweep, and
     there is no scheduled worker -- so the therapist's calendar is
     re-checked at acceptance instead.
  3. Nothing writes an "expired" status. A pending suggestion simply stops
     being acceptable once its slot is inside the booking lead time, computed
     by `suggestionState()` in `src/lib/sessionSuggestions.ts` everywhere it
     is read. `status` records explicit human actions only.
  At most one pending suggestion per purchase, enforced by a partial unique
  index rather than a route check, because a double tap defeats
  SELECT-then-INSERT. **Every read in the suggest route answers a failure
  with 503 ("we couldn't check ... nothing was sent"), never with a
  refusal.** It used to fall through: a dropped profile read said
  "Forbidden", the feature-switch read said "switched off", the purchase read
  said "no longer exists" -- each a false statement, and the cause of
  `session-suggestions` SS-003 failing intermittently under load (one of six
  simultaneous taps came back as neither a suggestion nor a duplicate; 96
  taps in bursts of 12 never produced two suggestions). SS-003 now prints
  every status and accepts only 409 or that explicit 503 beside the single
  200. The advisory calendar check (`findTherapistConflict`) still reads a
  failure as "no conflict"; acceptance re-checks it. Both dashboards' controls guard submits with a
  synchronous ref (a `disabled` attribute lands a render too late) and never
  clear optimistically, so a request that dies on a bad connection leaves the
  person exactly where they were. Gated by
  `site_settings.therapist_suggestions_enabled`. The column's default is now
  **true** -- a finished feature nobody can reach drifts out of test coverage
  and accrues maintenance for no return -- but that default applies to a
  **fresh** database only. `site_settings` is a singleton that already
  exists, so an established clinic keeps its current value until an admin
  toggles it, or until a reset restores defaults. Applying a schema file must
  not turn a live feature on by itself.
