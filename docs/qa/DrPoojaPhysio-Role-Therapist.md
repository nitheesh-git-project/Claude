## 1. Who this is, and what must exist first

**The account.** A clinician who delivers care. They self-register, wait for
an admin to approve them, and then own one dashboard: their roster, their
assigned sessions, their patients' clinical records, the recommendations they
write, and what they are owed.

**What a therapist is not.** They do not set prices, they do not see a
patient's email address, they do not book a session, they do not approve
their own credentials, and they do not write a date exception on their own
roster. Every one of those is checked in this plan, because each is a rule
the screen and the route both have to keep.

**The accounts this plan uses.** All of them use the same password, and every
address ends `@example.test`, a reserved domain that cannot deliver to a real
inbox.

| Label | Email | Password | Why this plan needs them |
| --- | --- | --- | --- |
| **Therapist A** | `qa.therapist.a@example.test` | `QaTest!2024pass` | The main journey. Assigned, delivers, writes, is paid. |
| **Therapist B** | `qa.therapist.b@example.test` | `QaTest!2024pass` | Never assigned to Patient A. Proves one clinician cannot reach another's patient. |
| **Therapist C** | `qa.therapist.c@example.test` | `QaTest!2024pass` | Registers and is left **unapproved**, so the waiting screen has somebody on it. |

Their details, used where the steps name them:

| | Therapist A | Therapist B |
| --- | --- | --- |
| Full name | `QA Therapist A` | `QA Therapist B` |
| Phone | `+91 98765 43220` | `+91 98765 43221` |
| Qualification | `MPT (Orthopaedics)` | `MPT (Neurology)` |
| Years of experience | `12` | `8` |
| Specialist in | `Lower back and post-operative knee rehabilitation` | `Stroke and Parkinson's rehabilitation` |
| Languages | `English, Kannada, Hindi` | `English, Tamil` |
| Revenue share (set by the admin) | `60%` online, `65%` home visit | `55%` online, `60%` home visit |

### 1.1 Before you start

A therapist cannot do anything until somebody has built a clinic around them.
Each line below is one line of somebody else's plan.

| Must exist | Set up by |
| --- | --- |
| At least two treatment categories, priced and active | Master Admin |
| A six-session programme under one of those categories, marked recommendable | Master Admin |
| Home visits **on**, one service area, one single-visit package | Master Admin |
| A patient who has paid for a session | Patient |
| An admin who can approve accounts, assign sessions and settle payouts | Master Admin |
| Therapist-Suggested Sessions **on** (Settings → Programmes & Home Visits) | Master Admin |

**The figures this plan quotes** assume `QA Back & Spine Care` at **₹1,999**,
a six-session programme at **₹9,999**, a home visit at **₹2,499** plus
**₹150** travel, and Therapist A on **60% / 65%**. If yours differ, the
arithmetic changes and the rules do not.

### 1.2 How to record a result

Mark every step **Pass**, **Fail**, **Blocked** or **N/A**. Raise a failure
with: the step id, what you did, what you expected, what happened, a
screenshot, any console error in full, how many times out of how many it
reproduced, and **which account you were signed in as**.

**Severity.** **P0** - money, clinical data or access control is wrong: stop
and report. **P1** - a main journey is broken with no workaround. **P2** -
wrong with a workaround. **P3** - cosmetic.

### 1.3 Calling a route without a terminal

Several steps call an API directly, because this application enforces its
rules twice - once in the screen, once in the route - and a hidden button
proves only the first. Sign in as the person the step names, press **F12**,
open **Console**, paste and press Enter:

```js
const r = await fetch("/api/some/route", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ some: "value" }),
});
({ status: r.status, body: await r.text() });
```

The request is same-origin, so the browser attaches that account's cookie
itself. For a **different** user use a second browser profile, not a second
tab - tabs share cookies. Never paste the URL in the address bar: that sends
a GET, these are POSTs, and you will get 405 and think you found something.

---

## 2. Becoming a therapist

### `TH-01` - Register, and wait · P1

**Do this**

1. Signed out, open `/therapist/register`.
2. Fill in Therapist A's details from the table in §1, with password
   `QaTest!2024pass`.
3. Submit.
4. Repeat for Therapist B and Therapist C.

**Expect**

* **You are signed in immediately.** There is no "check your email" step
  anywhere in this flow - email confirmation is off in this product by
  design, and the admin's approval is the only gate. **A sign-up that asks
  you to confirm an address is a P1**, and means the Supabase project has had
  that setting turned back on.
* You land on `/pending-approval`, which says what is waiting and on whom.
* Signing out and back in returns you to the same waiting screen, not to a
  dashboard.

### `TH-02` - What an unapproved therapist cannot reach · P0

Stay signed in as **Therapist C**, who nobody has approved.

| Try | Expect |
| --- | --- |
| Open `/therapist/dashboard` | Bounced to `/pending-approval` |
| Open `/therapist/dashboard/earnings` | The same |
| Open `/admin/dashboard` | Redirected to **`/get-started`**, never to `/admin/login` |
| Look at `/team` | Therapist C is **not** on it |

Then in the console, as Therapist C:

```js
const r = await fetch("/api/therapist/save-availability", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
({ status: r.status, body: await r.text() });
```

**Expect** a refusal, not a 200. The waiting screen is a door, not a curtain:
a session cookie can call a route around the UI, so the route has to refuse
too. **A 200 here is a P0.**

### `TH-03` - Approval, and what it changes · P1

**As the admin**, open **Today → Approvals** and approve Therapist A and
Therapist B. Leave Therapist C pending - the rest of this plan needs somebody
on that screen.

**Expect**

* Both therapists' next page load lands on `/therapist/dashboard`.
* **Both now appear on `/team`** - `visible_on_team` defaults to true, so an
  approved therapist belongs there at once. If `/team` still shows the old
  list after a reload, that page's cache was not invalidated by the approval:
  **P2**.
* Therapist C is still absent from `/team` and still on the waiting screen.

---

## 3. The therapist's own dashboard

### `TH-04` - Read the Overview before tapping anything · P1

**Do this.** Sign in as Therapist A and open `/therapist/dashboard`.

**Expect**

* The header greets them by name and states **what they are paid and how they
  are rated**: `Your Revenue Share: 60%` and, before any rating,
  `No ratings yet`. Once Step `TH-18` has left a rating it reads
  `Your Rating: 4.0 (1 rating)`. If the admin has hidden that rating from the
  public pages, the line ends ` - hidden from public pages`.
* The greeting is `Your practice today`, and the headline names the **next**
  session and its patient - or, with nothing booked,
  `No sessions booked yet - keep your availability open and the clinic assigns work to it.`
* Four figures, in this order: **Today**, **Upcoming**, **Notes to write**,
  **Owed to you**.
* Then the feed, then quick actions. Every dashboard in this product is that
  shape, in that order, because that is the order people ask "how am I doing
  / what needs me / what do I do next".

### `TH-05` - Every figure agrees with the screen it opens · P2

| Tap | Lands on | The count there should |
| --- | --- | --- |
| **Today** | the session list | match, with `Next at H:MM` beneath the figure |
| **Upcoming** | the session list | count confirmed **and** awaiting-assignment work |
| **Notes to write** | `/therapist/dashboard/sessions` | match the delivered sessions with nothing written |
| **Owed to you** | `/therapist/dashboard/earnings` | match, as a rupee figure |

**Also expect**

* **Notes to write** is amber above zero and emerald at zero, reading
  `Every delivered session is written up`.
* **Owed to you** carries its state: `Not yet requested`,
  `Payout request under review`, or `Payout request sent`.
* **A figure that disagrees with the list it opens is a P2** - and it is the
  commonest defect in this product's history, so look properly rather than
  glancing.

### `TH-06` - The four quick actions all land somewhere real · P2

Tap each and come back.

| Action | Must land on |
| --- | --- |
| Set your availability | `/therapist/dashboard/availability`, **with the weekly editor on screen** |
| Your assigned sessions | `/therapist/dashboard/sessions` |
| Patient health profiles | `/therapist/dashboard/health-profile` |
| Earnings and payouts | `/therapist/dashboard/earnings` |

**A quick action that reloads the Overview and changes nothing is a defect.**
Availability in particular is its own route, not an anchor.

### `TH-07` - No patient contact detail is on this screen · P0

Read the whole Overview - every figure, every feed item, every quick action -
and confirm **no patient's phone number or email address appears anywhere on
it**.

A patient's phone is masked on every therapist surface and their email is not
loaded there at all. The real number comes one session at a time and is
logged (`TH-17`). **A plain number or an address on this screen is a P0**:
this is the control that keeps treatment being paid for through the platform.

### `TH-08` - Back to the public site, and the way out · P3

| Try | Expect |
| --- | --- |
| Find **Back to Home** in the sidebar | Present in all three renders: expanded, collapsed rail, and the mobile drawer |
| Tap it | The public home page, still signed in |
| Press the browser Back button | Back on the dashboard, not signed out |
| Use the header **Refresh** button | The screen re-runs; the button is disabled while it does |

Without an explicit link the only exit from a dashboard is Log Out, which
also ends the session. **A dashboard with no way back to the site is a P2.**

---

## 4. The roster

Availability is three separate things and must read as three: a **weekly
schedule** (what you normally work), **exceptions** (a date that differs), and
**time off** (off the roster entirely). Nothing here books, moves or cancels
an appointment.

### `TH-09` - The weekly schedule, as periods not cells · P1

**Do this**

1. Open **Set your availability**.
2. Set Monday to Friday, **9:00 AM - 1:00 PM** and **2:00 PM - 6:00 PM**.
3. Save.
4. Reload the page.
5. Add Saturday **10:00 AM - 1:00 PM** and save.

**Expect**

* You are editing **working periods**, not an eighteen-column grid of hourly
  cells. Nobody edits an hour.
* Step 3 confirms with a sentence naming what was saved.
* Step 4: everything reads back exactly as entered. A period that comes back
  an hour short or an hour long is a **P1** - the periods are converted to
  hour rows underneath, and that conversion has to round-trip.
* An end time before its start is refused.
* Overlapping periods on one day are refused or merged, and whichever it
  does, it says so.

### `TH-10` - A stale save, and a double-clicked one · P1

This is a compare-and-swap under a real row lock, and the two failure modes
are deliberately different.

**Do this**

1. Open the availability screen in **two tabs** of the therapist's browser.
2. In tab 1, change Monday to `10:00 AM - 4:00 PM` and save.
3. In tab 2 - which still holds the old version - change Monday to
   `8:00 AM - 12:00 PM` and save.
4. Now reload both tabs. In one, **double-click Save** without changing
   anything.

**Expect**

* Step 3 is **refused with a 409** and a sentence telling you the schedule
  moved underneath you. It does not silently overwrite tab 1's work.
* Step 4 is a **no-op success**, not an error and not two saves. Two identical
  requests carrying the same version are one logical change.
* **Never a silent overwrite.** If tab 2's save lands and tab 1's work
  vanishes without a word, that is a **P0** for a clinic that rosters from
  two screens.

### `TH-11` - A therapist reads exceptions, and cannot write one · P0

**Do this.** Look for a control that sets a **date exception** - a single date
whose hours differ from the weekly pattern.

**Expect.** There is **none** on the therapist's own screen. They can see an
exception an admin has set; they cannot create one. Widening that is a product
decision, not a screen's.

Now prove the route agrees. In the console, as Therapist A:

```js
const routes = [
  "/api/admin/set-availability-exception",
  "/api/admin/save-therapist-availability",
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

**Expect 403 on both.** A 200 or a 400 that suggests it merely wanted better
arguments is a **P0**.

### `TH-12` - Time off does not clear the schedule · P1

**Do this**

1. Turn **time off** on.
2. Look at the weekly schedule.
3. Turn it back off.
4. Look again.

**Expect**

* The weekly schedule is **untouched** throughout. Leave takes somebody off
  the roster; it does not delete what they normally work, because there would
  then be nothing to restore on the way back. **A schedule emptied by turning
  leave on is a P1**, and it is not recoverable by turning it off again.
* Step 3 restores them to exactly the pattern from `TH-09`.

### `TH-13` - Removing hours a session is booked into · P1

**Do this.** With a confirmed session already in the diary (from `TH-15`),
remove the working period that contains it, and save.

**Expect**

* The save **names who is affected** and says the session **stays as booked**.
* Nothing is cancelled, moved or flagged. The two systems are separate and
  **the booking wins**.
* Reload and check the patient's own screen: their session is exactly where
  it was, at the same time, with the same link.
* **A roster edit that moves or cancels an appointment is a P0.**

### `TH-14` - The roster does not filter the patient's booking picker · P1

**Do this.** With Therapist A rostered **9 AM - 6 PM only**, open `/book` as a
patient and look at the hours offered for tomorrow.

**Expect.** The picker offers the clinic's ordinary bookable hours, **not**
only the hours Therapist A works. The roster is the clinic's planning record -
who can be *offered* a session - and it deliberately does not narrow what a
patient may choose. Only the 12-hour lead time does that.

This looks wrong the first time you see it and is correct. **A picker that has
started following the roster is a P1**, because it is a product change nobody
asked for and it silently shrinks the bookable week.

---

## 5. Sessions: the clinician's half

Part of this overlaps with the patient's plan on purpose - the same session,
from the other side. Where a step says *check the patient's screen*, use a
second browser profile.

### `TH-15` - A session arrives · P1

**As the admin**, assign Patient A's paid session to Therapist A.

**Then as Therapist A**, open **Your assigned sessions**.

**Expect**

* The session is listed with the patient's name, the condition, the date and
  time **in clinic time**, and a meeting link for a video session.
* The **Upcoming** figure on the Overview has moved by one.
* The patient's **phone is masked** on this row and their **email is absent**.
* It is **one list** with filters - Upcoming / Past / Cancelled, and a
  Video / Home visit filter that only appears once this therapist has both.
  Two separate sidebar entries for video sessions and home visits would be
  the same rows listed twice: **P2**.

### `TH-16` - The join window, and what the button says outside it · P1

| When | The control should read |
| --- | --- |
| More than the join window before the slot | Not yet joinable, and it says when |
| Inside the join window | **Tap to Join**, opening the meeting |
| After the Session Completed cutoff | **Session Completed** |

**Expect**

* The cutoff is an admin setting in minutes after the slot time, and it reads
  **the same way on every screen a session appears on** - the therapist's, the
  patient's and the admin's. A session an hour past its start that still says
  "Tap to Join" on one screen and "Session Completed" on another is a **P1**.
* A **home visit** has no meeting link at all, by design. There is nothing to
  join - the therapist is going to the address. **A home visit showing a
  broken or missing-link error is a P2**, and one showing a Meet link is a
  **P1**.

### `TH-17` - Reveal a patient's phone, and leave a trace · P0

**Do this**

1. On an upcoming **video** session, well before its join window, look for the
   control that reveals the patient's phone number.
2. Wait until inside the join window and use it.
3. On a **home visit**, use it on the visit's own day.
4. On a **cancelled** session, try.
5. **As the admin**, open the contact reveal log.

**Expect**

* Step 1: refused, or the control is absent. Outside the window there is no
  reason to have it.
* Step 2: the **full number** appears, once, for that session.
* Step 3: allowed at any time on the day of the visit - a therapist driving
  to somebody's house needs to be able to ring them.
* Step 4: **refused**. A cancelled session is not a reason to reach anybody.
* Step 5: **every** reveal above is in the log, with who, which patient and
  when. The log is admin-read-only and append-only.
* **A reveal that is not recorded is a P0.** This one route refuses rather
  than proceeding if it cannot write its own trace - which is the opposite of
  how the audit log behaves, and deliberate.

### `TH-18` - Completing a session, and the two refusals · P0

Completing is a financial write with a clinical name: `completed` **and**
`paid` is the exact condition that makes the therapist's share payable.

**Do this**

| Try | Expect |
| --- | --- |
| Complete a session **before** its join window has opened | **Refused.** A therapist could otherwise be owed for a session that had not started |
| Complete a session with **no payment** behind it | **Refused** |
| Complete a **cash home visit** before recording the cash | **Refused.** Collect first, which is the right order anyway |
| Complete a paid, in-window session | Succeeds, and **Notes to write** goes up by one |

**Then the admin's override.** As the Master Admin, complete a session that
the therapist was just refused - a backfill or a correction is exactly what
that lane is for.

**Expect.** It works. An admin is subject to neither gate.

**And the desk that may not.** Sign in as the **Finance** admin and try the
same thing.

**Expect. Refused.** Finance reads Sessions and cannot change one: the whole
point is that the person reconciling the books cannot close the session that
creates the payout obligation. **Finance completing a session is a P0.** The
two buttons should not render for them either - a control an admin's scope
cannot call must not be on screen.

### `TH-19` - The session note, and the 24-hour window · P1

**Do this**

1. On the completed session, open the note dialog.
2. Fill in what was treated, how the patient responded, the home exercise and
   the plan for next time.
3. Save.
4. Edit it, and save again.
5. **As Patient A**, look everywhere for that note - the session card, the
   health profile, the PDF export.

**Expect**

* The note saves, and the **Notes to write** figure falls by one.
* Step 4 is allowed **inside 24 hours** of the session, and what it replaced
  is kept as a revision. Past the window, editing is refused.
* Step 5: **the patient can see none of it, anywhere.** These are working
  notes written in the register clinicians use with each other, and they are
  excluded from the patient's data export and printable profile on purpose.
  **A session note reaching a patient on any surface is a P0.**
* Completion was never blocked on writing one. The nudge is a feed item and
  the Overview figure, not a gate.

### `TH-20` - The contact scanner: what is refused and what is recorded · P0

Every string one role writes and another reads is scanned. There are two
tiers, because a scanner that treats digits as suspicious fires on every dose
and every exercise prescription.

**Do this.** In a session note or a suggestion note, try each of these in
turn:

| Type this | Expect |
| --- | --- |
| `Pay me directly at qatherapist@okaxis` | **Refused.** The write does not land. A payment handle is a block-tier hit |
| `https://razorpay.me/@qatherapist` | **Refused.** A payment link is the same tier |
| `Call me on 9876543210` | **Delivered, and recorded.** A phone number is flag tier |
| `Reach me at qa.therapist.a@gmail.com` | **Delivered, and recorded** |
| `3 sets of 12, twice daily, 10 second holds` | **Delivered, and nothing recorded.** Clinical text full of numbers is left alone |
| `Order ref 4455667788` | **Delivered, and nothing recorded.** Phone matching is the Indian mobile shape, not a loose digit run |

**Then as the admin**, open the flagged-messages panel.

**Expect** the two flag-tier writes are there with the text quoted, and the
two block-tier attempts are visible as refusals. That panel is
**Master-Admin-only** - it quotes what a colleague wrote.

**A payment handle that lands is a P0.** So is a clinical instruction that is
refused: a check that cries wolf is a check nobody reads, and this one runs
over medical text.

---

## 6. The patient's clinical record

### `TH-21` - Triage a patient, and write the first record · P1

A patient's health record does not exist until a therapist triages them. This
needs only that the therapist is **assigned**, and it writes **live** with no
review step - because the approval queue cannot sit in front of the first
record ever existing, and the patient is locked out of their own health
profile until it lands.

**Do this**

1. Open **Patient health profiles** and pick Patient A.
2. Open the triage dialog and answer its four questions.
3. Read the suggested condition type **and its stated reason**.
4. Accept it, and fill the seven questions that follow.
5. Submit.
6. **As Patient A**, open the health profile.

**Expect**

* Step 3: the suggestion is a **suggestion**, with the reason shown, and is
  never auto-accepted. You can override it.
* The therapist's dialog shows **everything at once with headings** - a
  clinician filling this in after every assignment wants to scan it. The
  patient's version paces it one question at a time; that difference is
  deliberate and both are correct.
* Step 5 goes **live immediately**. No queue.
* Step 6: the patient's record now exists and **they can now edit it**. Before
  this step they were read-only, with the call to action and the answered
  counter **absent** rather than greyed out.
* The onboarding is recorded in the ordinary **Review History** as an
  already-approved entry. Live is not unrecorded.

### `TH-22` - Submitting the same thing twice writes nothing · P1

**Do this.** Submit the identical intake again, unchanged. Then **tap submit
ten times in a row** on an unchanged form.

**Expect**

* **Nothing at all is written** - no record update, no history entry. The test
  is whether the request changed anything clinical, not who got there first.
* Ten taps produce **zero** new history entries, not ten and not two. Two is
  the answer a naive fix gives, because the route has an insert path and an
  update path and a burst splits across both; both callers then believe they
  were first. **Two entries here is a P1.**
* Change one answer and resubmit: **one** entry, correctly.

### `TH-23` - Re-triage keeps the previous record · P0

**Do this.** Re-triage Patient A to a **different** condition type -
neurological if they were orthopaedic - and fill the new set.

**Expect**

* The new record renders with the new type's questions, summary card,
  snapshot figures and progress line.
* **The previous specialty's answers are still there**, hidden rather than
  deleted. Re-triage merges; it does not replace.
* **A re-triage that wipes the orthopaedic record is a P0** - it is a
  patient's clinical history deleted by a dropdown.
* The "we've changed some of these questions" banner does **not** fire at
  every patient just because one type's questions were versioned.

### `TH-24` - The Pain Map is orthopaedic, and stays one · P1

**Do this**

1. On an **orthopaedic** patient, open the body map.
2. Tap a region on the figure and record an exam through the dialog.
3. Record a second exam on the same region.
4. Now open a **neurological** or **paediatric** patient's profile.

**Expect**

* Step 1: front and back **stack on a phone** rather than shrinking each tap
  target below a fingertip.
* Step 2: the region is chosen by **tapping the figure** or a chip, never a
  dropdown, and it stays in the dialog header while you type. Questions are
  **grouped**, not listed flat.
* It posts **live**, with no review step.
* Step 3: a re-assessment is a **new row**, never an edit, so the screen can
  show a trend against the previous visit.
* Step 4: there is **no body map at all** - not a hidden one, not an empty
  one. The other two exam layers are deliberately deferred.
* Every pain figure on screen reads **out of ten**, whatever is stored. A
  percentage sitting beside an out-of-ten figure in the same strip reads as
  two different measurements: **P2**.

### `TH-25` - Read access is automatic; edit access is asked for · P0

**Do this**

1. As Therapist A, read Patient A's health profile and Pain Map.
2. Try to **edit** the live intake record on the patient's behalf.
3. Find the "Request access to edit" card.
4. Request it, and have the admin approve it.
5. Edit, and submit.

**Expect**

* Step 1 needs **no request**: reading their assigned patient's record is
  automatic.
* Step 2 is refused until Step 4. The line is **create versus edit**: writing
  down what a patient told you in a session you ran is your own clinical
  record; editing their live record is editing their own account of their
  history.
* Step 3: the request card is **inside the Pain Map card** - beside the thing
  it unlocks - and states what is readable regardless and what needs
  approval. A gate three sections above what it gates is a **P2**.
* Step 5 goes through **review**, not live.

### `TH-26` - A therapist cannot reach a patient who is not theirs · P0

**As Therapist B**, who has never been assigned to Patient A:

| Try | Expect |
| --- | --- |
| Open **My Patients** | Patient A is **not** listed |
| Open Patient A's health profile by URL | Refused, and **no clinical data renders** |
| Open Patient A's Pain Map by URL | The same |
| Call `/api/therapist/pain-assessments` for Patient A in the console | Refused |

**A path by which an unassigned clinician reads a patient's record is a P0
that stops the run.**

---

## 7. My Patients, and the two ways to look at it

### `TH-27` - One set of rows, two arrangements · P2

**Do this**

1. As Therapist A, open **My Patients**.
2. Find the **Patients / Programmes** toggle and switch between them.
3. Sign in as **Therapist B**, who has no programme patients, and look again.

**Expect**

* The toggle renders the **same** cards arranged differently, not two
  different lists. A session in one view and not the other is a **P1**.
* Step 3: the toggle is **absent** for Therapist B rather than showing an
  empty panel. A screen that can only ever be empty is not offered.
* Patient A's **phone is masked** and their **email is not shown at all**, on
  every card and every detail panel.

---

## 8. Recommending treatment

A therapist recommends; the clinic prices. This is the only route by which a
patient buys a programme.

### `TH-28` - Write a care plan from the session note · P1

**Do this**

1. On the **completed** session from `TH-18`, open the care plan control.
2. Answer the two questions: **which condition**, and **how many sessions**.
3. Fill the four clinical fields: hands-on required, frequency per week, the
   clinical rationale, and the instructions.
4. Submit.

**Expect**

* **There is no price field. No session-count field you type. No discount
  field.** The two answers select exactly one admin-configured package, and
  everything money comes from that row. **A price input anywhere on this form
  is a P0** - it is not a policy anybody enforces here, it is a thing the
  schema cannot express.
* The programmes offered are **narrowed to the chosen session's own
  condition**. A programme for a different condition appearing in this list is
  a **P1**.
* The four clinical fields are yours; the rest is the clinic's.

### `TH-29` - It needs a completed session you ran · P0

| Try | Expect |
| --- | --- |
| Write a plan against a session that is **not completed** | Refused |
| Write one against a session **another therapist** ran | Refused |
| Write one with no source session at all | Refused - the route re-derives the appointment rather than trusting what is sent |

This is what makes "recommend to everyone and see who bites" impossible
rather than merely discouraged. **Any of these landing is a P0.**

### `TH-30` - The clinic approves it before the patient sees it · P1

With **Recommendations require approval** on (the default):

**Do this**

1. Submit a recommendation.
2. **As Patient A**, look at Suggested Sessions and the Health Profile.
3. In the console **as Patient A**, try to create an order against that plan.
4. **As the admin**, open **Sessions → Recommendations** and approve it.
5. As Patient A, look again.

**Expect**

* Step 2: **nothing.** Not a greyed-out card, not a "pending" chip - the plan
  is absent from the patient's screens entirely.
* Step 3 is **refused**. Hiding a card is presentation; refusing the order is
  the rule. **A patient who can pay for an unapproved recommendation is a
  P0.**
* Step 4: the queue is **oldest first**, aged in words rather than dated, and
  each card states **how many sessions that patient already has unused** -
  the commonest reason to turn one down.
* Step 5: now it is there, with the offer window counting from **approval**,
  not from when you wrote it. A plan that waited two days must not reach the
  patient with two days already spent.

### `TH-31` - Rejected, and rewritten · P1

**Do this.** Have the admin turn a recommendation down with the reason:

```
Patient still has four sessions unused on the current programme.
```

**Then as Therapist A**, look at the Overview and at Patient A's chart.

**Expect**

* It is a **needs-you feed item carrying the reason**, and it is **also on the
  patient's chart beside the thread**. Both, because the feed scrolls away and
  the chart is where a clinician goes to rewrite.
* The reason is the actionable half. "Not approved" says it is gone; only the
  reason says what to write instead. **A rejection with no reason reaching the
  therapist is a P1.**
* You rewrite it. The admin does not edit your judgement from the back office.

### `TH-32` - Approved with different numbers · P1

Have the admin approve one **with changes** - a different package.

**Expect**

* A **new version** appears in the thread, attributed to **you** as the
  clinician, and recorded as **entered by the admin**. Your original is still
  there, superseded.
* **Your version is not rewritten.** Versions are append-only; an edit under a
  clinician's name would be a lie about who decided what, and the database
  refuses it anyway. **Your original disappearing is a P0.**

### `TH-33` - A purchased plan is closed · P1

**Do this.** After Patient A has **paid** for the programme, try to write a new
version on that same thread.

**Expect.** Refused - and a later recommendation opens a **new** thread rather
than re-versioning the purchased one. Editing a purchased plan would change
the description of something already paid for.

Also: at most **one open plan per patient**. Try to submit a second while one
is pending or active.

**Expect.** Refused. A patient must never see two competing recommendations.

---

## 9. Proposing the next session

A therapist may **suggest** a time on a programme locked to them. They cannot
book it - the patient does that.

### `TH-34` - Suggest a time · P1

**Do this**

1. Confirm **Therapist-Suggested Sessions** is on.
2. Open Patient A's programme and use the suggest control.
3. Pick a date and hour at least a couple of days out, with the note:

```
Let's keep to Tuesdays while the pain settles.
```

4. Submit. Then try a **second** suggestion on the same programme.
5. **Double-tap** submit on a fresh one.

**Expect**

* The control offers the **same compact calendar and hour chips** the patient
  sees, obeying the same lead time. A raw date box beside an hour dropdown
  could offer a time the patient's own screen would then refuse: **P1**.
* A time like `6:52` cannot be produced at all. Slots start on the hour.
* Step 4 is **refused**: at most one pending suggestion per programme, and it
  is the database that enforces it, not a check the screen does first.
* Step 5 produces **exactly one**, not two.
* **No slot is held.** Nothing is reserved, and your calendar is re-checked
  when the patient answers.

### `TH-35` - The patient answers · P1

**As Patient A**, open **Suggested Sessions**.

| Do | Expect |
| --- | --- |
| Read it | The proposed time and your note, with **Accept** and **Decline** |
| **Accept** | It is booked, **auto-assigned to Therapist A and confirmed**, with its own meeting link, because the programme is locked to you. The balance falls by one **now**, not before |
| **Decline** another | Nothing is spent |
| Let one run inside the 12-hour lead time | It simply **stops being acceptable**. Nothing anywhere writes it as "expired" - the state is worked out when it is read |
| Answer one from **two browsers at once** | One wins, the other is told so. Not two bookings |
| Accept with the network dropped mid-request | The patient is left **exactly where they were**, suggestion still on screen, not cleared into a state that never happened |

**A suggestion that spends a session before it is accepted is a P1** - a
decline would then have to refund one.

### `TH-36` - Withdraw one, and switch the feature off · P2

| Do | Expect |
| --- | --- |
| Withdraw a pending suggestion | It is gone from the patient's screen, and nothing was spent |
| Have the admin switch the feature **off**, then reload | The suggest control is **gone** from your screen |
| Call `/api/therapist/suggest-session` in the console while it is off | **Refused.** A hidden control is not the rule |

Switch it back on before continuing.

---

## 10. Home visits, from the therapist's side

### `TH-37` - A home visit is a different job · P1

**Do this.** With a confirmed home visit assigned to Therapist A, open it.

**Expect**

* The **street address and any access notes** are on the session and on the
  calendar invite. That invite is the only outbound message this platform
  sends - **a home visit whose invite carries a Meet link and no address is a
  P0**, because the therapist is handed a video call instead of somewhere to
  drive to.
* There is **no meeting link**, and the absence is not reported as a failure
  anywhere.
* The address is the one **snapshotted at booking**. Change the patient's
  saved address afterwards and this visit does not move.

### `TH-38` - Recording cash, and who owns the number · P0

**Do this**

1. On a cash-on-visit home visit, record the collection.
2. Look for a field where you type the **amount**.
3. In the console, try to send your own figure:

```js
const r = await fetch("/api/therapist/record-cash-collection", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ appointmentId: "PASTE_THE_ID", amountPaise: 100 }),
});
({ status: r.status, body: await r.text() });
```

**Expect**

* Step 2: **there is no amount field.** The therapist asserts that money
  changed hands; the system owns the number, reconstructed from the purchase.
* Step 3: the `amountPaise` is **ignored**, and the recorded figure is the
  real one. It is not a ₹1 collection. **An accepted client-sent amount is a
  P0** - that figure nets straight off what the therapist owes the clinic, so
  it would be a one-field withdrawal.
* The correction lane belongs to somebody **not holding the money**: an admin,
  on Money, with a mandatory reason and an audit row. Confirm the therapist
  has no such control.

### `TH-39` - Cash shows up as owed back · P1

**As Therapist A**, open **Earnings**.

**Expect.** Cash collected and not yet remitted is shown as **owed back to the
clinic**, and the screen says it will be netted off the next payout. It is
real exposure, not a note.

---

## 11. Earnings, and asking to be paid

### `TH-40` - What the figure counts, and what it does not · P0

**Expect**

* The sidebar word is **Earnings** - the same word the hospital's sidebar
  uses. Money owed *to* somebody is Earnings. A third word for the same thing
  is a **P2**.
* It counts **completed and paid** sessions only. A session paid for and not
  yet delivered contributes **nothing**: a therapist is paid for delivering,
  not for being booked. **A booked-but-undelivered session in this figure is a
  P0** - it deducts a share nobody will ever be paid and understates the
  clinic's take.
* A **forfeited late cancellation** - paid, never delivered - contributes
  **nothing**.
* A **home visit** contributes at the home-visit rate (65%) with the
  **travel fee in full** on top. Travel is a pass-through reimbursement, never
  discounted and never revenue. **Travel split at the revenue share is a P0** -
  the therapist would be funding their own transport.

### `TH-41` - Request a payout, and watch the state · P1

| Stage | Overview's **Owed to you** should read |
| --- | --- |
| Before requesting | `Not yet requested` |
| After requesting | `Payout request under review` |
| After the admin settles it | `Payout request sent` |

**Then try to request twice** without an admin acting in between.

**Expect.** Refused, or a no-op. **Two open requests for one balance is a
P1** - somebody will pay both.

### `TH-42` - The settlement, and what it nets off · P0

**As the admin**, settle Therapist A's payout.

**Then as Therapist A**, check Earnings.

**Expect**

* The transfer is the earned figure **minus the cash they are holding**, and
  exactly those visits are now marked remitted.
* **Check the next payout does not deduct the same cash again.** It is the
  commonest arithmetic bug in a netting model, and it asks somebody to chase
  money already recovered: **P0**.
* If the cash held **exceeds** what is owed, the transfer floors at **zero**,
  the difference stays as still-owed-to-the-clinic, and those collections stay
  open on the admin's cash ledger for a person to chase. It does not go
  negative.

---

## 12. Edit Profile: the line between a detail and a credential

### `TH-43` - What saves instantly · P2

**Do this**

1. Open **Edit Profile**.
2. Under **Public Details**, set:

| Field | Value |
| --- | --- |
| Short Bio | `Works with desk-based patients on posture-driven back pain.` |
| Languages Spoken | `English, Kannada, Hindi` |

3. **Save**, then reload.

**Expect.** Both survive the reload, and **no admin ever saw them**. A bio is
the therapist's own.

### `TH-44` - What the clinic approves · P1

**Do this**

4. Under **Credentials & Specialization**, set **Years of Experience** to `15`
   and **Specialist In** to `Spine, hip and knee rehabilitation`.
5. Tap **Request Changes**.
6. Read the two fields you just changed.
7. Tap **Withdraw** beside **Specialist In**.
8. Request it again and leave it pending.
9. **As the admin**, open **Today → Approvals** and decline both with:

```
Send the council registration number first.
```

10. Back as the therapist, reopen **Edit Profile**.

**Expect**

* Step 5: `Your request has been submitted for admin review.`
* Step 6: each requested field is replaced by its **new** value on a slate
  panel with an amber **Pending Review** chip and a **Withdraw** link, and
  **cannot be edited again** until it is decided.
* **The live profile still shows the old value.** Check `/team` and the
  patient's view of their therapist - neither may change yet. **A credential
  that goes live before approval is a P1**: these are what a patient relies on
  when choosing somebody.
* Step 7: Withdraw returns the field to an editable input immediately, holding
  the **old** value.
* Step 10: editable again, carrying
  `Last request declined: Send the council registration number first.` in red.
  Nothing on the public profile ever changed.
* The note under those fields reads
  `Changes to these fields need admin approval before they take effect.`

### `TH-45` - Photo, password, and visibility · P2

| Do | Expect |
| --- | --- |
| Upload a profile photo | Saves on the spot, no review, and appears on `/team` |
| **Account Security → Send password reset email** | The reset is sent and the screen says so. **No password is ever typed or shown on this screen** |
| Have the admin hide you from `/team` | You come off the public page; your dashboard is unchanged |
| Have the admin **suspend** you | You come off `/team` **immediately** - not five minutes later when a cache lapses. **P2** if the page still lists a suspended clinician |

---

## 13. What a therapist must never be able to do

### `TH-46` - The wrong dashboards · P0

Each signed in as Therapist A:

| Try | Expect |
| --- | --- |
| Open `/admin/dashboard` | Redirected to **`/get-started`** - never to `/admin/login`, which would confirm the back office exists and name its door |
| Open `/patient/dashboard` | Bounced. One account carries one role |
| Open `/hospital/dashboard` | Bounced |
| Open `/book` | The **wrong-account panel**, telling a clinician wanting therapy to sign out and use a separate patient account - not a booking form, and not a bare error |
| Open `/book-home-visit` | The same panel |

**A therapist who can complete a booking is a P0**: that session would be
invisible to every dashboard afterwards, and money would have moved.

### `TH-47` - The route sweep · P0

In the console, as Therapist A:

```js
const routes = [
  "/api/admin/approve-account",
  "/api/admin/settle-therapist-payout",
  "/api/admin/save-therapist-availability",
  "/api/admin/set-availability-exception",
  "/api/admin/create-booking",
  "/api/admin/refund-session-partial",
  "/api/admin/grant-session-credits",
  "/api/admin/apply-goodwill-discount",
  "/api/admin/clear-activity-log",
  "/api/admin/start-impersonation",
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

**Expect 403 on every single one.** Not 404, not 500, and not a 400 that reads
as "give me better arguments" - that is a route that checked the body before
it checked who was asking. **Any 200 is a P0 that stops the run.**

### `TH-48` - Suspension reaches further than the screen · P0

**Do this**

1. **As the admin**, suspend Therapist A.
2. In the therapist's **still-open browser**, reload the dashboard.
3. In the same browser, run the route sweep from `TH-47` again, plus one route
   that is genuinely theirs:

```js
const r = await fetch("/api/therapist/save-availability", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
({ status: r.status, body: await r.text() });
```

4. Have the admin un-suspend them.

**Expect**

* Step 2: bounced to the suspended screen.
* Step 3: **refused**. A suspended account's own routes refuse it too - the
  session was ended, not merely redirected away from. **A suspended therapist
  still saving a roster or reading a patient is a P0**: flipping a column
  without ending the session leaves them acting as themselves indefinitely.
* They are off `/team` while suspended.
* Step 4 restores them to exactly the visibility setting the admin had chosen,
  not to a default.

---

## 14. Sign-off

| | Should be |
| --- | --- |
| Steps run | 48 |
| Pass | |
| Fail | |
| Blocked | |
| N/A | |
| P0 raised | |
| P1 raised | |

**Confirm each of these before signing.**

| | |
| --- | --- |
| Registered, waited, was approved, and appeared on `/team` | ☐ |
| Roster saved as periods, round-tripped, refused a stale save, no-opped a double click | ☐ |
| Leave did not clear the schedule; removing hours did not move a booking | ☐ |
| The patient's booking picker is **not** filtered by the roster | ☐ |
| A session joined in its window, completed only when paid and in-window, and refused to Finance | ☐ |
| A contact revealed inside the window only, and every reveal logged | ☐ |
| A payment handle refused, a phone number recorded, a dose left alone | ☐ |
| A patient triaged, the first record written live, a re-submit writing nothing | ☐ |
| Re-triage kept the previous specialty's answers | ☐ |
| An unassigned therapist reached nothing | ☐ |
| A recommendation written with no price field, held until approved, rejected with a reason, rewritten | ☐ |
| A session suggested, accepted, declined, and never holding a slot | ☐ |
| Cash recorded without the therapist naming the amount | ☐ |
| Earnings counting delivered work only, travel in full, paid once | ☐ |
| Credentials held for approval while the public profile never changed | ☐ |
| 403 on all twelve admin routes, and again after suspension | ☐ |

**Signed** ......................... **Date** .................

**Build / commit tested** .........................

---

**What a clean run of this document proves.** That a therapist's own journey -
approval, roster, sessions, clinical records, recommendations, suggestions and
money - behaved on one machine, in one browser, against test payment keys,
once. It does not prove the other roles' views of the same rows agree; that is
each of their own documents, and the run-order document is where all four are
exercised side by side.
