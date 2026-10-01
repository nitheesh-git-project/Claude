# The clinical record

Per-specialty intake, the Pain Map, care plans and their review, session notes, patient files, who may read a record, and the vocabulary all three roles share.

**Mostly lives in:** src/lib/conditionIntake.ts · painMap.ts · carePlanAuthoring.ts · clinicalAccess.ts · healthProfileSummary.ts

> Part of `docs/rules/`. `CLAUDE.md` says which file a task needs; this one
> is the detail. Keep it current in the same change that makes it wrong --
> see the docs rule in `docs/rules/testing.md`.

---

- **Patient Care Intake and Pain Map are two separate data layers**, and
  the intake is **per specialty**. A `patient_condition_profiles` row
  carries `specialty` - `ortho`, `neuro` or `pediatrics` - and that
  decides its question set (`src/lib/intakeOrtho.ts` / `intakeNeuro.ts` /
  `intakePediatrics.ts`, assembled in `conditionIntake.ts`), its summary
  card, its snapshot strip and its progress line. Four things about this
  are load-bearing:
  1. **Question keys are globally unique across the three sets and `data`
     stays flat.** Ortho keys are unchanged, neuro keys are all `neuro_*`,
     peds keys all `peds_*`. That is what lets a re-triaged patient keep
     the previous specialty's answers in the same blob (hidden, never
     deleted) with no jsonb migration inside a re-runnable file. A
     module-load assertion in `conditionIntake.ts` throws if the rule is
     ever broken - violated silently it cross-contaminates two patients'
     charts.
  2. **Applying an approved change MERGES, it does not replace.**
     `mergeSpecialtyAnswers()` keeps every key the incoming specialty does
     not own. The approve path used to write `data: proposedData`
     outright, which under re-triage deletes a patient's whole
     orthopaedic record the moment a neurological one is written.
  3. **`schema_version` is per specialty**
     (`INTAKE_QUESTIONS_VERSION_BY_SPECIALTY`), so it means "version of
     *this profile's own* set". One shared scalar bumped to 3 would have
     fired the "we've changed some of these questions" banner at every
     existing patient even though ortho's seven are byte-identical.
  4. **Pain Map is ORTHOPAEDIC and stays so.** Neuro and paediatric exam
     layers are deferred. A non-ortho page does not merely hide the body
     map - it never queries `pain_assessments` (both health-profile pages
     do a two-phase read to know the specialty before choosing what to
     fetch), and both exam-submit routes 400. When those layers are
     built they are a **new table** (`neuro_assessments`), a new question
     module, a new `*Snapshot`, and one more arm on `SpecialtyExamPanel`
     - never a `specialty` column on `pain_assessments`, which would make
     every reader branch. The two new summary cards must not import
     `PAIN_MAP_REGIONS` or `parseAreaPain`; that import boundary is what
     keeps the rule true in practice rather than only in intent.

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
  plus `intakeTrendSeries()`, which gives the two specialties with no
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
  Manage Questions has one tab per specialty (tabs, not three stacked
  sections - twenty-odd textareas is the wall-of-fields shape this
  codebase keeps correcting). `enabled_intake_specialties` removes a
  specialty from **triage only**: an existing profile carrying it must
  keep rendering, and a therapist re-triaging such a patient is still
  offered it. Ortho can never be switched off.
- **One authoring implementation, three doors.** A therapist writes their own
  recommendation from the session note dialog; an admin writes one on their
  behalf from Sessions → Recommendations when that therapist cannot reach the
  dashboard (on leave, off sick, gone, with a patient still waiting to hear);
  and an admin approving a queued one with different numbers writes a third,
  which is the same act again rather than an edit. All three call
  `authorCarePlanVersion()` in `src/lib/carePlanAuthoring.ts`, which
  is what stops the later doors growing weaker rules than the first: the
  package still comes from the admin whitelist, the source still has to be a
  **completed session that therapist ran**, the text is still scanned, and
  there is still no price, session-count or discount field for anyone.
  Attribution is split rather than fudged - `authored_by` stays the clinician
  whose judgement it is, `entered_by` records the admin who typed it. Naming
  only the therapist would be a quiet lie about who was at the keyboard;
  naming only the admin a louder one about whose judgement it is.
  `/api/admin/author-care-plan` takes `requireAdminScope("sessions")`, a
  mandatory reason, and writes a `care_plan.author_on_behalf` audit row.
  The admin's panel matches the therapist's dialog on the two things that
  decide what gets picked. The programmes on offer are narrowed to the
  chosen session's own condition, through `narrowToCategory()` in
  `CarePlanFields.tsx` - both doors load the whole recommendable catalog in
  one go (a therapist's dashboard covers all their patients, an admin's
  screen covers all of them), so neither can narrow at load time and both
  narrow per session at the point of use; the admin's draft is dropped when
  the chosen session changes, so a package for someone else's condition
  cannot be carried across. And whose name it goes out in is stated at the
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
     publishes different numbers. All take `requireAdminScope("sessions")`
     and write `care_plan.approve` / `care_plan.reject` /
     `care_plan.edit_and_approve` audit rows. A ten-character reason is
     required for the two that take something away from somebody - a
     rejection the therapist has to act on, and an approval whose numbers
     are not the ones they wrote - and **not** for a plain approval, which
     is one tap. Approving is the outcome this queue exists to reach;
     taxing it with a sentence meaning "fine" is how a reason column fills
     up with "ok" and stops being worth reading, and how a patient waits
     longer for a recommendation nobody objected to. A plain approval's
     evidence is who and when, both already on the row.
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
  this figure disagree with the Purchases screen the moment the ledger
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

- **The clinic can also see every recommendation, and stop one.** Sessions →
  Recommendations lists them all and `/api/admin/withdraw-care-plan`
  (`requireAdminScope("sessions")`, mandatory reason, CAS on either open
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
  1. **A therapist picks a package, never a price.** Session count, price,
     validity, duration and the gap rules all come from an
     admin-configured `treatment_category_packages` / `home_visit_packages`
     row, re-read server-side in
     `/api/therapist/care-plan/submit`. There is no price column, no session
     count column and no discount column on a version, so "the therapist set
     their own price" is not a policy anyone enforces - it is a thing the
     schema cannot express. The four fields they *do* choose
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
  fingertip. See the "Patient Care Intake and Pain Map" section in README.md
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
  ran, so being assigned to a future session is not enough.
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
  `session_note_revisions`. Writing one needs no
  `condition_access_grant`, unlike the intake and Pain Map: a note records
  work this therapist personally did rather than editing the patient's own
  history. Completion is never blocked on a note - the nudge is a
  `needsYou` feed item plus the "Notes to write" figure on the therapist's
  Overview.
