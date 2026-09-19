## 6. Part 5 - One session, seen by everyone

**What this part does.** Takes Patient A's paid session from "nobody is assigned" to "delivered, written up and rated" - and at every moment shows **what each role sees of the same row**. A session is the one thing in this product four different people look at, and the commonest class of defect is two of them disagreeing about it.

**How to read this part.** Each step is split by who you are signed in as - **As the admin**, **As the therapist**, **As the patient**, **As the partner**. Work through the blocks in the order they appear.

**Keep four browsers or profiles open.** Tabs in one browser share cookies, so signing in as the admin in a second tab signs the patient out of the first.

**Time.** About 55 minutes.

---

### Step 5.1 - The paid session arrives

**As the admin**

1. Open **Today**.
2. Read the "needs a person" figure and the queue list beneath it.
3. Tap the figure.

**Expect**

* The figure and the list **agree**. A strip reading 23 over a list of four is the exact defect this check exists for - **P1**.
* Tapping it opens **Sessions → All Sessions** already filtered to the rows it counted, **not** the whole table.
* Patient A's session is there: paid, tomorrow at 4 PM, **no therapist**.
* The row carries a chip reading **Tap to assign** - not "Reschedule / Reassign". A session nobody has ever been assigned to must not describe the action as editing something that already happened.

Move to another screen and come back.

**Expect.** The preset is **gone** - it is one-shot, so a filter never becomes something an admin cannot find the source of. Tapping the figure again re-applies it.

**As the therapist**

Open `/therapist/dashboard`.

**Expect. Nothing.** The session is paid and unassigned, so it belongs to nobody yet. A clinician seeing unassigned work on their own dashboard is a **P2** - it is the admin's queue, not theirs.

**As the patient**

Open **Sessions**.

**Expect.** The session is listed as **Pending** - paid, waiting on the clinic. It does **not** claim a therapist and does **not** offer a join link.

**As the partner**

Sign in as `QA Sunrise Hospital` and look everywhere.

**Expect.** Nothing about this session, at all. Patient A did not come through them.

---

### Step 5.2 - Assigning a therapist

**As the admin**

1. Tap Patient A's session row. The detail drawer opens.
2. Read what the drawer leads with.
3. Assign **QA Therapist A**.

**Expect**

* The drawer **leads with the assign control**, with the reschedule form kept below for when the time has to move too.
* One tap, honouring the therapist the patient asked for if they asked for one.
* The session becomes **confirmed**.

**As the therapist**

Reload `/therapist/dashboard`.

**Expect**

* The session is now **theirs** - on the Overview's **Today** or **Upcoming** figure, and in their session list.
* The patient's name is there. Their **phone is masked** and their **email is not shown at all**; Step 5.7 covers that properly.

**As the patient**

Reload **Sessions**.

**Expect**

* It reads **Confirmed**, and now names the therapist.
* A **meeting link** appears on the card.

**If there is no meeting link**, look at **Settings → System Health** as the admin before reporting anything:

| What System Health says | What it means |
| --- | --- |
| Google shows **Not set up** | Nobody wired Google up here. **Not a defect** - a state, not a fault. Mark every meeting-link check in this run N/A. |
| **Needs you now**, dead credential | One token has died, so **every** session fails identically. The card states the length, an eight-character fingerprint and whether the stored value carries stray whitespace - that is how you tell "the permission died" from "the server is still holding the old value". |
| The session sits in **Session Links** | The sweep retries it, capped. A manual **Retry** resets the counter. |

**One thing to watch for and report.** Once you have a home visit (Part 9), tap **Retry** on it. A home visit **never** has a meeting link by design - there is nothing to join. If Retry answers `502 Retry failed`, or if each click creates a **new calendar event**, that is a **P0**: three duplicate invites once reached one patient that way.

---

### Step 5.3 - One row, four screens

The same session, read by six different signed-in people. Compare the **date, the time and the status** on each.

| Signed in as | Where | Must show |
| --- | --- | --- |
| Patient A | `/patient/dashboard/sessions` | 4 PM, Confirmed, therapist named |
| Therapist A | `/therapist/dashboard/sessions` | 4 PM, Confirmed, patient named, phone masked |
| The Master Admin | Sessions → All Sessions | 4 PM, Confirmed, both named, amount visible |
| The Master Admin | Sessions → Schedule | The same session on the same day, opening the **same** drawer |
| Operations | Sessions → All Sessions | The same row - **but no amount** |
| Finance | Sessions → All Sessions | The row **and** the amount, and **no** control that changes it |

**Expect**

* One date, one time, one status, everywhere - and the time is **4 PM**, in **India Standard Time**, on every one of them whatever your laptop is set to. A screen showing `10:30 AM` for the same row is the clinic-time rule broken, and it is a **P1**: two people reading one screen then disagree about when the session is.
* The patient's screen is **one list** - Upcoming / Past / Cancelled filters, not separate entries for video and home visits. The Video / Home visit filter appears only once they have both, which they do not yet.

---

### Step 5.4 - The join window, for all three

Three people, one session, and they must agree about whether it can be joined.

**As the patient.** Look at the session card now, well before the slot.

**Expect.** The join control is **not live**, and it **names when it opens** rather than being a dead button with no explanation.

**As the therapist.** Look at the same session.

**Expect.** The same answer, at the same moment. A window open for one party and shut for the other is a **P1** - one of them sits waiting in a meeting nobody else can enter.

**As the admin.** Open the session drawer.

**Expect.** The admin's own join control follows the **same** window. The admin is not special here.

**Now move inside the window.** Use the Debug bar's simulated time rather than editing the database - changing a slot by hand also changes what the money screens count.

**Expect. Tap to Join** works for the patient, the therapist **and** the admin.

**Then move past the Session Completed cutoff** - the admin-set number of minutes after the slot time.

**Expect.** Every join control now reads **Session Completed** instead - **on all three screens, the admin's included**. A session an hour past its start must read the same way everywhere it appears. One screen still offering Join is a **P2**.

---

### Step 5.5 - Completing it

Completing a session is a **financial write with a clinical name**: `completed` + `paid` is the exact and only condition that makes the therapist's revenue share payable. So who may do it, and when, is a money question.

**As the therapist - the refusals**

| Try | Expect |
| --- | --- |
| Complete it **before** the join window opens | **Refused.** A therapist who can mark tomorrow's session done today and be owed for it is a **P0** |
| Complete a session with **no payment** behind it | Refused |
| Complete a **cash home visit** with no cash recorded | Refused - collect first, which is the right order anyway |

**As the therapist - properly.** Inside or after the window, mark it complete.

**Expect.** It succeeds, and reads **Completed** on all the screens from Step 5.3.

**As the admin - the override lane.** Complete a session that has **no payment** behind it.

**Expect. Allowed.** A backfill or a correction is exactly what an admin is for, and neither gate above applies to them.

**As Finance - the refusal that matters.** Signed in as `qa.admin.finance@example.test`, try to complete a session, from the screen and from the console:

```js
const r = await fetch("/api/appointments/complete-session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ appointmentId: "<a paid, past session id>" }),
});
({ status: r.status, body: await r.text() });
```

**Expect.** The buttons **do not render**, and the route answers **403**. Finance reads Sessions precisely so the person reconciling the books cannot change what they are reconciling - and completing a session is what creates the payout obligation they are reconciling.

**As the patient.** Reload Sessions.

**Expect.** The session moves to **Past**, marked completed. Nothing about the money changes on their screen - they already paid.

---

### Step 5.6 - The session note

**As the therapist**

1. From the completed session's card, open the note dialog.
2. Fill all four fields:

| Field | Value |
| --- | --- |
| What was treated | `Lumbar assessment. Reduced flexion, pain on end-range. PA mobilisations L4-L5.` |
| How the patient responded | `Good tolerance, reported easing during the session. No radiating symptoms today.` |
| Home exercise | `Cat-cow x10, twice daily. Walking 15 minutes after lunch.` |
| Plan for next time | `Reassess flexion range. Add glute bridge progression if pain stays under 4.` |

3. Save.

**Expect.** Saved, and the Overview's **Notes to write** figure falls by one. At zero it reads `Every delivered session is written up`.

**Then edit it** and change one sentence.

**Expect.** The edit lands, and **what it replaced is kept** rather than overwritten. Notes stay editable for **24 hours**; past that the route refuses the edit whatever the screen offers. A note that can be silently rewritten days later is a clinical record with no history - **P1**.

**As the patient.** Look for it: on Health Profile, on the session card, and in the export from Step 6.5.

**Expect. Nothing, anywhere.** Session notes are clinician-only, written in the register clinicians use with each other, and they are excluded from the patient's export on purpose. **A patient who can read a session note is a P0.**

**As the admin.** Open the same session.

**Expect.** The admin **can** read it - they carry the clinic's responsibility for the record.

**Now the contact scanner, as the therapist.** Try saving each of these into the note:

| What you type | Expect |
| --- | --- |
| `Grade III PA mobilisation x3 sets, 30s hold. 10 reps, 2x daily. Order ref 90210.` | **Saves normally.** Clinical text full of numbers must not fire the scanner - a check that cries wolf is a check nobody reads |
| `Call me on 9876543210 before the session` | **Saves, and is recorded.** A phone number is flagged, not blocked |
| `Pay me directly on 9876543210@okhdfc, it's cheaper` | **Refused.** A payment handle is blocked outright |

**As the admin**, confirm the flagged one appears on the flagged-messages panel, and that **the blocked one is nowhere in the record at all** - it was never written.

Restore the real note text.

---

### Step 5.7 - The patient's phone number

**As the therapist**

1. Open **My Patients** → Patient A.
2. Read the contact details.
3. Inside the session's join window, use **reveal contact**.
4. Try it again **outside** the window, and on a **cancelled** session.

**Expect**

* The phone is **masked**; the email is **not shown at all** - it is not even loaded onto these screens.
* The reveal works inside a video session's join window, and on a home visit's own day.
* Step 4's two attempts are both **refused**.

**As the admin.** Open the contact reveal log.

**Expect.** A row for the reveal, naming who, whom and when. **A reveal that could not be recorded is refused** - unlike the audit log, this one is not best-effort, because a reveal with no trace is the one outcome the route must not produce.

**As the patient.** Nothing about any of this is on their screens, and nothing should be.

---

### Step 5.8 - The rating

**As the patient.** Rate the completed session **4 stars** with:

```
Clear explanation and a plan I can actually follow at home.
```

**As the therapist.** Reload the Overview.

**Expect.** The header now reads `Your Rating: 4.0 (1 rating)` instead of `No ratings yet`.

**As the admin.** Hide that therapist's rating from the public pages.

**Expect.** `/team` stops quoting it, and the therapist's own header gains ` - hidden from public pages`. The real number is still theirs to see - it is the public quoting of it that stopped.

Put it back.

---

### Step 5.9 - Reopening a completed session

Undoing a completion has to undo the whole of it.

**As the admin**

1. Reopen the session you completed at Step 5.5.
2. Read what the screen says will happen **before** confirming.
3. Look at the session afterwards.

**Expect**

* It returns to **confirmed**, and the record of *when* it was completed is **cleared** with it. A row reading `confirmed` while still carrying a completion time is a contradiction, and it is exactly the evidence a risk detector should no longer be looking at - **P1**.
* **Both sides' ratings are destroyed**, and you were told so before confirming. The 4 stars from Step 5.8 are gone.

**As the therapist.** Reload Earnings.

**Expect. Owed to you** has fallen back by that session's share. A reopened session must not stay payable.

**As the patient.** Reload Sessions.

**Expect.** It is back among the upcoming work, and their rating is gone.

**Then have two admins reopen it at once**, in two browsers, tapping within a moment of each other.

**Expect.** Exactly **one** of them does it. The second is refused or is a no-op - not a second reopen destroying a rating somebody has since left again.

Re-complete the session and re-rate it before moving on. Part 11 counts it.

---

### Step 5.10 - Checkpoint

| | Should be |
| --- | --- |
| The session | Completed and paid, delivered by Therapist A, rated 4 |
| Agreement | The same date, time and status on every screen, in clinic time |
| Join window | The same answer for patient, therapist and admin, at the same moments |
| Completion | Refused early, refused unpaid for the therapist, allowed for the admin, refused for Finance |
| Note | Written, edited with its previous version kept, invisible to the patient |
| Contact | One reveal, logged; two refusals |
| Flags | One phone number recorded, one payment handle refused and never written |

---
