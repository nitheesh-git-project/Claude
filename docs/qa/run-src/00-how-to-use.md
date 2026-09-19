## 1. How to use this document

### 1.1 What this is

This is **one test run, written in the order you perform it.** Start at Step 1.1, work down, and stop at the sign-off sheet at the end. Every screen, every value you type and every result you check is on the step that needs it.

It is deliberately **not** the reference plan. The companion document, *Complete Manual E2E Test Plan & Feature Guide*, is organised by area - all the patient cases together, all the admin cases together, with a test-data library at the front - which is the right shape for looking something up and the wrong shape for executing. Following it meant scrolling back to a table at the front to find out what to type, then scrolling forward again, over and over. Everything here is where you are.

**Every role is in it, and often on the same step.** This is not a patient
test plan with the other roles bolted on. Four people look at the same
session, the same recommendation and the same money, and the commonest class
of defect is two of them disagreeing - so where a moment involves more than
one role, the step is split by **who you are signed in as**:

> **As the admin** … **As the therapist** … **As the patient** … **As the partner**

Work those blocks in the order they appear. Part 5 is the clearest example:
one session, assigned, joined, completed, noted and rated, with each role's
view of it side by side. Each role also has a part of its own where their
work is theirs alone - the patient at Part 4, the therapist at Part 8, the
partner hospital at Part 10, and the back office at Part 14.

**The run builds its own data.** You will reset the database at Step 1.2 and then create everything the run needs, in the order the application itself would have it created: the catalogue before anyone can book against it, the therapists before anyone can be assigned to one, the patient before there is a session to treat. Nothing is seeded for you, and nothing assumes a fixture that arrived from somewhere else. If a step needs a therapist with a roster, an earlier step made one.

That is also why the order matters more than usual. **Do not skip a step and do not reorder the parts.** A skipped step is usually a missing row three parts later, and it surfaces as a screen that looks broken.

### 1.2 What you need before Step 1.1

| You need | Why | How to check you have it |
| --- | --- | --- |
| The application running at `http://localhost:3000` | Everything | Open it. The home page renders with a teal splash. |
| A **throwaway** Supabase project | Step 1.2 empties it | Open the Supabase dashboard for the project and confirm nothing in it matters. |
| `ALLOW_DEBUG_DATA_RESET=true` in the **server** environment | Step 1.2 | Without it, the reset route answers **404**, not 403. |
| One admin account that already exists | Step 1.2 keeps admins and deletes everyone else | Sign in at `/admin/login`. If you cannot, see Step 1.0. |
| Razorpay **test** keys | Every payment step | The Razorpay sheet says *Test Mode* across the top. |
| Google Chrome or Edge | A handful of steps read the DevTools console | **F12** opens it. |

> **If money can move for real, stop.** Every payment step here uses Razorpay test mode. Check the key in the server environment starts `rzp_test_` before Step 4.6, not after.

### 1.3 The four conventions this run uses

Only four things are defined once rather than at the point of use, because they are true of every step rather than of one:

**1. One password, everywhere you create an account.** Every account you make in this run uses:

```
QaTest!2024pass
```

Where a step needs a *second, different* password - there is one, at Step 12.4 - it says so and gives you the value there.

**2. Emails all end `@example.test`.** `.test` is reserved and cannot be delivered to, so nothing you type here can reach a real inbox by accident.

**3. Times are the clinic's.** Every date and time the application prints is in **India Standard Time**, whatever your laptop is set to. When a step says "tomorrow at 4 PM" it means 4 PM as the screen shows it.

**4. Calling a route without a terminal.** Six steps ask you to call an API route directly, because this application enforces its rules twice - once in the screen and once in the route - and a screen that hides a button proves only the first. You do not need a terminal. Sign in as the person the step names, open DevTools (**F12**) → **Console** on any page of the app, paste, and press Enter:

```js
const r = await fetch("/api/some/route", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ some: "value" }),
});
({ status: r.status, body: await r.text() });
```

The request is same-origin, so the browser attaches that user's session cookie by itself - there is nothing to copy. Four things catch people out, and each step that matters repeats the relevant one:

* **For an anonymous call, use a private window.** Running it in a window where you are signed in sends your cookie and proves nothing.
* **For a different user, use a second browser or a second profile**, not a second tab - tabs share cookies.
* **`r.text()` rather than `r.json()`** when a route answers with no body, or `await r.json()` throws and hides the status you wanted.
* **Never paste the URL into the address bar.** That sends a GET, and these routes are POSTs; you will get **405** and think you found something.

### 1.4 How to record a result

Put a mark against every step as you go. The sign-off sheet at Step 15.1 asks for the totals.

> **Keep four browsers or profiles open.** Tabs in one browser share cookies,
> so signing in as the admin in a second tab signs the patient out of the
> first. Chrome for the patient, a private window for the admin, and two more
> profiles (or a second machine) for the therapist and the hospital.

| Mark | Means |
| --- | --- |
| **Pass** | The expected result happened, all of it. |
| **Fail** | Any part of the expected result did not happen. Raise it with the template below. |
| **Blocked** | You could not run the step because something earlier failed. Name the step that blocked it. |
| **N/A** | The step's feature is switched off in this environment on purpose. Say which setting. |

**Raise a failure like this.** The two lines people leave out are the last two, and they are the two that decide whether anyone can act on it.

```
Step:            4.6
What I did:      Paid for the Back & Spine consultation with card 4111 1111 1111 1111
What I expected: Confirmation screen, session listed as Pending under Your Sessions
What happened:   Razorpay sheet closed, spinner ran for ~30s, screen stayed on step 3
Screenshot:      yes - attached
Console errors:  "POST /api/razorpay/verify 500" - copied in full below
Reproducible:    3 times out of 3
Who was signed in: QA Patient A (qa.patient.a@example.test)
```

### 1.5 Severity, so a failure lands in the right queue

| Severity | Means | Examples from this run |
| --- | --- | --- |
| **P0** | Money, clinical data, or access control is wrong. Stop and report immediately. | A patient charged a figure they were not quoted; one patient seeing another's record; a non-admin reaching an admin route. |
| **P1** | A main journey is broken or badly misleading, with no workaround. | Booking cannot complete; a recommendation never reaches the patient. |
| **P2** | Something is wrong but has a workaround. | A count disagrees with the list under it; an empty state reads badly. |
| **P3** | Cosmetic. | Spacing, a wrapped label, a stale tooltip. |

---
