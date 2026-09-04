---

## 12. Therapist test plan

### 12.0 Feature guide — the therapist's world

A therapist applies, waits for admin approval, sets a roster, is assigned patients, delivers sessions, writes clinical records, recommends treatment, and gets paid a revenue share on what they **delivered**.

Five rules shape almost every screen:

1. **Availability is three separate things and reads as three things.** A **weekly schedule** (what they normally work, expressed as working *periods*, not hourly cells), **exceptions** (one date that differs), and **time off** (`profiles.on_leave`, off the roster entirely). Leave never clears the schedule. An exception never edits the weekly template.
2. **Availability never touches an appointment.** Removing hours a session is booked into names who is affected and says the session stays as booked. Nothing cancels, moves or flags it. The booking wins.
3. **A therapist suggests; the patient books.** A therapist can propose a time on a programme locked to them. No slot is held. Only the patient's acceptance spends a credit.
4. **A therapist picks a package, never a price.** There is no price, session-count or discount field on a care plan version. Those columns do not exist.
5. **A patient's phone is masked, their email is not loaded at all**, and revealing the number is logged. Every cross-role free-text field is scanned.

---

### 12.1 Application, approval and access

#### `THR-AUTH-001` — Apply to join · P0

**Steps**
1. Open `/therapist/login`. Confirm two tabs: **Sign In** and **Apply to Join**.
2. Tap **Apply to Join**.
3. Tap **Full Name**. Enter `QA Therapist A`.
4. Tap **Email Address**. Enter `qa.therapist.a@example.test`.
5. Tap the phone field. Enter `+91 90000 10001`.
6. Tap **Qualifications & License / Council Reg No.** Enter `MPT (Ortho), KSCP Reg 44821`.
7. Tap **Password**. Enter `QaTest!2024pass`.
8. Tap **Confirm Password**. Enter `QaTest!2024pass`.
9. Tap **Submit Application**.

**Expected Result.** The button reads `Submitting...`, then the form returns to the **Sign In** tab with a confirmation that the application is with the clinic. The `profiles` row exists with `role='therapist'`, `approved=false`, `active=true`. **No "check your email" step appears anywhere.** The application shows in Admin → Today → Approvals and raises that tab's badge.
**Cleanup.** Leave for `ADM-APPR-002`.

#### `THR-AUTH-002` — An unapproved therapist is held at the door · P0

**Steps**
1. Sign in at `/therapist/login` as `qa.therapist.a@example.test` before approval.
2. Then, with that session cookie, call `POST /api/therapist/save-availability` directly with any valid body.

**Expected Result.** Step 1 lands on **`/pending-approval`**, not the dashboard. Step 2 returns **403** with `Your account is not active — it is either awaiting admin approval or has been suspended.` **The API refusal is the one that matters** — a valid cookie must not be able to call around the UI.

#### `THR-AUTH-003` — Sign in after approval · P0
**Preconditions.** `ADM-APPR-002` approved Therapist A.
**Expected Result.** Sign-in lands on `/therapist/dashboard`. The sidebar shows **Overview**, **Availability**, **Sessions**, **Earnings**, **My Patients**, **Edit Profile**, with **Back to Home** at the foot of the nav directly above Collapse (with children Photo / Public Details / Credentials / Account Security).

---

### 12.2 Availability — the roster

> **Feature guide.** The editor is the same component on the therapist's own screen and on the admin's Roster. It edits **periods** ("Monday 9 AM – 1 PM and 2 PM – 6 PM"), and converts them to the hour rows the tables have always stored. Every existing schedule — including a sparse exception written one cell at a time by the old grid — must read back as exactly the same hours. A weekly save is a **compare-and-swap under a real row lock**, versioned by `therapist_schedule_state`.

#### `THR-AVAIL-001` — Set a weekly schedule with two periods a day · P0

**Steps**
1. Open `/therapist/dashboard/availability`.
2. Read the header line — it states the schedule's timezone.
3. On **Monday**, tap the "working" toggle so the day is on.
4. Tap the Monday start-time control. Set `09:00`. Tap the end-time control. Set `13:00`.
5. Tap **Add hours** on Monday. On the new period, set `14:00` to `18:00`.
6. Tap the copy control on Monday and copy Monday to Tuesday, Wednesday, Thursday and Friday.
7. Tap **Save**.

**Expected Result.** After saving, a "Saved" indication appears and the week summary reads Mon–Fri `9:00 AM – 1:00 PM, 2:00 PM – 6:00 PM`. Reloading the page shows exactly the same periods — **the stored hour rows round-trip to the same periods**. Saturday and Sunday remain off.
**Cross-check:** Admin → Sessions → Roster, opening `QA Therapist A`, shows the identical schedule in the identical editor.

#### `THR-AVAIL-002` — A day with no hours must be explicit · P1
**Steps.** Turn Monday's working toggle on, remove all its periods, and tap **Save**.
**Expected Result.** Refused with `Add at least one set of hours, or mark the day unavailable.` The save does not go through with an ambiguous day.

#### `THR-AVAIL-003` — Removing hours a session is booked into · P0

**Preconditions.** Therapist A has a confirmed session on a Wednesday at 10:00.
**Steps.** Edit Wednesday's period to `14:00–18:00` (dropping 10:00) and tap **Save**.
**Expected Result.** Before saving, the editor **names the affected sessions** and states that **the session stays as booked**. After saving, the schedule changes and **the appointment is unchanged** — not cancelled, not moved, not flagged. The patient's dashboard and the admin's Schedule still show it at 10:00. **Availability and appointments are separate systems and the booking wins.**

#### `THR-AVAIL-004` — A stale save is refused; a double-clicked Save is a no-op success · P0

**Purpose.** Prove the compare-and-swap.
**Steps**
1. Open the availability screen in two browser tabs (Tab 1 and Tab 2), both showing the same schedule.
2. In Tab 1, change Monday to `10:00–14:00` and tap **Save**. Wait for "Saved".
3. In Tab 2 (still holding the old version), change Monday to `08:00–12:00` and tap **Save**.
4. Separately, in a fresh tab, change Tuesday and **double-click Save**.

**Expected Result**
* Step 3: refused with **HTTP 409** and a message telling the therapist to reload the latest. Tab 1's save is not overwritten.
* Step 4: **both identical requests succeed** — two identical requests carrying the same stale version are one logical change, so this is a **no-op success**, not a 409. Exactly one change is stored.

#### `THR-AVAIL-005` — A therapist reads their exceptions but cannot write them · P0

**Steps.** On the availability screen, look for a control that creates a date exception. Then call `POST /api/admin/set-availability-exception` with the therapist's cookie.
**Expected Result.** The therapist's own screen **shows** any exception on their record but offers no control to create one. The admin route returns **403 Forbidden**. Writing a date exception is an admin capability and stays one.

#### `THR-AVAIL-006` — Leave leaves the schedule intact · P0

**Steps**
1. In the Leave panel, set leave from `2026-09-14` to `2026-09-18` with reason `Annual leave`. Save.
2. Look at the weekly schedule.
3. Remove the leave.
4. Look at the weekly schedule again.

**Expected Result.** The weekly schedule is **unchanged** in both step 2 and step 4 — leave never clears it, and there is nothing to restore on the way back because nothing was removed. `profiles.on_leave` reflects the state. The admin's Roster shows the therapist as on leave for those dates.

#### `THR-AVAIL-007` — An exception owns only its own date · P1
**Preconditions.** An admin has set a `2026-09-15` exception of `14:00–18:00` for Therapist A (`ADM-ROST-003`).
**Expected Result.** 15 September shows `14:00–18:00`; every **other** Tuesday still shows the weekly template's hours. The weekly template itself is unchanged.

#### `THR-AVAIL-008` — Roster changes never move a booking or the patient's picker · P0
This is the regression that guards the whole design. See `XCFG-ROSTER-001`.

---

### 12.3 Sessions

#### `THR-SESS-001` — Assigned sessions appear; unassigned ones do not · P0

**Steps.** Sign in as Therapist A and open `/therapist/dashboard/sessions` **before** the admin assigns anything. Then have `ADM-SESS-003` assign Patient A's paid session to Therapist A, and reload.
**Expected Result.** Before assignment: the session is **absent**. A `requested`, unassigned session belongs to no therapist. After assignment: it appears under Upcoming with the patient's name, the concern, the slot and its status. If Google credentials are configured, it also carries a Meet link.

#### `THR-SESS-002` — Sessions is one list with filters · P2
**Expected Result.** Video sessions and home visits are in **one** Sessions screen with Upcoming/Past/Cancelled and a Video/Home-visit filter that appears only for a therapist who has both. There is no separate "Home visits" sidebar entry.

#### `THR-SESS-003` — A patient's phone is masked and their email is absent · P0

**Preconditions.** `contact_masking_enabled` is on (the default).
**Steps.** Open an assigned session card and read the contact area. Then open the browser's **View Source / Network** and search the page HTML for the patient's full phone number and for `qa.patient.a@example.test`.
**Expected Result**
* On screen: the phone reads in the masked form `+91 ••••• ••210` — country prefix and last three digits only. **The email is not shown at all.**
* **In the page source, the plaintext phone number must not appear anywhere**, because masking happens where the rows are loaded, not in the component. The email must not appear either — it is not loaded onto therapist surfaces.
* A patient with no number shows `No number on file`.

#### `THR-SESS-004` — Reveal a contact inside the join window · P0

**Preconditions.** A confirmed **video** session whose slot is within the join window in **real** time (the route uses the server clock). Reason: this route's window check is server-side.
**Steps.** Tap **Show number**. Read the number. Then repeat on a session whose slot is a week away, and on a cancelled session.
**Expected Result**
* Inside the window: the full number is revealed, and a `contact_reveal_log` row is written. **The log write is not best-effort** — if it fails, the reveal is refused with `Could not show the number just now. Please try again.` A reveal with no trace is the one outcome this route must not produce.
* Outside the window: refused with the route's own explanation (403).
* Cancelled session: refused.
* A **home visit** is revealable **any time on the visit's own day**, not merely in a join window — verify this separately.
* Admin → Settings → User Access shows the reveal log. It is **admin-read-only and append-only by trigger**: attempting to update or delete a row raises, even with the service role.

#### `THR-SESS-005` — Completing a session is gated two ways · P0

**Purpose.** `status='completed' && payment_status='paid'` is the exact condition that makes a therapist's revenue share payable, so the route refuses two things.

**Steps**
1. On an **unpaid, unprogrammed, no-cash** confirmed session, tap the complete control.
2. On a **paid** confirmed session whose slot is still in the future, tap the complete control.
3. Simulate a time after the slot and try step 2 again.
4. On a paid confirmed session whose join window has genuinely opened in **real** time, tap the complete control, read the dialog, and confirm.

**Expected Result**
* Step 1: refused (409). Nothing may be completed with no payment, no programme behind it and no cash recorded. A cash home visit must collect first.
* Step 2: refused (409) — nothing may be completed before the join window in which it could have been started.
* Step 3: **still refused.** The simulated clock is client-side only; this gate is server-side. **This is correct behaviour, not a defect.**
* Step 4: the dialog reads *"Mark this session as done? You'll be asked to rate it next."* After confirming, the session becomes `completed`, `completed_at` is stamped, and the therapist's Earnings figure increases by their share.
* A session that is not `confirmed` is refused with `Only confirmed sessions can be marked completed.`
* A second completion attempt returns `This session was already updated — please refresh and try again.` (409). **No double payout.**

#### `THR-SESS-006` — Mark a no-show · P2
**Expected Result.** The session is completed with `no_show=true`. It shows as `Marked as no-show` and the patient's rating control is suppressed with `This session was marked as a no-show — there's nothing to rate.`

#### `THR-SESS-007` — Record cash on a home visit · P0

**Purpose.** The person holding the cash must not also decide how much the clinic knows about.
**Steps.** On a cash-on-visit home visit, tap the collect-cash control. Observe what the form asks for. Then inspect the network request body.
**Expected Result.** The therapist **asserts that money changed hands**; they do **not** type an amount. The request body carries **an appointment id and nothing else** — the total is reconstructed server-side from the purchase using the same per-visit maths that booked it. If the UI ever offers an editable amount field here, that is a P0 defect.
The honest exception (a patient short of cash) belongs to **Admin → correct cash amount**, which requires `money` scope, a mandatory reason, a CAS on the figure being replaced, and writes a `cash.correct_amount` audit row — and refuses a visit whose cash has already been remitted.
A second attempt returns `This visit's payment has already been recorded.`

#### `THR-SESS-008` — Session notes · P1

**Steps**
1. Before a session has taken place, open the note dialog.
2. After completion, open it and fill: **What did you treat today?** `L4-L5 segmental mobilisation, glute med activation`; **Techniques and dosage** `Grade III PA mobilisation ×3 sets, 30s hold`; **How did the patient respond?** `Reported easing within the session, straight-leg raise improved`; **Home exercise prescribed** `Cat-camel ×10, twice daily. Walking 15 min.`; **Plan for the next session** `Progress to loaded hinge if pain stays under 3/10; reassess SLR`; **Anything to watch** `Reports night pain — reassess if it persists`. Save.
3. Edit the note within 24 hours and change one field.
4. Sign in as Patient A and search their entire portal and their exported PDF for the note text.

**Expected Result**
* Step 1: refused — `You can write the note once the session has taken place.`
* Step 2: saved. It appears on the therapist's chart. **Completion is never blocked on a note** — the nudge is a "Notes to write" figure on Overview and a feed item.
* Step 3: succeeds, and a `session_note_revisions` row records what it replaced. After 24 hours, editing is refused.
* Step 4: **the note text appears nowhere the patient can see, including the PDF export.** `session_notes` has no patient select policy and must never get one.
* Submitting with required fields blank: `Fill in what you treated, how the patient responded, and the plan for next time.`
* An unknown field in the payload: `Note contains unknown fields.`

---

### 12.4 Clinical records

#### `THR-PAT-001` — My Patients, with a view switch not a second entry · P2
**Steps.** Open `/therapist/dashboard/health-profile`. Toggle **Patients** ↔ **Programmes**.
**Expected Result.** The same patients, arranged two ways — by name, and by package purchase. **Programmes is a toggle, not a sidebar entry**, and it only appears for a therapist who actually has package patients.

#### `THR-HP-001` — Triage a new patient · P0

**Purpose.** The therapist owns the **first fill**, and it is **not reviewed**.
**Preconditions.** Therapist A is assigned to Patient A, who has no condition profile.

**Steps**
1. Open Patient A's chart at `/therapist/dashboard/health-profile/<patientId>`.
2. Tap the control that starts triage.
3. Answer **How old is the patient?** → `18 to 64`.
4. Answer **What brought them in?** → `Injury, strain or overuse`.
5. Answer **Any of these present?** → tick `None of these`.
6. Observe whether the milestones question appears.
7. Read the suggestion panel.
8. Confirm the suggested condition type.

**Expected Result**
* Step 2: the dialog shows **all four questions at once, with headings** — the clinician's surfaces deliberately invert the patient's one-question-at-a-time pacing, because a clinician filling this after every assignment wants to scan it.
* Step 6: the milestones question is **not shown** — it only appears when age is `Under 18`.
* Step 7: **Orthopaedic** is suggested, **with its reason stated**, and is **not auto-accepted**. The therapist confirms or overrides.
* On confirming, an already-`approved` `condition_change_requests` row is written, so the triage appears in the ordinary Review History with no new concept and no queue.
* **Nowhere on a patient-facing screen do the words "triage", "onboarding" or "specialty" appear.** A patient is shown the care ("Orthopaedic care"), never the category word.

#### `THR-HP-002` — Write the patient's first record (live, no review) · P0

**Steps.** Continue from triage into the seven orthopaedic questions and enter the §8.4 answers. Submit.
**Expected Result.** The record is written **live** — there is no approval queue in front of it. The patient's own Health Profile **unlocks** immediately (see `PAT-HP-002`). The route needs only that the therapist is **assigned** to the patient. If the therapist is not assigned, it is refused with `You aren't assigned to this patient.`

#### `THR-HP-003` — Editing a live record needs an approved grant · P0

**Purpose.** The line is **create versus edit**.
**Steps.** With the record now live, attempt to edit the patient's answers on their behalf. Then request access, have an admin approve it (`ADM-PEOP-004`), and try again.
**Expected Result.** Before the grant: refused with `You don't have an approved access grant for this patient's health profile.` The **Request access to edit** card sits **inside the Pain Map card** — beside the thing it gates, not three sections above it — and states what is readable regardless and what needs approval. After the grant: the edit submits and goes to admin review. A second request while one is open: `You already have a pending or approved request for this patient.`

#### `THR-HP-004` — Re-triage merges, it never replaces · P0 **[SQL or careful UI check]**

**Purpose.** This is the single most damaging possible regression in the clinical layer.
**Steps.** With Patient A holding a full orthopaedic record, re-triage them as **Neurological** and complete the neuro question set with the §8.5 answers. Then inspect the profile.
**Expected Result.** The neuro answers are stored **alongside** the orthopaedic ones in the same flat blob. **Every orthopaedic key survives** (hidden on screen, never deleted). The chart now renders the neuro summary card, the neuro snapshot strip and the neuro progress line. The Pain Map is **not** rendered.
**If any orthopaedic answer is gone, stop and raise a P0** — the approve path must merge, never write the proposed data outright.

#### `THR-HP-005` — Pain Map is orthopaedic and stays so · P0

**Steps**
1. On an **orthopaedic** patient, open the body-map surface. Tap **Lower back** on the figure. Record an exam through the dialog.
2. On the **neurological** patient (Patient C), look for the body map. Then call `POST /api/therapist/pain-assessments/submit` for that patient directly.

**Expected Result**
* Step 1: the region is chosen by **tapping the figure** (or a chip inside the dialog), never a `<select>`, and the chosen region stays in the dialog header while the clinician types. Questions are grouped, not listed flat. The exam posts **live with no review**, and is **append-only** — a re-assessment is a new row, so the UI can show a trend against the previous visit. Recording one requires only that the therapist is **assigned**.
* Step 2: the non-ortho page **does not merely hide the map — it never queries `pain_assessments` at all**, and the submit route answers **400**.
* Every user-facing exam figure is printed **out of ten**, never as a raw percentage. `Last exam found 34%` beside `How you rate it 6/10` is a defect: both must read on the same 0–10 scale.

#### `THR-HP-006` — Read access needs no request · P2
**Expected Result.** An **assigned** therapist can read the patient's intake and Pain Map with no grant. Only *editing the patient's own account of their history* needs one.

---

### 12.5 Recommendations (care plans) and suggested sessions

#### `THR-CARE-001` — Write a care plan from the session note dialog · P0

**Preconditions.** A **completed** session that **this therapist ran** for Patient A. Package P1 exists and is recommendable.

**Steps**
1. Open the completed session's note dialog.
2. In the **Recommend treatment** panel, tap the **Condition** dropdown.
3. Read the list of conditions offered, and how they are grouped.
4. Select the session's own condition, then tap the session-count chip for `6 sessions`.
5. Read the four read-only figures shown beneath.
6. Tap **How often, per week** and select `2 a week`.
7. Tick **Needs hands-on treatment**.
8. Tap **Why this, for this patient**. Enter `Your range has improved but the pain returns after a day at your desk. A structured block will hold the gains.`
9. Tap **Anything they should do or know**. Enter `Keep up the walking between sessions. Book the first one within a fortnight if you can.`
10. Read the line above the submit button.
11. Submit.

**Expected Result**
* Step 3: **conditions are grouped by condition type** — Orthopaedic, Neurological, Paediatric — from `treatment_categories.specialty`. A category an admin has not tagged appears under **General** and still works — that is where the clinic's general consultation sits, and "General" is deliberately **not** a fourth condition type: a patient's own health profile is only ever ortho, neuro or paediatric. The panel **never shows a programme by name**: a clinician answers "which condition" and "how many sessions", and those two pick the catalogue row.
* Step 3: **only programmes for this session's own condition are offered.** `QA Neuro Rehab 8 Sessions` must not be reachable for a `QA Back & Spine Care` session.
* Step 4: a **Delivered as** toggle (Video sessions / Home visits) appears **only** where the clinic sells both against that condition. A toggle with one option is not a decision the clinician has.
* Step 5: **Sessions `6`**, **Price `₹9,999`**, **Valid for `90 days`**, **Each session `60 min`** — all read-only, all from the admin's catalog row. **There is no price field, no session-count field and no discount field anywhere in this panel.** If one exists, that is a P0 defect: "the therapist set their own price" must be a thing the schema cannot express.
* Step 6: the frequency dropdown is capped by `care_plan_max_frequency_per_week` (default 5) and offers `Leave open`.
* Step 10: with `care_plan_requires_approval` **on** (the default), the panel says *"Goes to the clinic first. Your patient sees it once it is approved."* With it off, it says the patient sees it on their dashboard. **The copy must match the setting** — telling a clinician their patient can already see something sitting in a queue is a P0 defect.
* Step 11: the plan lands `status = 'pending_review'`, append-only and attributed. `care_plan_versions.source_appointment_id` is NOT NULL and is **re-derived from the appointment, not trusted from the body**. `care_plan_versions.expires_at` is **null** — the offer window is stamped at approval, not now.
* **The patient sees nothing.** Not a greyed-out card: the recommendation is absent from Suggested Sessions and from their Health Profile until an admin approves it (`ADM-CARE-004`).

#### `THR-CARE-006` — The Overview names who is waiting to hear · P1

**Feature.** Every programme a patient can buy comes from a recommendation written after a completed session, so that one step is the whole distance between a delivered consultation and a course of treatment. It used to be carried only by an aggregate count, which reads as a score rather than as a list of people.

**Steps.** Complete a session for Patient A and write no recommendation. Open `/therapist/dashboard`.
**Expected Result.** The activity feed carries a **named** item — *"QA Patient A is waiting to hear what next"* — pinned by `needsYou` and linking to that patient's chart. It disappears once a recommendation is written, or once the patient's plan is accepted. A patient who **already has** a live or purchased recommendation must **not** appear; a patient whose plan was declined or withdrawn **should**, because that thread is open again. At most four are shown, most recently seen first, alongside the note nudge.

#### `THR-CARE-008` — Writing a second one while the first is still queued · P1

**Feature.** Submitting again is allowed — it lands as a new version on the same thread, which is right when a clinician has genuinely changed their mind. Doing it *without being told* is how the same plan gets submitted twice by someone who assumed the first had failed.

**Steps.** With a recommendation already waiting for the clinic, open another completed session's note dialog for the same patient.
**Expected Result.** The panel says *"You have already recommended a programme for this patient and the clinic has not decided yet — nothing has gone wrong, and your patient has not been asked for anything. Writing another replaces it."* The button reads **Replace it**, not **Add a recommendation**.

#### `THR-CARE-002` — A recommendation needs a completed session this therapist ran · P0
**Steps.** Attempt to submit a care plan (a) for a patient this therapist is not assigned to, (b) against a session run by Therapist B, (c) against a session that is not completed.
**Expected Result.** (a) `That isn't your patient.` (403). (b) and (c) refused by the route's own re-derivation. This is what makes "recommend to everyone and see who bites" **impossible rather than discouraged**.

#### `THR-CARE-003` — A purchased plan is never re-versioned · P0
**Preconditions.** Patient A has **bought** the recommendation (`PAT-CARE-002`).
**Steps.** Attempt to write a new recommendation for the same patient.
**Expected Result.** The purchased thread is **closed**. A new recommendation opens a **new plan** with `supersedes_id` set — it does not add a version to the purchased one. Editing a purchased plan would change the description of something already paid for.
`care_plans_one_open_per_patient` means the patient never sees two competing live recommendations — and covers a **queued** plan too, so a submission waiting on the clinic blocks a second one exactly as a published one does.

#### `THR-CARE-004` — Versions are append-only by trigger · P1 **[SQL]**
**Steps.** In the Supabase SQL editor, attempt `update care_plan_versions set clinical_rationale='changed' where id='<id>';` and `delete from care_plan_versions where id='<id>';`
**Expected Result.** Both **raise**. Only `is_current` and a **first** `expires_at` may change — the offer window is stamped once, at approval, and moving one already set raises too. This is enforced by trigger, not by RLS — every route writes with the service role, which bypasses RLS entirely.

#### `THR-CARE-005` — Withdraw one's own recommendation · P2
**Steps.** Tap the withdraw control on an unpurchased recommendation, then on one still **waiting for the clinic's approval**.
**Expected Result.** Both close; the patient's offer disappears where there was one. **A purchased plan cannot be withdrawn at all.**

#### `THR-CARE-007` — The clinic's decision reaches the therapist · P0

**Feature.** A recommendation turned down silently is one that never happened, and the therapist is the only person who can put it right — they rewrite.

**Preconditions.** `ADM-CARE-005` has turned down this therapist's recommendation with the reason `This patient still has four unused sessions on their current plan.`

**Steps.** Open `/therapist/dashboard`. Then open that patient's chart.
**Expected Result.**
* The activity feed carries a **needsYou** item: *"The clinic turned down your recommendation for QA Patient A"*, with the admin's reason as its detail. It is the **only** care-plan feed item marked `needsYou` — an approval is the expected outcome and marking it so would train the therapist to ignore the badge.
* An **approval** and an **approve-with-changes** also appear, not marked `needsYou`: a submission that vanishes into a queue and never reports back teaches a clinician to stop trusting the queue.
* On the chart, the thread reads **Not approved** **with the clinic's reason printed beneath it**, in red. The reason is the actionable half — "Not approved" says the recommendation is gone, and only the reason says what to write instead — and the feed item scrolls away while the chart is where a clinician goes to rewrite. A queued thread reads **Waiting for the clinic to approve**. Both are visible to the clinician and **neither is visible to the patient**.
* The thread being closed frees the one-open-plan slot, so a fresh recommendation can be written straight away.

#### `THR-SUGG-001` — Suggest a session · P0

**Preconditions.** `therapist_suggestions_enabled` is **on** (it is on by default now; confirm in Settings → Programmes & Home Visits). A programme locked to this therapist with credits remaining.

**Steps**
1. On the programme's card, tap the suggest control.
2. Pick a date and time comfortably beyond the booking lead time.
3. Enter the note `Let's keep the two-a-week rhythm while it is working.`
4. Tap **Send suggestion**.
5. Tap **Send suggestion** twice more, rapidly, on a second programme.

**Expected Result**
* Step 4: the control changes to **Waiting on the patient** with a **Withdraw suggestion** option. **No slot is held** — a hold would need releasing, releasing would need a sweep, and there is no scheduled worker. The therapist's calendar is re-checked at acceptance instead.
* No appointment is created and **no credit is spent** — `sessions_used` is unchanged.
* Step 5: exactly **one** suggestion. The submit is guarded by a **synchronous ref** (a `disabled` attribute lands a render too late), and a partial unique index allows at most **one pending suggestion per purchase**.
* Negative cases: a slot too soon → `That time is too soon to book. Pick a later slot.`; a programme not locked to this therapist → `That isn't your programme.`; an inactive/unpaid programme → `That programme isn't active.`; a slot after expiry → `That time is after the programme expires.`; no credits → `Every session in this programme is already used.`; the therapist already busy → `You already have a session at that time.` (409); a note over 500 characters → `Your note must be 500 characters or less.`
* With the toggle off: `Suggesting sessions is switched off.` (403).

#### `THR-SUGG-002` — Withdraw a suggestion · P2
**Expected Result.** The pending suggestion is closed. The patient's Suggested Sessions entry disappears (and the sidebar entry disappears if nothing else waits).

---

### 12.6 The contact-leak scanner (therapist side)

> **Feature guide.** Every string one role writes and another reads is scanned. **Two tiers, deliberately**: a `block` hit (UPI handle, payment link, payment app) refuses the write; a `flag` hit (phone, email, social handle, bare URL) is delivered and recorded. The two tiers exist because this text is **clinical** — a scanner that treats digits as suspicious fires on every dose and every exercise prescription, and a check that cries wolf is a check nobody reads. Phone matching is the Indian mobile shape specifically (ten digits starting 6–9, optional `0`/`91`), not a loose digit run.

#### `THR-LEAK-001` — A payment handle is blocked · P0
**Steps.** In **Why this, for this patient**, enter `Pay me directly on 9876543210@okhdfc, it's cheaper` and submit.
**Expected Result.** The write is **refused**. The care plan is not created. A `communication_flags` row records the attempt with `blocked=true` and the offending content.

#### `THR-LEAK-002` — A payment link is blocked · P0
**Steps.** In a suggestion note, enter `https://rzp.io/l/abcd1234 pay here`. **Expected Result.** Refused, recorded.

#### `THR-LEAK-003` — A phone number is delivered and recorded · P1
**Steps.** In a suggestion note, enter `Call me on 9876543210 before the session`. **Expected Result.** The suggestion **is created** and the patient sees the note. A `communication_flags` row exists with tier `flag` and `blocked=false`. Admin → Settings → User Access shows it.

#### `THR-LEAK-004` — Clinical text with digits does not fire · P0
**Steps.** In a session note, enter `Grade III PA mobilisation ×3 sets, 30s hold. 10 reps, 2× daily. Order ref 90210.`
**Expected Result.** **No flag at all.** If this fires, the scanner is broken in the way that matters most — a false positive on ordinary clinical text is what makes the whole control useless.

#### `THR-LEAK-005` — The patient direction is record-only · P1
**Steps.** As Patient A, put `Call me on 9876543210` in the `/book` notes field and complete the booking.
**Expected Result.** The booking **succeeds**. A flag is recorded. **A 400 at the last step of checkout costs a real booking, and a patient is not who this control exists to catch.**

#### `THR-LEAK-006` — The scan mode switch · P1
**Steps.** Admin sets `contact_scan_mode` to `flag_only`, then to `off`. Repeat `THR-LEAK-001` after each.
**Expected Result.** `flag_only`: the UPI handle is **delivered** and recorded rather than refused. `off`: nothing is scanned or recorded. The setting is read in its **own** call and **fails open** — if the read fails, writes are allowed. (`contact_masking_enabled` is the opposite: it fails **closed**. Both defaults are deliberate and opposite.)

#### `THR-LEAK-007` — The evidence tables cannot be edited · P0 **[SQL]**
**Steps.** Attempt `update communication_flags set content='x'` and `delete from contact_reveal_log` in the SQL editor.
**Expected Result.** Both **raise**. Append-only **by trigger**, not merely by RLS — every route here writes with the service-role client, which bypasses RLS entirely. *An evidence record the evidenced party could edit is not evidence.*

---

### 12.7 Earnings and payouts

#### `THR-EARN-001` — Earnings shows delivered work only · P0

**Preconditions.** Therapist A has a revenue share of `60`, one **completed paid** session at ₹1,999, and one **paid but not completed** session at ₹1,799.
**Steps.** Open `/therapist/dashboard/earnings`.
**Expected Result.** The earned figure counts **only the completed** session: `₹1,999 × 60% = ₹1,199.40 → 119940 paise` (rounded). The paid-but-not-completed session contributes **nothing** — a therapist's share is earned by **delivering**, not by being booked. The screen answers both "what am I owed" and "what have I been paid" — Earnings and Payout Receipts are **one screen**, not two entries.

#### `THR-EARN-002` — Home-visit share and travel · P0

**Preconditions.** Therapist A has `home_visit_revenue_share_percent = 65`; Therapist B has none set. Each completes one home visit of ₹2,499 with a ₹150 travel fee.
**Expected Result.** Therapist A: `2499 × 65% + 150 = ₹1,774.35`. Therapist B falls back to their **online** share (55%): `2499 × 55% + 150 = ₹1,524.45`. **The travel fee is paid through in full and is never revenue** — a therapist must never fund their own transport.

#### `THR-EARN-003` — Request a payout · P1
**Steps.** Tap **Request Payout**.
**Expected Result.** The button becomes **Request Pending**, then **Under Review** once an admin starts review. A second request returns `You already have a pending payout request.` With no revenue share set: `Ask admin to set your revenue share % before requesting a payout.` The online method is refused with `Online payouts aren't available yet — use cash for now.`

#### `THR-EARN-004` — Cash held nets off the payout · P0
See `FIN-PAY-003` for the full cross-check. From the therapist's side, the figure shown as payable must be **net of cash they are still holding**.

---

### 12.8 Therapist authorization (negative)

#### `THR-SEC-001` — Therapist A cannot touch Therapist B's schedule · P0
**Steps.** With Therapist A's cookie, call `POST /api/therapist/save-availability` with a body naming Therapist B's id. Then call `POST /api/admin/save-therapist-availability` for Therapist B.
**Expected Result.** Both refused. The therapist route writes **only** the caller's own schedule (the id in the body is ignored or rejected); the admin route returns **403 Forbidden**. Verify in the admin Roster that Therapist B's schedule is byte-identical afterwards.

#### `THR-SEC-002` — Therapist A cannot read an unassigned patient · P0
**Steps.** With Therapist A's cookie, open `/therapist/dashboard/health-profile/<Patient B id>` (a patient assigned only to Therapist B). Then call `POST /api/therapist/pain-assessments/submit` and `POST /api/therapist/care-plan/submit` for Patient B.
**Expected Result.** The page shows no clinical data. The routes return **403** with `You're not assigned to this patient.` / `That isn't your patient.`

#### `THR-SEC-003` — A therapist cannot book as a patient · P0
**Steps.** Signed in as Therapist A, open `/book`.
**Expected Result.** Instead of the form, the **wrong-account** panel renders, naming the role and routing them to what is theirs. A direct `POST /api/appointments/create` with the therapist's cookie returns **403** with `This account can't book sessions. Sessions are booked under a patient account.` The same applies to all four purchase routes.

#### `THR-SEC-004` — A therapist cannot reach the admin dashboard · P0
**Steps.** Signed in as Therapist A, navigate to `/admin/dashboard`.
**Expected Result.** Redirected to **`/get-started`** — **never** to `/admin/login`, which would confirm the back office exists and name its door.

#### `THR-SEC-005` — A suspended therapist is locked out immediately · P0
**Steps.** Admin sets Therapist A inactive. With the therapist's still-valid cookie, load the dashboard and then call any therapist API route.
**Expected Result.** The dashboard redirects to **`/account-suspended`**. The API returns **403** `Your account is not active.` A live session cookie must not outlive suspension.
