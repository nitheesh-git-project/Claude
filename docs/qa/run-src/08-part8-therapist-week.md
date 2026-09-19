## 9. Part 8 - The therapist's own week

**What this part does.** Everything a clinician does that is not a session:
their dashboard, the line between a detail they own and a credential the
clinic approves, their patient list, proposing the next appointment, and
asking to be paid. The patient gets an end-to-end part of their own; this is
the therapist's.

**Who you are.** **QA Therapist A**, with the admin and Patient A in other
browsers.

**Time.** About 50 minutes.

---

### Step 8.1 - Read the therapist's Overview

**Do this.** Sign in as `qa.therapist.a@example.test` and open
`/therapist/dashboard`. Read it top to bottom before tapping anything.

**Expect**

* The header greets them by name and states **what they are paid and how they
  are rated**: `Your Revenue Share: 60%` and `Your Rating: 4.0 (1 rating)`
  after Part 5. Before any rating it reads `No ratings yet`. If an admin has
  hidden that rating from the public pages, the line ends
  ` - hidden from public pages`.
* The greeting is `Your practice today`, and the headline names the **next**
  session and its patient - or, with nothing booked,
  `No sessions booked yet - keep your availability open and the clinic assigns work to it.`
* Four figures, in this order: **Today**, **Upcoming**, **Notes to write**,
  **Owed to you**.
* Then the feed, then quick actions - the same shape as every other
  dashboard in this product.

**Now check each figure agrees with the screen it opens.**

| Tap | Should land on | And the count there should |
| --- | --- | --- |
| **Today** | the session list | match, with `Next at H:MM` beneath the figure |
| **Upcoming** | the session list | count confirmed **and** awaiting-assignment work |
| **Notes to write** | `/therapist/dashboard/sessions` | match the delivered sessions with nothing written |
| **Owed to you** | `/therapist/dashboard/earnings` | match, as a rupee figure |

* **Notes to write** is amber above zero and emerald at zero, reading
  `Every delivered session is written up`.
* **Owed to you** carries its state: `Not yet requested`, `Payout request
  under review`, or `Payout request sent`.

**Then the four quick actions.** Tap each and come back.

| Action | Must land on |
| --- | --- |
| Set your availability | `/therapist/dashboard/availability`, **with the weekly editor on screen** |
| Your assigned sessions | `/therapist/dashboard/sessions` |
| Patient health profiles | `/therapist/dashboard/health-profile` |
| Earnings and payouts | `/therapist/dashboard/earnings` |

**A quick action that reloads the Overview and changes nothing is a defect** -
report it against this step. Availability in particular is its own route.

**And one thing that must not be here.** No figure, card or feed item on this
screen shows a patient's **phone number or email address**. Check.

---

### Step 8.2 - Edit Profile: what saves instantly, and what the clinic approves

This screen draws a line: a detail the therapist owns outright saves on the
spot, and a credential patients rely on becomes a request an admin decides.

**Do this**

1. Open **Edit Profile**.
2. Under **Public Details**, set:

| Field | Value |
| --- | --- |
| Short Bio | `Works with desk-based patients on posture-driven back pain.` |
| Languages Spoken | `English, Kannada, Hindi` |

3. **Save**, then reload the page.
4. Under **Credentials & Specialization**, set **Years of Experience** to `15`
   and **Specialist In** to `Spine, hip and knee rehabilitation`.
5. Tap **Request Changes**.
6. Read the two fields you just changed.
7. Tap **Withdraw** beside **Specialist In**.
8. Request it again, and leave it pending.
9. In the admin browser, open **Today → Approvals** and **decline both**
   with the note:

```
Send the council registration number first.
```

10. Back as the therapist, reopen **Edit Profile**.

**Expect**

* Step 3: **Public Details survive the reload.** No admin ever saw them.
* Step 5: `Your request has been submitted for admin review.`
* Step 6: each requested field is replaced by its **new** value on a slate
  panel with an amber **Pending Review** chip and a **Withdraw** link, and
  **cannot be edited again** until it is decided.
* **The live profile still shows the old value.** Check `/team` and the
  patient's view of their therapist - neither may change yet. A credential
  that goes live before approval is a **P1**.
* Step 7: **Withdraw** returns the field to an editable input immediately,
  carrying the **old** value.
* Step 10: the field is editable again and carries
  `Last request declined: Send the council registration number first.` in
  red. Nothing on the public profile ever changed.
* The note under those fields reads
  `Changes to these fields need admin approval before they take effect.`

**Two more on the same screen.**

* **Profile photo** uploads on the spot, with no review, and appears on
  `/team`.
* **Account Security → Send password reset email** sends the reset and says
  so. The password is never typed on this screen.

---

### Step 8.3 - My Patients, and the two ways to look at it

**Do this**

1. Open **My Patients**.
2. Find the **Patients / Programmes** toggle and switch between them.
3. Open `QA Patient A`.

**Expect**

* Patient A is listed. **Patient B is not** - Therapist A has never been
  assigned to them.
* The toggle renders the **same** cards arranged differently, not two
  different lists. A session that appears in one view and not the other is a
  **P1**.
* The **Programmes** view only exists for a therapist who has programme
  patients. Sign in as **QA Therapist B**, who has none: the toggle is
  **absent** rather than showing an empty panel.
* On Patient A: their **phone is masked** and their **email is not shown at
  all**. The health record from Part 6 is there; the Pain Map is there.

**Then check a therapist cannot reach somebody who is not theirs.** As
**Therapist B**, try to open Patient A's health profile by URL.

**Expect.** Refused, and no clinical data renders. A path by which an
unassigned clinician reads a patient's record is a **P0** that stops the run.

---

### Step 8.4 - Propose the next session

A therapist may **suggest** a time on a programme locked to them. They cannot
book it - the patient does that. This whole feature has its own switch; check
it is on before blaming the screen.

**Do this**

1. As the admin, confirm **Therapist-Suggested Sessions** is **on**
   (Settings → Programmes & Home Visits).
2. As **QA Therapist A**, open Patient A's programme from Part 7 and use the
   suggest control.
3. Pick a date and hour at least a couple of days out, and add the note:

```
Let's keep to Tuesdays while the pain settles.
```

4. Submit. Then try to submit a **second** suggestion on the same programme.
5. **Double-tap** submit on a fresh suggestion.

**Expect**

* The control offers the **same compact calendar and hour chips** the patient
  sees, obeying the same lead time. A raw date box beside an hour dropdown
  could offer a time the patient's own screen would then refuse - **P1**.
* Step 4 is **refused**: at most **one pending suggestion per programme**.
* Step 5 produces **exactly one** suggestion, not two.
* **No slot is held.** Nothing about that time is reserved for the patient,
  and the therapist's calendar is re-checked when they answer.

**Now switch to Patient A** and open **Suggested Sessions**.

**Expect**

* The proposed time and the therapist's note are there, with **Accept** and
  **Decline**.
* **Accepting books it** - and only then does the programme's remaining
  balance fall by one. A suggestion that spends a session before it is
  accepted is a **P1**: a decline would then have to refund one.
* The booked session is **auto-assigned to Therapist A and confirmed**, with
  its own meeting link, because the programme is locked to them.

**Then the three refusals.**

| Try | Expect |
| --- | --- |
| **Decline** a suggestion, then look at the balance | Nothing was spent |
| Have the therapist suggest a slot, then let the clock run inside the 12-hour lead time | It simply **stops being acceptable**. Nothing anywhere writes it as "expired" - there is no worker here to run a sweep, so the state is worked out when it is read |
| Answer the same suggestion from **two browsers at once** | One wins, the other is told so. Not two bookings. |

**And the connection test.** Accept a suggestion with the network dropped
mid-request.

**Expect.** The patient is left **exactly where they were**, with the
suggestion still on screen - not cleared optimistically into a state that
never happened.

**Finally, switch the feature off** as the admin and reload both screens.

**Expect.** The suggest control is gone from the therapist's screen, and the
route refuses it if called directly. Switch it back on.

---

### Step 8.5 - Earnings, and asking to be paid

**Do this.** As Therapist A, open **Earnings**.

**Expect**

* The sidebar word is **Earnings** - the same word the hospital's sidebar
  uses. Money owed *to* somebody is Earnings; money going *out* is Payments
  on the patient's side. A third word for the same thing is a **P2**.
* The figure counts **completed, paid** sessions only. A session that is paid
  and not yet delivered contributes **nothing** - a therapist is paid for
  delivering, not for being booked.
* A **home visit** contributes at their home-visit rate (65%) with the
  **travel fee in full** on top.
* A forfeited late cancellation - paid, never delivered - contributes
  **nothing**.
* Any **cash they are holding** is shown as owed back to the clinic, and the
  screen says what will be netted off.

**Now request a payout**, and watch the state move on the Overview:

| Stage | Overview's **Owed to you** should read |
| --- | --- |
| Before requesting | `Not yet requested` |
| After requesting | `Payout request under review` |
| After the admin settles it (Part 11) | `Payout request sent` |

**Then try to request twice** without an admin acting in between.

**Expect.** Refused, or a no-op. Two open requests for one balance is a
**P1** - somebody will pay both.

---

### Step 8.6 - What a therapist cannot reach

**Do this**, each signed in as QA Therapist A:

| Try | Expect |
| --- | --- |
| Open `/admin/dashboard` | Redirected to **`/get-started`** - never to `/admin/login` |
| Open `/patient/dashboard` | Bounced. One account carries one role. |
| Open `/book` | The wrong-account panel, telling a clinician wanting therapy to use a separate patient account |
| Open another therapist's patient by URL | Refused |

**And the route sweep**, in the console:

```js
const routes = [
  "/api/admin/approve-account",
  "/api/admin/settle-therapist-payout",
  "/api/admin/save-therapist-availability",
  "/api/admin/set-availability-exception",
  "/api/patient/condition-profile/export",
  "/api/hospital/withdraw-referral",
];
console.table(await Promise.all(routes.map(async (route) => {
  const r = await fetch(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return { route, status: r.status, body: (await r.text()).slice(0, 90) };
})));
```

**Expect. 403 on every one.** The two roster routes matter particularly:
**writing a date exception is an admin capability**, and a therapist reads
theirs rather than setting it.

---

### Step 8.7 - Checkpoint

| | Should be |
| --- | --- |
| Therapist A's Overview | Four figures, each agreeing with the screen it opens |
| Profile | Bio and languages saved instantly; both credentials declined, editable again, public profile never changed |
| My Patients | Patient A only; Therapist B sees neither them nor the toggle |
| Suggestion | One accepted and booked, one declined and costing nothing, a second one refused |
| Earnings | Delivered work only, travel in full, a payout requested |
| Refusals | 403 on all six routes |

---
