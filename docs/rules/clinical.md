# The clinical record

Per-specialty intake, the Pain Map, care plans and their review, session notes, patient files, who may read a record, and the vocabulary all three roles share.

**Mostly lives in:** src/lib/conditionIntake.ts · painMap.ts · neuroExam.ts · outcomeMeasures.ts · milestones.ts · patientDiary.ts · careStatus.ts · geriatricRisk.ts · cardioSafety.ts · sessionProtocols.ts · assessmentRun.ts · carePlanAuthoring.ts · clinicalAccess.ts · healthProfileSummary.ts

> Part of `docs/rules/`. `CLAUDE.md` says which file a task needs; this one
> is the detail. Keep it current in the same change that makes it wrong --
> see the docs rule in `docs/rules/testing.md`.

---

- **Patient Care Intake and Pain Map are two separate data layers**, and
  the intake is **per specialty**. A `patient_condition_profiles` row
  carries `specialty` - `ortho`, `neuro`, `pediatrics`, `geriatric` or
  `cardiopulmonary` (the last two since phase 6a, below) - and that
  decides its question set (`src/lib/intakeOrtho.ts` / `intakeNeuro.ts` /
  `intakePediatrics.ts` / `intakeGeriatric.ts` / `intakeCardio.ts`,
  assembled in `conditionIntake.ts`), its summary card, its snapshot strip
  and its progress line. Four things about this are load-bearing:
  1. **Question keys are globally unique across the five sets and `data`
     stays flat.** Ortho keys are unchanged, neuro keys are all `neuro_*`,
     peds keys all `peds_*`, geriatric keys all `geri_*`, cardiopulmonary
     keys all `cardio_*`. That is what lets a re-triaged patient keep
     the previous specialty's answers in the same blob (hidden, never
     deleted) with no jsonb migration inside a re-runnable file. A
     module-load assertion in `conditionIntake.ts` throws if the rule is
     ever broken - violated silently it cross-contaminates two patients'
     charts.
  2. **Applying an approved change MERGES, it does not replace.**
     `mergeSpecialtyAnswers()` keeps every key the incoming specialty does
     not own. The approve path used to write `data: proposedData`
     outright, which under re-triage deletes a patient's whole
     orthopaedic record the moment a neurological one is written. **And
     what is kept is offered back:** a therapist taking a patient back to a
     condition type they had before gets that type's latest answers
     prefilled, ready to edit (`intakePrefillAnswers()`: a same-type draft
     first, then the answers on file, only that type's keys, never a
     blank). It used to open blank while the answers sat hidden in the same
     blob. Saving is an ordinary `/onboard` write -- one new approved
     history entry, nothing earlier rewritten.
  3. **`schema_version` is per specialty**
     (`INTAKE_QUESTIONS_VERSION_BY_SPECIALTY`), so it means "version of
     *this profile's own* set". One shared scalar bumped to 3 would have
     fired the "we've changed some of these questions" banner at every
     existing patient even though ortho's seven are byte-identical.
  4. **Pain Map is ORTHOPAEDIC and stays so; the neurological exam is its
     own layer.** A non-ortho page does not merely hide the body map - it
     never queries `pain_assessments` (both health-profile pages do a
     two-phase read to know the specialty before choosing what to fetch),
     and both Pain Map submit routes 400. The neurological layer was built
     exactly as this rule said it would be: a **new table**
     (`neuro_assessments`), its own module (`src/lib/neuroExam.ts`), and one
     more arm on `SpecialtyExamPanel` (`NeuroExamPanel`) - never a
     `specialty` column on `pain_assessments`. Its components import
     nothing from `painMap.ts` (no `PAIN_MAP_REGIONS`, no `parseAreaPain`);
     that import boundary is what keeps the rule true in practice. The
     paediatric layer followed the same shape (phase 5a, below): its own
     table (`peds_assessments`), its own module (`src/lib/pedsExam.ts`),
     nothing imported from `painMap.ts` or `neuroExam.ts`.

  **The therapist owns the first fill, and it is not reviewed.** A
  patient's record does not exist until a therapist triages them
  (`ConditionTriageDialog`, four questions in
  `src/lib/conditionSpecialty.ts` that *suggest* a specialty with its
  reason shown, never auto-accepted) and fills that specialty's set.
  `/api/therapist/condition-profile/onboard` needs only
  `isTherapistAssignedToPatient` and writes **live**. Both halves matter:
  the access-grant queue cannot sit in front of the first record ever
  existing (the exact failure the Pain Map gate was changed to avoid),
  and the patient is locked out of their own health profile until it
  lands, so an admin approval in between would leave them on a read-only
  screen after their session with nothing happening. Live is not
  unrecorded - every onboarding and re-triage writes an
  already-`approved` `condition_change_requests` row, the pattern
  `ConditionDirectEditForm` already uses, so it appears in the ordinary
  Review History with no new concept and no queue.

  **And it writes exactly one, which took two goes to get right.** The claim
  is a compare-and-swap so only the caller whose write lands writes the
  history entry -- that took ten taps down from ten entries to **two**, not
  to one, and the audit found the remainder. The route has two paths, an
  INSERT when no record exists and an UPDATE when one does, and they guard
  different races: a burst splits across both, so one caller wins the insert
  and another wins the first update, and each believes it was first. Both are
  right from their own view, which is why guarding the paths harder cannot
  fix it. The honest test is whether the request changed anything clinical,
  so an identical resubmission now writes **nothing at all** -- no record
  update, no history entry (`isSameIntakeSubmission`, keyed on the thing that
  happened rather than on who got there first, the same rule the credit
  ledger's idempotency keys follow). It compares the answers, the triage
  answers and the condition type, and deliberately not `updated_at` or
  `last_submitted_by`, which are bookkeeping and identical on a double-tap
  anyway. `e2e/health-profile.spec.ts` SPAM-001 is the guard; a record that
  is not yet `active` is never a no-op, since a draft going live is exactly
  what onboarding does.

  **The line is create versus edit.** Deciding what kind of patient this
  is, and writing down what they told you in a session you ran, is the
  therapist's own clinical record - the same kind of thing a Pain Map
  exam or a session note is, and gated the same way. *Editing* a live
  record on the patient's behalf is editing their own account of their
  history and still needs an admin-approved `condition_access_grants`
  request plus review (`/api/therapist/condition-profile/submit`).

  **The patient is read-only until that first fill**, computed once by
  `patientIntakeGate()` - a four-state union, not a boolean, because "not
  yours to do" and "yours, but not right now" need different copy. It is
  enforced in `submit` *and* `save-draft` (which flips `status` to
  `draft`, one of the gate's own inputs) and in
  `condition_change_requests_insert_gated`, without which the lock is
  cosmetic: `revoke` on that table only ever covered `update`. While
  locked, the CTA and the answered counter are **absent**, not disabled;
  the amber dashboard banner is dropped entirely rather than recoloured;
  the overview cell reads `-` on slate rather than `0%` on amber; and the
  reports uploader stays **open**, because it is the one useful thing the
  patient can do beforehand.

  Patient Care Intake is filled through a one-question-at-a-time pop-up
  (`ConditionIntakeWizard.tsx`), never as a form rendered on the
  dashboard: a wall of seven fields is what patients read as paperwork
  and abandon. A new question therefore needs `helpText` (why this answer
  matters, in the patient's words) and a `shortLabel` alongside its
  `label`. The therapist's own surfaces invert that pacing on purpose -
  the triage dialog shows everything at once with headings, the same rule
  `PainExamDialog` follows: a clinician filling this after every
  assignment wants to scan it, and the gentleness is for the patient who
  does it once. Once answered, the dashboard shows the answers, never
  inputs, and every reading figure on the page is derived in
  `src/lib/healthProfileSummary.ts`, not inside a component - that module
  now carries `orthoSnapshot` / `neuroSnapshot` / `pediatricsSnapshot`
  plus `intakeTrendSeries()`, which gave the two specialties that had no
  exam layer a progress line read back out of the approved submissions
  already on file (no new table, no cron).

  Pain Map (`pain_assessments`, `pain_map_question_templates`, region and
  question logic in `src/lib/painMap.ts`) is therapist-only, per-region
  clinical exam data that posts live immediately with no review step, and
  is append-only (a re-assessment is a new row, never an edit) so the UI
  can show a trend against the previous visit. Recording one requires
  only that the therapist is **assigned** - enforced by
  `pain_assessments_insert_assigned_therapist` and mirrored in the submit
  route by `isTherapistAssignedToPatient`. *Read* access needs no request
  either way and is automatic for the assigned therapist. Both layers
  render on **one** body-map surface (`PainMapExplorer.tsx`), and that
  same surface is where an exam gets recorded - via `PainExamDialog`, not
  a form beneath the map. The region is chosen by tapping the figure (or
  a chip in the dialog), never a `<select>`, and it stays in the dialog
  header while the clinician types. Questions are grouped by
  `PAIN_EXAM_GROUPS` rather than listed flat.

  **The paediatric caregiver is a pre-step, not one of the seven.**
  `peds_caregiver_name` and `peds_caregiver_relationship` are ordinary
  flat keys - so the wizard, the required check, the admin's question
  bank and the PDF all handle them with no special case - but they are
  excluded from the seven-question count, because who is speaking for the
  child is provenance rather than a clinical question.

  **Admin edits wording per specialty, and can switch one off.**
  `intake_question_templates` is keyed `(specialty, question_key)`;
  Manage Questions has one tab per specialty (tabs, not stacked
  sections - twenty-odd textareas is the wall-of-fields shape this
  codebase keeps correcting). `enabled_intake_specialties` removes a
  specialty from **triage only**: an existing profile carrying it must
  keep rendering, and a therapist re-triaging such a patient is still
  offered it. Ortho can never be switched off. **Geriatric and
  cardiopulmonary are off until an admin switches them on**: the setting
  is the list of what triage offers, its default (and what an unreadable
  read fails open to) is the three original types, and a type the clinic
  has not staffed must not appear in a therapist's picker on deploy.

  **"None of these" means none of the others.** A `multi_select` whose list
  carries a "None" answer declares it in `exclusiveOptions`, and every tap
  goes through `toggleMultiSelectOption()` (`conditionIntake.ts`): ticking
  it clears the rest, ticking anything else clears it. Triage used to
  toggle each option on its own, so "None of these" and "Weakness on one
  side" both stayed ticked and the record contradicted itself. `/onboard`
  and `/save-draft` refuse the pair with a 400
  (`findContradictoryMultiSelects`) rather than guessing which half was
  meant, and both now store only known triage keys with string values
  (`sanitiseTriageAnswers`). `multiSelectExclusive.test.ts` fails on a new
  multi-select with a "None" option that forgot to declare it.
- **One authoring implementation, three doors.** A therapist writes their own
  recommendation from the session note dialog; an admin writes one on their
  behalf from Programmes → Recommendations when that therapist cannot reach the
  dashboard (on leave, off sick, gone, with a patient still waiting to hear);
  and an admin approving a queued one with different numbers writes a third,
  which is the same act again rather than an edit. All three call
  `authorCarePlanVersion()` in `src/lib/carePlanAuthoring.ts`, which
  is what stops the later doors growing weaker rules than the first: the
  price is still the condition's per-session price times the count, resolved
  server-side, the source still has to be a **completed session that
  therapist ran**, the text is still scanned, and there is still no price or
  discount field for anyone.
  Attribution is split rather than fudged - `authored_by` stays the clinician
  whose judgement it is, `entered_by` records the admin who typed it. Naming
  only the therapist would be a quiet lie about who was at the keyboard;
  naming only the admin a louder one about whose judgement it is.
  `/api/admin/author-care-plan` takes `requireAdminScope("programmes")`, a
  mandatory reason, and writes a `care_plan.author_on_behalf` audit row.
  **A version is published in one transaction, and only by the plan's own
  therapist.** The new version is inserted with `is_current = false`, and
  `publish_care_plan_version()` (schema.sql) moves both current flags and
  the plan's pointer together under a row lock - the old order (retire,
  insert, repoint, with the repoint's failure only logged) could leave a
  plan with no current version or pointing at one it did not hold. A new
  thread whose first version fails to publish is withdrawn, so it neither
  shows empty nor blocks the retry. An open plan belonging to another
  therapist is refused (409) rather than revised under their name.
  The admin's panel matches the therapist's dialog: both use
  `CarePlanFields.tsx` over the same `loadRecommendableRates()` list - every
  active online condition, starting on the chosen session's own - and the
  admin's draft is dropped when the chosen session changes. And whose name it goes out in is stated at the
  button rather than in a subtitle two screens up. It renders even with no session
  to write against or no recommendable package, saying which of the two is
  missing -- an admin opens this screen because a patient is waiting, and a
  panel that is simply absent reads as a feature that does not exist.

- **A recommendation is reviewed before it is published, and the review is
  evidence.** A therapist's submission lands `status = 'pending_review'` and
  the patient is shown nothing - not a greyed-out card, nothing: the plan is
  absent from `loadActiveCarePlan`, `loadCarePlanHistory` drops it unless a
  caller passes `includeUnapproved`, and `/api/care-plan/create-order`
  refuses it, because hiding a card is presentation and refusing the order
  is the rule. Seven things hold it together:
  1. **Three outcomes, one route each.** `/api/admin/review-care-plan`
     approves or turns one down; `/api/admin/edit-and-approve-care-plan`
     publishes different numbers. All take `requireAdminScope("programmes")`
     and write `care_plan.approve` / `care_plan.reject` /
     `care_plan.edit_and_approve` audit rows. A ten-character reason is
     required for the two that take something away from somebody - a
     rejection the therapist has to act on, and an approval whose numbers
     are not the ones they wrote - and **not** for a plain approval, which
     is one tap. Approving is the outcome this queue exists to reach;
     taxing it with a sentence meaning "fine" is how a reason column fills
     up with "ok" and stops being worth reading, and how a patient waits
     longer for a recommendation nobody objected to. A plain approval's
     evidence is who and when, both already on the row. An optional note on
     one is still **none or ten characters**, the column's CHECK, and
     `validateReviewReason()` refuses a short one with a 400 - it used to
     fail the insert inside `approve_care_plan()` and roll the approval back
     as a 500. The review card's plain Approve sends no reason at all, Cancel
     discards what was typed, and its error renders in the idle card too: a
     reason left over from a cancelled "Turn it down" once kept a
     recommendation pending with nothing on screen (QA F-19).
  2. **Approve-with-changes is not an edit.** It writes a new version
     through `authorCarePlanVersion()` with `authored_by` still the
     therapist and `entered_by` the admin, leaving the original in the
     thread as superseded. Rewriting a version under a clinician's name
     would be a lie about who decided what, and the append-only trigger
     refuses it anyway.
  3. **Every decision is recorded, and a failure to record it un-publishes
     the plan.** `care_plan_reviews` is append-only by trigger - the routes
     write with the service-role client, so RLS is not the guarantee - and
     both decisions revert their own status change when the insert fails.
     Same posture as `/api/therapist/reveal-contact`, and the opposite of
     the audit log's: an approval nobody can trace to a person is the one
     outcome these routes must not produce.
  4. **The offer is re-checked against the live catalogue before it is
     published, never only at checkout.** Checkout re-reads the package and
     refuses on a mismatch, which is right - but on its own it means an
     admin approving a recommendation whose package has since been
     re-priced, deactivated or made unrecommendable publishes an offer that
     fails at the last step of the patient's checkout, and the patient
     discovers the clinic's stale data by having their payment refused.
     `describeOfferDrift()` compares the two figures a patient reads and
     pays - session count and price - and blocks the approval with a
     sentence naming the drift. A **rejection** is deliberately not checked:
     refusing to let an admin close a thread because its package moved
     would trap exactly the recommendation that most needs closing.
  5. **The offer window is stamped at approval, not at authoring.** A
     version is written with a null `expires_at`; the approval sets it. The
     append-only trigger permits exactly that one transition, one-way, so a
     window can be stamped once and never moved after the patient has read
     it. Stamping at authoring meant the plans the clinic took longest over
     reached the patient with the least time on them.
     **Approval is one transaction** (`approve_care_plan()`): lock the plan,
     check it is still pending, stamp the window if the version has none,
     publish, record the review -- all or nothing. It was three writes, and a
     failed stamp was only logged, publishing an offer with no expiry; a
     failed review record put the plan back in the queue with a window the
     retry could not restamp. A version already stamped and lapsed is refused
     (409) rather than published expired. The admin's review queue reads
     every `pending_review` plan in full and only caps the decided history at
     the newest 200 -- a single newest-200 read across all statuses hid older
     plans still waiting for a decision.
  6. **A new version on a published thread sends the whole thread back.**
     Deliberately, even though it takes a live offer off the patient's
     screen: what they can now see is a version nobody approved.
  7. **The rejection reaches the therapist, twice over.** It is a `needsYou`
     feed item carrying the reason, and it is on the patient's chart beside
     the thread - the feed scrolls away, and the chart is where a clinician
     goes to rewrite. The reason is the actionable half: "Not approved"
     says the recommendation is gone, and only the reason says what to
     write instead. They rewrite - an admin editing a clinician's judgement from
     the back office is what door three is deliberately narrow about.
  The queue itself reads as work rather than as a record: **oldest first**,
  aged in words rather than dated (`formatWaitingFor`, with
  `isQueueStale` colouring anything past four hours -- and Today's inbox row
  is urgent on **that** count, never on the queue merely being non-empty: a
  badge that is always on is a badge nobody reads, which is how the one
  queue with a patient waiting behind it stops being looked at), and each
  card states how many sessions or visits that patient already has unused,
  read through `applyLedgerSessionBalances` / `applyLedgerVisitBalances`
  like every other balance surface -- reading `sessions_used` raw would make
  this figure disagree with the Programmes screen the moment the ledger
  switch is flipped, in the one place it is read as a reason to refuse
  somebody treatment - the commonest reason
  to turn one down, and previously invisible without leaving the queue.
  Stated, never acted on: a patient with sessions left may well need a
  different programme, and the clinician has seen them.
  One switch, `site_settings.care_plan_requires_approval`, on by default,
  read in its own call -- deliberately **not** in `SITE_SETTINGS_SELECT`,
  the same treatment `therapist_suggestions_enabled` gets, because it is the
  newest column on that table and a shared select that fails takes every
  other setting down to its default with it -- and failing **closed** - the opposite direction from
  `contact_scan_mode`, because the safe answer to "I could not read the
  setting" is to hold a recommendation, never to publish one unreviewed.
  With it off, a therapist's submission publishes on save exactly as before.

- **The clinic can also see every recommendation, and stop one.** Programmes →
  Recommendations lists them all and `/api/admin/withdraw-care-plan`
  (`requireAdminScope("programmes")`, mandatory reason, CAS on either open
  status, `care_plan.withdraw` audit row) closes one whose author cannot -
  on leave, gone, or the reason it is wrong. It covers a **queued** plan
  too: refusing would leave the queue holding a thread nobody intends to
  approve while the patient's one-plan slot stayed taken. A **purchased**
  plan cannot be withdrawn at all - the patient has paid and the sessions
  exist, so the honest lane is a refund or a credit adjustment, both of
  which have their own screens.

- **A therapist recommends; the clinic prices.** A care plan
  (`care_plans` + `care_plan_versions`) is what a therapist proposes after a
  session, and it is the only route by which a patient buys a programme once
  the consultation-first flow is on. Five rules hold it together:
  1. **A therapist picks a condition and a number, never a price.** The
     price is that condition's per-session price times the count
     (`buildCourseSnapshot()` in `src/lib/carePlans.ts`): the condition's
     own `treatment_categories.price_paise` for video sessions, the
     condition's home-visit price (`src/lib/homeVisitRates.ts`: its own
     price, else the clinic-wide one, set under Catalog -> Conditions -> Home
     visits -- never another condition's) when **Needs hands-on treatment**
     is ticked - which is the *only* switch between video and home visits
     (`offerKindFor()`), so a plan can never say hands-on and sell video.
     The count is 1-30. All of it is resolved by `loadRecommendableRates()` /
     `resolveCourseRate()` on the server, never taken from the body, and
     there is no price or discount field anywhere. Admin programmes are no
     longer what a recommendation sells. A purchase still needs a catalog
     row behind it, so each condition gets one hidden **course row** per
     delivery mode (`care_plan_course = true`, created on demand by
     `ensureCourseTemplate()`, left out of every catalog list); the count and
     amount live on the purchase. Checkout (`/api/care-plan/create-order`)
     and approval (`describeOfferDrift()`) re-price a course from the live
     rate and refuse on a change; a version written against a programme
     before this keeps the old path. The snapshot carries the condition's
     photograph, which the patient's card shows. The other fields they choose
     (`hands_on_required`, `frequency_per_week`, `clinical_rationale`,
     `instructions`) are clinical judgement.
  2. **A version needs a completed session that therapist ran.**
     `source_appointment_id` is NOT NULL, and the route re-derives the
     appointment rather than trusting the body. That is what makes
     "recommend to everyone and see who bites" impossible rather than
     discouraged.
  3. **The clinic approves it before the patient sees it.** This used to
     write live, on the same reasoning as `condition-profile/onboard`: a
     queue in front of a clinician's own judgement means the patient hears
     nothing for hours after a session that just ended. That reasoning held
     while a recommendation was one clinical record among several, and
     stopped holding once a care plan became the only route by which a
     patient buys a programme - what is written is now a bill, and the
     clinic that carries it sees one before the patient is asked to pay it.
     See the review rule below for the whole of it.
  4. **Versions are append-only, by trigger.** Only `is_current` may
     change; every other column raises on update, and delete raises
     outright. A recommendation that changed is a new version.
  5. **A purchased plan is never re-versioned.** Once `status = 'accepted'`
     the thread is closed and a later recommendation opens a new one with
     `supersedes_id` set, because editing a purchased plan would change the
     description of something already paid for. `care_plans_one_open_per_patient`
     keeps at most one **open** plan - `active` or `pending_review` - so a
     patient never sees two competing recommendations, and a queued one
     cannot go live beside a published one. Scoping that index to `active`
     alone, as it was before the review step, is exactly how that happens.

  One record, two readers: `CarePlanHistory` renders the same
  `care_plan_versions` rows on the therapist's chart and the patient's
  Health Profile, branching on `voice` rather than keeping a copy per
  surface. Read them through `src/lib/carePlanServer.ts`, never with your
  own query.

- **One word for the record, one for the condition type, one for the
  reviewer.** The clinical counterpart of the money-word rules below, added
  after an audit found **ten** user-facing names for the health profile and
  **eight** for the condition type - four of the ten on one screen. The
  words multiply whenever someone extends a surface rather than naming a
  concept, and every extra one is a patient wondering whether "your chart"
  and "your health profile" are two different things.
  - The record is **Health Profile**, to all three roles. Not "Patient Care
    Intake" (a code and docs term now), not "condition data", not "the
    questionnaire". "chart" is clinician register: fine on a therapist or
    admin screen, never on a patient's.
  - The kind of patient is a **condition type** to clinicians and admins.
    Never "specialty" (that is the column name), never "case". A patient is
    never shown a category word at all - name the care instead
    ("Paediatric physiotherapy", not "pediatrics"), and keep "triage" and
    "onboarding" off their screens entirely. The clinician word and the
    patient word are separate fields (`label` / `patientLabel`) and may
    differ, but where the clinic has settled on one name for a service, both
    say it: the catalogue, the condition picker and the exam panel calling
    the same care three things is the confusion this rule exists to stop.
    Spelling is British throughout - "Orthopaedic", "Paediatric" - so an
    American spelling in one label reads as a typo beside the others.
  - Whoever approves a change is **the clinic** to a patient, and **admin**
    on admin screens. Not both, and not "us".
  Before adding a noun to any of these screens, check it is not a fifth name
  for something already named.

- **One pain scale on screen, whatever the column says.** Assessments are
  stored 0–100 and a patient rates their own pain 0–10; both used to be
  printed raw, so "How you rate it 6/10" sat beside "Last exam found 34%"
  in the same strip and read as two different measurements. Every
  user-facing exam figure goes through `formatPainOutOfTen()`
  (`painMap.ts`). Storage is unchanged - this is display only, and new
  surfaces must use the helper rather than printing `pain_percent`.
- **A permission gate belongs beside the thing it gates.** The therapist's
  "Request access to edit" card sat three sections above the Pain Map, the
  only thing it unlocks; it is now inside that card, stating what is
  readable regardless and what needs approval - if a third view of this data is ever needed, add a mode to
  that switch rather than another card. The figure itself
  (`BodyMapDiagram.tsx`) is an anatomical human silhouette built from
  cross-section nodes (`silhouettePath`), one `<svg>` per view so front and
  back stack on a phone instead of shrinking each tap target below a
  fingertip. The **front figure faces the reader**, so the patient's left is
  on the reader's right (an `R`/`L` marker sits under each figure), and the
  surface detail tells the views apart: collarbones, chest, abdominal line
  and navel on the front; spine, shoulder blades and glute cleft on the
  back. Both used to place "left" on the reader's left, and the back's
  shoulder-blade arcs read as a chest, so the two views looked swapped.
  Every tap point is a named, focusable control worked by Enter or Space
  (checkboxes in the intake's picker, toggle buttons on the read-only map)
  -- see the SVG-controls rule in `frontend.md`. See the "Patient Care Intake and Pain Map" section in docs/PRODUCT-GUIDE.md
  for the full flow.
- **A patient's own record leaves the app as a PDF, not as JSON.**
  `/api/patient/condition-profile/export` returns a typeset document named
  `Name_PatientCode.pdf`, built by `src/lib/healthProfilePdf.ts` - the
  thing a patient does with an export is hand it to another clinician, and
  a JSON file is only readable by a developer. `?format=json` still serves
  the raw structure for genuine portability; nothing in the UI links to
  it. pdf-lib's standard fonts encode **WinAnsi only**, so every string
  goes through that module's `toWinAnsi()` before it is drawn - a
  Devanagari name would otherwise throw at draw time and 500 the whole
  export rather than degrading. Session notes stay excluded from every
  format, same rule as before. **An export is complete or it is refused**:
  every read carrying part of the record is checked and its lists are
  paged, and a failure answers 503 rather than a document missing a
  section. The button fetches the file instead of linking to it, so that
  refusal reads as a sentence beside the button, not a page of JSON.
- **Clinical access follows live or delivered care - never a cancelled
  session or a lapsed programme.** A therapist reads a patient's health
  profile, Pain Map exams, reports, addresses and other clinicians' session
  notes while named on one of their `requested`, `confirmed` or
  `completed` appointments, or while holding the lock on a programme that
  is paid, active and unexpired. The policies used to match *any*
  appointment row, so a therapist attached only to a session cancelled
  before it happened kept reading the record for good. The rule lives in
  the RLS policies appended at the end of `schema.sql`, in
  `CLINICAL_ACCESS_APPOINTMENT_STATUSES` / `programmeLockGrantsClinicalAccess`
  (`src/lib/clinicalAccess.ts`, which the admin's "who can see this"
  panel reads) and in `isTherapistAssignedToPatient`; change all three
  together. **A Pain Map exam also needs a session that has started**
  (`hasStartedSessionWithPatient`: completed, or confirmed and inside its
  join window) - it records an observation from a session the therapist
  ran, so being assigned to a future session is not enough. "Started" is
  read on the debug bar's simulated clock while the bar is on, like the
  session card that offers the exam (see the simulated-clock gotcha in
  `ops-security.md`), so `nowMs` is a required argument, never a
  `Date.now()` default.
- **The neurological examination is a chart of published scales, and "not
  tested" is never "normal".** QA F-17: a neurological patient's record
  sent clinicians to their session notes because the chart was "still being
  built". It is now `neuro_assessments` - one append-only row per
  examination (trigger, like `pain_assessments`), `findings` jsonb in the
  shape `validateNeuroFindings()` (`src/lib/neuroExam.ts`) accepts, and
  `schema_version` = `NEURO_EXAM_VERSION`. Seven rules:
  1. **Every score is one of its scale's own grades.** Tone is the Modified
     Ashworth Scale (0, 1, 1+, 2, 3, 4), power Oxford/MRC 0-5 per myotome,
     reflexes 0 to 4+ plus the plantar response, sensation intact /
     impaired / absent for light touch, pinprick and proprioception,
     coordination normal / impaired - all left and right. Balance is
     Romberg, sitting and standing grades and the Berg Balance Scale (total
     0-56, with optional item scores 0-4); gait is pattern and aids from
     fixed lists plus the 10-metre walk and Timed Up and Go in seconds. The
     dialog renders its controls from the same tables the route validates
     against, so a value the screen cannot offer is a 400, never rounded
     into shape - and there are no number boxes where a scale exists.
  2. **"Not tested" is the absence of a key.** A row or a side nobody
     examined is not stored; the first segment of every control is a dash
     meaning exactly that. A form that can only say "not tested" by leaving
     a blank is how it gets read as normal.
  3. **Severity is derived, never stored.** Each grade knows its distance
     from normal, and asymmetry (one grade between sides is enough - the
     scales are coarse), the abnormal counts and the better/worse arrows
     all read that one number. A Berg total disagreeing with its fourteen
     item scores is refused; all fourteen with no total are summed.
  4. **Change is only between findings recorded both times.** "Not tested
     last time" is not "got worse"; `compareNeuroExams()` leaves a finding
     new to this exam out rather than reporting it against a blank.
  5. **Same gate as a Pain Map exam.** A therapist needs to be assigned and
     to have a started or delivered session with the patient
     (`hasStartedSessionWithPatient`, on the debug bar's clock), no access
     grant; `/api/therapist/neuro-assessments/submit` mirrors
     `neuro_assessments_insert_assigned_therapist`. An admin records one
     through `/api/admin/neuro-assessments/submit`
     (`requireAdminScope("people")`, `neuro_assessment.create` audit row),
     and the button renders only for a scope that route accepts. Both 400
     a patient who is not recorded as neurological. Reads follow the
     clinical-access rule (`neuro_assessments_select_assigned_therapist`,
     plus the patient's own and the admin's).
  6. **The patient reads it, notes included.** It is on their Health Profile
     in their own words (`voice`) and in their PDF export, so the notes are
     scanned at write time (`neuro_assessment_note` surface) and the dialog
     says that colleagues-only remarks belong in the session note.
     **A neurological patient's Done requires one** (owner's decision), the
     way an orthopaedic patient's requires the Pain Map: `complete-session`
     refuses 409 `neuro_exam_required` without a `neuro_assessments` row this
     therapist recorded since an hour before the slot - the same
     `sessionExamWindowStartMs` window, shifted by the debug clock the same
     way - and the note dialog's exam step becomes the neurological one
     (`SessionExamStep` -> `SessionNeuroExamStep`). Which layer is required
     is one decision, `requiredSessionExam()` / `missingSessionExam()` in
     `sessionCompletion.ts`: Pain Map for ortho, neurological exam for
     neuro, the paediatric exam for paediatrics (phase 5b: its dialog step
     shipped and `PEDS_EXAM_REQUIRED_FOR_DONE` is true), **none** for
     geriatric and cardiopulmonary (phase 6a, the owner's decision: their
     progress is recorded measurements, and no layer means "examined"), and
     no layer stands in for another. A failed read of the required layer answers 503, never a pass.
  7. **Every read of it is its own call**, so a database without the table
     costs the card - which says it could not load, rather than "nothing
     recorded" - and not the page. `e2e/neuro-exam.spec.ts`,
     `src/lib/neuroExam.test.ts`.
- **Every standardised test goes in one shared measurement table, and the
  layers that already own a measure keep it.** The Health Profile redesign
  (phase 1: modules and schema; phase 2a: the routes and loaders below; no
  screen draws them yet) records
  walking speed, Timed Up and Go, LEFS, the six-minute walk and the rest in
  **one** append-only `outcome_measurements` table for every condition type -
  the owner's decision, because the graph, the status pill and the milestone
  maths all ask the same question of every measure. Seven rules:
  1. **One registry decides what a measure is.** `src/lib/outcomeMeasures.ts`
     holds every measure in the assessment handbook's summary table: unit,
     range, which direction is better, MDC/MCID, cut-offs per profile kind,
     norms, licence, where it may be done (video, with a helper, home device),
     trial rule, score sheet. The future dialog renders from it and the future
     route validates with `validateMeasurement()`, so a value the screen
     cannot offer is a 400. A module-load assertion throws on a duplicate key.
     **Every threshold in it is marked "to be verified by a senior
     physiotherapist against its source"** and none reaches a patient before
     that review; a cut-off means "higher risk", never a diagnosis.
  2. **The Pain Map and the two exams are not copied.** Pain stays
     on the Pain Map (orthopaedic only, `source: "pain_map"`); Berg and its
     item scores, the Modified Ashworth and MRC grades, and a neurological
     patient's 10-metre walk and TUG stay in `neuro_assessments`
     (`neuroExam` on the entry); a child's WHO milestones and GMFCS level stay
     in `peds_assessments` (`source: "peds_exam"`, phase 5a), while standing
     time and independent steps are measurements. `measurementSource()` says where a graph
     reads each one, and `validateMeasurement()` refuses to store a measure
     another layer owns - two sources for one line is a "change" that is only
     a change of table.
  3. **Parkinson's is a neuro sub-profile, not a condition type.** Six
     profile kinds exist in the registry and the milestone templates -
     `ortho`, `neuro`, `neuro_parkinsons`, `pediatrics`, `geriatric`,
     `cardiopulmonary` - and the neurological intake's condition group
     decides Parkinson's (phase 4a, below). Geriatric ("Strength and balance
     care") and cardiopulmonary ("Heart and lung rehabilitation") became
     condition types in phase 6a, each resolving to its own kind. On a
     Parkinson's measurement ON/OFF and the last dose time are required.
  4. **A licensed scale exists and is switched off.** Barthel, Oswestry, NDI,
     QuickDASH, GMFM, AIMS, Peabody, CAT, both Borg scales, MDS-UPDRS III
     (and NFOG-Q until checked) are `licence: "licensed"`,
     `enabledByDefault: false`; the module throws at load if one is on, and
     `validateMeasurement()` refuses one the clinic has not enabled - the
     admin's `enabled_licensed_measures` switch (`admin.md`), read failing
     closed. Never
     reword a licensed scale to avoid paying: it is no longer the validated
     scale. The Parkinson's symptom profile is the physiotherapist's own
     rating and is labelled so.
  5. **A change below the MDC is "no change".** `changeDirection()` uses the
     MDC (falling back to the MCID, the conservative end of a range, and the
     between-tester allowance when testers differ); a measure with no
     direction or no known threshold answers "changed", never "better".
     `riskBand()` answers "unknown" when a line needs an age, a sex or the
     patient's own limit that was not supplied. Calculators
     (`clinicalCalculators.ts`) refuse rather than guess - the six-minute walk
     equation is a named table and **the clinic's choice is a setting**
     (phase 3a, below): the placeholder entry refuses, and nothing falls back
     to the US equation, Karvonen refuses a beta-blocker or an unknown, and a
     score sheet with too many blanks has no total. STEADI keeps two falls (or
     one injurious fall) in 12 months **high** whatever the tests show.
  6. **Same gate and posture as the neurological exam.** Read by the patient,
     the clinical-access therapist and an admin; inserted by an active
     assigned therapist with a started or delivered session, and only against
     their own session when one is linked; therapist or admin, never the
     patient - what a patient reports goes in the diary (phase 4a, below),
     never in this table. Append-only by trigger; the one
     permitted change is `appointment_id` cleared by `on delete set null`.
  7. **Milestones are a plan, and "reached" is the one fact in it.**
     `care_goals` (the patient's goal in their own words, one active at a
     time) and `care_milestones` (title, measurable criterion, optional linked
     measure, target and baseline) are edited by the assigned therapist under
     the same rule. `reached_at` is written once and a reached milestone stays
     reached (trigger and CHECK); a regression is a new milestone.
     `deriveMilestone()` (`milestones.ts`) suggests "reached" when the linked
     reading meets the target and names it as the proof, but only the
     physiotherapist marks it; planned to working is theirs too. Starter
     templates (`milestoneTemplates.ts`, at least six per profile kind, each
     with a measurable bar) are copied and edited, never read back. **Goals
     and milestones are therapist-authored, and the back office does not
     edit them** (the owner's decision, phase 3a): an admin reads them, and
     the one admin door is reopening a milestone marked reached by mistake.
  `src/lib/outcomeMeasures.test.ts`, `clinicalCalculators.test.ts`,
  `milestones.test.ts`; `scripts/append-only-sql-checks.sql` for the triggers.
  **Phase 2a, the server side.** Five POST routes, every body through
  `parseJsonBody`, every role, patient and profile kind re-derived on the
  server (the request contracts are in each route's header comment):
  - `/api/therapist/measurements/submit` and `/api/admin/measurements/submit`
    share `prepareMeasurement()` / `insertMeasurement()`
    (`src/lib/outcomeMeasurementRoute.ts`), so neither door stores what the
    other refuses. The therapist's gate is the neurological exam's
    (`therapistClinicalGate.ts`: active, a therapist, assigned, and a started
    or delivered session on the debug clock); a linked `appointmentId` must
    be this patient's and, for a therapist, their own. The admin's is
    `requireAdminScope("people")` with an `outcome_measurement.create` audit
    row. The free-text conditions are scanned
    (`outcome_measurement_condition`).
  - **The profile kind comes from `profileKindFor(specialty, intake)`**
    (`src/lib/profileKind.ts`): `neuro_parkinsons` when the intake key
    `neuro_subtype` reads "Parkinson's disease" (apostrophe and spacing
    normalised), else the specialty's own kind. The question arrived with
    the neurological set's `schema_version` 2 (phase 4a) and is optional, so
    a record without it is `neuro`. **No profile on file is a 409, an
    unreadable one a 503** - never the column's ortho default, which is how a neurological
    patient would be measured against the wrong thresholds.
  - **For a Parkinson's patient TUG and the 10-metre walk are stored here**,
    not in the neurological exam (the registry's `ownsFor: ["neuro"]` makes
    the sub-profile the exception), with ON/OFF, the last dose and **all
    three trials** (`trialsRequired()`): a timed test's trials travel in
    `items` as a list in the measure's own unit and the value must equal the
    keep rule (average, best or median) over them. An ordinary
    neurological patient's TUG posted here is a 400 naming the exam.
  - `/api/therapist/care-goals/save` (create, or edit the keys sent; a
    second active goal is a 409 `active_goal_exists` naming the one in the
    way, never a silent close) and `/api/therapist/care-milestones/save`
    (`create` under the active goal, `update` an unreached milestone's plan,
    `mark_reached`) gate on the assignment alone, like their RLS policies -
    except `mark_reached`, which is an observation and needs a started
    session. A milestone with a measurable target held in
    `outcome_measurements` is reached only with its proving measurement
    (`measurementProvesMilestone()`: this patient's, the same measure,
    variant and side, meeting the target), and `reached_at` is that
    measurement's `measured_at`; one described in words, or linked to a
    measure the Pain Map or the exam holds, is reached on the clinician's
    judgement with no id. A reached milestone is not edited (409
    `milestone_reached`). Goal and milestone text is scanned
    (`care_goal_text`, `care_milestone_text`); writes are compare-and-set on
    `updated_at` when the screen sends `expectedUpdatedAt`.
  - **A milestone marked reached by mistake is reopened by the clinic, never
    edited.** `/api/admin/care-milestones/reopen`
    (`requireAdminScope("people")`, a reason of at least 10 characters,
    `care_milestone.reopen` audit row) calls `reopen_care_milestone()`, which
    in one transaction writes an append-only `care_milestone_events` row
    (the `reached_at` withdrawn, the proving measurement, who, why) and moves
    the milestone back to working or planned. The newest
    `care_milestones_guard()` lets `reached_at` go only when that event, for
    exactly that `reached_at`, was written in the same transaction
    (`xact_id = txid_current()`) - two PostgREST calls cannot do it, so the
    guarantee still holds for every route and the service role. Loosening
    the guard for the service role was the rejected alternative: every route
    is the service role. The events are admin-read only.
  - **Reads** (`src/lib/outcomeServer.ts`) are one call each and answer a
    discriminated result: `loadMeasurements()` (paged through `readAllRows`,
    "unreadable" past 5,000 rows rather than a short graph),
    `loadGoalAndMilestones()` (both reads or neither), `loadPatientProfileKind()`,
    `loadEnabledLicensedMeasures()` (see `admin.md`). Shaping is pure and
    tested: `outcomeSeries.ts` (one line per measure, variant, side and - on
    the Parkinson's sub-profile - ON/OFF; one point per review, the session
    or else the clinic-zone day, newest reading kept; the measures table's
    first / now / goal, the goal being the target of the last step planned
    on exactly that line) and `careGoals.ts` (row shapes, validation, the
    milestone views). The three tables are on the realtime publication for
    the screens phase 2b adds. `e2e/measurements.spec.ts`,
    `src/lib/profileKind.test.ts`, `outcomeSeries.test.ts`,
    `careGoals.test.ts`, `licensedMeasures.test.ts`.
- **The shared progress screens, timers and export (Health Profile redesign,
  phase 2b; no page draws them yet - phase 3 wires the orthopaedic page).**
  Components live in `src/components/profile/progress/`; every figure they
  draw is computed in a tested, dependency-free module, never in JSX.
  - **Graph and tiles.** `ProgressGraph` (tabs as `aria-pressed` buttons, one
    dot per review spaced evenly, goal as a green band, a dotted risk line only
    when near the data, `role="img"` summary plus a visually hidden table),
    `KeyNumbers`, `MeasuresTable`, `PhaseBar`, `MilestoneCards`,
    `WhereThingsStand` and `ProfileStatusPill` take `voice: "patient" |
    "clinician"` and read `MeasureSeries`/`MilestoneView` from
    `outcomeSeries.ts`/`careGoals.ts`. Geometry is `progressChart.ts`, words
    and picks are `progressView.ts`, the pill's rule is `profileStatus.ts`
    (Improving = MCID reached since first and not worse than the previous review
    beyond the MDC; Needs attention = worse beyond the MDC, a new fall or a red
    flag; a physiotherapist override with a reason is stored data, applied by the
    pill). `--chart-good` tokens colour the band. A failed read, nothing
    recorded and a single reading are three different states.
  - **Recording.** `RecordTestDialog` offers only what `recordableMeasures()`
    allows (never a Pain Map or exam measure; a licensed scale that is off is
    listed but unselectable, "we couldn't check" when the switch was
    unreadable), validates with the route's own `validateMeasurement`, and
    posts to the therapist route (or the admin route with `asAdmin`). Refusals
    go through `progressErrors.ts`: 503 is "couldn't check", 429 is "wait",
    409 `stale` says reload. The test time is the debug clock's now; there is
    no backdating. `GoalMilestonePlanner` (therapist only) sets the goal and
    steps, templates are suggestions that fill the form, and Mark reached asks
    for the proving reading (`proofCandidates`) or says it is on clinical
    judgement. `ReopenMilestoneDialog` is mounted by `MilestoneCards` only when
    the parent passes `reopen`, which it must do only for
    `scopeCanManage(scope, "people")`.
  - **Timers** (`timers/`: `TapTimer`, `CountdownCounter`, `BalanceHolds`,
    `SixMinuteWalkGuide`). The logic is `testTimers.ts`: a timer stores its
    start timestamp (`performance.now()` via `useRunClock`) and derives elapsed
    time, so a throttled tab cannot lose time; there is no pause (a clinical
    test that was interrupted is discarded); a hidden page or a device that
    slept is flagged, not silently recorded. Trials are rounded to the
    measure's precision before they are kept, so the route's re-derivation
    agrees. The six-minute walk needs every safety box ticked, shows the five
    standard phrases word for word, and names the predicted-distance equation -
    saying so when the clinic has not chosen one.
  - **Export.** `progressExport.ts` shapes the goal, steps and a first / now /
    goal table as text for `healthProfilePdf.ts` ("Goal and progress"); the
    export route reads measurements and goals with the patient's own client and
    answers 503 if either read fails ("complete or refused"). The JSON format
    includes the three tables too. `healthProfilePdf.test.ts` builds one.
    **Deployment: `supabase/schema.sql` must be applied to staging's database
    before this branch merges** (`STAGING.md`) - on a database without these
    tables the export answers 503 rather than a shorter document, which is
    the rule working, not a bug.
- **The phase, the status override, used arms and the walk equation
  (Health Profile redesign, phase 3a, server side; the orthopaedic page that
  draws them is phase 3b).**
  - **The phase and an override of the status pill are history, not a
    cell.** The assigned therapist (assignment alone, like a goal) or an
    admin (`requireAdminScope("people")`, a `care_status.set` audit row with
    from and to) sets the current phase - one of the profile kind's four,
    `PHASES_BY_PROFILE_KIND` - or overrules the computed pill (Improving /
    Holding steady / Needs attention) with a reason of at least 10
    characters (`validateStatusOverride`), or clears the override. Each
    change is a row in the append-only `care_status_events` (kind `phase` |
    `status_override` | `override_cleared`, value, reason, profile kind,
    who, role, when); a shape CHECK and a trigger hold it for every caller.
    `careStatus.ts` shapes what is in force: the latest phase for this
    profile kind wins (a phase chosen under another kind is passed over),
    the latest override wins, a clear ends the one before it, and an
    override older than the latest review is `stale` so the screen asks the
    physiotherapist to look again. `inferPhase()` is only the fallback when
    no phase is set. The reason reaches the patient and is scanned
    (`care_status_reason`). Read by the patient, the clinical-access
    therapist and an admin; on the realtime publication.
  - `/api/therapist/care-status/set` and `/api/admin/care-status/set` share
    `applyCareStatusChange()` (`src/lib/careStatusRoute.ts`): every body
    through `parseJsonBody`; the role, assignment and profile kind
    re-derived; 409 `no_condition_profile` with no profile on file, 503 when
    it or the current state cannot be read (never "no override"); the same
    phase or the same override again is 200 `unchanged` with no row; a clear
    with nothing in force is 409 `no_override`. `loadCareStatus()`
    (`outcomeServer.ts`) answers ok with the events, the phase and the
    override, or "unreadable".
  - **Used arms on the 30-second chair stand.** Per the CDC method a stand
    that needs the arms scores 0: `conditions.usedArms` (only on a measure
    with `usedArmsScoresZero`, today the chair stand alone) true means the
    value must be 0 and the stands done with the arms travel in `items` as
    `{ standsWithArms }` (`validateUsedArms`, `usedArmsEntry`); false means
    no items. The countdown's tick records it; nothing goes in a session
    note. The chair stand is a geriatric measure, reachable at the route
    since phase 6a made geriatric a condition type.
  - **The six-minute walk equation is the clinic's choice.**
    `site_settings.six_minute_walk_equation` (nullable text) is set on
    Settings -> Clinical Questions (`admin.md`). Null, an unknown key and
    the placeholder all mean "formula not chosen yet": the guide says so and
    shows no percentage of predicted; an unreadable setting says "we
    couldn't check". `predictedSixMinuteWalk()` takes the key with no
    default and `DEFAULT_SIX_MINUTE_WALK_EQUATION` is the placeholder, so
    nothing silently uses Enright and Sherrill, which stays selectable and
    is labelled "US adults".
  `src/lib/careStatus.test.ts`, `sixMinuteWalkEquation.test.ts`,
  `outcomeMeasures.test.ts`, `recordTest.test.ts`, `testTimers.test.ts`;
  `e2e/measurements.spec.ts` MS-006 to MS-008;
  `scripts/append-only-sql-checks.sql` for the trigger.
- **The orthopaedic Health Profile (Health Profile redesign, phase 3b).** For
  a patient whose specialty is `ortho` - and only then - the patient's page,
  the therapist's chart and the admin's condition detail share
  `OrthoProfileTop` (`src/components/profile/ortho/`): header (name,
  condition line, `ProfileStatusPill`, `PhaseBar`) -> `WhereThingsStand` ->
  `KeyNumbers` -> body map card -> `ProgressGraph` -> `MilestoneCards` ->
  `MeasuresTable`. Every page keeps what it had (condition record, reports,
  care plan history, notes, banners, gates) and places it around that.
  Neurological and paediatric pages have their own layouts (the next rules);
  neither **makes these reads** (same two-phase
  rule as `pain_assessments`).
  - **Every figure is computed in a tested module.** `orthoProfile.ts` (pain as
    a line, per-area first/now/change, the knee and strength picks, extension
    lag, status input, summary sentences), `orthoProfileView.ts` (one shaper
    for all three pages), `rangeGauge.ts` (dial and bar geometry),
    `jointLandmarks.ts` (how to measure each movement; the handbook table), `angleMeasure.ts` / `angleFraming.ts` / `angleView.ts` (the image-angle tool's maths, camera guide and picture geometry).
  - **Pain is not a measurement.** The Pain Map owns it; it is drawn as one
    more line by `painMapSeries()` (average of each area's latest score after
    each exam, 0-10, one decimal) and is the main measure for the status rule
    when an exam exists. Nothing is written to `outcome_measurements` for it.
    Falls and red flags are not collected for an orthopaedic profile, so the
    rule never gets them.
  - **Three reads, each its own call** (`loadOrthoReads`): measurements, goal
    and steps, phase and status history. A failed one degrades only its card
    ("We couldn't load ... They are not missing"); an unreadable measurement
    read keeps the Pain Map line and the body map; an unreadable status read
    shows the computed pill with a line saying the override could not be
    checked. Unreadable is never "none yet". The realtime tables gain
    `outcome_measurements`, `care_goals`, `care_milestones`,
    `care_status_events` for an orthopaedic page.
  - **Who may do what.** *Record a test*, *Goal and steps* and *Phase and
    status* render for the assigned therapist (the neurological exam
    button's rule: assignment; the measurement route adds its started-session
    check). On the admin's condition detail, *Record a test*, the phase and
    status controls and the milestone reopen need `scopeCanManage(scope,
    "people")`, matching the routes. A patient has none. A control the route
    would refuse is absent, not disabled.
  - **Record a test** offers the registry's orthopaedic tests: goniometry
    (movement chosen from `JOINT_MOVEMENTS`, active or passive, side; the
    handbook's landmarks under "How to measure"; the other side's latest
    reading and the last reading of the same line beside the entry; typing a
    knee-straightening reading shows the extension lag against its partner
    line), limb symmetry from three trials a side, the LEFS score sheet, and
    KOOS-12 (free). Licensed scales are listed and unselectable while off.
    The spine's modified Schober (centimetres) is **not** in the registry yet.
  - **An angle taken from an image is an estimate, and the image is never
    kept.** Goniometry's "Measure from an image" (`AngleTool.tsx`, maths in
    `angleMeasure.ts`) draws the joint angle from three taps on a screenshot of
    the video call, in the goniometer's own convention (straight knee 0, short
    of straight negative). The picture is drawn to a canvas in the browser and
    is never uploaded, stored or logged, and neither are the landmark
    positions: "Use this angle" hands back one whole-degree number, which the
    dialog files as `conditions.estimatedFromImage` over video. That mark is
    labelled everywhere a video estimate is shown (hollow dots on the graph,
    the measures table's First and Now, the PDF), a goniometer reading taken
    at the same review is kept in front of it, and the route refuses the mark
    on anything but a joint range over video. Photo error is about 5 to 10
    degrees and grows off side-on, so never word it as equal to a goniometer.
    The screen shows one step, one big number and at most one warning at a time.
  - **"Where things stand" is the physiotherapist's written text** when
    there is one (phase 4a, below); the sentences generated from the numbers
    are only a draft for the writing box and, with nothing written, a
    fallback labelled as worked out automatically. Either way it is wording,
    not a judgement - the status pill and the overrule are the judgement.
  - **The PDF export** prints the current phase and any active overrule with
    its reason and date under "Goal and progress"; the export refuses (503) if
    the status history cannot be read ("complete or refused").
  `src/lib/orthoProfile.test.ts`, `orthoProfileView.test.ts`,
  `rangeGauge.test.ts`, `jointLandmarks.test.ts`, `recordTest.test.ts`,
  `progressExport.test.ts`; `e2e/ortho-health-profile.spec.ts`; QA
  `THR-HP-005c` to `005f`, `PAT-HP-020`.
- **Parkinson's is a sub-profile of neurological care, and its server side
  is three layers (Health Profile redesign, phase 4a; the screens are the
  next rule, phase 4b).**
  - **The condition group opens the follow-ups; a hidden question is never
    unanswered.** The neurological set gains `neuro_subtype` (*Condition
    group*: Stroke or brain injury, Spinal cord injury, Parkinson's disease,
    Multiple sclerosis, Nerve injury or neuropathy, Other or not sure) and
    five follow-ups asked only when it reads Parkinson's:
    `neuro_pd_year_diagnosed` and `neuro_pd_freezing` (how often the feet
    feel stuck) required, `neuro_pd_medication_times`,
    `neuro_pd_falls_worry` and `neuro_pd_main_difficulty` optional, each
    with patient-plain `helpText` and a `shortLabel`, all `neuro_`-prefixed
    and flat. Visibility is `showWhen` on the question, decided by **one**
    pure function, `visibleQuestions()` (`conditionIntake.ts`, apostrophe
    and spacing normalised): the wizard (the follow-ups are the very next
    steps), triage, the summary panel, the required check, every "N of M"
    counter (`countedQuestions(questions, answers)` now takes the answers),
    the patient dashboard's total, the admin's direct-edit form and question
    bank (which notes "Asked only when ...") and the PDF all go through it.
    A follow-up the group has since closed keeps its stored answer (the flat
    blob never deletes) and is neither listed, counted nor required. The
    module-load assertion also refuses a `showWhen` naming a later or
    unknown question, or an answer the controller cannot give.
  - **Only the neurological `schema_version` moved (to 2), and nobody is
    nagged for it.** The group is **optional** and every follow-up hidden
    until it opens, so an existing record is exactly as complete under v2;
    and the "we've changed some of these questions" banner now needs a
    *required, visible* question unanswered as well as an older version
    (`intakeNeedsAnotherLook`). Both, because either alone leaves a door
    open: a required group would refuse every existing patient's next
    unrelated edit and raise the banner for all of them, and a banner on
    version alone fires at records that are complete. An admin who makes the
    group required gets the banner shown to the records missing it - an
    honest consequence. No template rows are seeded in `schema.sql`, so the
    question bank lists the new questions from the code.
  - **The diary is the patient's own account, append-only.**
    `patient_diary_entries` (one generic table: `freezing`, `fall`,
    `near_miss`, `active_minutes`; `details` validated key by key by
    `validateDiaryDetails()` in `src/lib/patientDiary.ts`; the free text in
    its own `note` column, scanned as `patient_diary_note` and recorded, never
    blocked - the booking-note posture). Which kinds a patient keeps follows
    the server-derived profile kind (`DIARY_KINDS_BY_PROFILE_KIND`: freezing
    for Parkinson's only; falls and near-misses wherever falls are the risk,
    geriatric included; active minutes for cardiopulmonary, reachable since
    phase 6a). `/api/patient/diary/add` takes the patient, author and role from
    the session (never the body), is rate limited (`patientDiary`), refuses
    a future time and one older than 92 days, and answers a double tap as
    `duplicate` (a unique index over the content). RLS: the patient reads
    and inserts their own, the clinical-access therapist and an admin read.
    **A physiotherapist confirms an entry once and never edits it**
    (`/api/therapist/diary/confirm`, the assignment alone, compare-and-set):
    the trigger permits exactly that stamp on a patient's own entry and sets
    its time itself. Everything shaped from it says **"Patient reported"**
    (`diaryProvenance`); weekly totals are clinic weeks, Monday start
    (`weeklyDiaryTotals`, `freezingWeeklySeries` - an empty week is "nothing
    written down", not "no freezing"; `fallsSince`). Reads are
    `loadDiaryEntries` / `loadDiaryEntry` (`patientDiaryServer.ts`, ok or
    unreadable). The registry's therapist-entered `freezing_episodes`
    measure is unchanged and separate.
  - **"Where things stand" is written, and kept as history.** A fourth
    `care_status_events` kind, `summary` (the text in `value`, up to 1,200
    characters, line breaks kept), set through the care-status routes with
    `{ action: "set_summary", text }` - the assigned therapist, or an admin
    with `requireAdminScope("people")` and a `care_status.set` audit row
    carrying from and to - scanned as `care_status_summary`, the same text
    again `unchanged`. `shapeCareStatus()` returns the latest summary
    whatever profile kind it was written under, `stale` once a review is
    newer. The card (`WhereThingsStand`, shaped by `whereThingsStand.ts`)
    shows the written text with its byline - the physiotherapist's name and
    the date ("Dr Farhan Sheikh, 12 Oct"), "The clinic" for an admin's text,
    "Your physiotherapist" when the name could not be read; the generated sentences are a **draft** the
    writing box starts from, and with nothing written a fallback labelled as
    worked out automatically - never presented as the physiotherapist's
    view. The PDF prints only a written summary. The box sits in the *Phase and
    status* panel of the orthopaedic and the neurological chart. The name is
    looked up with the admin client by the id on the event
    (`careStatusAuthor.ts`, the care plan cards' rule: a therapist's name is not
    readable through anyone's own session), never for the clinic's own text, and
    its failure only costs the name.
  - **Parkinson's tests compare like with like.** TUG, the 10-metre walk,
    five times sit-to-stand and the Mini-BESTest (and every measure marked
    `medicationStateRequired`) need ON/OFF and the last dose on the
    sub-profile at both measurement routes, and `pointsAreComparable()`
    (`outcomeSeries.ts`) joins only readings in the same **known** state. A
    line whose state was not recorded (readings from before the record
    became Parkinson's) has `joinPoints: false`: dots with no line, and no
    change claimed in the table.
  `src/lib/intakeVisibility.test.ts`, `patientDiary.test.ts`,
  `careStatus.test.ts`, `whereThingsStand.test.ts`, `medicationState.test.ts`;
  `e2e/parkinsons-profile.spec.ts`; `scripts/append-only-sql-checks.sql`.

- **The neurological and Parkinson's Health Profile (Health Profile
  redesign, phase 4b).** For `specialty === "neuro"` - and only then - the
  patient's page, the therapist's chart and the admin's condition detail render
  `NeuroProfileTop` (`src/components/profile/neuro/`), the orthopaedic
  skeleton with the neurological parts in its slots (`ProfileHeader`,
  `ProfileProgressSection`, `ProfileStatusControls`, `KeyNumbers` are shared
  with `OrthoProfileTop`): header (name, condition line from
  `neuro_diagnosis`, condition group, **Tested in ON time**, status pill, phase
  bar, "filled in with ...") -> *Where things stand* -> **four key numbers** ->
  the **condition picture** -> [Parkinson's: symptom profile, stage] -> the
  **diary** -> graph -> steps -> measures. `profileKindFor` decides plain
  neurological or Parkinson's; the page is the same with the Parkinson's parts
  switched on. A neurological page makes the progress reads
  (`loadNeuroReads`, each its own call: measurements, goal and steps, phase and
  status, the diary, the intake history, the licence switch) and a
  non-neurological one makes none of them; realtime gains
  `outcome_measurements`, `care_goals`, `care_milestones`,
  `care_status_events` and `patient_diary_entries`.
  - **Two stores, one graph, and each measure has one owner** (the registry's
    `neuroExam.ownsFor`, `measurementSource`). For a neurological record Berg,
    the 10-metre walk (as m/s) and Timed Up and Go are drawn **from the
    exams**, one point per exam, and a recorded copy is dropped; on the
    Parkinson's sub-profile the exam owns none of them (they are ON/OFF
    measurements) so no exam point is drawn for them. FAC, Fugl-Meyer, the
    Parkinson's tests and the rest come from `outcome_measurements`. The
    freezing line is **one point per clinic week**: the therapist's weekly
    count and the patient's diary weeks, the therapist's count winning for a
    week they share; the week in progress is never a point (it would read as an
    improvement before it is over), and a week nobody wrote in is no point
    (`neuroProfile.ts`). The stage (Hoehn and Yahr) is a card, not a graph tab.
  - **The four key numbers are always four** (`neuroKeyTiles`): independence,
    balance, walking speed, falls - or, for Parkinson's, Up-and-go (the ON
    line), freezing per week, walking speed, falls. Independence is the
    **Barthel Index only when its licence is on and it has a reading**
    (an unreadable licence switch does not hide a Barthel line already on the
    record), otherwise the intake's 0-10 answer over time. A tile with no
    reading says "Not yet"; one whose source could not be read says
    "Unavailable" - never the same words.
  - **A fall moves the pill only when a person stands behind it** (owner's
    decision). The status rule's `newFall` is a fall entry a physiotherapist
    **confirmed** (or a clinician recorded) after the last review (a recorded
    measurement or an exam - never a diary week); a patient's unconfirmed
    report is shown as *patient reported* and changes nothing. The main measure
    is the first of the kind's preference list that can be compared, and a
    Parkinson's line is only ever a single ON or OFF line whose state was
    recorded. An unreadable diary says so under the pill and does not pretend a
    fall check was made.
  - **The condition picture is the examination.** `NeuroPicture` holds the
    existing `NeuroExamPanel` (the dialog, the Done gate's exam, the change
    since the exam before) with a **First exam / Latest** switch (the panel's
    `snapshot`, mirroring the Pain Map's), beside the affected-side figure
    (drawn only from the intake's `neuro_affected_side`; "Not sure" is not drawn
    as "nothing affected"), the **walking ladder** (FAC 0-5, therapist-entered) and
    the **walking-speed zones** (under 0.4, 0.4-0.8, 0.8 and over m/s, the
    exam's own bands). The quick-look column is sticky only from `lg`.
  - **Parkinson's extras draw only what exists.** The symptom profile is the
    registry's `pd_symptom_rating` (the clinic's own six-part 0-4 rating,
    labelled as such - not the MDS-UPDRS) and appears only when one has been
    recorded; the stage only when recorded; "Tested in ON time" only when every
    ON/OFF reading was ON, with the hours after the dose when it was recorded.
    A line whose medication state was not recorded draws as unjoined dots with
    **State not recorded** (graph heading and tab), and its tile and graph claim
    no move.
  - **The diary screens.** The patient's page has **Log feet getting stuck, a
    fall or a near miss** (`DiaryLogDialog`: only the kinds `diaryKindsFor` gives
    the profile kind, checked with the route's own `validateDiaryEntry` first,
    real radios, 44px targets, every refusal worded for the patient -
    `progressErrorMessage(..., "diary")`; 503 is "nothing was saved", 429 "wait",
    never "not allowed"). The assigned therapist's chart has **Confirm** on each
    entry waiting for them (`entriesAwaitingConfirmation`); an **admin reads the
    diary and nothing more** - neither control is mounted, there is no admin
    write or confirm door. The Parkinson's card draws twelve clinic weeks of
    freezing (a blank week is "nothing written down", an open dot is the
    patient's own account, a filled one a confirmed week) and the triggers.
  - **The PDF export carries the diary as counts** (`diaryExport.ts`: falls,
    near-misses and freezing episodes, split into patient reported and
    confirmed, and the weeks with a freezing entry - never a note) for a record
    whose profile kind keeps a diary, under "complete or refused": an unreadable
    diary refuses the export (503), and the JSON export gains
    `patient_diary_entries`.
  - **Who may do what** is the orthopaedic rule: *Record a test* (neuro-aware:
    FAC, Fugl-Meyer and, for Parkinson's, the ON/OFF measures - never what the
    exam owns), *Goal and steps* and *Phase and status* (with the summary box)
    for the assigned therapist; on the admin's detail the test, phase and status
    and milestone reopen need `scopeCanManage(scope, "people")`. The "Record a
    neurological examination" button, the exam dialog and the Done gate are
    unchanged. The neurological summary card has a designed Parkinson's block
    (condition group chip, year diagnosed, usual medicine times, how often the
    feet feel stuck, worry about falling, the hardest thing), shown only while the
    group still reads Parkinson's.
  `src/lib/neuroProfile.test.ts`, `neuroProfileView.test.ts`,
  `patientDiaryForm.test.ts`, `diaryExport.test.ts`; `e2e/neuro-health-profile.spec.ts`;
  QA `THR-HP-005i`, `THR-HP-005j`, `PAT-HP-022`.
- **The paediatric examination is a milestone chart, and "not assessed" is
  never "not yet" (Health Profile redesign, phase 5a: the server side; the
  screens are phase 5b, the next rule).** `peds_assessments` - one append-only row per
  examination (trigger, like `neuro_assessments`), `findings` jsonb in the
  shape `validatePedsFindings()` (`src/lib/pedsExam.ts`) accepts,
  `schema_version` = `PEDS_EXAM_VERSION`. Eight rules:
  1. **Six WHO milestones, one table of windows.** The windows (1st to 99th
     percentile) and the "counts as reached when" definitions live once, in
     `WHO_MOTOR_MILESTONES` (`outcomeMeasures.ts`); `pedsExam.ts` refuses to
     load if its keys drift from it. Each milestone is `not_yet` /
     `emerging` / `achieved`; emerging and achieved need **who saw it**
     (`seen` - in a session or on a parent's video - or `reported`, the
     handbook's "parent reports"), achieved needs the **date first seen**
     (never after the clinic's today, never before the date of birth), and
     not yet has no date. A milestone nobody looked at is **absent**; "not
     yet" means looked for and not there. GMFCS (Level I-V, for a child with
     cerebral palsy) classifies and is never better or worse; the orthoses
     and equipment note and the note are free text.
  2. **One owner per measure.** The exam owns the WHO milestones and GMFCS
     (the registry's `who_motor_milestone` and `gmfcs` are `source:
     "peds_exam"`, so the measurement route refuses them). **Standing time
     and independent steps stay in `outcome_measurements`**, where their
     three-try best-kept rule, the Record a test timer and the starter
     milestones that link to them already live; the exam refuses them by
     name and points at Record a test. Two tables for one line is a change
     that is only a change of table.
  3. **Change is only between findings recorded both times**
     (`comparePedsExams()`): along not yet -> emerging -> achieved is better,
     back is worse, a parent's report now seen in a session is "changed".
  4. **Corrected age is derived, never stored** (`pedsAge.ts`): the date of
     birth is the patient record's own `profiles.date_of_birth` (the
     patient is the child; the intake does not ask again), weeks at birth is
     the paediatric intake's optional `peds_weeks_at_birth` (22-44, the
     set's `schema_version` 2, at the end of the set, so nobody is nagged -
     `intakeNeedsAnotherLook` needs a required question). Corrected only
     below 37 weeks and under 24 months chronological; no weeks is
     chronological age, said so; no date of birth is "not on file"; one that
     makes the patient an adult is implausible and never charted. "Today" is
     the clinic's day (`pedsTodayIso`).
  5. **Where a milestone sits is derived** (`pedsMilestoneWindows.ts`): an
     achieved one by the corrected age on the day first seen (within, or
     later than most; earlier than most is still within), one not there by
     the age today (before, within or past its window). The parent's words
     are gentle and never diagnostic ("Came a little later than most
     children"); **the referral prompt - not walking alone by 18 months
     corrected - is for clinicians only** (`referral` is null in the
     patient's voice and never printed in the family's PDF). Every window
     and line is marked *to be verified by a senior physiotherapist*.
  6. **Same gate and posture as the neurological exam.** Assigned, active,
     with a started or delivered session on the debug clock
     (`/api/therapist/peds-assessments/submit` mirrors
     `peds_assessments_insert_assigned_therapist`; the note and equipment
     note are scanned, `peds_assessment_note`); an admin through
     `/api/admin/peds-assessments/submit` (`requireAdminScope("people")`,
     `peds_assessment.create`). Both share `pedsExamRoute.ts`, 400
     `not_paediatric` for a patient not recorded as paediatric (503 when
     that cannot be read), validate against the child's date of birth, and
     503 on a database without the table. Reads follow the clinical-access
     rule plus the family's own and the admin's.
  7. **Done requires it** (phase 5b). A paediatric Done needs this exam like
     the other two: the 409 `peds_exam_required`, the `sessionExamWindowStartMs`
     window and the complete-session read. `SessionPedsExamStep` ("Record the
     paediatric exam", in the note dialog) is mounted as the `"peds_exam"` arm
     of `SessionExamStep` and `PEDS_EXAM_REQUIRED_FOR_DONE` is true in that
     same change; a unit test fails if it is on without that arm. A failed read
     of the exams, or of the condition type, says so and is never "recorded",
     and the record button stays pressable - nobody faces a gate with nothing to
     press.
  8. **What the screens get** (5b): `loadPedsReads()` / `loadPedsExams()`
     (`pedsProfileServer.ts`, each ok or unreadable - an unreadable exam
     read is never "nothing recorded"; the date of birth is read with the
     admin client and never leaves the server, only the ages do) and
     `shapePedsExamView()` (`pedsProfileView.ts`): the header's provenance
     from the caregiver pre-step (*Told by Priya Sharma, her mother*,
     "their" when the child's gender is not on file; a relationship it does
     not know stays in the caregiver's words) - while **"Where things
     stand" keeps the physiotherapist's byline**; the latest and first
     exams with a chart for each, the tally and the change. **No paediatric
     diary** (`DIARY_KINDS_BY_PROFILE_KIND.pediatrics` stays empty). The PDF
     export prints the latest exam with the age line and the age each
     milestone came at, complete or refused; the JSON export carries every
     row.
  `src/lib/pedsExam.test.ts`, `pedsAge.test.ts`, `pedsMilestoneWindows.test.ts`,
  `pedsProfileView.test.ts`, `sessionCompletion.test.ts`;
  `e2e/peds-exam.spec.ts`; `scripts/append-only-sql-checks.sql`; QA
  `THR-HP-005k`, `PAT-HP-023`.
- **The paediatric Health Profile is the milestone-window chart (Health
  Profile redesign, phase 5b).** One layout in three places (`PedsProfileTop`;
  see dashboards.md). Rules:
  1. **Every figure is computed in a tested module**: `pedsChartGeometry.ts`
     (axis, bars, markers, the text for every row and the legend),
     `pedsProfile.ts` (the milestones-achieved line, the four tiles, the
     status input, the generated "where things stand", equipment chips),
     `pedsProfileView.ts` `shapePedsView()` (all of it for any reader),
     `pedsExamForm.ts` (the dialog's state, what it posts, every refusal
     worded). The milestones-achieved line is the registry's
     `peds_milestones_achieved` (`source: "peds_exam"`, so Record a test and the
     measurement route refuse it): the count of the six achieved as at each
     exam, a skill staying counted when a later exam did not look at it. GMFCS
     and the six WHO milestones are never in Record a test; standing time and
     independent steps always are.
  2. **Marker encodings** are never colour alone: a **dot** is a skill that came
     (solid = seen by the physiotherapist, hollow = told by parents, **dashed
     ring** = the date is approximate); a **diamond** is a skill not there,
     placed at the child's age today (half-filled = emerging); nothing for one
     nobody checked ("not checked yet" is a gap). Each row is a real button
     named by a full sentence; "Show as a table" is the text alternative. Phones
     stack the name above a full-width track; a name column from `sm`.
  3. **A rough date** (`approximate: true`, in the findings jsonb; no schema
     change, `schema_version` unchanged - old rows are valid): only a parent's
     report with a date; a seen date is exact. Said "about" in the chart, the
     table, `describePedsExamForText` and so the PDF. It is not a change
     between exams.
  4. **An implausible date of birth is not charted** (age 19 or more, or in the
     future): the clinician gets a "Check the date of birth" card, the family a
     neutral "We're checking your child's date of birth". The gap: **there is
     no screen where a therapist or an admin edits a date of birth** - only the
     patient's Profile, as a reviewed change request. Add one deliberately
     before relying on this card.
  5. **Walking alone never assessed** past 18 months corrected is, to a
     clinician only, "Walking alone not assessed yet" (`walkingNotAssessed`); the
     doctor's-review prompt still needs a finding that the child is not walking.
  6. **The parent's voice**: the shared progress components take `subject`
     (`"self" | "child"`, `ProfileSubject` in `childVoice.ts`; it replaced a
     boolean `child` in phase 6a) and speak "your child's ..." through
     `subjectWords(subject, voice)`, which rewrites patient-voice text only.
     A new patient-voice sentence there is covered by its rules (a unit test
     walks the status reasons).
  7. **Realtime**: the paediatric pages refresh on `peds_assessments`
     (appended to the publication at the end of `schema.sql`),
     `appointments` (the sessions tile) and the progress tables.
  `src/lib/pedsChartGeometry.test.ts`, `pedsProfile.test.ts`,
  `pedsExamForm.test.ts`, `childVoice.test.ts`; `e2e/peds-exam.spec.ts`
  PE-005 to PE-008; QA `THR-HP-005l`, `PAT-HP-024`.
- **Strength and balance care and Heart and lung rehabilitation are
  condition types of their own (Health Profile redesign, phase 6a: the
  server side and the data; phase 6b draws the screens).** `geriatric` and
  `cardiopulmonary` join `ConditionSpecialty` and `CONDITION_SPECIALTIES`
  (sky `fa-person-cane` and rose `fa-lungs`, the same icon and colour as
  the therapist specialisations of those names). Parkinson's stays inside
  neuro. Eight rules:
  1. **The words.** The clinician's `label` is **Geriatric** /
     **Cardiopulmonary**; the patient's `patientLabel` is exactly **Strength
     and balance care** / **Heart and lung rehabilitation**
     (`PROFILE_KIND_LABELS` agrees). A patient never reads "geriatric",
     "elderly" or "cardiopulmonary".
  2. **Two intake sets, seven counted questions each**, `schema_version` 1,
     every key prefixed (`geri_*`, `cardio_*`), each question with a
     patient-plain `helpText` and a `shortLabel`. Geriatric
     (`intakeGeriatric.ts`): main concern; the three **STEADI screening
     questions**, required - falls in the last 12 months (*No falls / One
     fall, without an injury / One fall, with an injury / Two or more
     falls*), unsteady standing or walking, worried about falling; walking
     aid; **which of the Katz six they need help with** (`multi_select`,
     "None - I manage all of these on my own" exclusive); goal. An
     **optional carer pre-step** (`geri_carer_name`,
     `geri_carer_relationship`) is the paediatric caregiver pattern, but
     optional and excluded from the count. Cardiopulmonary
     (`intakeCardio.ts`): condition (open-heart surgery, heart attack,
     stent, heart failure, COPD, another lung condition, other) and when;
     beta-blocker (*Yes / No / Not sure*); breathlessness today as the
     **mMRC grade 0-4 in plain words** (the option index is the grade);
     home oxygen; the doctor's oxygen stop limit (a select, *No limit given,
     or not sure* or 85-94%, so the answer is always a number); goal.
     Three follow-ups ask only when they apply (`showWhen`, the Parkinson's
     precedent): the surgeon's breastbone precautions and their end date
     **only after open-heart surgery** (a COPD patient is never asked about
     a breastbone), the oxygen prescription only with home oxygen. No
     template rows are seeded; the question bank lists them from the code.
  3. **Triage suggests them, never picks them.**
     `suggestSpecialtyFromTriage(answers, { offered })` (presenting problem
     *Falls, unsteadiness or getting weaker with age* and *A heart or lung
     condition, or after heart surgery or a heart attack*) suggests
     Cardiopulmonary for a heart or lung referral (adults; before any sign),
     neuro for a stroke or long-term neurological referral, Geriatric for a
     falls referral with at most the balance sign, or **65 or older whose
     only sign is balance or walking**, then neuro for any other sign. Never
     for a child. **It only suggests what the dialog offers** (the enabled
     types plus the profile's own): a rule whose type is switched off is
     passed over and the reason says so ("Geriatric would fit, but it is
     switched off in Settings") - which also stopped a switched-off
     neurological type being pre-selected. Still arrives pre-selected and is
     never auto-accepted. `triageSuggestion.test.ts`.
  4. **No exam before Done** (owner's decision): `requiredSessionExam`
     answers null for both, so Done needs the session note alone. Both have
     no exam layer; `SpecialtyExamPanel` renders nothing for them (no
     "still being built" notice for a chart that is not coming).
  5. **The fall-risk level is STEADI's, with the rule that decided it**
     (`geriatricRisk.ts`, over `steadiFallRisk`). Two or more falls, or one
     with an injury, in 12 months is **high whatever the tests show**, until
     those falls are a year old; "Tests in the safer range: n of 4" is a
     separate line, never folded into the level (the handbook's fix for the
     mockup). Without that history a fully negative screen is low, and
     otherwise the four tests (TUG at 12 s, the chair stand against the CDC
     age-and-sex norm - 0 when the arms were used, unjudged with no age or
     sex - the heel-to-toe stage, walking speed under 0.8 m/s) decide low or
     moderate; with no test it is "not known yet", never low. **Falls come
     from two places and are never counted twice**: the intake's answer,
     dated when that answer was **first** given (`answerFirstGivenAt` - a
     re-save of the same answer does not move it; an unreadable history
     dates it today, the conservative way) and counting for a year after;
     and diary falls **after** that answer that a physiotherapist confirmed
     or a clinician entered. A patient's unconfirmed report is shown as
     patient reported and decides nothing. Katz is the physiotherapist's
     score sheet when there is one, else six less the intake's ticks;
     standing blood pressure is re-derived from the three stored readings
     (positive at 20 top or 10 bottom: "for the patient's doctor").
  6. **The heart and lung safety rules** (`cardioSafety.ts`). The oxygen stop
     limit is **the patient's own**: the doctor's figure, else the default
     for the condition - **88% for a lung condition, 90% (or a 4-point fall
     from the resting reading) for a heart one and for no answer** - always
     labelled as a default. Before exercise, resting heart rate over 120,
     blood pressure over 180/100 or resting oxygen below the limit is "do not
     exercise today, tell the doctor" (patient: *Please don't exercise today.
     Rest, and tell your physiotherapist and your doctor about this
     reading.*; clinician: *Do not exercise or test today. Contact the
     patient's doctor.*); a reading not taken is "not checked", never clear.
     Karvonen only for a patient recorded as **not** on a beta-blocker with
     an exercise-test maximum (never 220 minus age); "Yes", "Not sure" and
     no answer are the talk test. The surgeon's precautions are active
     through their end date in the clinic's zone (`parseClinicDate` reads
     ISO, "20 Sep 2026" and day-first "20/09/2026"; anything else is "end
     date unknown", never passed). The six-minute walk's % of predicted uses
     the clinic's equation setting: "formula not chosen yet", "we couldn't
     check", or - height and weight not being on the record yet - "needs the
     patient's height, weight".
  7. **New free measures, no licensed ones switched on.** The registry gains
     `blood_pressure` (rest / after exercise; both numbers in `items`, the
     top one the value), `resting_spo2` (against the patient's limit) and
     `talk_test` (0 too easy, 1 just right, 2 too hard; a classification).
     Borg (both), CAT and Barthel stay licensed and off. Diary:
     `DIARY_KINDS_BY_PROFILE_KIND` gives geriatric falls and near-misses and
     cardiopulmonary active minutes; `activeMinutesWeeklySeries` totals
     clinic weeks against the WHO's 150 (light minutes apart; the week in
     progress marked, never a fall).
  8. **What 6b draws** (`geriatricProfile.ts` `shapeGeriatricView`,
     `cardioProfile.ts` `shapeCardioView`, over `progressProfileBase.ts`;
     reads by `loadGeriatricReads` / `loadCardioReads`, each its own call,
     ok or unreadable). Status: a confirmed fall since the last review is
     *Needs attention* (the neurological rule); a pre-exercise red flag from
     the **latest review's** vitals is the pill's red flag; the main measure
     is walking speed then TUG, chair stand, balance (geriatric) or the
     six-minute walk then the sit-to-stand, mMRC, breathlessness
     (cardiopulmonary). Both speak to the patient (`subject: "self"`); a
     named carer is a header line ("Ramesh, your son, helps at home"), not a
     voice. **Goals and milestones stay therapist-only.** The PDF export adds
     "Fall risk and daily living" or "Safety limits and vitals" and the carer
     line, under complete or refused (phase 6b adds the home safety check, and
     height and weight and the highest heart rate when present). The catalogue's condition-type tag
     (`treatment_categories.specialty`) takes both too. Every threshold is
     **to be verified by a senior physiotherapist against its source.**
  9. **Phase 6b draws the two pages** (`GeriatricProfileTop`,
     `CardioProfileTop`, shared by the patient, the therapist and the admin;
     `ProfileHeader`'s `carerLine` and `safetyRow`). Geriatric: the dial
     (`FallRiskDial`) names the STEADI level AND the rule that decided it,
     with "Tests in the safer range: n of 4" as its own line; four test cards
     (`steadiCards.ts`: In the safer range / Close / Not yet / Not done yet /
     Recorded, not judged - "Close" is a margin this module chose, to be
     verified); daily living (Katz); the home safety check; the standing blood
     pressure, whose positive result says "tell the patient's doctor" (whether
     the doctor was told is NOT recorded: the registry has nowhere for it
     without a schema change); the falls diary; the graph of the Up and Go,
     chair stand (its risk line is the person's age-and-sex norm,
     `riskOverrides`) and walking speed. Cardiopulmonary: the safety-limits
     chip row in the header (the patient's own oxygen limit labelled default or
     set by the doctor, the beta-blocker note, the precautions and their end
     date), the six-minute-walk track, the oxygen bar with the patient's own
     limit, the talk test, the vitals strip (rest and after), the mMRC grade,
     the weekly active minutes against 150 (the diary dialog takes active
     minutes), a gentle red "Stop and tell your physiotherapist" box that
     names the patient's own limit, the precautions end date beside the plan's
     steps, and the graph of the walk, breathlessness and resting heart rate.
     The physiotherapist's controls (Record a test, the guided falls check,
     the guided walk, the pre-session safety check, height or weight, highest
     heart rate) are absent, not disabled, for anyone else; an admin with
     People scope can record and set the status; the diary is confirmed by the
     assigned therapist only. **Free measures added:** `height_cm`,
     `weight_kg` (latest wins), `max_hr_bpm` (variant *from an exercise test*
     or *estimated*, never 220 minus age) and `home_safety_check` (one 1 or 0
     per item in `items`, the value how many are done, a re-check is a new
     row; `checklist` on the registry draws ticks). The predicted walk shows a
     percentage only when sex, age, height, weight AND the admin-chosen
     formula exist; otherwise a line names exactly what is missing
     (`predictionNeedsList`), and an unreadable read is "we couldn't check",
     never "needs". A heart-rate range (40-60% of reserve, to be verified) is
     offered only off a beta-blocker with a recorded maximum; everyone else is
     talk-test paced and never shown a target. **The pre-exercise refusal is
     enforced on the screen, not at a route** (outside a guided video
     assessment - inside one, phase 7a enforces it at the route): the guided six-minute walk
     cannot start while `preExerciseCheck` says stop (the clinician wording),
     and the route still stores a flagged reading as a fact. The walk saves its
     before and after vitals and the talk test as readings through the
     existing route (`walkMeasurements.ts`); the heart rate straight after a
     walk has no measure and is not stored. Every sign-off item stays "to be
     verified by a senior physiotherapist". Tests: `phase6bProfile.test.ts`,
     `steadiCards.test.ts`, `cardioPicture.test.ts`;
     `e2e/geriatric-cardio-profile.spec.ts` (written, not run); QA
     `THR-HP-005n`, `THR-HP-005o`, `PAT-HP-026`.
  `src/lib/triageSuggestion.test.ts`, `intakeGeriatricCardio.test.ts`,
  `geriatricRisk.test.ts`, `cardioSafety.test.ts`,
  `geriatricCardioProfile.test.ts`, `sessionCompletion.test.ts`;
  `e2e/geriatric-cardio-intake.spec.ts`; QA `THR-HP-005m`, `PAT-HP-025`,
  `ADM-SET-020a`.
- **The guided video assessment is live, therapist-led, and gated by the
  server (Health Profile redesign, phase 7a: the server side; phase 7b: the
  therapist's session cockpit and the patient's companion screen).** The
  owner's decisions:
  every measurement in a video session happens LIVE, guided by the
  physiotherapist, and nothing relies on the patient measuring alone; the
  video stays on Google Meet (the app embeds none); the therapist works from a
  second-screen cockpit, one step at a time, with exactly three actions -
  Stop test, Skip, Save and next; the patient's companion is display-only.
  Ten rules:
  1. **One ordered protocol per profile kind, checked at load.**
     `src/lib/sessionProtocols.ts`: `ortho_knee` (the approved cockpit's
     Safety, Pain, Function, Knee bend, Knee straightening, 30-second chair
     stand, walk, Summary - the orthopaedic default) and `ortho_general`,
     `neuro`, `neuro_parkinsons`, `pediatrics`, `geriatric`,
     `cardiopulmonary`. Each step has a title, a tab label, a script of at most
     two short sentences, one patient line, a picture from a fixed set, a
     set-up checklist, a tool, the measures it may record (a variant list where
     it matters - the knee bend saves knee flexion, never a shoulder) or the
     layer that records it instead (Pain Map, neurological or paediatric exam),
     helper, exertion and skippable flags. The module throws at load on a
     duplicate id, a measure the registry does not hold, one not used on the
     kind or owned by another layer there, a licensed scale, an
     **in-person-only (`videoUse: "no"`) measure in a video protocol**, a
     helper measure on a step not marked as needing one (or a helper step with
     no helper item to tick), an exertion measure on a step not marked
     exertion, a first step that is not the red-flag check, a last that is not
     the summary, a heart and lung exertion step before the resting check, or
     a clinic word ("triage", "case", "patient", "geriatric"...) in what the
     patient sees. The six-minute walk is in person only, so the heart and lung
     protocol uses the one-minute sit-to-stand (the handbook's video stand-in);
     the chair stand and the 10-metre walk were opened to the orthopaedic
     profile for the knee protocol. **Every step, script, red-flag question and
     set-up item is marked "to be verified by a senior physiotherapist".**
  2. **The gates are the server's, not the screen's.** The measurement route
     takes `runId` and `stepId`; with them it re-derives the step from the
     run's protocol and refuses (409 with a code, `assessmentRun.ts`
     `checkRunSave`) unless: the run is this therapist's, this patient's, in
     progress and on the protocol version it started on; every red-flag
     question was answered before step 2 and none was answered yes (a flag
     leaves only the summary open); the step's whole set-up was confirmed in
     this run, with its helper where the step needs one (and the reading's
     `helperPresent` agrees); the measure and variant are the step's; the
     reading was taken over video; a vital sign says it was read off the
     patient's own device; and, on the heart and lung protocol, **the
     pre-exercise check is clear before any exertion** - worked out on the
     server by `preExerciseCheck` from the resting heart rate, blood pressure
     and oxygen **saved in this run's resting step** and the patient's own
     oxygen limit, never from what the cockpit says ("not recorded" is
     `cardio_check_not_recorded`, a red flag `cardio_red_flag`). The same gate
     refuses that exertion step's set-up and its *go* on the patient's screen.
     This moves the 6b pre-exercise refusal, which was UI only, to the route
     for any reading inside a run; a reading outside a run keeps today's
     behaviour.
  3. **Stop test throws the reading away.** It writes one `stopped` event and
     nothing else; a stopped step is never a result.
  4. **Three tables** (`schema.sql`, phase 7a): `assessment_runs` (one in
     progress per patient by a partial unique index; ended once - the trigger
     sets the end time - and never deleted), `assessment_run_events` (kinds
     `setup_confirmed`, `safety_confirmed`, `saved`, `skipped`, `stopped`,
     `step_opened`; append-only by trigger and written only into a run in
     progress, because a save is allowed by these rows; `details` validated in
     `assessmentRun.ts`, structured answers only; one link per measurement) and
     `assessment_live_display` (one row per run). Runs and events are read by
     the clinical-access therapist and an admin; **the patient reads only the
     live display**. Nobody writes any of them from a browser session.
  5. **The companion shows patient-safe text only, chosen by the server.**
     `/api/therapist/assessment-runs/display` takes a step, a phase (`ready`,
     `go`, `done`, `rest`, `paused`) and whether the clock starts - never text.
     The words are the step's own title and patient line, the fixed phase
     lines, the step counter and a clock label (`buildLiveDisplay`);
     `validateLiveDisplay` re-checks the stored jsonb against that whitelist on
     the way in and out, and the table's CHECK refuses any other key. No
     result, score, number other than the clock and the counter, or note can
     reach the patient's screen. The clock is a start time and a length; the
     screen counts.
  6. **Routes.** `/api/therapist/assessment-runs/start` (the protocol from the
     server-derived profile kind; `protocolKey` only chooses among that kind's;
     a linked session must be this therapist's video session; a second start
     is 409 `run_in_progress` with the open run), `/event`, `/display`, `/end`
     (completed, or abandoned with a fixed reason). All take the
     assigned-therapist and started-session gate on the debug clock, every body
     through `parseJsonBody`, rate limited (`assessmentRun`,
     `assessmentDisplay`). **No admin door**: the admin measurement route
     refuses a `runId` (`run_is_therapist_only`). Reads: `loadRun`,
     `loadActiveRun`, `loadRunMeasurements`, `loadLiveDisplay` (the patient's
     own client) in `assessmentRunServer.ts`, each ok or unreadable.
  7. **The run leaves a draft, never a summary.** `assessmentSummaryDraft()`
     writes two to four plain sentences from what was SAVED in the run, naming
     a skipped or stopped step honestly and a red flag or early end; the end
     route returns it in the patient's voice for the writing box, and it is
     saved, if at all, through the care-status `set_summary` action as the
     physiotherapist's own text.
  8. **Vitals read on video are labelled.** `conditions.readFrom`
     (`clinic_device` in person, `patient_device_on_video` over video; vitals
     measures only, `VITALS_MEASURE_KEYS`) is required inside a run and drawn
     as "Read off the patient's own device on video" by `readFromLabel()` on
     the measures table and in the PDF.
  9. **The cockpit has three actions, always the same, always on screen.**
     `/therapist/dashboard/assessment/[patientId]` (guarded like the chart:
     the assigned therapist, anyone else a 404; the started-session half is
     the routes', on the debug clock) is the physiotherapist's second screen
     next to Google Meet: steps across the top as 44px-plus buttons (a tick
     once saved, a step the order keeps shut is disabled and says why), the
     current step as **one** card - *Step n of N*, the title, *Say to the
     patient* in large type, *Set up first* as real checkboxes that must **all**
     be ticked, a red-bordered safety line where another adult has to stand
     beside the patient, then the step's tool - and at the bottom, sticky on
     every width, exactly **Stop test** (throws this step's reading away and
     writes a `stopped` event only), **Skip** (only where the step is
     skippable, with an optional fixed reason from `SKIP_REASONS`) and one big
     **Save and next**, disabled until the set-up (the helper named on its own),
     the safety answers and a result are all in, with the line underneath
     saying which is missing (`saveReadiness`, `cockpit.ts`). The tool is the
     existing recorder inline (`RecordTestDialog` with `embedded`: the same
     timers, score sheet and angle tool, the test and its variants chosen by
     the step, always over video, the vitals marked *read off the patient's own
     device on video*), the Pain Map, neurological or paediatric exam dialog
     for a layer step (its record named in the `saved` event), or the safety
     questions. **A save is three calls, in order**: `setup_confirmed`, the
     result (the measurement route with `runId` and `stepId`, or the layer's
     route and `saved`), then on to the next step; **every refusal code is a
     sentence with the single fix** (`cockpitFailure`, one row per
     `RunRefusalCode`, so a new code fails the build until it is worded), a
     503 is "we could not check, nothing was saved", never "not allowed", and
     a 429 is a wait. The server is still the only gate: the screen mirrors it
     (`stepAvailability`, `exertionBlock`, the resting-check banner) so nobody
     is surprised, never replaces it. The patient's screen is told only a
     phase and whether the clock starts, debounced to the last tap with one
     request in flight (`latestWins.ts`); on a phone the results and the
     preview fold away under the step. The end of a run puts the draft in the
     existing *Where things stand* editor (`CareStatusControls summaryOnly`).
     Entry: *Start guided assessment* on a video session's card (from the join
     window, judged on the debug clock) and on the chart (assigned, with a
     started session).
  10. **The companion is display-only, dark and large, and counts against
     server time.** `/patient/dashboard/session`: the step name small, **one**
     big instruction, one of seven simple position pictures (`PATIENT_PICTURES`),
     a giant clock when the step has one and one calming line; no button, link
     or field while a check is live (the only thing that can be pressed is the
     way back to the dashboard, on the waiting screen). Nothing but the
     server's whitelisted text reaches it (rule 5), and a row that fails
     `validateLiveDisplay` is not drawn. It follows the patient's own display
     row on realtime and **falls back to polling `/api/patient/assessment-display`
     every three seconds** whenever realtime is not reaching it; the clock is
     the row's start time and length read against the loader's `serverNow`
     (`clockShown`), never a client-trusted timer, and it never announces
     itself per second to a screen reader. With no run it says *Your
     physiotherapist will start the guided check soon*; *All done* shows for
     fifteen minutes after a run ends, then it waits again. Every patient screen
     carries a bar to it while a check is live. The first-visit tour never opens
     over either live screen (`tutorialMayAutoStart`).
  `src/lib/sessionProtocols.test.ts`, `assessmentRun.test.ts`,
  `assessmentSummaryDraft.test.ts`, `cockpit.test.ts`, `companionScreen.test.ts`,
  `latestWins.test.ts`, `guidedAssessmentEntry.test.ts`;
  `e2e/assessment-run.spec.ts` and `e2e/assessment-cockpit.spec.ts` (written,
  not run); `scripts/append-only-sql-checks.sql`; QA `THR-HP-005q`,
  `THR-HP-005r`, `PAT-HP-006`.
- **Patient-uploaded reports live in Storage; the database holds only
  metadata.** `patient_medical_documents` has no bytea or base64 column,
  and it never should: a handful of MRI PDFs stored inline would dominate
  the database's size and ride along on every `select *` over a patient's
  chart. The `medical-reports` bucket is **private**, unlike `avatars` -
  a scan report is the most sensitive thing this app holds, and a public
  bucket makes the object URL itself the only secret. Reads go through
  `/api/medical-documents/view`, which selects the metadata row with the
  caller's own RLS-scoped client (the row coming back *is* the
  authorization, same posture as `/api/packages/purchase-detail`) and only
  then mints a 120-second signed URL with the service role. Storage's own
  policies cover the owning patient alone, so there is no path-parsing
  subquery to get subtly wrong. Growth is bounded by two caps that only
  work together - 10MB per file and 20 files per patient
  (`src/lib/medicalDocuments.ts`, enforced in the upload route, which is
  the only writer) - since either alone leaves the bucket unbounded one
  upload at a time. Writes are the patient's own; a therapist and an admin
  read. There is deliberately **no update policy**: correcting a report
  means deleting it and uploading again, so the row and the object can
  never describe different things.
- **An uploaded report is typed by its bytes, not its label, and only a
  patient uploads one.** The upload route ignores `File.type` (whatever
  the browser or a crafted request claims) and reads the type with
  `sniffDocumentMimeType`; the sniffed type is what Storage stores. A PDF
  carrying scripts, launch actions or embedded files is refused
  (`pdfHasActiveContent`) - a clinician opens these on a work machine.
  That is a structural check, **not a virus scan**: names inside a
  compressed object stream are invisible to it, and a real scanner needs
  an external service this deployment does not have. The route also
  requires the patient role (any other active account could otherwise
  file "reports" under its own id), and the view route checks suspension
  for every role, because RLS does not know about it. **Delete removes
  the file before the row** and never answers success while the file
  remains; the ownership check compares `patient_id` to the caller,
  because the select policies also let a treating therapist and an admin
  read the row.
- **Session notes are clinician-only, and they are the prep loop.** After a
  delivered session the therapist writes what was treated, how the patient
  responded, the home exercise and the plan for next time
  (`session_notes`, fields in `src/lib/sessionNotes.ts`, written through
  `SessionNoteDialog` from the session card itself). `session_notes` has
  **no patient select policy and must never get one** - these are working
  notes written in the register clinicians use with each other, and the
  patient's data export (`/api/patient/condition-profile/export`) and
  printable profile both exclude the table on purpose. Notes stay editable
  for 24 hours (`SESSION_NOTE_EDIT_WINDOW_HOURS`), enforced in the submit
  route, and every edit inside that window copies what it replaced into
  `session_note_revisions` - **and if that copy fails, the note is not
  changed** (its result used to be ignored). An edit carries the version
  the editor opened (`baseUpdatedAt`) and the update compare-and-sets on
  it, so two windows saving the same note cannot silently erase each
  other; the second is told to reopen. A note is written only for a
  `completed` session, or a `confirmed` one whose time has come - a
  `requested` session past its slot was never held. Writing one needs no
  `condition_access_grant`, unlike the intake and Pain Map: a note records
  work this therapist personally did rather than editing the patient's own
  history. Completion is never blocked on a note - the nudge is a
  `needsYou` feed item plus the "Notes to write" figure on the therapist's
  Overview.
- **What the patient reads about a session is the summary, never the note.**
  The same dialog (Done, or the card's note button) carries a second band,
  teal with an eye and labelled **Shared with the patient**: *What we did
  today* and *What to do before next time*, both optional, plain words,
  600 characters each (`src/lib/sessionSummary.ts`). It is its own table,
  `session_summaries`, precisely so the note never needs a patient policy:
  the patient's RLS (`session_summaries_select_own_patient`) reads their own
  rows, clinicians read them under the note's treating-therapist rule, and
  **no browser session can write one** - only
  `/api/therapist/session-summary/submit`, which re-derives the session and
  its patient (never from the body), requires the caller to be that
  session's therapist, the session delivered (completed, or confirmed and
  started on the debug-aware clock) and not a no-show, and runs the text
  through the contact scanner (surface `session_summary`) because it is
  therapist-to-patient text. It follows the note's rules for a record:
  editable for 24 hours, every edit copies what it replaced into
  `session_summary_revisions` (append-only by trigger) and compare-and-sets
  on `baseUpdatedAt`; an identical re-send writes nothing; and a summary the
  patient may already have read **can be corrected but not blanked**. The
  dialog saves it after the note and before Done closes the session, so a
  refusal leaves the session open and a retry repeats nothing. When the
  therapist is also recommending a programme in the dialog, the band says
  the recommendation reaches the patient on its own; on the patient's card
  the summary links to a programme recommended after that session (one the
  patient may see) rather than repeating it. Where the summary is read -
  `patientSummaryState()` - decides it belongs to *this* patient and *this*
  session, that the session was delivered, and keeps "could not load" apart
  from "none written". `e2e/patient-session-summary.spec.ts`.
- **"Are you getting better?" is one point per exam, never per day.**
  `painTrendSeries()` (`src/lib/healthProfileSummary.ts`) closes an exam at a
  gap of more than an hour or when an area already scored in it is scored
  again, and plots the patient's overall pain after it: the average of the
  latest reading for every area so far, so an area not re-checked keeps its
  last score. It used to average each calendar day, which folded a second
  exam that day into the first and erased the earlier value from the line.
  `src/lib/painTrendSeries.test.ts`, `e2e/pain-trend.spec.ts`.
