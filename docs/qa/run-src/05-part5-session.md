## 6. Part 5 - Assign, join and deliver the session

**What this part does.** Takes Patient A's paid session from "nobody is assigned" to "delivered and written up". It is the spine of the clinic's operational day, and every money figure in Part 10 comes from it.

**Time.** About 45 minutes.

---

### Step 5.1 - Find the session in the admin's queue

**Who you are.** The Master Admin.

**Do this**

1. Open **Today**.
2. Read the "needs a person" figure and the queue list beneath it.
3. Tap the figure.

**Expect**

* The figure and the list **agree**. A strip reading 23 over a list of four is the exact defect this check exists for - **P1**.
* Tapping it opens **Sessions → All Sessions** already filtered to the rows it counted, **not** the whole table. Filtering you have to redo by hand is the failure; so is a count that opens an unfiltered list and therefore looks wrong.
* Patient A's session is there: paid, tomorrow at 4 PM, **no therapist**.
* The row carries a chip reading **Tap to assign** - not "Reschedule / Reassign". A session nobody has ever been assigned to must not describe the action as editing something that already happened.

**Then tap somewhere else and come back.** Move to another screen and return to All Sessions.

**Expect.** The preset is **gone** - it is one-shot, so a filter never becomes something an admin cannot find the source of. Tapping the Today figure again re-applies it.

---

### Step 5.2 - Assign Therapist A

**Do this**

1. Tap Patient A's session row. The detail drawer opens.
2. Read what the drawer leads with.
3. Assign **QA Therapist A**.

**Expect**

* The drawer **leads with the assign control**, with the reschedule form kept below for when the time has to move too.
* The session becomes **confirmed**.
* A **Meet link** appears on it, and on the patient's own session card.
* The therapist's dashboard now lists the session.

**If there is no Meet link**, look at **Settings → System Health** before reporting anything:

| What System Health says | What it means |
| --- | --- |
| Google shows **Not set up** | Nobody wired Google up in this environment. **Not a defect** - it is a state, not a fault, and the run continues without video links. Mark the Meet checks N/A. |
| Google shows **Needs you now** with a dead-credential message | One refresh token has died, so **every** session fails identically. The card states the length, an eight-character fingerprint and whether the stored value has stray whitespace - that is how you tell "the permission died" from "the server is still holding the old value". |
| The session sits in **Session Links** with an error | The sweep will retry it, capped. A manual **Retry** resets the counter. |

**One thing to watch for and report.** Tap **Retry** on a **home visit** (you will have one after Part 8). A home visit **never** has a Meet link by design - there is nothing to join. If Retry answers `502 Retry failed`, or if every click creates a **new calendar event**, that is a **P0**: three duplicate invites once reached one patient that way.

---

### Step 5.3 - Check the session reads the same on every screen

The same row is rendered by four different people. They must agree.

**Do this.** Open, in turn, and compare the date, the time and the status:

| Screen | Where |
| --- | --- |
| The patient's **Sessions** | `/patient/dashboard/sessions` |
| The therapist's **Sessions** | `/therapist/dashboard/sessions` |
| The admin's **All Sessions** | Sessions → All Sessions |
| The admin's **Schedule** | Sessions → Schedule (calendar) |

**Expect.** One date, one time, one status, everywhere - and the time is **4 PM**, in India Standard Time, on all four. A screen showing `10:30 AM` for the same row is the clinic-time rule broken.

**Also check the patient's Sessions screen is one list.** Upcoming / Past / Cancelled filters, not separate sidebar entries for video and home visits. The Video / Home visit filter appears only once this patient has both, which they do not yet.

---

### Step 5.4 - Check the join window

**Do this**

1. As the patient, look at the session card now (it is tomorrow).
2. As the therapist, look at the same session.
3. Open **Settings → Booking Rules** as the admin and read the **join window** and the **Session Completed cutoff**.

**Expect**

* Well before the slot, the join control is **not** live - it names when it opens rather than being a dead button.
* Inside the window, **Tap to Join** works for both parties.
* Past the cutoff - the admin-set number of minutes after the slot time - every join control reads **Session Completed** instead, **including the admin's own**. A session an hour past its start must read the same way on every screen it appears on.

> If you cannot wait for real time to pass, use the Debug bar's simulated time rather than editing the database. Changing a session's slot to the past by hand also changes what the money screens count.

---

### Step 5.5 - Try to complete it too early, then properly

**Who you are.** QA Therapist A.

**Do this**

1. **Before** the join window opens, try to mark the session complete.
2. Then, inside or after the window, mark it complete.

**Expect**

* Step 1 is **refused**. Completing a session is a financial write with a clinical name: `completed` + `paid` is the exact and only condition that makes the therapist's revenue share payable, so a session cannot be closed before the window in which it could have been started. A therapist who can mark tomorrow's session done today and be owed for it is a **P0**.
* Step 2 succeeds. The session reads **Completed** on all four screens from Step 5.3.

**Then check the two refusals that protect the money**, each on a session you set up for it:

| Situation | Expect |
| --- | --- |
| A session with **no payment** behind it | The therapist cannot complete it. |
| A **cash home visit** with no cash recorded | The therapist cannot complete it - collect first, which is the right order anyway. |

> An **admin** can complete a session in either of those states, deliberately: a backfill or a correction is exactly what the override lane is for. What an admin cannot do is complete one from a desk that only reads Sessions - Step 12.3 checks that.

---

### Step 5.6 - Write the session note

**Who you are.** QA Therapist A.

**Do this**

1. From the completed session's card, open the session note dialog.
2. Fill all four fields:

| Field | Value |
| --- | --- |
| What was treated | `Lumbar assessment. Reduced flexion, pain on end-range. PA mobilisations L4-L5.` |
| How the patient responded | `Good tolerance, reported easing during the session. No radiating symptoms today.` |
| Home exercise | `Cat-cow x10, twice daily. Walking 15 minutes after lunch.` |
| Plan for next time | `Reassess flexion range. Add glute bridge progression if pain stays under 4.` |

3. Save.

**Expect**

* Saved, and the therapist's Overview **Notes to write** figure falls by one. At zero it reads `Every delivered session is written up`.
* The note is editable for **24 hours**, and every edit inside that window keeps a copy of what it replaced.
* **The patient cannot see it anywhere.** Check the patient's Health Profile and their export - session notes are clinician-only and are excluded from both on purpose. A patient who can read a session note is a **P0**.

**Then check the contact scanner on this field.** Open the note again and try to save each of these:

| What you type | Expect |
| --- | --- |
| `Grade III PA mobilisation x3 sets, 30s hold. 10 reps, 2x daily. Order ref 90210.` | **Saves normally.** Clinical text full of numbers must not fire the scanner - a check that cries wolf is a check nobody reads. |
| `Call me on 9876543210 before the session` | **Saves, and is recorded.** A phone number is flagged, not blocked. It appears on the admin's flagged-messages panel. |
| `Pay me directly on 9876543210@okhdfc, it's cheaper` | **Refused.** A payment handle is blocked outright. |

Restore the real note text afterwards.

---

### Step 5.7 - Check the patient's phone is masked

**Who you are.** QA Therapist A.

**Do this**

1. Open **My Patients** and then Patient A.
2. Read the contact details.
3. Inside the session's join window, use **reveal contact**.

**Expect**

* The phone is **masked** and the email is **not shown at all** - it is not loaded onto these screens in the first place.
* Revealing works inside a video session's join window, and on a home visit's own day.
* It is **refused** outside that window, and refused for a cancelled session.
* Every reveal is recorded. As the admin, check the reveal log has a row. **A reveal that could not be recorded is refused** - unlike the audit log, this one is not best-effort, because a reveal with no trace is the one outcome the route must not produce.

---

### Step 5.8 - Rate the session

**Do this.** As Patient A, rate the completed session **4 stars** with the comment:

```
Clear explanation and a plan I can actually follow at home.
```

**Expect.** The rating saves. The therapist's Overview header now reads `Your Rating: 4.0 (1 rating)` instead of `No ratings yet`.

**Then, as the admin**, hide that therapist's rating from public pages and check `/team` no longer quotes it, and that the therapist's own header gains ` - hidden from public pages`. Put it back.

---

### Step 5.9 - Checkpoint

| | Should be |
| --- | --- |
| Patient A's session | Completed and paid, delivered by Therapist A |
| Session note | Written, clinician-only |
| Rating | 4 stars, showing on the therapist's header |
| Flagged message | One recorded, from Step 5.6 |
| Contact reveal | One logged |

---
