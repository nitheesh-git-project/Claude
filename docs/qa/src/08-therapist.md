---

## 12. Therapist test plan

### 12.0 Feature guide - the therapist's world

A therapist applies, waits for admin approval, sets a roster, is assigned patients, delivers sessions, writes clinical records, recommends treatment, and gets paid a revenue share on what they **delivered**.

Five rules shape almost every screen:

1. **Availability is three separate things and reads as three things.** A **weekly schedule** (what they normally work, expressed as working *periods*, not hourly cells), **exceptions** (one date that differs), and **time off** (`profiles.on_leave`, off the roster entirely). Leave never clears the schedule. An exception never edits the weekly template.
2. **Availability never touches an appointment.** Removing hours a session is booked into names who is affected and says the session stays as booked. Nothing cancels, moves or flags it. The booking wins.
3. **A therapist suggests; the patient books.** A therapist can propose a time on a programme locked to them. No slot is held. Only the patient's acceptance spends a credit.
4. **A therapist picks a package, never a price.** There is no price, session-count or discount field on a care plan version. Those columns do not exist.
5. **A patient's phone is masked, their email is not loaded at all**, and revealing the number is logged. Every cross-role free-text field is scanned.

---

### 12.1 Application, approval and access

#### `THR-AUTH-001` - Apply to join · P0

**Steps**
1. Open `/therapist/login`. Confirm two tabs: **Sign In** and **Apply to Join**.
2. Tap **Apply to Join**.
3. Tap **Full Name**. Enter `QA Therapist A`.
4. Tap **Email Address**. Enter `qa.therapist.a@example.test`.
5. Tap the phone field. Enter `+91 90000 10001`.
6. Tap **Qualifications & License / Council Reg No.** Enter `MPT (Ortho), KSCP Reg 44821`.
7. Tap **Specialist In**. It is a **dropdown**, not a text box, and it lists exactly eight: Orthopaedic, Neurological, Paediatric, Sports, Geriatric, Cardiopulmonary, Women's health, General physiotherapy - **General physiotherapy** is the one for somebody who does not specialise. Choose **Orthopaedic**.
7b. Tap **Years of experience**. Try `abc`, then `-2`, then `2024`, then `61`. Finally enter `9`.
8. Tap **Password**. Enter the `E2E_QA_PASSWORD` value.
9. Tap **Confirm Password**. Enter the `E2E_QA_PASSWORD` value.
10. Tap **Submit Application**.

**Expected Result.** The button reads `Submitting...`, then the form returns to the **Sign In** tab with a confirmation that the application is with the clinic. The `profiles` row exists with `role='therapist'`, `approved=false`, `active=true`, `specialization='Orthopaedic'` - the exact label, not a code - and `years_experience = 9`.
**Step 7b:** letters never reach the box at all; `-2` and `61` are refused with the clinic's own wording naming the range (0 to 60); `2024` is refused as a number of years rather than stored, since somebody typing a *year* has answered a different question. Leaving it empty is refused - it is required on this form, and optional only on the admin's own create-account form, where the therapist can set it themselves afterwards. This column has existed since the first therapist shipped and nothing ever wrote it, so a therapist created before this landed carries null and shows nothing rather than `0`. **No "check your email" step appears anywhere.** The application shows in Admin → Today → Approvals, **carrying the specialisation chip**, and raises that tab's badge. Submitting with **Specialist In** left on its placeholder is refused by the form's own validation, in the clinic's wording rather than the browser's.
**Critical check:** the specialisation and the years both reach the profile row through the signup trigger (`handle_new_user`), which clamps the years server-side - signup metadata comes from a browser and is never trusted. A database that has not had the schema re-applied writes the rest of the application and leaves those columns null - the account is still created, and the therapist sets it from their own dashboard.
**Cleanup.** Leave for `ADM-APPR-002`.

#### `THR-AUTH-002` - An unapproved therapist is held at the door · P0

**Steps**
1. Sign in at `/therapist/login` as `qa.therapist.a@example.test` before approval.
2. Then call the route directly, still signed in as that unapproved therapist. DevTools (**F12**) → **Console** (§5.1a):

```js
await fetch("/api/therapist/save-availability", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slots: [{ dayOfWeek: 1, hour: 10 }] })
}).then(async r => ({ status: r.status, body: await r.json() }))
```

**Expected Result.** Step 1 lands on **`/pending-approval`**, not the dashboard. Step 2 returns **403** with `Your account is not active - it is either awaiting admin approval or has been suspended.` **The API refusal is the one that matters** - a valid cookie must not be able to call around the UI.

#### `THR-AUTH-003` - Sign in after approval · P0
**Preconditions.** `ADM-APPR-002` approved Therapist A.
**Expected Result.** Sign-in lands on `/therapist/dashboard`. The sidebar shows **Overview**, **Availability**, **Sessions**, **Earnings**, **My Patients**, **Edit Profile**, with **Back to Home** at the foot of the nav directly above Collapse (with children Photo / Public Details / Credentials / Account Security).

---

### 12.1a The dashboard landing screens

The therapist Overview is where a clinician starts every shift: what is on today, what is owed, and what they have not written up yet. Edit Profile is the screen that draws the line between a detail they own outright and a credential a patient relies on.

#### `THR-DASH-001` - The therapist Overview · P1

**Feature.** `/therapist/dashboard`. **Role.** Therapist.
**Purpose.** Confirm the header states what this therapist is paid and rated, that the four figures agree with the screens they link to, and that every quick action lands somewhere real.
**Preconditions.** `THR-AUTH-003`. Best read after `THR-SESS-005` has completed at least one session, so **Notes to write** and **Owed to you** are non-zero.

**Steps**
1. Open `/therapist/dashboard`. On a brand-new therapist only, the dashboard tutorial opens first (`Dashboard tour · dummy data`): tap the **Health profiles** chip and step through all five of its steps - triage, filling the seven questions, the Pain Map exam, recommending a programme, and later changes through the clinic - then tap **Skip**, confirm **Skip tour**, and check it does not return on reload.
2. Read the header block: name, credentials, `Your Revenue Share: N%`, `Your Rating: …`.
3. Read the four figures: **Today**, **Upcoming**, **Notes to write**, **Owed to you**.
4. Tap **Notes to write**.
5. Tap Back, then tap **Owed to you**.
6. Tap Back. Read the activity feed.
7. Tap the quick action **Set your availability**.
8. Tap Back, then tap each of **Your assigned sessions**, **Patient health profiles** and **Earnings and payouts** in turn, returning each time.

**Expected Result.**
* **The tutorial explains the health profile from the therapist's side** with dummy data only (Priya, Dr Ananya): who fills it first, that the first fill saves without review and unlocks the patient's profile, and that later changes wait for the clinic. Skip asks once, then records it as seen; the (i) beside any page title replays just that page's chapter.
* Header: `Welcome, QA Therapist A`, the credentials string, `Your Revenue Share: 60%` (whatever `ADM-PEOP-006` set), and `Your Rating: No ratings yet` until a patient has rated one - then `4.0 (1 rating)`. If an admin has hidden this therapist's rating, the line ends ` - hidden from public pages`.
* Greeting `Your practice today`. The headline names the next session and its patient, or reads `No sessions booked yet - keep your availability open and the clinic assigns work to it.`
* **Today** counts today's sessions with `Next at H:MM` beneath, **Upcoming** counts confirmed and awaiting-assignment work, **Notes to write** counts delivered sessions with nothing recorded (amber above zero, emerald at zero with `Every delivered session is written up`), **Owed to you** is a rupee figure with `Not yet requested` / `Payout request under review` / `Payout request sent` - and it is **the same figure**, to the paisa, as Earnings' *Pending Payout*, the *Owed* on this therapist's admin profile and their row on Money → Payouts (cash held aside). A session marked paid with no amount recorded adds nothing to any of them; one that read ₹9,232.80 here against ₹4,435.20 there is the QA F-21 bug.
* Steps 4 and 5 land on `/therapist/dashboard/sessions` and `/therapist/dashboard/earnings`. The counts there match the figures exactly.
* Empty feed reads `Assignments, completed sessions and payouts show up here as they happen.` A session delivered with no note written is a `needsYou` item pinned above dated items.
* **Step 7 must land on `/therapist/dashboard/availability`, with the weekly schedule editor on screen.** Availability is its own route; a quick action that reloads the Overview and changes nothing is a defect - report it against this test ID.
* Step 8's three links land on `/therapist/dashboard/sessions`, `/therapist/dashboard/health-profile` and `/therapist/dashboard/earnings`.
* No figure on this screen exposes a patient's phone number or email - see `THR-SESS-003`.
**Cleanup.** None.

#### `THR-PROF-001` - Edit Profile: what saves instantly and what needs approval · P1

**Feature.** `/therapist/dashboard/profile`. **Role.** Therapist.
**Purpose.** Prove the line between a detail a therapist owns and a credential patients rely on: the first saves on the spot, the second becomes an admin review request and locks the field until it is decided.
**Preconditions.** `THR-AUTH-003`. An admin is available to decide the request in `ADM-APPR-004`.
**Test Data.** Bio `Works with desk-based patients on posture-driven back pain.` · Languages `English, Kannada, Hindi` · Years of Experience `15` (a deliberate wrong value - it is declined, never approved, so Therapist A stays at the §8.8 value of `9`) · Specialist In `Neurological` (a **dropdown** now, not a text box).

**Steps**
1. In the sidebar tap **Edit Profile**.
2. Under **Public Details → Bio**, tap **Edit** (or **Add**). Type `Works with desk-based patients on posture-driven back pain.`, press Enter, type `Video and home visits.`, then select the words `posture-driven` and tap **Bold** in the toolbar. Tap **Save**.
3. Under **Public Details**, tap **Edit**, then **Languages Spoken**. Enter `English, Kannada, Hindi` and tap **Save**.
4. Confirm the bio now shows in grey exactly as typed - two paragraphs, `posture-driven` in bold - with an **Edit** button under it.
5. Reload the page and confirm both values survived.
6. Under **Credentials & Specialization**, tap **Years of Experience**. Enter `15`.
7. Tap **Specialist In** and choose `Neurological` from the dropdown.
8. Tap **Request Changes**.
9. Read the two fields you just changed.
10. Tap **Withdraw** beside **Specialist In**.
11. Repeat steps 7–8 for **Specialist In** only. Leave it pending.
12. Sign in as a full admin and open **Today → Approvals**. Decline **both** requested fields with the note `Send the council registration number first.`
13. Sign back in as the therapist and reopen **Edit Profile**.
14. Under **Account Security**, tap **Send password reset email**.

**Expected Result.**
* **Public Details save instantly.** The button reads `Saving...` then `Save`; the values survive the reload at step 5. No admin sees anything.
* **The bio keeps its formatting everywhere.** The grey saved view, the admin's therapist page and the `/team` popup all show the same two paragraphs with `posture-driven` in bold - never one run-on line. **Cancel** with unsaved changes asks before discarding them.
* **Credentials do not.** Step 8 shows `Your request has been submitted for admin review.` Each requested field is replaced by its **new** value on a slate panel with an amber `Pending Review` chip and a **Withdraw** link, and **cannot be edited again** until the request is decided. The live public profile still shows the **old** value - `/team` and the patient's therapist card must not change yet.
* Step 10's **Withdraw** returns the field to an editable control immediately, with the old value.
* **Specialist In is a dropdown of the eight the clinic recognises.** A therapist whose stored value is free text written before this list existed is offered that value as a ninth option and it is **preselected** - the screen must never show a different specialisation from the one in the database because the stored one had no matching option.
* After step 12's decline the field is editable again and carries `Last request declined: Send the council registration number first.` in red. Nothing on the public profile ever changed.
* The note under the credential fields reads `Changes to these fields need admin approval before they take effect.`
* **Profile photo** uploads on the spot (no review) and appears on `/team` once the therapist is visible there.
* Step 14 sends the reset by email and says so; the password is never typed on this screen.
* Negative: a **negative** Years of Experience is refused by the field's `min=0`; an empty **Full Name** submits nothing.
**Cleanup.** Leave the bio and languages as set - §8.8 quotes them. **No credential request may be left pending**, or `ADM-APPR-004` starts with rows it did not create and Therapist A's experience drifts from `9`.

---

### 12.2 Availability - the roster

> **Feature guide.** The editor is the same component on the therapist's own screen and on the admin's Roster. It edits **periods** ("Monday 9 AM – 1 PM and 2 PM – 6 PM"), and converts them to the hour rows the tables have always stored. Every existing schedule - including a sparse exception written one cell at a time by the old grid - must read back as exactly the same hours. A weekly save is a **compare-and-swap under a real row lock**, versioned by `therapist_schedule_state` - and a therapist who has never been saved has no such row, so the first save asks for no comparison at all rather than comparing against a version nobody holds. It **opens read-only**, as a week summary with an **Edit schedule** button: reading somebody's hours and changing them are two different acts, and a mis-tap on a dropdown used to be a change.

**If it fails to load.** When the profile (or the list of changes waiting for approval) cannot be read, the page shows *We couldn't load …* with a **Try again** button **instead of** the editable sections - never blank fields. Account Security still works. The sidebar's section links land on the notice. To check by hand, the page must be made to fail a read on the server (for example a temporarily broken query on a scratch build); there is no switch for it.

#### `THR-AVAIL-001` - Set a weekly schedule with two periods a day · P0

**Steps**
1. Open `/therapist/dashboard/availability`.
2. Read the header line - it states the schedule's timezone. The week is shown as a **summary, with no editable controls on it**; tap **Edit schedule**.
3. On **Monday**, tap the "working" toggle so the day is on.
4. Tap the Monday start-time control. Set `09:00`. Tap the end-time control. Set `13:00`.
5. Tap **Add hours** on Monday. On the new period, set `14:00` to `18:00`.
6. Tap the copy control on Monday and copy Monday to Tuesday, Wednesday, Thursday and Friday.
7. Tap **Save**.

**Expected Result.** After saving, a "Saved" indication appears, the editor **closes back to the read-only summary**, and that summary reads Mon–Fri `9:00 AM – 1:00 PM, 2:00 PM – 6:00 PM`. Reloading the page shows exactly the same periods - **the stored hour rows round-trip to the same periods** - and shows them read-only. Saturday and Sunday remain off.
**This is also the first-save check for this therapist.** If it is refused with *"This schedule was changed by someone else"* on an account nobody else has touched, that is the version default returning: an absent `therapist_schedule_state` row is "no comparison asked for", not version `0`.
**Cross-check:** Admin → Sessions → Roster, opening `QA Therapist A`, shows the identical schedule in the identical editor.

#### `THR-AVAIL-002` - A day with no hours must be explicit · P1
**Steps.** Turn Monday's working toggle on, remove all its periods, and tap **Save**.
**Expected Result.** Refused with `Add at least one set of hours, or mark the day unavailable.` The save does not go through with an ambiguous day.

#### `THR-AVAIL-003` - Removing hours a session is booked into · P0

**Preconditions.** Therapist A has a confirmed session on a Wednesday at 10:00.
**Steps.** Edit Wednesday's period to `14:00–18:00` (dropping 10:00) and tap **Save**.
**Expected Result.** Before saving, the editor **names the affected sessions** and states that **the session stays as booked**. After saving, the schedule changes and **the appointment is unchanged** - not cancelled, not moved, not flagged. The patient's dashboard and the admin's Schedule still show it at 10:00. **Availability and appointments are separate systems and the booking wins.**

#### `THR-AVAIL-004` - A stale save is refused; a double-clicked Save is a no-op success · P0

**Purpose.** Prove the compare-and-swap.
**Steps**
1. Open the availability screen in two browser tabs (Tab 1 and Tab 2), both showing the same schedule.
2. In Tab 1, change Monday to `10:00–14:00` and tap **Save**. Wait for "Saved".
3. In Tab 2 (still holding the old version), change Monday to `08:00–12:00` and tap **Save**.
4. Separately, in a fresh tab, change Tuesday and **double-click Save**.

**Expected Result**
* Step 3: refused with **HTTP 409** and a message telling the therapist to reload the latest. Tab 1's save is not overwritten.
* Step 4: **both identical requests succeed** - two identical requests carrying the same stale version are one logical change, so this is a **no-op success**, not a 409. Exactly one change is stored.

#### `THR-AVAIL-005` - A therapist adds and removes their own exceptions · P0

**Steps**
1. On the availability screen, under **Exceptions**, tap **Add exception**. Pick a date next week, choose **Available for set hours**, set `10 AM - 12 PM`, add a note. Save.
2. Tap **Remove** on that exception.
3. Try to pick a date before today in the date picker. Then call `POST /api/therapist/set-availability-exception` with `{ "date": "<yesterday>", "mode": "unavailable" }` and the therapist's cookie.
4. Call `POST /api/admin/set-availability-exception` with the therapist's cookie.
5. Call `POST /api/therapist/set-availability-exception` with another therapist's id in the body.

**Expected Result.** Step 1: the exception is listed with its hours and note, and the admin's Roster shows the same date. Step 2: it disappears and the date follows the weekly schedule again. Step 3: the picker does not offer past dates, and the route answers **400** - *That date has already passed.* Step 4: **403** - the admin route is still the admin's. Step 5: the id is ignored; only the caller's own schedule changes. A booked session on the date is never moved or cancelled.

#### `THR-AVAIL-005b` - A failed read never shows an empty schedule · P0

**Steps.** With the database briefly unreachable (or `therapist_availability_template` reads failing), open the availability screen.
**Expected Result.** The screen says *We couldn't load your schedule* and shows **no editor and no Save**. An empty week built from a read that failed would look like "no hours set", and saving it would wipe the real schedule. Separately: a weekly save sent with no `expectedVersion` for a therapist who already has a schedule is refused with **409** (or succeeds as a no-op if it asks for exactly the stored hours).

#### `THR-AVAIL-006` - Leave leaves the schedule intact · P0

**Steps**
1. In the Leave panel, set leave from `2026-09-14` to `2026-09-18` with reason `Annual leave`. Save.
2. Look at the weekly schedule.
3. Remove the leave.
4. Look at the weekly schedule again.

**Expected Result.** The weekly schedule is **unchanged** in both step 2 and step 4 - leave never clears it, and there is nothing to restore on the way back because nothing was removed. `profiles.on_leave` reflects the state. The admin's Roster shows the therapist as on leave for those dates.

#### `THR-AVAIL-007` - An exception owns only its own date · P1
**Preconditions.** An admin has set a `2026-09-15` exception of `14:00–18:00` for Therapist A (`ADM-ROST-003`).
**Expected Result.** 15 September shows `14:00–18:00`; every **other** Tuesday still shows the weekly template's hours. The weekly template itself is unchanged.

#### `THR-AVAIL-008` - Roster changes never move a booking or the patient's picker · P0
This is the regression that guards the whole design. See `XCFG-ROSTER-001`.

---

### 12.3 Sessions

#### `THR-SESS-001` - Assigned sessions appear; unassigned ones do not · P0

**Steps.** Sign in as Therapist A and open `/therapist/dashboard/sessions` **before** the admin assigns anything. Then have `ADM-SESS-003` assign Patient A's paid session to Therapist A, and reload.
**Expected Result.** Before assignment: the session is **absent**. A `requested`, unassigned session belongs to no therapist. After assignment: it appears under Upcoming with the patient's name, the concern, the slot and its status. If Google credentials are configured, it also carries a Meet link.

#### `THR-SESS-002` - Sessions is one list with filters · P2
**Expected Result.** Video sessions and home visits are in **one** Sessions screen with Upcoming/Past/Cancelled and a Video/Home-visit filter that appears only for a therapist who has both. There is no separate "Home visits" sidebar entry.

#### `THR-SESS-003` - A patient's phone is masked and their email is absent · P0

**Preconditions.** `contact_masking_enabled` is on (the default).
**Steps.** Open an assigned session card and read the contact area. Then open the browser's **View Source / Network** and search the page HTML for the patient's full phone number and for `qa.patient.a@example.test`.
**Expected Result**
* On screen: the phone reads in the masked form `+91 ••••• ••210` - country prefix and last three digits only. **The email is not shown at all.**
* **In the page source, the plaintext phone number must not appear anywhere**, because masking happens where the rows are loaded, not in the component. The email must not appear either - it is not loaded onto therapist surfaces.
* A patient with no number shows `No number on file`.

#### `THR-SESS-004` - Reveal a contact inside the join window · P0

**Preconditions.** A confirmed **video** session whose slot is within the join window - in real time, or on the debug bar's simulated clock while the bar is on (the route honours it, like Done).
**Steps.** Tap **Show number**. Read the number. Then repeat on a session whose slot is a week away, and on a cancelled session.
**Expected Result**
* Inside the window: the full number is revealed, and a `contact_reveal_log` row is written. **The log write is not best-effort** - if it fails, the reveal is refused with `Could not show the number just now. Please try again.` A reveal with no trace is the one outcome this route must not produce.
* Outside the window: refused (403) with the time it opens - `You can see this number from <time> on <date>.` - or, after it, `This number closed at <time>, after the session.` A home visit outside its day says `You can see this number on <date>, the day of the visit.`
* Cancelled session: refused.
* A **home visit** is revealable **any time on the visit's own day in the clinic's zone (IST)**, not merely in a join window - verify this separately, including a 7 AM visit just after midnight.
* Admin → Settings → User Access shows the reveal log. It is **admin-read-only and append-only by trigger**: attempting to update or delete a row raises, even with the service role.

#### `THR-SESS-005` - Completing a session is gated two ways · P0

**Purpose.** `status='completed' && payment_status='paid'` is the exact condition that makes a therapist's revenue share payable, so the route refuses two things.

**Steps**
1. On an **unpaid, unprogrammed, no-cash** confirmed session, tap the complete control.
2. On a **paid** confirmed session whose slot is still in the future, tap the complete control.
3. Simulate a time after the slot and try step 2 again.
4. On a paid confirmed session whose join window has genuinely opened in **real** time, tap the complete control, read the dialog, and confirm.

**Expected Result**
* Step 1: refused (409). Nothing may be completed with no payment, no programme behind it and no cash recorded. A cash home visit must collect first.
* Step 2: refused (409) - nothing may be completed before the join window in which it could have been started.
* Step 3: **still refused.** The simulated clock is client-side only; this gate is server-side. **This is correct behaviour, not a defect.**
* Step 4: the dialog reads *"Mark this session as done? You'll be asked to rate it next."* After confirming, the session becomes `completed`, `completed_at` is stamped, and the therapist's Earnings figure increases by their share.
* A session that is not `confirmed` is refused with `Only confirmed sessions can be marked completed.`
* A second completion attempt returns `This session was already updated - please refresh and try again.` (409). **No double payout.**

#### `THR-SESS-005b` - Done needs this condition type's examination · P0

**Preconditions.** Three confirmed, paid sessions with Therapist A whose start has passed: one with an **orthopaedic** patient, one with the **neurological** patient (Patient C), one with a **paediatric** patient. No exam recorded by Therapist A for any of them since an hour before each slot.
**Steps**
1. On each card tap **Done**, fill the three required note fields and tap **Save note & finish session** without recording anything else.
2. On the neurological session, tap **Record the examination** in the note's first step, record at least one finding, save it, then **Save note & finish session** again.
3. Call `POST /api/appointments/complete-session` directly for an orthopaedic and a neurological session that have a note but no exam this session. Repeat step 2 with the debug bar's clock moved to just after a future session's start.

**Expected Result**
* Step 1: the orthopaedic note's first step is **Pain Map** with **Update the Pain Map**, and finishing is refused with *"Update the Pain Map for this session before finishing it."* The neurological note's first step is **Neurological examination** with **Record the examination** - never a Pain Map - and finishing is refused with *"Record the neurological examination for this session before finishing it."* The paediatric note has no exam step and finishes on the note alone - until the paediatric exam step ships (phase 5b), when it will ask for the paediatric examination the same way (`THR-HP-005k` step 7). Nothing is completed by a refusal.
* Step 2: the step reads *"Recorded for this session at <time>."* and the session finishes; the rating form follows.
* Step 3: the route answers **409** `pain_map_required` (orthopaedic) and **409** `neuro_exam_required` with *"Record the neurological examination for this session before marking it done."* (neurological). A Pain Map reading does not satisfy a neurological session and a neurological exam does not satisfy an orthopaedic one. Under the simulated clock the exam just recorded counts for that session (the window moves with the debug clock), exactly as for the Pain Map.

#### `THR-SESS-006` - Mark a no-show · P2
**Expected Result.** The session is completed with `no_show=true`. It shows as `Marked as no-show` and the patient's rating control is suppressed with `This session was marked as a no-show - there's nothing to rate.`

#### `THR-SESS-007` - Record cash on a home visit · P0

**Purpose.** The person holding the cash must not also decide how much the clinic knows about.
**Steps.** On a cash-on-visit home visit, tap the collect-cash control. Observe what the form asks for. Then inspect the network request body.
**Expected Result.** The therapist **asserts that money changed hands**; they do **not** type an amount. The request body carries **an appointment id and nothing else** - the total is reconstructed server-side from the purchase using the same per-visit maths that booked it. If the UI ever offers an editable amount field here, that is a P0 defect.
The honest exception (a patient short of cash) belongs to **Admin → correct cash amount**, which requires `money` scope, a mandatory reason, a CAS on the figure being replaced, and writes a `cash.correct_amount` audit row - and refuses a visit whose cash has already been remitted.
A second attempt returns `This visit's payment has already been recorded.`

#### `THR-SESS-008` - Session notes · P1

**Steps**
1. Before a session has taken place, open the note dialog.
2. After completion, open it and fill: **What did you treat today?** `L4-L5 segmental mobilisation, glute med activation`; **Techniques and dosage** `Grade III PA mobilisation ×3 sets, 30s hold`; **How did the patient respond?** `Reported easing within the session, straight-leg raise improved`; **Home exercise prescribed** `Cat-camel ×10, twice daily. Walking 15 min.`; **Plan for the next session** `Progress to loaded hinge if pain stays under 3/10; reassess SLR`; **Anything to watch** `Reports night pain - reassess if it persists`. Save.
3. Edit the note within 24 hours and change one field.
4. Sign in as Patient A and search their entire portal and their exported PDF for the note text.

**Expected Result**
* Step 1: refused - `You can write the note from <date, time>, when the session starts.` (On the debug bar's simulated clock while the bar is on, like Done.)
* Step 2: saved. It appears on the therapist's chart. **Completion is never blocked on a note** - the nudge is a "Notes to write" figure on Overview and a feed item.
* Step 3: succeeds, and a `session_note_revisions` row records what it replaced. After 24 hours, editing is refused.
* Step 4: **the note text appears nowhere the patient can see, including the PDF export.** `session_notes` has no patient select policy and must never get one.
* Submitting with required fields blank: `Fill in what you treated, how the patient responded, and the plan for next time.`
* An unknown field in the payload: `Note contains unknown fields.`

#### `THR-SESS-009` - The summary for the patient, written beside the note · P0

**Feature.** The note dialog (Done, or the completed card's note button) has a second band, teal with an eye, headed **Shared with the patient**: *What we did today* and *What to do before next time*. Both optional, 600 characters each. It is the one part of the dialog the patient reads; the note above it stays clinician-only.
**Preconditions.** Therapist A has a confirmed session with Patient A that has started.

**Steps**
1. Tap **Done**. Fill the note as in `THR-SESS-008`, and in the shared band write *What we did today* `We worked on getting up from a chair without pushing off.` and *What to do before next time* `Heel slides, 10 at a time, morning and evening.` Save.
2. Within 24 hours reopen the note from the card and change one summary line. Save.
3. Reopen it, empty both summary boxes and save.
4. Put `Call me on 98765 43210` in a summary box and save.
5. As Therapist B (not on this session), POST `/api/therapist/session-summary/submit` for this appointment.

**Expected Result**
* Step 1: the session finishes; the toast ends `<first name> can read your summary.` One `session_summaries` row, filed under the session's patient and therapist (never from the request body). If the summary is refused, the note is still saved, the session **stays open**, and the message says so.
* Step 2: saved; a `session_summary_revisions` row keeps the old text. After 24 hours the band is read-only with `This summary is locked - it was written more than 24 hours ago.`
* Step 3: refused - `… may already have read the summary, so it can be corrected but not removed.`
* Step 4: blocked by the contact scanner, with a Risk signal on surface **Session summary for the patient**.
* Step 5: `That session isn't yours.` (403).
* A no-show session refuses a summary; an over-long box is refused with the 600-character message.

---

### 12.4 Clinical records

#### `THR-PAT-001` - My Patients, with a view switch not a second entry · P2
**Steps.** Open `/therapist/dashboard/health-profile`. Toggle **Patients** ↔ **Programmes**.
**Expected Result.** The same patients, arranged two ways - by name, and by package purchase. **Programmes is a toggle, not a sidebar entry**, and it only appears for a therapist who actually has package patients.

#### `THR-HP-001` - Triage a new patient · P0

**Purpose.** The therapist owns the **first fill**, and it is **not reviewed**.
**Preconditions.** Therapist A is assigned to Patient A, who has no condition profile.

**Steps**
1. Open Patient A's chart at `/therapist/dashboard/health-profile/<patientId>`.
2. Tap the control that starts triage.
3. Answer **How old is the patient?** → `18 to 64`.
4. Answer **What brought them in?** → `Injury, strain or overuse`.
5. Answer **Any of these present?** → tick `None of these`, then tick `Weakness on one side`, then tick `None of these` again.
6. Observe whether the milestones question appears.
7. Read the suggestion panel.
8. Confirm the suggested condition type.

**Expected Result**
* Step 2: the dialog shows **all four questions at once, with headings** - the clinician's surfaces deliberately invert the patient's one-question-at-a-time pacing, because a clinician filling this after every assignment wants to scan it.
* Step 5: **`None of these` and a sign never stay ticked together.** Ticking `Weakness on one side` unticks `None of these`; ticking `None of these` again unticks the weakness. It ends with `None of these` alone. A request carrying both anyway is refused by the server (`"None of these" can't be ticked alongside another answer…`).
* Step 6: the milestones question is **not shown** - it only appears when age is `Under 18`.
* Step 7: **Orthopaedic** is suggested, **with its reason stated**, and is **not auto-accepted**. The therapist confirms or overrides.
* On confirming, an already-`approved` `condition_change_requests` row is written, so the triage appears in the ordinary Review History with no new concept and no queue.
* **Nowhere on a patient-facing screen do the words "triage", "onboarding" or "specialty" appear.** A patient is shown the care ("Orthopaedic care"), never the category word.

#### `THR-HP-010` - "Onboarding needed" on Home and the session card, and the guide · P1

**Preconditions.** Therapist A is assigned to Patient A, who has no condition profile, with a confirmed session booked.

**Steps**
1. Open `/therapist/dashboard` (Home).
2. Open **Sessions** and find Patient A's session card.
3. Tap **How onboarding works** (on the banner or the card) and step through it with **Next**.
4. Tap **Start onboarding** on the card.
5. Fill and save the first record (THR-HP-001/002), then reopen Home and Sessions.

**Expected Result**
* Step 1: an amber banner above the greeting - `<Patient> needs onboarding` (or `N patients need onboarding`), each row with the next session's date and time and **Start onboarding**, and **How onboarding works**. More than three patients: three by name and `And N more - see them on Health Profiles.` The Home feed row `Onboarding needed - <Patient>` is still there too.
* Step 2: the card carries an amber strip - **Onboarding needed**, `<First name>'s Health Profile is locked until you fill it - do it with them in this session.`, **Start onboarding** and **How onboarding works**. A cancelled session's card has no strip.
* Step 3: an eight-step guide with dummy data, not part of the first-visit tour: *What onboarding is*, *Before the session*, *Step 1 - four questions decide the condition type* (it plays three dummy patients, one landing on each of Orthopaedic, Neurological and Paediatric with the reason), *Orthopaedic*, *Neurological* and *Paediatric* (each walks that type's real questions with the help line to read aloud, required ones marked), *Save - it's live straight away*, and *If the case turns out to be something else*.
* Step 4: the patient's Health Profile opens with **Which condition type is this?** already open, and the address bar no longer carries `?start=onboarding` (a reload does not reopen it).
* Step 5: the banner row and the card strip are gone.

#### `THR-HP-002` - Write the patient's first record (live, no review) · P0

**Steps.** Continue from triage into the seven orthopaedic questions and enter the §8.4 answers. Submit.
**Expected Result.** The record is written **live** - there is no approval queue in front of it. The patient's own Health Profile **unlocks** immediately (see `PAT-HP-002`). The route needs only that the therapist is **assigned** to the patient. If the therapist is not assigned, it is refused with `You aren't assigned to this patient.`

#### `THR-HP-003` - Editing a live record needs an approved grant · P0

**Purpose.** The line is **create versus edit**.
**Steps.** With the record now live, attempt to edit the patient's answers on their behalf. Then request access, have an admin approve it (`ADM-PEOP-004`), and try again.
**Expected Result.** Before the grant: refused with `You don't have an approved access grant for this patient's health profile.` The **Request access to edit** card sits **inside the Pain Map card** - beside the thing it gates, not three sections above it - and states what is readable regardless and what needs approval. After the grant: the edit submits and goes to admin review. A second request while one is open: `You already have a pending or approved request for this patient.`

#### `THR-HP-004` - Re-triage merges, it never replaces · P0 **[SQL or careful UI check]**

**Purpose.** This is the single most damaging possible regression in the clinical layer.
**Steps.** With Patient A holding a full orthopaedic record, re-triage them as **Neurological** and complete the neuro question set with the §8.5 answers. Then inspect the profile.
**Expected Result.** The neuro answers are stored **alongside** the orthopaedic ones in the same flat blob. **Every orthopaedic key survives** (hidden on screen, never deleted). The chart now renders the neuro summary card, the neuro snapshot strip and the neuro progress line. The Pain Map is **not** rendered; the **Neurological examination** card is, in its place (`THR-HP-005b`).
**If any orthopaedic answer is gone, stop and raise a P0** - the approve path must merge, never write the proposed data outright.

#### `THR-HP-004b` - Going back to an earlier condition type prefills its answers · P1

**Preconditions.** Continue from `THR-HP-004`: Patient A is now Neurological, with their orthopaedic answers still on file.
**Steps.** Tap **Change condition type**, answer the triage, pick **Orthopaedic** and **Continue to the questions**. Step through to the review screen, change one answer, and **Save to their chart**. Open the admin's Review History for Patient A.
**Expected Result.** Every orthopaedic question opens **with the patient's earlier answer already in it**, ready to edit - not blank. No neurological answer appears in the orthopaedic questions. After saving, the chart is orthopaedic with the edited answer; the neurological answers are still on file (hidden); Review History shows **one new entry** for this change and every earlier entry unchanged. Picking a condition type the patient has never had opens blank.

#### `THR-HP-005` - Pain Map is orthopaedic and stays so · P0

**Steps**
1. On an **orthopaedic** patient, open the body-map surface. Tap **Lower back** on the figure. Record an exam through the dialog.
2. On the **neurological** patient (Patient C), look for the body map. Then call `POST /api/therapist/pain-assessments/submit` for that patient directly.

**Expected Result**
* Step 1: the region is chosen by **tapping the figure** (or a chip inside the dialog), never a `<select>`, and the chosen region stays in the dialog header while the clinician types. Questions are grouped, not listed flat. The exam posts **live with no review**, and is **append-only** - a re-assessment is a new row, so the UI can show a trend against the previous visit. Recording one requires only that the therapist is **assigned**.
* Step 2: the non-ortho page **does not merely hide the map - it never queries `pain_assessments` at all**, and the submit route answers **400**.
* Every user-facing exam figure is printed **out of ten**, never as a raw percentage. `Last exam found 34%` beside `How you rate it 6/10` is a defect: both must read on the same 0–10 scale.

#### `THR-HP-005c` - The orthopaedic chart opens in the shared layout · P0
**Steps.** As the assigned therapist, open an orthopaedic patient's chart (`/therapist/dashboard/health-profile/<id>`) with a Pain Map exam on record. Resize to 360, 834 and 1280 px wide.
**Expected Result.** Top to bottom: header (name, condition line, status pill, four-stage phase bar), **Where things stand**, up to four key numbers, the **Pain Map** card, **Progress** (graph), **Steps**, **Measures**, then care plans, session notes, test reports and the condition card. At 360 px everything is one column, the tables scroll inside their box and the page never scrolls sideways; at 834 px cards go two across; the body-map column sticks only from 1024 px. Every button is at least 44 px tall. A paediatric patient's chart is **unchanged**; a neurological one opens in its own layout (`THR-HP-005i`).

#### `THR-HP-005d` - Body map: First exam / Latest and the area cards · P1
**Steps.** On the Pain Map card, tap **First exam**, then **Latest**. Tap a marked point.
**Expected Result.** The figure shows the first score of each area, then the latest; the popup, the right/left labelling and **Record an exam** behave as before. Each area has a card: first exam, now, and "Down N points" / "Up N points" / "No change" / "Not re-scored yet". The knee-bend dial and the leg-strength bar appear once those are recorded, with the straightening readings and the extension lag (active against passive).

#### `THR-HP-005e` - Record a test for range, strength and LEFS · P0
**Steps.** Press **Record a test**. Choose Goniometry, a movement (for example Knee straightening), Active, a side. Open **How to measure**. Then record strength (three pushes each side) and a LEFS (20 items).
**Expected Result.** The list holds only orthopaedic tests (licensed scales are listed but cannot be chosen while off). The how-to-measure card gives position, centre, fixed arm and moving arm, and for the knee explains the minus sign and the extension lag. The other side's latest reading and the last reading of this line show beside the entry; typing an active straightening with a passive reading on file shows the lag. After saving, the dial, bar, graph tab and Measures row update. No button exists for a patient, or for a therapist who is not assigned.

#### `THR-HP-005p` - Record a test: Measure from an image · P1 **[UI]**
**Preconditions.** An orthopaedic patient with a started session with Therapist A. A screenshot or photo of a person's leg, taken side-on, in an image file or on the clipboard.
1. **Record a test** -> Goniometry -> *Knee bend*, Active, a side. Press **Measure from an image**. Before loading anything, read the camera tips and the line *The photo stays on this device and is not saved.*
2. Load the picture with **Choose a photo**; repeat with **Paste a screenshot** (or Ctrl+V) and by dropping the file on the panel.
3. Tap the hip, the knee, the ankle. Watch the steps (1 to 5) and the one line telling what to tap next. Drag a point; nudge a point with the arrow keys (Shift for bigger steps); use **Zoom in**, **Fit**, **Turn the photo**, **Flip the photo**, **Level line**; then **Undo** and **Start again**.
4. Place the ankle almost on the knee, then place a point off the photo. Press **Use this angle**.
5. Save the reading over video, then look at the Progress graph and the Measures table. Open the browser's network tab throughout.
**Expected Result.** The tool opens only with the side and active or passive chosen. The number is large and readable across a shared screen, with *Estimate from a photo* beside it and one plain line saying what it means (*Bent 92 degrees from straight*); it is visible without scrolling at 390 px. A bad point gives **one** warning at a time with its fix (*Move the camera to the side of the joint and take it again*), points too close are refused with a sentence, and a straight leg reads 0. Every control is at least 44 px and labelled; the magnifier follows the point being moved. **Use this angle** closes the tool, puts the number in the first empty reading box, sets *Over video* and shows *Estimated from a photo* (removable with *It was not from a photo*). After saving, the graph dot is hollow, the table says *Estimated from a photo* under First or Now, the PDF row ends the same way, and a goniometer reading from the same session stays the one shown. The network tab shows **no request carrying the picture**, and the picture is gone when the tool closes. Works in light and dark and with reduced motion.

#### `THR-HP-005q` - Guided video assessment: the server's gates · P0 **[API]**
**Preconditions.** Phase 7a ships the server side only (the cockpit and the companion screens are 7b and 7c), so this case is run against the routes with a REST client signed in as Therapist A, on a disposable project. One orthopaedic and one heart and lung patient, each with a started video session with Therapist A; Therapist B has none. Contracts: the header comments of `/api/therapist/assessment-runs/{start,event,display,end}` and `/api/therapist/measurements/submit`.
1. **Start** the orthopaedic patient's assessment; start it again; start it as Therapist B.
2. Send `setup_confirmed` for step 2 (*Pain*) before answering the safety questions; then answer only one safety question; then answer them all *no*.
3. Save the *Everyday tasks* score through the measurement route with `runId` and `stepId` before ticking its set-up; tick it and save again. Try a measure the step does not record.
4. Send the *Sit to stand* set-up without the helper item. Then **Stop test** it.
5. Set the live display to *Sit to stand*, phase *go*, with the clock; try the same with a `line` of your own. Sign in as the patient and read `assessment_live_display`, `assessment_runs` and `assessment_run_events`.
6. Start the heart and lung patient's assessment. Answer the safety questions. Try the *Sit to stand for one minute* set-up; save a resting heart rate without *read off the patient's own device*; then save heart rate 130, blood pressure 130/80 and oxygen 96 off the patient's device, confirm the resting check, and try the sit-to-stand set-up, *go* and a save.
7. Post a measurement with a `runId` as an admin. End the heart and lung run as *abandoned* with no reason, then with *patient_unwell*; end the knee run as *completed*, twice.
**Expected Result.** 1: the run opens on the knee protocol; the second start is 409 `run_in_progress` naming the open run; Therapist B is 403 and reads no run or event. 2: 409 `red_flags_unanswered` twice, then 200 with nothing flagged. 3: 409 `setup_not_confirmed`, then 200 with `runEvent.recorded: true`; the wrong measure is 409 `measure_not_in_step`. 4: 409 `setup_incomplete`; the stop is 200, a `stopped` event with no measurement, and no new reading on the record. 5: 200 with a 30-second countdown; the request with text is 400; the patient reads only the step counter, title, line, picture and clock label, never a number from a result, and no run or event row. 6: 409 `cardio_check_not_recorded`, 409 `read_from_required`, the resting check answers *stop*, and the set-up, *go* and save are each 409 `cardio_red_flag`. 7: the admin is 400 `run_is_therapist_only`; abandoning with no reason is 400, with a reason 200; the knee run ends once (the second is 409 `run_not_in_progress`), its answer carries a draft *Where things stand* naming the saved score and the stopped sit to stand, and the patient's display reads *All done*. Every step and red-flag question is marked *to be verified by a senior physiotherapist* in `src/lib/sessionProtocols.ts`.

#### `THR-HP-005f` - Phase, status overrule and a failed read · P0
**Steps.** Press **Phase and status**. Choose a phase and save. Overrule the status with a reason under 10 characters, then with a real reason. Clear it. Separately, with the measurements table unreachable, reload the chart.
**Expected Result.** The phase bar moves and says the plan only *suggests* a phase until one is set. A short reason cannot be saved; a saved overrule shows on the pill with its reason, and the patient sees the same pill and reason. After a new review the overrule asks to be looked at again. The patient's PDF export names the phase and the overrule with its reason. When a read fails, only its card says "We couldn't load ... They are not missing"; the Pain Map line and the rest of the chart still draw.

#### `THR-HP-005g` - The neurological condition group and the Parkinson's follow-ups · P0
**Steps.** As the assigned therapist, onboard (or re-triage) a patient as neurological. In the intake pop-up, answer **Condition group** with *Stroke or brain injury*, read the question count, step on; go back and change it to *Parkinson's disease*; step through; try to submit with **Diagnosed** and **Feet getting stuck** blank, then fill them. Change the group back to *Multiple sclerosis* and submit. As an admin, open Settings -> Clinical Questions -> Neurological. As an existing neurological patient (answered before this change, no group on file), open the Health Profile.
**Expected Result.** With a stroke the count reads **of 8** and no Parkinson's question appears; choosing Parkinson's makes the next five steps the Parkinson's questions (each with plain help text) and the count **of 13**. Submitting with the two required ones blank is refused and returns to the first missing one. After switching to Multiple sclerosis the Parkinson's answers are kept on file but not shown, counted or printed in the PDF. The admin's question bank lists the group and the five follow-ups, each follow-up noted *Asked only when "Condition group" is "Parkinson's disease"*. The existing patient sees **no** "we've changed some of these questions" banner, and their record still reads complete.

#### `THR-HP-005h` - Diary confirmation and the written "Where things stand" · P1 **[API]**
**Preconditions.** A Parkinson's patient (group *Parkinson's disease*) with a delivered session with Therapist A, and a diary entry the patient wrote (`PAT-HP-021`). Therapist B has never been on the patient.
**Steps.**
1. As Therapist B, then as the patient, call `POST /api/therapist/diary/confirm` `{ "entryId": "<id>" }`. As Therapist A, call it twice.
2. On an orthopaedic or neurological patient's chart, open **Phase and status**; read the **Where things stand** box before anything is written, then write two short paragraphs and save. Save the same text again.
3. As Therapist A, call `POST /api/therapist/care-status/set` with `{ "action": "set_summary", "text": "   " }` and with 1,201 characters. As an admin, call `/api/admin/care-status/set` with a summary.
4. As the patient, open the Health Profile and export the PDF.
**Expected Result.**
* Step 1: Therapist B and the patient **403**; Therapist A **200** with `confirmedBy`, `confirmedByRole: "therapist"` and a `confirmedAt` set by the database; the second call **200** `unchanged: true`. The entry itself is unchanged.
* Step 2: before anything is written the card shows the generated sentences labelled *Generated automatically from the numbers - nobody has written a summary yet*, and the box is prefilled with them as a draft. After saving, the card shows your text with its line breaks and your name and the date (*Dr ... , 12 Oct*); the repeat says nothing changed.
* Step 3: both **400**; the admin **200** with `setByRole: "admin"` and a `care_status.set` audit row carrying the text from and to.
* Step 4: the patient reads the newest written text under the physiotherapist's name (*The clinic* for an admin's text, *Your physiotherapist* if the name could not be read); with none written, the generated sentences are labelled as worked out automatically. The PDF prints **only** a written summary under Goal and progress.

#### `THR-HP-005i` - The neurological chart opens in the shared layout · P0
**Steps.** As the assigned therapist, open a neurological patient's chart (a stroke patient with two examinations on record, FAC recorded, an affected side on the intake). Resize to 360, 834 and 1280 px wide, light and dark. Press **First exam**, then **Latest**. Open the graph's **Balance** tab and the **Measures** table.
**Expected Result.** Top to bottom: header (name, condition line, status pill, four-stage phase bar, *Filled in by ...*), **Where things stand** (your name and date under a written summary), **four** key numbers (independence, balance, walking speed, falls - *Not yet* where nothing is recorded, *Unavailable* where a read failed), the **examination** card with the affected-side figure, the walking ladder, the walking-speed zones and a First exam / Latest switch (First exam shows the oldest exam with no change line), the **diary**, **Progress**, **Steps**, **Measures**, then care plans, notes, reports and the condition card. Balance, walking speed and Up-and-go are drawn from the examinations and appear **once** in the table; FAC from the recorded measurements. **Record a re-examination**, **Record a test** (FAC, Fugl-Meyer; never Berg, TUG or the 10-metre walk), **Goal and steps** and **Phase and status** are present. At 360 px one column, tables scroll in their box, no sideways page scroll; the quick-look column sticks only from 1024 px; every button is at least 44 px. A Parkinson's patient's chart is the same with: a *Parkinson's disease* chip, **Tested in ON time**, the symptom profile and stage (only if recorded), and the freezing chart.

#### `THR-HP-005j` - A fall in the diary, confirmed, and the status pill · P0
**Preconditions.** A neurological patient with a recent review (an exam or a test), a Parkinson's patient, and a patient-written fall dated after the review (`PAT-HP-022`).
**Steps.** As the assigned therapist, open the chart: read the pill, find **Waiting for you to confirm**, press **Confirm** on the fall. Reload. As an admin open the condition detail. As an unassigned therapist, try the chart.
**Expected Result.** Before: the fall is shown *Patient reported* and the pill is **not** "Needs attention" because of it. After **Confirm** (44 px, one press, a toast): the entry moves out of the waiting box, reads *confirmed*, stays the patient's own account, and the pill reads **Needs attention** with *A new fall is recorded since the last review*; after the next review it returns to the numbers. An overrule still wins. The admin sees the diary with **no** Confirm and **no** Log button. The unassigned therapist cannot open the chart. With the diary unreadable, a line under the pill says a new fall could not be checked, and the falls tile says *Unavailable*.

#### `THR-HP-005k` - The paediatric examination, at the route · P0 **[API]**
**Preconditions.** A paediatric patient (born 1 Jun 2025 on the profile, intake **Weeks at birth** *30 weeks*, caregiver *Priya Sharma*, *Mother*) with a **completed** session with Therapist A; a neurological patient with a completed session with Therapist A; Therapist B has never been on either. No screen draws the exam yet (phase 5b).
**Steps.**
1. As Therapist A, `POST /api/therapist/peds-assessments/submit` `{ "patientId": "<child>", "findings": { "milestones": { "sitting_without_support": { "status": "achieved", "firstSeenOn": "2026-01-10", "source": "seen" }, "hands_knees_crawling": { "status": "achieved", "firstSeenOn": "2026-03-02", "source": "reported" }, "walking_alone": { "status": "not_yet" } }, "equipment": "Ankle splints" } }`. Read the row in `peds_assessments`.
2. Repeat with each of: an unknown milestone; `achieved` with no `firstSeenOn`; a `firstSeenOn` before the date of birth, and one tomorrow; `emerging` with no `source`; `"standingSeconds": 8`; `"gmfcsLevel": 6`; `{}`; a body that is not JSON.
3. Post a valid exam for the **neurological** patient as Therapist A, and through `/api/admin/peds-assessments/submit` as an admin.
4. As Therapist B, and as the child's family, post the step-1 exam. As Therapist B read `peds_assessments` for the child through the browser's Supabase client.
5. As an admin, post `{ "milestones": { "standing_with_help": { "status": "emerging", "source": "reported" } }, "gmfcsLevel": 2 }` for the child; open All Logs. As an admin without the People scope, post it again.
6. With the service role, try to update and delete the step-1 row.
7. Finish a paediatric session as Therapist A with only the session note written.
**Expected Result.**
* Step 1: **200**; one row, `submitted_by_role: "therapist"`, `schema_version` 1, the three milestones stored as sent and the other three **absent** (not assessed), never "not yet".
* Step 2: every one **400** with a sentence saying what to fix; standing time and steps are refused with *recorded with Record a test*; nothing is written.
* Step 3: both **400** `not_paediatric`.
* Step 4: Therapist B and the family **403**; Therapist B reads **no** rows.
* Step 5: **200**, `submitted_by_role: "admin"`, and a *Recorded a paediatric exam* entry (`peds_assessment.create`); without the People scope **403**.
* Step 6: both raise *append-only*.
* Step 7: the Done is refused **409** `peds_exam_required` until this therapist records a paediatric exam from an hour before the slot (the gate is on since phase 5b); with the exam it goes through.

#### `THR-HP-005l` - The paediatric chart, the exam dialog and the Done step · P0
**Preconditions.** A paediatric patient born premature (intake *Weeks at birth* 33), caregiver *Priya Sharma*, *Mother*, assigned to Therapist A with a started session; one exam recorded.
1. Open the child's Health Profile as Therapist A at 390 px, 834 px and 1280 px.
2. Tap **Record a re-examination**. Set *Sitting without support* to **Achieved**, *Parent reports*, pick a date and tick **The date is approximate**; set *Standing alone* to **Emerging** (Seen); leave the rest **Not assessed**; choose a GMFCS level. Save.
3. On the chart tap a milestone row; tap **Show as a table**.
4. Open the session's note as Therapist A, then **Finish**.
5. Set the patient's date of birth to an adult date and reload.
**Expected Result.** Step 1: header with the child's name, *Told by Priya Sharma, her mother*, the age line with both ages (*20.6 months (19 months corrected, born at 33 weeks)*), phase bar, four tiles, the bars with a today line and the legend; no horizontal scroll; every control at least 44 px tall. Step 2: saved; the approximate date reads *about* on the chart (a dashed ring) and in the table; a *seen* date has no approximate option. Step 3: the row opens its definition, who saw it, the date and the usual range; the table has the same facts. Step 4: the note's first step is **Paediatric examination** with **Record the paediatric exam**; Finish is refused until recorded; a failed read says *couldn't be loaded, so it is not counted as recorded* with **Try again**. Step 5: no chart; a *Check the date of birth* card says where it is fixed (the family's Profile, a reviewed field). Past 18 months corrected with walking alone never assessed the chart says *Walking alone not assessed yet*; not walking (not yet / emerging) shows the doctor's-review prompt.

#### `THR-HP-005m` - Strength and balance care and Heart and lung rehabilitation: triage, intake and Done · P0
**Preconditions.** `ADM-SET-020a` has ticked **Geriatric** and **Cardiopulmonary**. Two new patients assigned to Therapist A, each with a started session: Patient G (aged 79) and Patient H (aged 58). A third new patient assigned to Therapist A for step 6. The screens are phase 6b: this case checks triage, the intake, the session note and the answers on file.
1. As Therapist A, open Patient G's chart and start onboarding. Answer *65 or older*, **Falls, unsteadiness or getting weaker with age**, and tick only **Difficulty with balance or walking**. Read the suggestion; tick **Weakness on one side** as well and read it again; untick it.
2. Continue with **Geriatric**. Leave the carer step blank, then go back and enter *Ramesh*, *Son*. Try to submit with *Have you fallen in the last 12 months?* blank; answer **Two or more falls**, *Yes*, *Yes*, a walking stick and **Bathing or washing**. Submit.
3. Onboard Patient H: *18 to 64*, **A heart or lung condition, or after heart surgery or a heart attack**. Continue with **Cardiopulmonary**. Pick **COPD (long-term lung disease)** and read which questions follow; change it to **Heart bypass or valve surgery (open-heart)**; answer the precautions *No lifting over 4 kg* until *20 Nov 2026*, beta-blocker **Not sure**, home oxygen **Yes** with *2 litres a minute when walking*, stop limit **No limit given, or not sure**. Submit.
4. Open each patient's session note and **Finish**.
5. On Patient H's chart, **Record a test** -> **Blood pressure** (*At rest, before exercise*): type 124 / 130, then 124 / 78, and save; record **Talk test** *Can talk, not sing: just right*; record **Oxygen saturation at rest** 97.
6. As an admin untick **Geriatric**; as Therapist A onboard the third patient with the step 1 answers, then re-triage Patient G.
**Expected Result.** Step 1: *Suggested: Geriatric - Aged 65 or older and referred for falls, unsteadiness or getting weaker.* pre-selected and changeable; with a second sign the suggestion is **Neurological**. Step 2: the carer step is optional and not counted (*7 questions*); the three falls questions are required; the record goes live with no review, and the chart lists the answers. Step 3: *Suggested: Cardiopulmonary*; COPD asks no breastbone question; open-heart surgery adds *What did your surgeon say you must not do yet?* and *Until when do those rules apply?*; home oxygen *Yes* adds the prescription (the count grows honestly). Step 4: **no examination step** in the note dialog for either patient; Finish completes with the note alone. Step 5: 124/130 is refused with *Enter both numbers, the top one above the bottom one.*; the instructions say *Seated, same arm each time*; the talk test and oxygen save. Step 6: the third patient's suggestion is **Orthopaedic** with *(Geriatric would fit, but it is switched off in Settings.)* and Geriatric is not offered; re-triaging Patient G still offers **Geriatric** as *Current*.

#### `THR-HP-005n` - Strength and balance care: the falls check, the home safety check and the page · P0 **[UI]**
**Preconditions.** Patient G from `THR-HP-005m` with a started session with Therapist A.
1. Open G's chart. Press **Start the falls check**. Do the Timed Up and Go with the timer (two trials), save; do the 30-second chair stand (tick that the arms were used), save; **Leave this one out** for the balance; do the walking speed, save.
2. **Height or weight**: record 158 cm, then weight 61.5 kg.
3. On **Home safety check** press **Record the home safety check**, answer *Done* for the grab rail and the stair rails and *Not yet* for the rest, save. Record it again with the night light done.
4. **Record standing blood pressure**: lying 130/80, standing at 1 minute 105/72.
5. Read the dial, the cards and the graph.
**Expected Result.** The check shows *Step 1 of 4* to *Step 4 of 4* with the right timer each time (taps for the walk and Up and Go, the 30 second counter, the balance holds); each saved test fills its tile and card as it goes, the one left out is *Not done yet*, never a failure. A chair stand with the arms scores 0 and the card says so. Every home safety line must be answered; the card reads *2 of 6 done*, then *3 of 6 done* with *Done since last time* beside the new one and the earlier snapshot dated. A top number fall of 25 shows *Positive ... Tell the patient's doctor.* The dial's rule line says what decided the level; the graph has the Up and Go, chair stand and walking speed lines with their risk lines (the chair stand's is the age and sex norm). A patient or an outsider has none of these controls. An admin with People scope can record the tests but not confirm the diary; the guided check is the assigned therapist's own.

#### `THR-HP-005o` - Heart and lung rehabilitation: the safety check, the guided walk and the page · P0 **[UI]**
**Preconditions.** Patient H from `THR-HP-005m` with a started session with Therapist A and **Beta-blocker: Not sure**.
1. Open H's chart. Read **Before every session**. Press **Take the readings**: heart rate 128, blood pressure 150/90, oxygen 87, tick nothing. Save.
2. Press **Start the six-minute walk**, choose *In person*, tick every safety check and enter heart rate 78, blood pressure 186/104, oxygen 96.
3. Correct the blood pressure to 128/80, set the oxygen to 85, then to 96.
4. Start the walk, count laps, stop, enter the part lap, the readings after (blood pressure 148/82, lowest oxygen 94, breathlessness 4), the talk test *Can talk, not sing*, and use the result. Save.
5. Record **Height or weight** and **Highest heart rate** (*From an exercise test*, 158) and set Settings to a six-minute walk formula; set the beta-blocker answer to *No* through a patient edit.
**Expected Result.** Step 1: the card says *Do not exercise or test today. Contact the patient's doctor.* with each flag; the readings are saved. Step 2: the red box says the same with the flagged readings, and **Start the 6:00 walk** is disabled with *Not today*. Step 3: a high blood pressure refuses, a low oxygen (under the patient's own limit) refuses, normal readings allow it; a reading not taken says *Not checked*, never clear. Step 4: the distance is saved and so are the resting and after vitals and the talk test, each as a reading in the vitals strip; a vital that cannot be saved is named, never dropped. Step 5: the predicted distance is a percentage once the formula, sex, age, height and weight all exist and until then says exactly which is missing; a heart-rate range with *from an exercise test* appears only once the patient is recorded as not on a beta-blocker, the talk test otherwise. The safety limits row shows the oxygen limit (*default* or *set by the doctor*), the beta-blocker note and the breastbone precautions with their end date, and the plan's steps carry the precautions end date. A patient writes active minutes; the chart shows *Waiting for you to confirm* and confirming is once. The refusal lives on the guided walk's screen; the measurement route does not refuse a flagged reading.

#### `THR-HP-005b` - The neurological examination chart · P0

**Preconditions.** The neurological patient (Patient C) with a **completed** session with Therapist A (or a confirmed one inside its join window). Therapist B has never been on Patient C. Repeat the layout steps at a phone width (360px), a laptop (1280px) and an ultrawide (2560px).
**Steps**
1. As Therapist A, open Patient C's chart. Read the **Neurological examination** card. Tap **Record an examination**.
2. In the dialog: on **Tone**, set Elbow flexors **L 2 / R 0**; on **Power**, Tab into Shoulder abduction left and use the arrow keys to reach **3**, set the right to **5**; on **Reflexes**, tap **Mark the rest normal**. Hover or focus a grade to read its meaning; read the legend above each section. Use the section strip (phone) or rail (laptop) to jump to **Balance**: type **38** for the Berg total; open **Score the fourteen items** and look at the band line. On **Gait**: pick **Hemiplegic** and **Walking stick**, then **Unable to walk**, then back to **Hemiplegic**; type **18.5** for Timed Up and Go. Write a note. Press **Escape**.
3. Choose **Keep editing**, then **Save examination**.
4. Reload the page. Then **Record a re-examination**: change Elbow flexors left to **1**, Shoulder abduction left to **4**, Berg **44**, and save. Reload, and tap the older date in **Examinations on record**.
5. As Patient C, open the Health Profile.
6. As Therapist B, open `/therapist/dashboard/health-profile/<Patient C's id>` and call `POST /api/therapist/neuro-assessments/submit` for Patient C. As Therapist A, call the same route with `{"findings":{"bilateral":{"tone_elbow_flexors":{"left":"2+"}}}}` and again with `{"findings":{}}`.

**Expected Result**
* Step 1: no "still being built" sentence anywhere. Before any exam the card says **No neurological examination recorded yet** with the Record button in it.
* Step 2: every score is a **segmented control** - no number box where a scale exists - and its first segment is a dash, **Not tested**, selected until you choose. A grade outside normal turns **amber**; a left/right difference shows **L≠R** on the row at once. Each control is a radio group named for its row and side ("Elbow flexors, left"); Tab enters a group once, the arrows move and choose, the focus ring is visible. **Mark the rest normal** fills only unscored rows (reflexes 2+, plantar Down) and never overwrites one you set. The Berg line reads **Medium fall risk - 21-40: walks with assistance**; with all fourteen items scored the total is their sum and cannot be typed. Picking **Unable to walk** clears the other patterns and the two timed boxes and disables them; picking another pattern clears **Unable**. TUG 18.5 reads **13.5 s or more - raised fall risk**. Escape with something entered asks **Close without saving?** in the footer rather than losing the work. Left and right sit side by side from tablet width and stack as L then R on a phone; the section strip stays at the top while the body scrolls; nothing scrolls sideways at any width.
* Step 3: the toast says **Neurological examination saved for <name>** and the dialog closes.
* Step 4: after the reload the summary shows the Berg tile **38/56 · Medium fall risk**, the TUG tile, a **Side to side** tile, the tables of what was examined only (with "N not tested" counted, never listed), each grade with its meaning beside it, and the note. The re-examination dialog shows **Last time: L 2 · R 0** on that row and a dot on last time's grade. After the second save: **Since <date>** lists **Better (3)** - elbow flexors left, shoulder abduction left, Berg 38/56 → 44/56 - with arrows on the changed cells; findings recorded only once are not listed as changes. The older date shows the first exam.
* Step 5: the patient sees **Your examination** in their own words ("Muscle strength", "Balance score", "Full strength"), the same figures and the change since last time, and **no** Record button.
* Step 6: Therapist B gets **404** on the chart and **403** on the write (*"You can only record findings for a patient you've been assigned to."*). The bad grade answers **400** naming the Modified Ashworth Scale; the empty exam **400** *"Record at least one finding before saving the examination."* An orthopaedic patient answers **400** on this route. Before any session with the patient has started the route answers **409**.

#### `THR-HP-005c` - Outcome measurements and milestones, at the routes · P1 **[API + SQL]**

**Preconditions.** No screen draws this yet (Health Profile redesign phase 2b), so it is checked at the routes. Patient C (neurological) with a completed session with Therapist A, and on a disposable project only - the rows are append-only. Mark Patient C as Parkinson's by setting their intake answer `neuro_subtype` to `Parkinson's disease` in `patient_condition_profiles.data` (the intake question arrives in a later phase). Patient D: another neurological patient without that answer, also seen by Therapist A. Settings -> Clinical Questions -> **Licensed outcome scales** all off.
**Steps**
1. As Therapist A, `POST /api/therapist/measurements/submit` for Patient C with `{"measurement":{"measureKey":"tug","value":11,"items":[10.8,11.1,11.1],"measuredAt":"<10 minutes ago>","conditions":{"setting":"in_person","medicationState":"on","lastDoseAt":"<2 hours ago>"}}}`. Repeat with only two trials, then without `medicationState`.
2. The same TUG (without trials or ON/OFF) for Patient D. Then `measureKey` `mds_updrs_3` for Patient C.
3. As Therapist B, and as Patient C, call the step 1 route for Patient C.
4. As Therapist A, `POST /api/therapist/care-goals/save` `{"goal":{"goalText":"Walk to the temple and back"}}`, then `POST /api/therapist/care-milestones/save` `{"action":"create","goalId":"<id>","milestone":{"title":"TUG under 11.5 s","criterion":"11.5 s or less, ON","linkedMeasureKey":"tug","targetValue":11.5}}`, then `{"action":"mark_reached","milestoneId":"<id>","measurementId":"<step 1's id>"}`, then `{"action":"update","milestoneId":"<id>","milestone":{"status":"working"}}`.
5. As the admin, `POST /api/admin/care-milestones/reopen` `{"patientId":…,"milestoneId":…,"reason":"oops"}`, then with `"reason":"Marked reached on the wrong patient record"`, then again.
6. **[SQL]** `update care_milestones set status = 'working', reached_at = null where id = '<id>'` (after re-marking it reached), and `update care_milestone_events set reason = 'x'`.

**Expected Result**
* Step 1: **200** with the stored measurement (`items` the three trials). Two trials **400** *"record all 3 trials"*; no ON/OFF **400** naming ON or OFF and the last dose.
* Step 2: Patient D **400** *"Timed Up and Go is recorded in the neurological examination."*; the licensed scale **400** *"switched off until the clinic confirms its licence"*. Switch MDS-UPDRS III on in Settings and it is accepted (with ON/OFF).
* Step 3: both **403**; nothing is written.
* Step 4: the goal and milestone save (**200**); a second goal is **409** `active_goal_exists`. Mark reached **200** with `reachedMeasurementId` set; the update **409** `milestone_reached`.
* Step 5: **400** `reason_required`; then **200** - the milestone is back at **working** with no reached time, and a `care_milestone_events` row holds the reason and the measurement; the third call **409** `not_reached`. Logs -> All Activity shows **Reopened a milestone marked reached by mistake**.
* Step 6: both raise (*"stays reached"*, *"append-only"*).

#### `THR-HP-005d` - Phase, status override and the walk formula, at the routes · P1 **[API + SQL]**

**Preconditions.** Phase 3a, server side only (the screens are phase 3b). Patient C as in THR-HP-005c (Parkinson's sub-profile), seen by Therapist A; a disposable project only - `care_status_events` is append-only.
**Steps**
1. As Therapist A, `POST /api/therapist/care-status/set` for Patient C with `{"action":"override_status","status":"needs_attention","reason":"fell"}`, then with `"reason":"Freezing at doorways is worse this week"`.
2. As Therapist A, `{"action":"set_phase","phase":"Strengthen"}`, then `{"action":"set_phase","phase":"Learn strategies"}` twice.
3. As Therapist B, and as Patient C, `{"action":"set_phase","phase":"Learn strategies"}` for Patient C.
4. As Therapist A, `{"action":"clear_override"}` twice.
5. As the admin, `POST /api/admin/care-status/set` `{"patientId":…,"action":"set_phase","phase":"Build capacity"}`.
6. **[SQL]** `update care_status_events set value = 'improving' where id = '<step 1's id>'`.
7. As Therapist A, `POST /api/therapist/measurements/submit` for Patient C with step 1 of THR-HP-005c's TUG plus `"usedArms": true` in `conditions`.
8. Settings -> Clinical Questions -> **Six-minute walk: predicted distance**: pick **Enright and Sherrill (1998), US adults**, then **Not chosen yet**. Then `POST /api/admin/update-setting` `{"key":"six_minute_walk_equation","value":"enright"}`.

**Expected Result**
* Step 1: **400** `reason_required`; then **200** with `state.override` Needs attention and the reason.
* Step 2: **400** listing Patient C's phases (Assess, Learn strategies, Build capacity, Keep it going); then **200**; the repeat is **200** `unchanged: true` and writes no row.
* Step 3: Therapist B **403** `not_assigned`; the patient **403**.
* Step 4: **200** with `state.override` null; the second **409** `no_override`.
* Step 5: **200**, the event has `setByRole` admin; Logs -> All Activity shows **Set a patient's phase, overruled their status or wrote where things stand**.
* Step 6: raises *"append-only"*.
* Step 7: **400** *"does not record whether the arms were used"* - only the 30-second chair stand takes the tick (a geriatric measure: no condition type reaches it yet, so its own case is a unit test).
* Step 8: each pick saves with a toast; the bad key is **400** *"Unknown six-minute walk equation."* With **Not chosen yet** the six-minute walk guide says **Formula not chosen yet** and shows no percentage of predicted.

#### `THR-HP-006` - Read access needs no request · P2
**Expected Result.** An **assigned** therapist can read the patient's intake and Pain Map with no grant. Only *editing the patient's own account of their history* needs one.

#### `THR-HP-007` - Clinical access follows delivered care · P0 **[SQL]**

**Feature.** Four RLS policies decide whether a therapist may read a patient's health profile, Pain Map exams, uploaded reports and session notes. The rule is **access follows delivered care**: a completed session keeps whoever ran it - neither `update-appointment` nor `reassign-package-therapist` will move one - so a clinician who has actually treated somebody keeps access after the patient moves to a colleague, because the person who gave the care has to be able to answer for it. A therapist whose only link was a **future** session that was reassigned away keeps nothing: they never treated them.

**Steps.** Give Therapist A one **completed** session with Patient A and one **future** one. Reassign the future session to Therapist B, and confirm Therapist A can still read Patient A's chart. Then delete (or reassign) the completed one too and read again. Separately, give Therapist B only a future session with Patient B, move it away, and have B read Patient B's chart.
**Expected Result.** Therapist A keeps access while the delivered session is theirs, and loses it once nothing they delivered remains. Therapist B, who delivered nothing, reads **nothing** at any point. Both halves matter - a check that only proved the refusals would pass just as well on a policy that had locked every clinician out of every chart.

#### `THR-HP-008` - A suspended therapist stops reading, at the database · P0 **[SQL]**

**Feature.** Those four policies asked only whether the therapist had an appointment, never whether the account is still **allowed to be a therapist here**. A suspended *patient*'s live token reads their own rows for one token lifetime, with the app as the gate - bounded to their own data. A suspended **therapist** was reading *other people's medical records* on exactly the same terms, which is what suspension is meant to stop.

**Steps.** As an assigned, active Therapist A, read Patient A's condition profile straight from PostgREST with A's own token. Suspend A. Read again with **the same token**. Restore A and read once more.
**Expected Result.** The first read returns the row; the second returns **nothing at all** - `is_active_therapist()` refuses at the row rather than one token lifetime later; the third returns it again. An **unapproved** therapist is refused the same way: unlike `is_admin()`, this checks `approved` as well as `active`, because an admin is promoted by hand while a therapist still in the signup queue has no business reading a chart.
**Also check session notes:** that policy carried a hand-written copy of `is_admin()` which did **not** check `active`, so a suspended *admin* went on reading session notes after every other admin policy had started refusing them. A suspended admin must now read none, and an active one must still read them all.

#### `THR-HP-009` - Who can see this record · P1

**Feature.** The rule above lived in four policies and one helper and was stated on **no screen at all**, so "who can see this patient's record" was unanswerable - for the clinic, for a patient asking, and for an admin deciding whether somebody's access should end.

**Steps.** Open **People → Patients → a patient with two past therapists, one of them suspended**, and read the **Who can see this record** panel.
**Expected Result.** It states the rule in plain words before the list. Every clinician with access is named, with **why** (how many sessions, or a programme locked to them) and when they last saw the patient, most recent first. The suspended one is **listed and marked "Access ended"**, never dropped - omitting them would make a suspension read as a deletion on the one screen whose job is to say who has a relationship with this record. A patient nobody has treated shows the sentence, not an empty list.

---

### 12.5 Recommendations (care plans) and suggested sessions

#### `THR-CARE-001` - Write a care plan from the session note dialog · P0

**Preconditions.** A **completed** session that **this therapist ran** for Patient A, or a started one finished through **Done** (the note dialog carries the panel then too). Its condition has a price on Catalog → Conditions.

**Steps**
1. Open the completed session's note dialog.
2. In the **Recommend treatment** panel, tap the **Condition** dropdown.
3. Read the list of conditions offered, and how they are grouped.
4. Check the session's own condition is pre-selected. Enter `8` in **How many sessions**.
5. Read the total line beneath.
6. Tap **How often, per week** and select `2 a week`.
7. Tick **Needs hands-on treatment**, read the field label and total again, then untick it.
8. Tap **Why this, for this patient**. Enter `Your range has improved but the pain returns after a day at your desk. A structured block will hold the gains.`
9. Tap **Anything they should do or know**. Enter `Keep up the walking between sessions. Book the first one within a fortnight if you can.`
10. Read the line above the submit button.
11. Submit.

**Expected Result**
* Step 3: the list is **every active online condition** (the same list `/book` sells), **grouped by condition type** - Orthopaedic, Neurological, Paediatric - from `treatment_categories.specialty`; an untagged one sits under **General**. The session's own condition is selected first, with its photograph beside the picker. No admin programme appears by name - recommendations are no longer built from programmes.
* Step 4: **How many sessions** is a number field, 1-30 (default 6). Outside that range the field says so and saving is refused.
* Step 5: the total reads `8 sessions × ₹<the condition's price> = ₹<8 × that price>` and moves as the number changes. **There is no price field and no discount field** - the price is always the condition's own per-session price times the count, re-derived on the server.
* Step 7: **Needs hands-on treatment is the only switch between video and home visits.** Ticked, the field reads **How many visits**, the per-visit price is the single home-visit price, the line adds "Plus travel for the patient's area", and the plan is a home-visit plan. Unticked, it is video sessions and the patient is never asked for an address. If home visits are off (or have no single-visit price), the box is disabled and says so.
* Step 6: the frequency dropdown is capped by `care_plan_max_frequency_per_week` (default 5) and offers `Leave open`.
* Step 10: with `care_plan_requires_approval` **on** (the default), the panel says *"Goes to the clinic first. Your patient sees it once it is approved."* With it off, it says the patient sees it on their dashboard. **The copy must match the setting** - telling a clinician their patient can already see something sitting in a queue is a P0 defect.
* Step 11: the plan lands `status = 'pending_review'`, append-only and attributed. `care_plan_versions.source_appointment_id` is NOT NULL and is **re-derived from the appointment, not trusted from the body**. `care_plan_versions.expires_at` is **null** - the offer window is stamped at approval, not now.
* **The patient sees nothing.** Not a greyed-out card: the recommendation is absent from Suggested Sessions and from their Health Profile until an admin approves it (`ADM-CARE-004`).

#### `THR-CARE-006` - The Overview names who is waiting to hear · P1

**Feature.** Every programme a patient can buy comes from a recommendation written after a completed session, so that one step is the whole distance between a delivered consultation and a course of treatment. It used to be carried only by an aggregate count, which reads as a score rather than as a list of people.

**Steps.** Complete a session for Patient A and write no recommendation. Open `/therapist/dashboard`.
**Expected Result.** The activity feed carries a **named** item - *"QA Patient A is waiting to hear what next"* - pinned by `needsYou` and linking to that patient's chart. It disappears once a recommendation is written, or once the patient's plan is accepted. A patient who **already has** a live or purchased recommendation must **not** appear; a patient whose plan was declined or withdrawn **should**, because that thread is open again. At most four are shown, most recently seen first, alongside the note nudge.

#### `THR-CARE-008` - Writing a second one while the first is still queued · P1

**Feature.** Submitting again is allowed - it lands as a new version on the same thread, which is right when a clinician has genuinely changed their mind. Doing it *without being told* is how the same plan gets submitted twice by someone who assumed the first had failed.

**Steps.** With a recommendation already waiting for the clinic, open another completed session's note dialog for the same patient.
**Expected Result.** The panel says *"You have already recommended a programme for this patient and the clinic has not decided yet - nothing has gone wrong, and your patient has not been asked for anything. Writing another replaces it."* The button reads **Replace it**, not **Add a recommendation**.

#### `THR-CARE-002` - A recommendation needs a completed session this therapist ran · P0
**Steps.** Attempt to submit a care plan (a) for a patient this therapist is not assigned to, (b) against a session run by Therapist B, (c) against a session that is not completed.
**Expected Result.** (a) `That isn't your patient.` (403). (b) and (c) refused by the route's own re-derivation. This is what makes "recommend to everyone and see who bites" **impossible rather than discouraged**.

#### `THR-CARE-003` - A purchased plan is never re-versioned · P0
**Preconditions.** Patient A has **bought** the recommendation (`PAT-CARE-002`).
**Steps.** Attempt to write a new recommendation for the same patient.
**Expected Result.** The purchased thread is **closed**. A new recommendation opens a **new plan** with `supersedes_id` set - it does not add a version to the purchased one. Editing a purchased plan would change the description of something already paid for.
`care_plans_one_open_per_patient` means the patient never sees two competing live recommendations - and covers a **queued** plan too, so a submission waiting on the clinic blocks a second one exactly as a published one does.

#### `THR-CARE-004` - Versions are append-only by trigger · P1 **[SQL]**
**Steps.** In the Supabase SQL editor, attempt `update care_plan_versions set clinical_rationale='changed' where id='<id>';` and `delete from care_plan_versions where id='<id>';`
**Expected Result.** Both **raise**. Only `is_current` and a **first** `expires_at` may change - the offer window is stamped once, at approval, and moving one already set raises too. This is enforced by trigger, not by RLS - every route writes with the service role, which bypasses RLS entirely.

#### `THR-CARE-005` - Withdraw one's own recommendation · P2
**Steps.** Tap the withdraw control on an unpurchased recommendation, then on one still **waiting for the clinic's approval**.
**Expected Result.** Both close; the patient's offer disappears where there was one. **A purchased plan cannot be withdrawn at all.**

#### `THR-CARE-007` - The clinic's decision reaches the therapist · P0

**Feature.** A recommendation turned down silently is one that never happened, and the therapist is the only person who can put it right - they rewrite.

**Preconditions.** `ADM-CARE-005` has turned down this therapist's recommendation with the reason `This patient still has four unused sessions on their current plan.`

**Steps.** Open `/therapist/dashboard`. Then open that patient's chart.
**Expected Result.**
* The activity feed carries a **needsYou** item: *"The clinic turned down your recommendation for QA Patient A"*, with the admin's reason as its detail. It is the **only** care-plan feed item marked `needsYou` - an approval is the expected outcome and marking it so would train the therapist to ignore the badge.
* An **approval** and an **approve-with-changes** also appear, not marked `needsYou`: a submission that vanishes into a queue and never reports back teaches a clinician to stop trusting the queue.
* On the chart, the thread reads **Not approved** **with the clinic's reason printed beneath it**, in red. The reason is the actionable half - "Not approved" says the recommendation is gone, and only the reason says what to write instead - and the feed item scrolls away while the chart is where a clinician goes to rewrite. A queued thread reads **Waiting for the clinic to approve**. Both are visible to the clinician and **neither is visible to the patient**.
* The thread being closed frees the one-open-plan slot, so a fresh recommendation can be written straight away.

#### `THR-SUGG-001` - Suggest a session · P0

**Preconditions.** `therapist_suggestions_enabled` is **on** (it is on by default now; confirm in Settings → Programmes & Home Visits). A programme locked to this therapist with credits remaining.

**Steps**
1. On the programme's card, tap the suggest control.
2. Pick a date and time comfortably beyond the booking lead time, **inside this therapist's own working hours** (Availability).
3. Enter the note `Let's keep the two-a-week rhythm while it is working.`
4. Tap **Send suggestion**.
5. Tap **Send suggestion** twice more, rapidly, on a second programme.

**Expected Result**
* Step 4: the control changes to **Waiting on the patient** with a **Withdraw suggestion** option. **No slot is held** - a hold would need releasing, releasing would need a sweep, and there is no scheduled worker. When the patient accepts, the session goes to the admin's queue with this therapist pre-picked, and the admin's assign re-checks the calendar.
* No appointment is created and **no credit is spent** - `sessions_used` is unchanged.
* Step 5: exactly **one** suggestion. The submit is guarded by a **synchronous ref** (a `disabled` attribute lands a render too late), and a partial unique index allows at most **one pending suggestion per purchase**.
* Negative cases: a slot too soon → `That time is too soon to book. Pick a later slot.`; a programme not locked to this therapist → `That isn't your programme.`; an inactive/unpaid programme → `That programme isn't active.`; a slot after expiry → `That time is after the programme expires.`; no credits → `Every session in this programme is already used.`; a time outside this therapist's own working hours (or on leave, or over another session) → `You can only suggest a time inside your own working hours. You're not working <hour> on <date>.` naming every reason (409) - checked up front with the same roster rule the admin's assign uses; the therapist already busy → `... You already have a session at <hour> on <date>.` (409); a note over 500 characters → `Your note must be 500 characters or less.`
* With the toggle off: `Suggesting sessions is switched off.` (403).

#### `THR-SUGG-002` - Withdraw a suggestion · P2
**Expected Result.** The pending suggestion is closed. The patient's Suggested Sessions entry disappears (and the sidebar entry disappears if nothing else waits).

---

### 12.6 The contact-leak scanner (therapist side)

> **Feature guide.** Every string one role writes and another reads is scanned. **Two tiers, deliberately**: a `block` hit (UPI handle, payment link, payment app) refuses the write; a `flag` hit (phone, email, social handle, bare URL) is delivered and recorded. The two tiers exist because this text is **clinical** - a scanner that treats digits as suspicious fires on every dose and every exercise prescription, and a check that cries wolf is a check nobody reads. Phone matching is the Indian mobile shape specifically (ten digits starting 6–9, optional `0`/`91`), not a loose digit run.

#### `THR-LEAK-001` - A payment handle is blocked · P0
**Steps.** In **Why this, for this patient**, enter `Pay me directly on 9876543210@okhdfc, it's cheaper` and submit.
**Expected Result.** The write is **refused**. The care plan is not created. A `communication_flags` row records the attempt with `blocked=true` and the offending content.

#### `THR-LEAK-002` - A payment link is blocked · P0
**Steps.** In a suggestion note, enter `https://rzp.io/l/abcd1234 pay here`. **Expected Result.** Refused, recorded.

#### `THR-LEAK-003` - A phone number is delivered and recorded · P1
**Steps.** In a suggestion note, enter `Call me on 9876543210 before the session`. **Expected Result.** The suggestion **is created** and the patient sees the note. A `communication_flags` row exists with tier `flag` and `blocked=false`. Admin → Settings → User Access shows it.

#### `THR-LEAK-004` - Clinical text with digits does not fire · P0
**Steps.** In a session note, enter `Grade III PA mobilisation ×3 sets, 30s hold. 10 reps, 2× daily. Order ref 90210.`
**Expected Result.** **No flag at all.** If this fires, the scanner is broken in the way that matters most - a false positive on ordinary clinical text is what makes the whole control useless.

#### `THR-LEAK-005` - The patient direction is record-only · P1
**Steps.** As Patient A, put `Call me on 9876543210` in the `/book` notes field and complete the booking.
**Expected Result.** The booking **succeeds**. A flag is recorded. **A 400 at the last step of checkout costs a real booking, and a patient is not who this control exists to catch.**

#### `THR-LEAK-006` - The scan mode switch · P1
**Steps.** Admin sets `contact_scan_mode` to `flag_only`, then to `off`. Repeat `THR-LEAK-001` after each.
**Expected Result.** `flag_only`: the UPI handle is **delivered** and recorded rather than refused. `off`: nothing is scanned or recorded. The setting is read in its **own** call and **fails open** - if the read fails, writes are allowed. (`contact_masking_enabled` is the opposite: it fails **closed**. Both defaults are deliberate and opposite.)

#### `THR-LEAK-007` - The evidence tables cannot be edited · P0 **[SQL]**
**Steps.** Attempt `update communication_flags set content='x'` and `delete from contact_reveal_log` in the SQL editor.
**Expected Result.** Both **raise**. Append-only **by trigger**, not merely by RLS - every route here writes with the service-role client, which bypasses RLS entirely. *An evidence record the evidenced party could edit is not evidence.*

---

### 12.7 Earnings and payouts

#### `THR-EARN-001` - Earnings shows delivered work only · P0

**Preconditions.** Therapist A has a revenue share of `60`, one **completed paid** session at ₹1,999, and one **paid but not completed** session at ₹1,799.
**Steps.** Open `/therapist/dashboard/earnings`.
**Expected Result.** The earned figure counts **only the completed** session: `₹1,999 × 60% = ₹1,199.40 → 119940 paise` (rounded). The paid-but-not-completed session contributes **nothing** - a therapist's share is earned by **delivering**, not by being booked. The screen answers both "what am I owed" and "what have I been paid" - Earnings and Payout Receipts are **one screen**, not two entries.

#### `THR-EARN-002` - Home-visit share and travel · P0

**Preconditions.** Therapist A has `home_visit_revenue_share_percent = 65`; Therapist B has none set. Each completes one home visit of ₹2,499 with a ₹150 travel fee.
**Expected Result.** Therapist A: `2499 × 65% + 150 = ₹1,774.35`. Therapist B falls back to their **online** share (55%): `2499 × 55% + 150 = ₹1,524.45`. **The travel fee is paid through in full and is never revenue** - a therapist must never fund their own transport.

#### `THR-EARN-003` - Request a payout · P1
**Steps.** Tap **Request Payout**.
**Expected Result.** The button becomes **Request Pending**, then **Under Review** once an admin starts review. A second request returns `You already have a pending payout request.` With no revenue share set: `Ask admin to set your revenue share % before requesting a payout.` The online method is refused with `Online payouts aren't available yet - use cash for now.`

#### `THR-EARN-004` - Cash held nets off the payout · P0
See `FIN-PAY-003` for the full cross-check. From the therapist's side, the figure shown as payable must be **net of cash they are still holding**.

---

### 12.8 Therapist authorization (negative)

#### `THR-SEC-001` - Therapist A cannot touch Therapist B's schedule · P0
**Steps.** With Therapist A's cookie, call `POST /api/therapist/save-availability` with a body naming Therapist B's id. Then call `POST /api/admin/save-therapist-availability` for Therapist B.
**Expected Result.** Both refused. The therapist route writes **only** the caller's own schedule (the id in the body is ignored or rejected); the admin route returns **403 Forbidden**. Verify in the admin Roster that Therapist B's schedule is byte-identical afterwards.

#### `THR-SEC-002` - Therapist A cannot read an unassigned patient · P0
**Steps.** With Therapist A's cookie, open `/therapist/dashboard/health-profile/<Patient B id>` (a patient assigned only to Therapist B). Then call `POST /api/therapist/pain-assessments/submit` and `POST /api/therapist/care-plan/submit` for Patient B.
**Expected Result.** The page shows no clinical data. The routes return **403** with `You're not assigned to this patient.` / `That isn't your patient.`

#### `THR-SEC-003` - A therapist cannot book as a patient · P0
**Steps.** Signed in as Therapist A, open `/book`.
**Expected Result.** Instead of the form, the **wrong-account** panel renders, naming the role and routing them to what is theirs. A direct `POST /api/appointments/create` with the therapist's cookie returns **403** with `This account can't book sessions. Sessions are booked under a patient account.` The same applies to all four purchase routes.

#### `THR-SEC-004` - A therapist cannot reach the admin dashboard · P0
**Steps.** Signed in as Therapist A, navigate to `/admin/dashboard`.
**Expected Result.** Redirected to **`/get-started`** - **never** to `/admin/login`, which would confirm the back office exists and name its door.

#### `THR-SEC-005` - A suspended therapist is locked out immediately · P0
**Steps.** Admin sets Therapist A inactive. With the therapist's still-valid cookie, load the dashboard and then call any therapist API route.
**Expected Result.** The dashboard redirects to **`/account-suspended`**. The API returns **403** `Your account is not active.` A live session cookie must not outlive suspension.
