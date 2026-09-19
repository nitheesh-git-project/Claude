## 14. Part 13 - Who may do what

**What this part does.** Checks the access model where it is actually enforced - in the routes, not in the sidebar - plus the settings that change other screens, the log, and signing in as somebody else.

**Time.** About 60 minutes.

> **Every check here needs a second browser.** Each scoped admin is a different session. Sign in as one, run its checks, sign out, and move on.

---

### Step 13.1 - Each desk lands on its own dashboard

**Do this.** Sign in as each of the four admins in turn and read the Today screen **before** touching anything.

| Signed in as | Expect the dashboard to lead with |
| --- | --- |
| Master Admin | Everything, unchanged |
| `qa.admin.ops@example.test` | **Unassigned sessions** |
| `qa.admin.finance@example.test` | **What is owed to therapists** |
| `qa.admin.clinical@example.test` | **Recommendations a patient is waiting on** |

**Expect, on each**

* The dashboard **names itself twice**: in the sidebar brand above *Admin Panel*, and again as the eyebrow over the section heading - `Master Admin`, `Operations`, `Finance`, `Clinical`. Twice because the sidebar collapses on a phone and the header is on every screen at every width. Four dashboards that all said "Admin Panel" and differed only in which entries were missing is the failure.
* Each of the three limited desks gets a **"Your access"** card naming which sections that desk covers. A Master Admin does **not** - a shorter sidebar with no explanation reads as a fault, and a full one needs no note.
* **Every quick action lands somewhere that desk can actually open.** Tap all of them. An action that lands back on Today is the exact defect this rule exists for: a finance admin's "All sessions" used to do that silently.
* The "needs you" figure **agrees with the queue list beneath it**, and counts only queues that desk can **work** - a section they can only read holds no work for them.

---

### Step 13.2 - The sidebar is presentation; the routes are the rule

This is the most important check in the part. A hidden button proves nothing.

**Do this.** Signed in as **`qa.admin.finance@example.test`**, open DevTools → Console and run the sweep:

```js
const routes = [
  "/api/admin/approve-account",
  "/api/admin/assign-therapist",
  "/api/admin/create-booking",
  "/api/admin/cancel-appointment",
  "/api/admin/update-treatment-category",
  "/api/admin/review-care-plan",
  "/api/admin/save-therapist-availability",
  "/api/admin/set-admin-scope",
  "/api/admin/clear-activity-log",
  "/api/admin/activity-log",
];
console.table(await Promise.all(routes.map(async (route) => {
  const r = await fetch(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return { route, status: r.status, body: (await r.text()).slice(0, 100) };
})));
```

**Expect: 403 on every row.** Then repeat the whole sweep signed in as **Operations** and as **Clinical**.

**A `400` anywhere in the table is its own finding.** It means that route read the request body **before** deciding whether the caller was allowed - the check ran after the parsing. Report it against this step.

**Then check the one `view` grant is real.** As **Finance**:

| Try | Expect |
| --- | --- |
| Open **Sessions → All Sessions** | It **opens**. Finance reads Sessions - the question "what was this ₹1,200 for?" was answerable only by asking somebody else. |
| Cancel or assign a session from that screen | The control **does not render**. A control an admin's scope cannot call must not be on screen, or they get a 403 with nothing to explain it. |
| Call `cancel-appointment` from the console anyway | **403.** |

That combination - open the screen, cannot change a row - is what makes `view` a real level rather than a label.

---

### Step 13.3 - Complete a session from the wrong desk

**Do this.** As **Finance**, find a completed-eligible session and try to mark it complete, both from the screen and from the console:

```js
const r = await fetch("/api/appointments/complete-session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ appointmentId: "<a paid, past session id>" }),
});
({ status: r.status, body: await r.text() });
```

**Expect.** Refused. Completing a session is what creates the payout obligation, and Finance holds Sessions at `view` precisely so the person reconciling the books cannot change what they are reconciling. The buttons are hidden on the same test.

---

### Step 13.4 - Change a setting and watch the feature change

Settings are only real if something downstream moves. Check each of these, then put it back.

| Change | Where | Then check |
| --- | --- | --- |
| Online booking lead time `12` → `48` | Settings → Booking Rules | `/book` now offers nothing sooner than 48 hours out, and a direct booking at the old boundary is refused **409** with `Please pick a slot at least 48 hours from now.` **Existing bookings are untouched.** |
| Online cancellation window `24` → `72` | Settings → Booking Rules | Step 3's notice re-words itself, and a session 48 hours away now falls **inside** the window: the dialog says it will not be refunded, and **no refund is processed**. The **home-visit** dialog must not change - it reads its own setting. |
| Booking languages: add `Hindi` and `Kannada` | Settings → Booking Rules | Three chips on Step 1, in order, first auto-selected. Then remove them all: refused with `Keep at least one language - booking needs something to offer.` |
| Automatic therapist assignment **on** | Settings → Programmes & Home Visits | A newly paid session assigns itself **only** when exactly one therapist is unambiguously free, or when it is the one the patient asked for. With two free, it stays in the queue - assigning the wrong clinician is far worse than the wait. |
| Session Completed cutoff | Settings → Booking Rules | Every join control past it reads **Session Completed**, on **all four** dashboards including the admin's |
| Idle timeout `1` minute | Settings → Booking Rules | A patient left idle is signed out to **their own** login page. `0` means off. **Admins are exempt entirely** - check an idle admin is not signed out. |

**And one regression that must *not* happen.** Change **QA Therapist A's roster** - remove a whole morning - then open `/book` as a patient.

**Expect.** `/book` offers **exactly the same times as before.** The roster is the clinic's planning record for who can be *offered* work; it deliberately does not filter the patient's picker, which applies the lead-time rule alone. A picker that narrows when a roster changes is a **P1** here, not an improvement.

**Then check the roster did not touch a booking.** Remove hours that an existing session sits in.

**Expect.** The screen **names who is affected** and says the session stays as booked. Nothing cancels, moves or flags it. The booking wins.

---

### Step 13.5 - Sign in as somebody else

**Do this.** As the **Master Admin**, open Patient A's profile and use the control that opens their dashboard as them.

**Expect**

* You are asked for a **reason**, at least ten characters. Try `test` - refused. Use `Patient reports the booking screen fails on submit.`
* The browser genuinely **becomes** that account - same routes, same data, same controls, every write real.
* An **amber bar sits above every dashboard screen**, naming the account, saying the actions are real, counting the window down, and carrying **Exit**.
* **Exit** puts you back as yourself.

**Then the four refusals:**

| Try | Expect |
| --- | --- |
| As **Operations**, **Finance** or **Clinical** | Refused. This is full scope only - a section scope would hand it to whoever can edit a phone number. |
| Opening **another admin** as somebody | Refused. That is one admin using another's authority. |
| Opening a **suspended** account | Refused. |
| Leaving the tab open past the window | The session **ends** - a forgotten tab is an open window into a health record. |

**And check the record.** As the Master Admin, confirm a row exists naming who, whom, when and why - **written before the swap**, so a session with no record behind it cannot exist. Everything done during the window is written **as that user**: no column anywhere says an admin was at the keyboard, which is a real cost of the swap and is why the window's own start and end times are the only thing a later reader can line an action up against.

---

### Step 13.6 - The log

**Who you are.** The Master Admin - **Logs** is this desk's alone.

**Do this**

1. Open **Logs → All Activity**.
2. Search for a patient's name. Filter by type. Set a date range.
3. Tap any row.
4. Tap the **subject** inside that row's detail.
5. Export it, both formats.

**Expect**

* Every action this run has taken is there: approvals, assignments, the settlement, the goodwill discount, the recommendation decisions, the credit adjustment, the impersonation, the reset from Step 1.2.
* A row's detail says **what changed from what**, not merely that something changed. `patient.update_contact` names the old and the new address - an entry saying a sign-in address was altered without saying what it had been is unusable for the one question it gets asked.
* **Nothing is dropped**: an unrecognised field is listed plainly, with the raw data behind a toggle.
* Values are **read, not printed raw** - money as rupees, timestamps as dates in clinic time, booleans as Yes/No, an absent value as a dash. The word "paise" never reaches the screen.
* The **four note routes record a length, not the text** - a note about one patient must not be reproduced across the back office.
* **No generated password appears anywhere in the log.**
* Step 4 opens that subject's whole timeline, keyed on the **id** rather than the name - so a patient renamed between two entries is still one person. An entry with no subject id offers no timeline rather than one built by guessing.
* Opening the timeline **closes** the entry behind it. Two stacked dialogs over a table leave a reader unable to tell which Escape closes what.

**Then try to clear it.**

**Expect**

* The **Clear** button is locked until a copy has actually been **downloaded** - not a checkbox saying one was. A record that is gone and was never kept is destroyed; one downloaded first has only been moved.
* A cutoff inside the **last 30 days** is **refused**, at every setting. The newest month - where anything worth hiding would be - is out of reach.
* The clearing **logs itself**, with the cutoff and the count, and that row is inside the protected window, so a clear can never remove the record of a clear.
* The count of what is about to go is taken **server-side**, not from the page you are looking at.

**And check the three other desks cannot open it at all.** As Operations, Finance and Clinical:

| Try | Expect |
| --- | --- |
| The **Logs** entry in the sidebar | Absent |
| `?section=logs` in the URL | Lands somewhere else, **and says why** in one amber line rather than silently redirecting |
| The two Logs routes from the console | **403** |

**But each of them does read their own desk's work.** Open **Today → Activity** as Operations.

**Expect.** Entries whose action belongs to a section they can work **and** whose actor sits at that desk. It will look **sparse** - in a small clinic the Master Admin does most of the work - and the screen says the list is their desk's rather than showing an empty screen that reads as "nothing happened".

---

### Step 13.7 - Suspend and delete

**Do this**

1. As the Master Admin, **suspend** `QA Admin Operations` from Settings → User Access.
2. In their still-open browser, reload and run one console call.
3. Try to suspend **yourself**.
4. Try to narrow the **last** Master Admin.
5. Try to **delete** an account with history - Patient A.
6. Create a throwaway account and delete **that**.

**Expect**

* Step 2: locked out on the screen **and** at the route. A suspension that only the app enforces leaves a valid cookie reaching the data layer directly - this check is why both halves exist.
* Steps 3 and 4: both **refused**. Nobody changes their own scope, and the last Master Admin who can still sign in cannot be narrowed - a single mis-click would lock everyone out permanently.
* Step 5: **refused, with the counts named** - how many sessions, purchases, payments and records point at that account - and **suspension offered beside them**. It is not a policy: deleting "properly" would mean deleting the money and the clinical record with it.
* Step 6: deletes. The audit row is written **before** the delete, since afterwards there is no row left to name.
* Deleting is **full scope only**, checked directly - every desk that manages People can already suspend, and this one is irreversible.

Restore `QA Admin Operations`.

---

### Step 13.8 - The doors a stranger can reach

**Do this.** In a **private window**, signed into nothing, run the anonymous sweep:

```js
const routes = [
  "/api/appointments/create",
  "/api/appointments/cancel",
  "/api/patient/condition-profile/submit",
  "/api/therapist/save-availability",
  "/api/therapist/care-plan/submit",
  "/api/hospital/withdraw-referral",
  "/api/admin/approve-account",
  "/api/admin/settle-therapist-payout",
  "/api/medical-documents/view",
  "/api/razorpay/create-order",
];
console.table(await Promise.all(routes.map(async (route) => {
  const r = await fetch(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return { route, status: r.status, body: (await r.text()).slice(0, 100) };
})));
```

**The private window is the test.** Running this where you are signed in sends that user's cookie and proves nothing.

**Expect.** **401** or **403** on every one. None returns 200, and none leaks data in the error body.

**Then four malformed bodies at one route:**

```js
const route = "/api/appointments/create";
const bodies = {
  "invalid JSON": "{not json",
  "empty body": "",
  "an array": "[]",
  "a bare string": "\"hello\"",
};
console.table(await Promise.all(Object.entries(bodies).map(async ([name, body]) => {
  const r = await fetch(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  return { name, status: r.status, body: (await r.text()).slice(0, 100) };
})));
```

**Expect.** Always **4xx**, never a **500**, and never a crash. A 500 here means the body was parsed without being caught - the request was the caller's to get right, so the honest answer is 400.

**And check the tampering refusals:**

| Try | Expect |
| --- | --- |
| As a patient, send `{"role":"admin"}` to a profile-update route | Ignored or refused. Never trust a role from a browser. |
| As a patient, send somebody else's appointment id to `cancel` | Refused |
| Send a booking amount in the body of `create-order` | The amount is **re-derived server-side** from the category row, whatever you send |

---

### Step 13.9 - Knock on a public door repeatedly

**Do this.** In a private window, call the area lookup about twenty times in a row:

```js
for (let i = 0; i < 20; i++) {
  const r = await fetch("/api/home-visit/check-area", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pincode: "560038" }),
  });
  console.log(i, r.status);
}
```

**Expect**

* After a while, **429**.
* The message carries **no numbers** and **no blame** - a limit is reached by a shared office address or a connection retrying far more often than by anybody doing anything wrong, and "Too many attempts" reads as an accusation to all of them. The concrete wait, if any, is composed separately from a measured value.
* **A 429 is not a "no".** Check the screen that calls this: a patient holding a good registration link must never be told it has **expired**, and a patient must never be told the clinic does **not visit their address**, because the app could not ask. The honest state is "we could not check", and it is a third answer rather than a falsy one. Either of those wrong messages is a **P1**.

---

### Step 13.10 - Check the back office is never named to outsiders

**Do this**

| As | Open | Expect |
| --- | --- | --- |
| A signed-in patient | `/admin/dashboard` | Redirected to **`/get-started`** - never to `/admin/login`, which would confirm the back office exists and name its door |
| Signed out | `/admin/login` | It renders (it is the real door) but is marked not to be indexed |
| A signed-in therapist | `/patient/dashboard` | Bounced. Each role reaches only its own. |

**And one response body worth reading.** In a private window with no session at all:

```js
const r = await fetch("/api/admin/stop-impersonation", { method: "POST" });
({ status: r.status, body: await r.text() });
```

**Expect.** Whatever it answers, it must **not** name `/admin/dashboard` or `/admin/login` to a stranger. A route can leak the back office in what it *says* as well as in what it lets you do.

---

### Step 13.11 - Check the response headers

Not everything that protects a patient is on screen. These ship on every
response and cost nothing to check.

**Do this.** Open any page, DevTools → **Network**, click the document request,
and read **Response Headers**.

**Expect** to find all of these:

| Header | Should be |
| --- | --- |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | present |
| `Strict-Transport-Security` | present (on an HTTPS deployment) |

**Why each matters here.** Without the first, the admin dashboard and a
patient's health profile can be framed by any site on the internet. Without
the third, a referral token or an appointment id sitting in a URL travels to
third parties as a full referrer.

**One you should expect to see complaints about.** A content-security policy
may be present in **report-only** form, logging violations without blocking
them. That is deliberate: Razorpay's checkout injects its own script and
frame, and a policy written blind takes down checkout, which is the one
failure a payment screen must not have. Console warnings from a report-only
policy are **not** a defect - note them and move on.

---

### Step 13.12 - A patient's route answers a patient

Three routes on the patient dashboard used to answer a therapist or a hospital
with a **200**. Nothing cross-account leaked - each acts on the caller's own
row - which is exactly why it survived unnoticed.

**Do this.** Sign in as **QA Therapist A**, then run:

```js
const routes = [
  "/api/patient/dismiss-onboarding",
  "/api/patient/previous-therapists",
  "/api/patient/condition-profile/export",
];
console.table(await Promise.all(routes.map(async (route) => {
  const r = await fetch(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return { route, status: r.status, body: (await r.text()).slice(0, 80) };
})));
```

Repeat signed in as the **hospital**.

**Expect.** Refused on every one, in both runs. The sharpest of the three is
the export: a 200 there hands a non-patient a typeset PDF of an empty health
record **named after them**.

**And check the suspended case too.** Suspend that therapist, then re-run.
Still refused - a suspended account must not keep acting as itself.

---

### Step 13.13 - Checkpoint

| | Should be |
| --- | --- |
| Four dashboards | Each leading with its own figure, naming itself twice, every action reachable |
| Route sweeps | 403 across all three limited desks; 401/403 anonymously |
| Malformed bodies | 4xx, never 500 |
| Impersonation | One session, recorded with a reason, exited |
| Logs | Read, exported, clear refused inside 30 days |
| Rate limit | A 429 seen, worded without numbers or blame |

---
