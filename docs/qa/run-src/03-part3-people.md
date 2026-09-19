## 4. Part 3 - Create the people

**What this part does.** Puts three therapists, one partner hospital and three scoped admins into an empty database, each through the door the application actually uses. Two of them self-register and wait for you to approve them; the hospital and the admins are minted from the back office.

**Time.** About 50 minutes.

---

### Step 3.1 - Therapist A applies

**Who you are.** Signed out. Use a private window if your admin session is open in this browser.

**Do this**

1. Open `/therapist/login`. Confirm there are two tabs: **Sign In** and **Apply to Join**.
2. Tap **Apply to Join**.
3. Fill it in:

| Field | Value |
| --- | --- |
| Full Name | `QA Therapist A` |
| Email Address | `qa.therapist.a@example.test` |
| Phone | `+91 90000 10001` |
| Qualifications & License / Council Reg No. | `MPT (Ortho), KSCP Reg 44821` |
| Password | `QaTest!2024pass` |
| Confirm Password | `QaTest!2024pass` |

4. Tap **Submit Application**.

**Expect**

* The button reads `Submitting...`, then the form returns to the **Sign In** tab with a confirmation that the application is with the clinic.
* **No "check your email" step appears anywhere.** Email confirmation is off in this product by design, and the admin's approval is the only gate. A screen telling this therapist to check their inbox is a **P1** - it sends them to wait for something that will never arrive.

---

### Step 3.2 - Prove an unapproved therapist is held at the door

This is the first of the six console steps. Read §1.3 if you have not.

**Do this**

1. Still on `/therapist/login`, **Sign In** tab, sign in as `qa.therapist.a@example.test` / `QaTest!2024pass`.
2. Note where you land.
3. With that same session, open DevTools (**F12**) → **Console** and run:

```js
const r = await fetch("/api/therapist/save-availability", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slots: [{ dayOfWeek: 1, hour: 10 }] }),
});
({ status: r.status, body: await r.text() });
```

**Expect**

* Step 2 lands on **`/pending-approval`**, not the dashboard.
* Step 3 returns **403** with `Your account is not active - it is either awaiting admin approval or has been suspended.`
* **The second one is the one that matters.** The screen refusing is good; the route refusing is the point. A valid session cookie must not be able to call around the interface. A **200** here is a **P0**.

Sign out.

---

### Step 3.3 - Therapists B and C apply

Repeat Step 3.1 twice more. You need all three: B proves one therapist cannot see another's patients, C is the one you put on leave.

| Field | **Therapist B** | **Therapist C** |
| --- | --- | --- |
| Full Name | `QA Therapist B` | `QA Therapist C` |
| Email Address | `qa.therapist.b@example.test` | `qa.therapist.c@example.test` |
| Phone | `+91 90000 10002` | `+91 90000 10003` |
| Qualifications & License | `MPT (Neuro), KSCP Reg 44822` | `BPT, KSCP Reg 44823` |
| Password | `QaTest!2024pass` | `QaTest!2024pass` |

**Expect.** Both applications submit the same way. Do not approve anyone yet.

---

### Step 3.4 - Approve all three, as the admin

**Who you are.** Signed in as the Master Admin.

**Do this**

1. Open **Today → Approvals**.
2. Read the badge on that tab and the queue itself.
3. Approve `QA Therapist A`.
4. Approve `QA Therapist B` and `QA Therapist C`.

**Expect**

* All three applications are listed **oldest first**, each aged in words (`12 minutes ago`), not stamped with a date.
* The queue's own age is the age of the **oldest** waiting row, and it does **not** reset when the screen refreshes. Watch it across one refresh: an item that jumps back to *just now* is a **P1** - a signup that has waited three days would read as having just arrived, which is backwards for the one kind of item that gets more urgent the longer it waits.
* After approving, each therapist disappears from the queue and the badge falls by one.
* Open `/team` in another tab: all three now appear there, immediately. A therapist approved but missing from `/team` for five minutes means the approval did not clear that page's cache - **P2**.

**Then sign in as Therapist A** (`qa.therapist.a@example.test` / `QaTest!2024pass`) and confirm the sign-in now lands on `/therapist/dashboard`, with the sidebar showing **Overview, Availability, Sessions, Earnings, My Patients, Edit Profile**, and **Back to Home** at the foot of the nav.

---

### Step 3.5 - Set what each therapist is paid

A therapist's revenue share decides every payout figure later in this run, so it has to exist before anybody delivers anything.

**Do this.** As the admin, open **People → Therapists**, open each therapist, and set:

| Therapist | Revenue share % | Home-visit revenue share % |
| --- | --- | --- |
| `QA Therapist A` | `60` | `65` |
| `QA Therapist B` | `55` | *leave unset* |
| `QA Therapist C` | `50` | *leave unset* |

**Expect**

* Each saves and the therapist's own Overview header then reads `Your Revenue Share: 60%` (and so on) when they next open it.
* **Leaving B and C's home-visit share unset is deliberate.** Part 8 checks that a home visit delivered by B falls back to their ordinary 55%, rather than to zero or to A's 65%.
* `-5` and `150` are both refused with `Revenue share must be a number between 0 and 100`.

---

### Step 3.6 - Give Therapist A a roster

The roster is the clinic's planning record - who can be *offered* work. It does **not** filter what times a patient is offered at booking; you will prove that at Step 12.5.

**Do this**

1. Open **Sessions → Roster**.
2. Read the landing view before opening anybody.
3. Open `QA Therapist A`.
4. Set the weekly schedule to these working periods:

| Day | Periods |
| --- | --- |
| Monday to Friday | `09:00-13:00` **and** `14:00-18:00` |
| Saturday, Sunday | none |

5. Save.
6. Now add a date exception: pick **the next Tuesday at least a week away**, set it to `14:00-18:00` only, reason `Clinic audit in the morning`. Save.
7. Look at the Tuesday **after** that one, and at the weekly template itself.

**Expect**

* Step 2: the Roster opens on a **list of therapists** with a summary of what each works and their leave state - not on a calendar date, and not on an eighteen-column hourly grid.
* Step 3: the **period editor** opens. You set working periods, never individual hours.
* Step 7: **only the one date changed.** Every other Tuesday still shows `09:00-13:00` and `14:00-18:00`, and the weekly template is untouched. An exception replaces that whole day and nothing else; a change that leaks into the template is a **P0**.

**Now set Therapist C on leave.** In the Roster, put `QA Therapist C` on leave for a five-day range starting next Monday, reason `Annual leave`.

**Expect.** The roster shows them off. **Their weekly schedule is untouched and is still there when the leave is removed** - there is nothing to restore on the way back because nothing was removed.

**And give Therapist B a roster too**, since Part 8 needs them bookable: Monday to Friday `10:00-16:00`.

---

### Step 3.7 - Create the three scoped admins

Four desks exist. You have the first; these are the other three, and the run needs them from Part 11 onwards.

**Do this.** Open **Settings → User Access**. For each row below, use the **Account type** picker and create the account.

| Full name | Email | Account type to pick |
| --- | --- | --- |
| `QA Admin Operations` | `qa.admin.ops@example.test` | **Operations** |
| `QA Admin Finance` | `qa.admin.finance@example.test` | **Finance** |
| `QA Admin Clinical` | `qa.admin.clinical@example.test` | **Clinical** |

**Expect, on the picker itself.** It lists **six** options in two groups - **Clinic** (Patient, Therapist) and **Back office** (Master Admin, Operations, Finance, Clinical). There is no "Admin" entry that then reveals a second *Access level* dropdown. Picking the desk by name is the whole control.

> **Write the password down the moment it appears.** Each of these three gets a **generated one-time password, shown once on this screen** - not `QaTest!2024pass`. It is deliberately never emailed and never written to the activity log. If you lose one, you cannot recover it: set a new password in the Supabase dashboard under **Authentication → Users**, or delete the account there and create it again here.

**Then check it survived the screen.** Stay on User Access for thirty seconds without touching anything.

**Expect.** The password is **still on screen**. Creating the account writes a `profiles` row, which fires a realtime refresh, and the password used to be swept off the screen mid-sentence by that refresh. If it disappears on its own, that is a **P0** - the credential is then unrecoverable.

---

### Step 3.8 - Read the access matrix

**Do this.** Still on **Settings → User Access**, scroll to the matrix.

**Expect**

* Rows are the jobs people describe; columns are the four desks. Every cell says `none`, `view` or `manage`.
* **The cells are not checkboxes.** They are a description of what the routes enforce, not switches - a tick you could toggle that did not change a route would be a lie.
* Exactly one grant reads **view**: **Finance reads Sessions**. Finance can read what a ₹1,200 session was for, and cannot cancel the sessions they are reconciling.
* **Logs** is `manage` for Master Admin and **`none` for all three other desks**.

---

### Step 3.9 - Prove the reset refuses a narrower admin

You could not run this at Part 1 because the account did not exist yet. It exists now.

**Do this**

1. Sign out of the Master Admin.
2. Sign in at `/admin/login` as `qa.admin.ops@example.test` with the one-time password from Step 3.7.
3. In the Debug bar, tap **Reset data**.
4. Type `RESET ALL DATA` in the confirmation field.
5. Tap **Reset**.

**Expect.** A red error in the bar reading exactly:

```
Only a Master Admin can reset data.
```

**Nothing is deleted.** Go back to **People → Therapists** as the Master Admin and confirm all three therapists are still there. If this call emptied the database, stop the run - it is the most serious defect this document can find.

> If you get `Invalid login credentials` here, that is the generated password, not the reset. Re-read the warning in Step 3.7.

Sign back in as the Master Admin.

---

### Step 3.10 - Provision the partner hospital

A hospital never self-registers into a working account. The public page collects an enquiry; an admin converts it.

**First, submit the enquiry.** Sign out (or use a private window) and open `/hospitals`. Scroll to the enquiry form and submit:

| Field | Value |
| --- | --- |
| Organisation name | `QA Sunrise Hospital` |
| Contact person | `QA Hospital Admin A` |
| Email | `qa.hospital@example.test` |
| Phone | `+91 80400 10001` |
| Address | `18 Airport Road` |
| City / State / PIN | `Bengaluru` / `Karnataka` / `560017` |

**Expect.** A confirmation appears. **No account is created and no login works yet** - an enquiry is not a partner. Try signing in at `/hospital/login` with that email and confirm it fails.

**Then convert it.** As the Master Admin, open **People → Partners**, find the lead `QA Sunrise Hospital`, and tap the onboard control:

| Field | Value |
| --- | --- |
| Organisation Name | `QA Sunrise Hospital` |
| Contact Person | `QA Hospital Admin A` |
| Email | `qa.hospital@example.test` |
| Revenue Share % | `10` |

**Expect**

* The account is created, and the screen shows **a generated password and a generated referral code, once**. **Write both down.** Part 9 needs the referral code.
* Open **Logs → All Activity**. The onboarding is recorded, naming who onboarded whom and when - **and the password is not in it.** Every admin can read that log, so a generated password there would be a credential leak. Finding one is a **P0**.
* A revenue share of `-5` or `150` is refused with `Revenue share must be a number between 0 and 100`. Re-submitting the same email is refused rather than creating a second account.

**Then sign in as the hospital** at `/hospital/login` and confirm you land on `/hospital/dashboard`, sidebar reading **Overview, Refer a Patient, Your Referrals, Earnings, Edit Profile**. The money word here is **Earnings** - the same word the therapist's sidebar uses. "Revenue & Payouts" or any third name for the same thing is a **P2**.

---

### Step 3.11 - Checkpoint

Before going on, confirm all of this is true. Part 4 assumes every line.

| | Should be |
| --- | --- |
| Conditions | Three, priced ₹1,999 / ₹1,799 / ₹2,499 |
| Programmes | P1 (6), P2 (8), P3 (1) |
| Home-visit packages | HV1 (1 visit), HV2 (4 visits) |
| Service areas | `560038` at ₹150, `560095` at ₹200 |
| Therapists | A, B, C - all approved, shares 60/55/50, A and B rostered, C on leave |
| Hospital | `QA Sunrise Hospital` provisioned, referral code written down |
| Admins | Master Admin plus Operations, Finance, Clinical - all three passwords written down |
| Patients | **None yet.** Part 4 makes the first one. |

---
