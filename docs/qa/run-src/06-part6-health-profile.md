## 7. Part 6 - The health record

**What this part does.** The therapist triages Patient A, writes the first health record, and records a physical examination. That first fill is what unlocks the patient's own access - the screen you read at Step 4.7 changes here.

**Who you are.** QA Therapist A, then Patient A.

**Time.** About 45 minutes.

---

### Step 6.1 - Triage the patient

**Do this**

1. As QA Therapist A, open **My Patients** and then `QA Patient A`.
2. Open the triage dialog.
3. Answer the four questions:

| Question | Answer |
| --- | --- |
| How old is the patient? | `18 to 64` |
| What brought them in? | `Injury, strain or overuse` |
| Any of these present? | `None of these` |
| Any concern about milestones…? | *not shown - it only appears when the age is `Under 18`* |

4. Read what the dialog suggests before accepting anything.

**Expect**

* The dialog shows **everything at once**, with headings. That is deliberate: a clinician filling this after every assignment wants to scan it, where the patient's own questionnaire is paced one question at a time.
* It **suggests** `Orthopaedic`, **with its reason shown**, and does **not** accept it for you. A suggestion applied automatically is a **P1** - the clinician confirms.
* The word on screen is **condition type**, never "specialty" and never "case".
* Spelling is British - `Orthopaedic`, `Paediatric`. An American spelling in one label reads as a typo beside the others.

5. Confirm **Orthopaedic**.

---

### Step 6.2 - Write the first health record

The orthopaedic set is **seven questions**. Fill every one.

**Do this.** Still on Patient A, fill the record:

| Question, as shown | Answer to enter |
| --- | --- |
| What's the main issue you'd like help with? | `Lower back pain that spreads into my right hip` |
| How long has this been going on? | `About four months` |
| Overall severity right now (0-10) | `6` |
| Where does it hurt? (tap each area, rate 0-10) | Tap **Lower back** → rate `7`; tap **Right hip** → rate `5` |
| What makes it worse? | `Sitting for more than an hour, and bending to pick things up` |
| What helps or relieves it? | `Walking, and lying flat for ten minutes` |
| Anything else the therapist should know? | `I work at a desk nine hours a day. No previous surgery.` |

Save.

**Expect**

* It goes **live immediately**. There is no approval queue in front of a clinician writing the first record - the patient is locked out of their own health profile until it lands, so a queue here would leave them on a read-only screen after a session that has just ended.
* It is still **recorded**: open the patient's Review History and confirm an already-approved entry is there. Live is not unrecorded.
* The copy addresses **the clinician**, not the patient. A clinician being told "this is your own account of your condition, in your words" is the shared-copy failure this rule exists for - report it as a **P2**.

**Then submit the identical thing again**, without changing a single answer.

**Expect.** **Nothing is written** - no record update, no second history entry. An identical resubmission is a no-op, keyed on whether anything clinical actually changed. Ten taps producing ten history entries is the defect; two is the half-fixed version of it. Check Review History still has exactly one entry from this step.

---

### Step 6.3 - Record a physical examination

The Pain Map is **orthopaedic** and stays one. It is the therapist's own clinical layer, separate from the record above.

**Do this**

1. On Patient A's chart, find the Pain Map.
2. **Tap the body figure** on the lower back region - do not look for a dropdown.
3. In the exam dialog, fill the grouped questions with whatever clinical values the form offers, keeping the region in the header visible while you type.
4. Save.
5. Record a **second** assessment on the same region a moment later, with a lower pain value.

**Expect**

* The region is chosen by **tapping the figure** (or a chip in the dialog), never a `<select>`, and it **stays in the dialog header** while the clinician types.
* Questions are **grouped**, not listed flat.
* It posts **live**, with no review step.
* The second assessment is a **new row**, never an edit of the first - so the screen can show a trend against the previous visit. If the first disappears, that is a **P0**: this layer is append-only.
* The figure is an anatomical silhouette with **front and back as separate SVGs** that stack on a phone, rather than one figure shrunk until the tap targets are smaller than a fingertip.

**Check the scale.** Every exam figure the app prints is out of **ten**, matching how the patient rates their own pain. A strip reading *"How you rate it 6/10"* beside *"Last exam found 34%"* is two different measurements on one screen - **P2**.

**Then check the gate sits beside the thing it gates.** The "request access to edit" card is **inside** the Pain Map card, stating what is readable regardless and what needs approval - not three sections further up the page.

---

### Step 6.4 - Watch the patient's screen unlock

**Who you are.** QA Patient A.

**Do this.** Open **Health Profile** and compare it with what you read at Step 4.7.

**Expect**

* The record is there, showing **answers, not inputs**.
* The Overview's health cell now shows a real percentage rather than `-`.
* Nothing claims the patient answered questions a clinician wrote. Look at the counter: it must not read `3 of 7 answered` over "Add the missing answers" for answers the patient never gave. **Attribution is not a nicety on a medical record** - a counter that credits the patient with the clinician's typing is a **P1**.
* The word on every patient-facing screen is **Health Profile**. Not "Patient Care Intake", not "condition data", not "the questionnaire", and never "chart" - that is clinician register.
* The patient is never shown a category word. Their care reads as **Orthopaedic physiotherapy**, never `ortho`, and the words "triage" and "onboarding" appear nowhere on their screens.

---

### Step 6.5 - Export the record

**Do this.** As Patient A, use the export on Health Profile.

**Expect**

* A **PDF** downloads, named `QA Patient A_PT####.pdf` using that patient's own code.
* It is typeset and readable - the thing a patient does with an export is hand it to another clinician.
* **Session notes are not in it.** Neither are they in the JSON form. Check.
* The uploaded report from Step 4.6 is listed as metadata.

---

### Step 6.6 - Check one patient cannot read another's record

**Do this.** Sign in as **QA Patient B** and try to reach Patient A's health profile - by URL if the interface gives you no link.

**Expect.** Refused. Nothing of Patient A's renders, and no error message names a table or a column.

**Then as QA Therapist B** - who is not assigned to Patient A - open **My Patients**.

**Expect.** Patient A is **not** listed. Therapist B has no route to that record. Any path by which one patient's clinical data reaches another patient, or an unassigned clinician, is a **P0** and stops the run.

---

### Step 6.7 - Try to edit the record on the patient's behalf

There is a line between **creating** a record and **editing** one, and it is worth seeing.

**Do this.** As QA Therapist A, try to change an answer in Patient A's live record.

**Expect.** You are asked to **request access**, which an admin approves - unlike the first fill, which needed only assignment. Deciding what kind of patient this is, and writing down what they told you in a session you ran, is the clinician's own record; editing a live record on the patient's behalf is editing their own account of their history.

**Then, as the admin**, approve that request from **People → Condition access**, and confirm the therapist can now submit an edit that goes through review.

---

### Step 6.8 - Checkpoint

| | Should be |
| --- | --- |
| Patient A | Triaged **Orthopaedic**, seven answers on file, health profile unlocked |
| Pain Map | Two assessments on one region, both kept |
| Export | PDF, named after the patient, no session notes |
| Isolation | Patient B and Therapist B can reach none of it |

---
