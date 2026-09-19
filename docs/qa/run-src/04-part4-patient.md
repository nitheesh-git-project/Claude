## 5. Part 4 - Onboard the first patient, end to end

**What this part does.** Takes one person from never having heard of the clinic to a paid, confirmed session in the diary - registering, being approved, booking, paying, and landing on their own dashboard. Everything later in the run hangs off this patient.

**Who you are.** Mostly **QA Patient A**. Two steps need the admin; each says so.

**Time.** About 60 minutes.

> **Use a second browser for the admin.** You will switch between the patient and the admin repeatedly, and tabs in one browser share cookies - signing in as the admin in a second tab signs the patient out of the first. Use Chrome for the patient and a private window (or a second profile) for the admin.

---

### Step 4.1 - Meet the clinic as a stranger would

Before registering anything, look at what a visitor sees. This is also the fastest check that Part 2's catalogue actually published.

**Do this.** Signed out, visit each page and check the one thing named.

| Page | Check this |
| --- | --- |
| `/` | A teal splash appears **once**, then the home page. Four conditions lead the "what we treat" band, not all of them, with a link on to the rest. |
| `/conditions` | All three of your conditions, in order 1, 2, 3, at ₹1,999 / ₹1,799 / ₹2,499. |
| `/how-it-works` | Renders, ends with the same closing band as every other page. |
| `/home-visit` | Renders (you switched it on at Step 2.4). HV1 has a Book button; HV2 does not. |
| `/team` | All three therapists from Part 3. |
| `/mission` | The mission and vision sentences, the promises band, the limits band. |
| `/faq` | Renders. |
| `/hospitals` | The enquiry form you used at Step 3.10. |

**Also check the splash behaves.** Reload `/` - the splash should **not** show again. Open a brand-new tab to `/` - it **should**. A splash on every navigation is a **P2**; a splash that covers a page you are already reading is worse, because the same behaviour over a checkout in progress is what it must never do.

**And check no programme is on sale.** Nowhere on `/` or `/conditions` is there a price list of programmes with a Buy button. Each programme card reads *"Arranged by your therapist after your first session."* A programme purchasable from a public page is a **P0**.

---

### Step 4.2 - Register Patient A through the booking wizard

This is the commonest real path: a stranger books and registers in one screen. The account, the booking and the payment all happen on `/book`.

**Do this**

1. From `/conditions`, tap **Book Assessment** on `QA Back & Spine Care`. You land on `/book`.
2. **Step 1 of the wizard.** Read what is pre-selected before changing anything:
   * a date, a time and a language are already chosen for you.
   * the detected timezone is stated on screen.
3. Choose **tomorrow**, and an hour of **4:00 PM**.
4. Leave the language as the first chip.
5. Tap **Continue**.
6. **Step 2.** Fill the account fields:

| Field | Value |
| --- | --- |
| Full Name | `QA Patient A` |
| Email Address | `qa.patient.a@example.test` |
| Password | `QaTest!2024pass` |
| Confirm Password | `QaTest!2024pass` |
| Phone | `+91 98765 43210` |
| Referral Code | *leave blank* |

7. Under **What would you like help with?**, pick `QA Back & Spine Care`.
8. In **Anything else we should know?**, type exactly:

```
Desk job, pain worse after sitting all day. Goal: sit through a full workday.
```

9. Tick the telehealth consent box.
10. Tap **Continue**.
11. **Step 3.** Read the whole screen before tapping anything. Note the figure on the button.

**Expect, at each step**

* **Step 1's dates.** Today is usually **not** offerable - the booking lead time is 12 hours, so at 10 AM the first bookable slot is 10 PM tonight, and after about midday today drops off the calendar entirely. That is the rule working, not a bug. The boundary day is **partly** available: early hours greyed, later ones live.
* **Changing the date re-picks the hour.** Pick a different date and the hour resets to that day's earliest eligible one. Your old pick is not carried across, because it might not clear the lead time on the new date.
* **Step 3 quotes what it will charge.** The Session Fee reads **₹1,999** - the category price - and the button reads **Request Booking**. With no discount running, the figure on the button and the figure Razorpay opens with must be **the same number**. They were not, once: the wizard printed the category price while checkout quietly applied an offer behind it. **A payment screen showing one figure and charging another is a P0.**
* **The cancellation line** reads *"Free cancellation up to 24 hours before your slot"* - the admin setting from Step 2.7.
* **The exit link** at the foot, outside the wizard, reads **Back to Home** and goes to `/` while you are signed out.

**Do not tap Request Booking yet.** Step 4.3 checks two refusals first.

---

### Step 4.3 - Check what the wizard refuses

**Do this, one at a time, returning to Step 1 between attempts.**

| Try this | Expect |
| --- | --- |
| On Step 2, email `not-an-email` | An invalid-email message. No account created. |
| Password `abc12` (five characters) | A minimum-length message. No account created. |
| Confirm Password `QaTest!2024pas` (one character short) | A passwords-do-not-match message. |
| Phone `12345` | An invalid-phone message. |
| Referral Code `ZZZZZZ` | `Code not recognized - double-check it or leave blank` in red. |
| Leave the consent box unticked and tap Continue | Refused, with a readable message. |
| Leave **What would you like help with?** unset | Refused. |

**In every case:** the form stays on screen with what you typed intact, the message is in plain English, and **no stack trace, database column name or row id appears anywhere**. A raw Postgres string such as *"new row violates row-level security policy"* on this screen is a **P0** - that exact failure is what the current booking route exists to prevent.

**One more, in a second browser.** Sign in as **QA Therapist A** and open `/book`.

**Expect.** Not the form - a **wrong account** panel, saying a clinician wanting therapy should sign out and use a separate patient account. Repeat signed in as the hospital (it points at referring) and as the admin (it points at the back office's own booking screen). **This is checked before every other branch**, so it shows even with a `?package=` on the URL.

---

### Step 4.4 - Create the booking and pay

Back in the patient's browser, refill Step 1 and Step 2 exactly as Step 4.2 gave them, and reach Step 3.

**Do this**

1. Tap **Request Booking**.
2. The Razorpay sheet opens. Confirm it says **Test Mode**.
3. Pay with the test card:

| Field | Value |
| --- | --- |
| Card number | `4111 1111 1111 1111` |
| Expiry | any future date, e.g. `12/30` |
| CVV | any three digits, e.g. `123` |
| Name | `QA Patient A` |
| OTP / 3DS page | choose **Success** |

**Expect**

* The figure in the Razorpay sheet is **₹1,999** - the same figure the button quoted.
* After paying, Step 3 is replaced by a **Payment Confirmed** panel with a **Go to Dashboard** link.
* Tap it. You land on `/patient/dashboard` **without being bounced to `/pending-approval`** - genuinely attempting checkout approves the patient, deliberately on the attempt rather than on success, so somebody whose card fails three times still reaches their dashboard rather than a waiting screen.
* The session is listed, **Pending** - paid, but nobody is assigned yet. That is correct: automatic assignment is off (Step 2.7), so it waits in the admin's queue.

**If the payment fails or you close the sheet**, that is worth seeing too, and costs nothing:

| What you do | Expect |
| --- | --- |
| Close the Razorpay sheet without paying | *"Payment was not completed. You can try again below."* The button now reads **Pay ₹1,999 Now**, not Request Booking. The appointment already exists, unpaid. |
| Fail three times | An amber escape hatch appears: *"Having trouble paying? Your booking is saved as pending…"* with a **Go to Dashboard** link. |
| Tap **Pay ₹1,999 Now** again | Checkout re-opens against the **same** appointment. No second appointment, no second order. |
| Press **Back** from Step 3 to Step 2 | The draft is abandoned; the button returns to **Request Booking**. The unpaid appointment stays in the dashboard. |
| Reload the page mid-wizard | The wizard restarts at Step 1. No wizard state is kept. Any appointment already created is still in the dashboard as unpaid. |

---

### Step 4.5 - Read the patient's Overview

**Do this.** On `/patient/dashboard`, read the screen top to bottom.

**Expect**

* A strip of **four figures**, then the activity feed, then quick actions - in that order.
* The sidebar shows **Overview, Book a Session, Sessions, Payments, Health Profile, Edit Profile**. **Programmes is absent** - the patient has not bought one, and a screen that can only ever be empty is not in the sidebar. **Back to Home** sits at the foot of the nav.
* Every time on this screen is in **India Standard Time**, whatever your laptop is set to. A session booked for 4 PM must not read `10:30 AM` anywhere - that is the clinic-time rule broken, and it is a **P1** because two people reading one screen then disagree about when the session is.
* The feed carries the booking. Nothing claims the patient did something they did not do.

**Then check the loading states.** In DevTools → **Network**, set throttling to **Slow 3G** and move through every sidebar entry.

**Expect.** Each screen shows a skeleton with **its own label** - `Loading your dashboard`, `Loading booking`, `Loading your sessions`, `Loading your payments`, `Loading your health profile`, `Loading your profile` - and **the sidebar stays on screen throughout**. A screen that blanks the chrome while it loads is a **P2**; one that flashes white, or shows another screen's label, is the same.

Turn throttling off.

---

### Step 4.6 - Fill in the patient's own profile

**Do this.** Open **Edit Profile** and fill in every field:

| Field | Value |
| --- | --- |
| Date of birth | `1990-04-12` |
| Gender | `Female` |
| Address line 1 | `12, 3rd Cross, Indiranagar` |
| Address line 2 | `Near Metro Station` |
| City | `Bengaluru` |
| State | `Karnataka` |
| PIN code | `560038` |
| Emergency contact name | `QA Contact A` |
| Emergency contact phone | `+91 98765 43299` |

Save, then reload the page.

**Expect.** Everything survives the reload. A patient's own details save immediately - there is no review step for these, unlike a therapist's credentials.

**Then upload a report.** Still on the patient's screens, open **Health Profile** and use the reports uploader. You need a small PDF; any file will do, named something you will recognise:

| File | Type to pick |
| --- | --- |
| `Spine_Report_E2E.pdf` | `Scan or X-ray` |

**Expect.** It uploads and is listed. **The uploader is open even though the health profile itself is locked** - the therapist has not filled the first record yet, and this is the one useful thing a patient can do beforehand.

Try two refusals while you are here:

| File | Expect |
| --- | --- |
| Any file over **10 MB** | Refused with a size message. |
| A `.txt` file | The picker will not accept it. |

---

### Step 4.7 - Note what the patient cannot do yet

This is the state Part 6 changes, and it is worth reading now so the change is visible later.

**Do this.** On **Health Profile**, read the screen.

**Expect**

* There is **no** "start the questionnaire" call to action and **no** answered counter (`0 of 7`). Both are **absent**, not greyed out - the record is not the patient's to start.
* The Overview's health cell reads **`-`** on slate, **not `0%` on amber**. Amber would be asking the patient for something they cannot give.
* There is no amber banner telling them to complete anything.
* The reports uploader still works.

> **Why.** A patient's health record does not exist until a therapist has triaged them and written the first entry. Locking the patient out until then is deliberate: the alternative is a patient filling in a form for a condition type nobody has decided yet.

---

### Step 4.8 - Register Patient B, the other way

You need a second patient for the isolation checks, and registering them through `/patient/register` proves the other rule: a standalone signup **always** waits for a human.

**Do this**

1. Sign out. Open `/patient/login` and tap **Register Account**.
2. Fill it in:

| Field | Value |
| --- | --- |
| Full Name | `QA Patient B` |
| Email Address | `qa.patient.b@example.test` |
| Phone | `+91 98765 43211` |
| Password | `QaTest!2024pass` |
| Confirm Password | `QaTest!2024pass` |
| Referral Code | *leave blank* |

3. Tap **Create Account**.

**Expect**

* You land on **`/pending-approval`** - not the dashboard, and **not** any "check your email" screen. A screen telling this patient to check their inbox is a **P1**: email confirmation is off in this product, so nothing will arrive and they will wait for ever.
* Type `/patient/dashboard` into the address bar. You are redirected back to `/pending-approval`.

**Then prove the gate is in the route, not only the screen.** Still signed in as Patient B, DevTools → Console:

```js
const r = await fetch("/api/appointments/create", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slotTime: "2026-12-01T10:30:00.000Z" }),
});
({ status: r.status, body: await r.text() });
```

**Expect: `200`**, and an unpaid, unassigned session appears. **That is correct and is not a defect.** This route gates on the account being *active*, not approved - an unapproved self-signup patient has to be able to hold the row they are about to pay for, and an unpaid row grants nothing. What must be refused is a **suspended** account, which you check at Step 13.2.

> **Why `10:30:00.000Z` and not `10:00:00.000Z`.** A slot must start on the hour **in the booking's own timezone**, and with no timezone in the body that is India. `10:00Z` is 15:30 IST and is correctly refused with `Sessions start on the hour. Pick a time like 6:00 or 7:00.` `10:30Z` is 4 PM IST. If you see that refusal, you have found the rule working, not a bug.

Delete the stray session later from **Sessions → All Sessions**, or leave it - Step 5.2 uses it.

---

### Step 4.9 - Approve Patient B, as the admin

**Do this.** In the admin browser, open **Today → Approvals** and approve `QA Patient B`.

**Expect.** They disappear from the queue, the badge falls by one, and signing in as Patient B now reaches `/patient/dashboard`.

**Then decline something, to see the other outcome.** Register a throwaway patient (`QA Patient Z`, `qa.patient.z@example.test`, phone `+91 98765 43219`, same password) and **decline** it from the same queue with the reason:

```
Duplicate registration, patient already has an account.
```

**Expect.** The account stays unapproved and cannot reach a dashboard. It is **not** deleted - declining is not deleting, and the row is still in People → Patients marked accordingly.

---

### Step 4.10 - Checkpoint

| | Should be |
| --- | --- |
| Patient A | Approved, one **paid** session tomorrow at 4 PM, unassigned, profile filled, one report uploaded |
| Patient B | Approved, possibly one stray unpaid session from the console call |
| Patient Z | Registered and declined |
| Health profile | Locked for Patient A - no CTA, no counter, `-` on the Overview |

---
