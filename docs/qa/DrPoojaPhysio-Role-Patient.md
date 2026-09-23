## 1. Who this is, and what must exist first

**The account.** One person who books and pays for their own care. They
self-register, wait for an admin to approve them - unless they pay, which
approves them on the attempt - and then own one dashboard: their sessions,
their programmes, their payments and their health record.

**The accounts this plan uses.** Create them as you go; the steps say where.
All of them use the same password, and every address ends `@example.test`,
which is a reserved domain that cannot deliver to a real inbox.

| Label | Email | Password | Why this plan needs them |
| --- | --- | --- | --- |
| **Patient A** | `qa.patient.a@example.test` | `QaTest!2024pass` | The main journey. Registers through the booking wizard. |
| **Patient B** | `qa.patient.b@example.test` | `QaTest!2024pass` | Registers the other way, through `/patient/register`. Proves one patient cannot reach another's anything. |
| **Patient D** | `qa.patient.d@example.test` | `QaTest!2024pass` | Has never paid. The discounts need somebody new. |
| **Patient E** | `qa.patient.e@example.test` | `QaTest!2024pass` | The second never-paid patient, for the second discount. |

Other details, used where the steps name them:

| | Patient A | Patient B |
| --- | --- | --- |
| Full name | `QA Patient A` | `QA Patient B` |
| Phone | `+91 98765 43210` | `+91 98765 43211` |
| Date of birth | `1990-04-12` | `1985-11-30` |
| Address | `12, 3rd Cross, Indiranagar` / `Near Metro Station` | `44 Residency Road` |
| City / State / PIN | `Bengaluru` / `Karnataka` / `560038` | `Bengaluru` / `Karnataka` / `560025` |
| Emergency contact | `QA Contact A`, `+91 98765 43299` | *leave blank* |

**`560038` is a serviceable pincode and `560025` is not.** That is deliberate:
Patient B's address is the one that cannot be visited at home.

---

### 1.1 Before you start

A patient cannot do anything until somebody has built a clinic around them.
These must already be true. Each is one line of somebody else's plan.

| Must exist | Set up by |
| --- | --- |
| At least one treatment category, priced and active | Master Admin |
| Home visits switched **on**, with a service area covering `560038` at ₹150 a visit | Master Admin |
| A single-visit home package that can be bought | Master Admin |
| At least one approved therapist with a roster | Master Admin + Therapist |
| An admin who can approve accounts and assign sessions | Master Admin |
| Razorpay in **test** mode | whoever set the environment up |

**The prices this plan quotes** assume a category called `QA Back & Spine Care`
at **₹1,999 / 60 min**, a second at `QA Knee & Joint Care` at **₹1,799 / 45 min**,
a six-session programme at **₹9,999**, and a single home visit at **₹2,499**
plus **₹150** travel. If your catalogue differs, the arithmetic changes and the
rules do not.

### 1.2 How to record a result

Mark every step **Pass**, **Fail**, **Blocked** or **N/A**. Raise a failure
with: the step id, what you did, what you expected, what happened, a
screenshot, any console error in full, how many times out of how many it
reproduced, and **which account you were signed in as**.

**Severity.** **P0** - money, clinical data or access control is wrong: stop
and report. **P1** - a main journey is broken with no workaround. **P2** -
wrong with a workaround. **P3** - cosmetic.

### 1.3 Calling a route without a terminal

Four steps ask you to call an API directly, because this application enforces
its rules twice - once in the screen, once in the route - and a hidden button
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
itself. For an **anonymous** call use a private window; for a **different**
user use a second browser profile, not a second tab - tabs share cookies.
Never paste the URL in the address bar: that sends a GET, these are POSTs,
and you will get 405 and think you found something.

---

## 2. Getting an account

### `PT-01` - Register inside the booking wizard · P0

The commonest real path: a stranger books and registers on one screen. The
account, the booking and the payment all happen on `/book`.

**Do this**

1. Signed out, open `/conditions` and tap **Book Assessment** on
   `QA Back & Spine Care`.
2. **Step 1.** Read what is already chosen before changing anything - a date,
   an hour and a language are pre-selected, and the detected timezone is
   stated on screen.
3. Choose **tomorrow** and **4:00 PM**.
4. **Continue.** On Step 2, fill in:

| Field | Value |
| --- | --- |
| Full Name | `QA Patient A` |
| Email Address | `qa.patient.a@example.test` |
| Password | `QaTest!2024pass` |
| Confirm Password | `QaTest!2024pass` |
| Phone | `+91 98765 43210` |
| Referral Code | *leave blank* |
| What would you like help with? | `QA Back & Spine Care` |
| Anything else we should know? | `Desk job, pain worse after sitting all day. Goal: sit through a full workday.` |

5. Tick the telehealth consent box. **Continue.**
6. **Step 3.** Read the whole screen. Note the figure on the button.

**Expect**

* **Today is usually not offerable.** The booking lead time is 12 hours, so at
  10 AM the first bookable slot is 10 PM tonight, and after midday today drops
  off the calendar. That is the rule working. The boundary day is *partly*
  available - early hours greyed, later ones live.
* **Changing the date re-picks the hour.** Your old pick is not carried
  across; it might not clear the lead time on the new date.
* **Step 3 quotes what it will charge.** Session Fee **₹1,999**, button reads
  **Request Booking**, and with no discount running those two and the Razorpay
  sheet must all be **the same number**. A payment screen showing one figure
  and charging another is a **P0**.
* The cancellation line reads *"Free cancellation up to 24 hours before your
  slot"* - an admin setting, so check it against what the admin has set.
* The exit link at the foot reads **Back to Home** and goes to `/`, because
  you are signed out.
* **No "check your email" step appears anywhere.** Email confirmation is off
  in this product by design. A screen telling this patient to check their
  inbox is a **P1**: nothing will arrive and they will wait for ever.

### `PT-02` - What the wizard refuses · P1

One at a time, returning to Step 1 between attempts.

| Try | Expect |
| --- | --- |
| Email `not-an-email` | An invalid-email message. No account created. |
| Password `abc12` | A minimum-length message. No account created. |
| Confirm Password `QaTest!2024pas` | A passwords-do-not-match message. |
| Phone `12345` | An invalid-phone message. |
| Referral Code `ZZZZZZ` | `Code not recognized - double-check it or leave blank` in red, and **Continue is blocked** |
| Consent box unticked | Refused, readably |
| No condition chosen | Refused |
| Email that already exists | A "user already registered" message, and **no second profile row** |

**In every case** the form stays on screen with what you typed intact, the
message is plain English, and **no stack trace, column name or row id appears
anywhere**. A raw Postgres string such as *"new row violates row-level
security policy"* here is a **P0**.

### `PT-03` - Register the other way, and wait · P0

**Do this.** Signed out, open `/patient/login` → **Register Account** and
create **Patient B** with the details in §1. Then type `/patient/dashboard`
into the address bar.

**Expect**

* You land on **`/pending-approval`**, not the dashboard, and not a "check
  your email" screen.
* The address bar attempt redirects back to `/pending-approval`.
* **Standalone registration always waits for a human.** Unlike PT-01, nothing
  here approves them - paying is what does that, and they have not.

**Then prove the gate is in the route too.** Still as Patient B, console:

```js
const r = await fetch("/api/appointments/create", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slotTime: "2026-12-01T10:30:00.000Z" }),
});
({ status: r.status, body: await r.text() });
```

**Expect: `200`, and an unpaid unassigned session appears.** That is correct
and is **not** a defect: this route gates on the account being *active*, not
approved, because an unapproved self-signup patient has to be able to hold the
row they are about to pay for, and an unpaid row grants nothing.

> **Why `10:30:00.000Z`.** A slot must start on the hour **in the booking's own
> timezone**, and with no timezone in the body that is India. `10:00Z` is
> 15:30 IST and is correctly refused with `Sessions start on the hour. Pick a
> time like 6:00 or 7:00.` `10:30Z` is 4 PM IST.

### `PT-04` - Sign in, sign out, reset a password · P2

| Do | Expect |
| --- | --- |
| Sign in at `/patient/login` | Lands on `/patient/dashboard`. The public navbar is **not** rendered there. |
| Sign out | The session ends, you land on a public page, and a farewell banner shows for the admin-set number of seconds. `/patient/dashboard` now redirects to `/patient/login`. |
| **Forgot password** → enter the address → **Send Reset Link** | `Sending...`, then a confirmation, with **← Back to Sign In**. `/reset-password` renders. Delivery cannot be checked with a `.test` address. |
| Sign in while **suspended** (ask the admin to suspend you) | You reach **`/account-suspended`**, and a console call to any patient route is **refused** |

---

## 3. Paying

### `PT-05` - Pay for the first session · P0

**Do this.** Back on Step 3 of the wizard, tap **Request Booking**, then pay:

| Field | Value |
| --- | --- |
| Card | `4111 1111 1111 1111` |
| Expiry | any future date, `12/30` |
| CVV | any three digits |
| OTP / 3DS | choose **Success** |

**Expect**

* The Razorpay sheet says **Test Mode** and shows **₹1,999** - the figure the
  button quoted.
* Step 3 is replaced by a **Payment Confirmed** panel with **Go to Dashboard**.
* Tapping it lands on `/patient/dashboard` **without bouncing to
  `/pending-approval`**. Genuinely attempting checkout approves the patient -
  deliberately on the *attempt*, not on success, so somebody whose card fails
  three times still reaches their dashboard.
* The session is listed **Pending**: paid, nobody assigned yet.

### `PT-06` - Every other payment outcome · P1

| What you do | Expect |
| --- | --- |
| Close the Razorpay sheet without paying | *"Payment was not completed. You can try again below."* The button now reads **Pay ₹1,999 Now**, not Request Booking. The appointment exists, unpaid. |
| Choose **Failure** on the 3DS page | An error; the attempt counter increments; the appointment stays unpaid |
| Fail three times | An amber escape hatch: *"Having trouble paying? Your booking is saved as pending…"* with **Go to Dashboard** |
| Tap **Pay ₹1,999 Now** again | Checkout re-opens against the **same** appointment. **No second appointment, no second order.** |
| Press **Back** from Step 3 to Step 2 | The draft is abandoned and the button returns to **Request Booking**. The unpaid appointment stays in the dashboard. |
| Reload mid-wizard | It restarts at Step 1. No wizard state is kept. Any appointment already created is in the dashboard, unpaid. |
| Close the tab after paying, before the confirmation | The booking still becomes paid - the gateway's own callback confirms it server-side. **If it does not**, the webhook secret is unset; that is a real finding and belongs on the admin's System Health. |

### `PT-07` - Pay twice, fast · P0

**Do this.** Double-tap **Request Booking**. Then, on a fresh booking,
double-tap **Pay … Now**.

**Expect.** **One** appointment and **one** payment, both times. Two
appointments from one tap, or two charges, is a **P0**.

---

## 4. The dashboard

### `PT-08` - The Overview · P1

**Expect**, in this order: a strip of **four figures**, the activity feed,
then quick actions. That order is the same on every dashboard in this product
because it is the order people ask *how am I doing / what needs me / what do I
do next*.

* The sidebar shows **Overview, Book a Session, Sessions, Payments, Health
  Profile, Edit Profile**, with **Back to Home** at the foot.
* **Programmes is absent** until they own one. A screen that can only ever be
  empty is not in the sidebar. Booking is the deliberate exception - always
  shown, because it is how a patient gets their first of anything.
* **Every time on this screen is India Standard Time**, whatever your laptop
  is set to. A session booked for 4 PM must not read `10:30 AM` anywhere -
  **P1**, because two people reading one screen then disagree about when it is.
* Nothing in the feed claims the patient did something they did not do.

### `PT-09` - Every screen says what it is loading · P2

**Do this.** DevTools → Network → **Slow 3G**, then walk every sidebar entry.

**Expect** a skeleton with **its own label** each time - `Loading your
dashboard`, `Loading booking`, `Loading suggested sessions`, `Loading your
sessions`, `Loading your programmes`, `Loading your payments`, `Loading your
health profile`, `Loading your profile` - and **the sidebar stays on screen
throughout**. A screen that blanks the chrome, flashes white, or shows another
screen's label is the defect.

### `PT-10` - Edit Profile and the address book · P2

**Do this.** Fill every field from §1, save, reload. Then add a second
address and remove it.

**Expect.** Everything survives the reload - a patient's own details save
immediately, with no review step. Removing a saved address does **not** alter
any visit already booked: a visit's address is copied onto the appointment at
purchase, never referenced live.

### `PT-11` - Upload reports · P1

**Do this.** On **Health Profile**, use the reports uploader.

| File | Type | Expect |
| --- | --- | --- |
| `Spine_Report_E2E.pdf` | `Scan or X-ray` | Uploads, listed |
| Anything over **10 MB** | - | Refused with a size message |
| A `.txt` file | - | The picker will not accept it |
| A 21st file | - | Refused - 20 per patient |

**The uploader works even while the health profile itself is locked** (PT-12).
It is the one useful thing a patient can do beforehand.

---

## 5. The health record

### `PT-12` - Locked until a therapist writes the first record · P1

**Do this.** Before any therapist has triaged you, open **Health Profile**.

**Expect**

* **No** call to action to start, and **no** answered counter. Both are
  **absent**, not greyed out - the record is not the patient's to start.
* The Overview's health cell reads **`-` on slate**, not `0%` on amber. Amber
  would be asking the patient for something they cannot give.
* No amber banner telling them to complete anything.
* The reports uploader still works.

### `PT-13` - Unlocked, and answered in the patient's own words · P0

**Preconditions.** A therapist has triaged you and written the first record.

**Expect**

* The record renders, showing **answers, not inputs**.
* The Overview's health cell shows a real percentage.
* **Nothing claims the patient answered questions a clinician wrote.** A
  counter reading `3 of 7 answered` over "Add the missing answers" for answers
  the patient never gave is a **P1** - attribution is not a nicety on a medical
  record.
* The word on screen is **Health Profile**, to the patient, everywhere. Not
  "Patient Care Intake", not "condition data", not "the questionnaire", and
  never "chart" - that is clinician register.
* The patient is **never shown a category word**. Their care reads as
  *Orthopaedic physiotherapy*, never `ortho`, and the words "triage" and
  "onboarding" appear nowhere on their screens.

### `PT-14` - Answer the questions, one at a time · P1

**Do this.** Where the patient may edit or add answers, open the wizard.

**Expect**

* It is a **one-question-at-a-time pop-up**, never a wall of seven fields on
  the dashboard. Each question carries help text saying why the answer matters,
  in the patient's words.
* A draft saves as you go, and coming back says where you left off - **only if
  it was you who left off.** A therapist's abandoned edit must never tell the
  patient *"You left off part-way through"*. **P1.**
* Every pain figure on screen is out of **ten**, matching how the patient rates
  their own. A strip reading *"How you rate it 6/10"* beside *"Last exam found
  34%"* is two measurements on one screen - **P2**.

### `PT-15` - Export the record · P1

**Do this.** Use the export on Health Profile.

**Expect**

* A **PDF** downloads, named `QA Patient A_PT####.pdf` using that patient's
  own code, typeset and readable - what a patient does with an export is hand
  it to another clinician.
* **Session notes are not in it.** Neither in the PDF nor in `?format=json`.
  A patient who can read a session note is a **P0**.
* Uploaded reports are listed as metadata.

---

## 6. Sessions

### `PT-16` - One list, three filters · P1

**Expect.** **Sessions** is one screen with **Upcoming / Past / Cancelled**,
plus a **Video / Home visit** filter that appears only once this patient has
both. Video sessions and home visits are **not** separate sidebar entries -
"what is next?" must not be a two-screen question.

There is also a **List / Calendar** toggle, rendering the **same** cards. The
two views can never disagree about a session.

### `PT-17` - Waiting, confirmed, joined · P0

| Moment | Expect on the patient's card |
| --- | --- |
| Paid, nobody assigned | **Pending**. No therapist named, no join link. |
| Admin assigns a therapist | **Confirmed**, therapist named, a meeting link appears |
| Well before the slot | The join control is **not live**, and **names when it opens** rather than being a dead button |
| Inside the join window | **Tap to Join** works |
| Past the Session Completed cutoff | It reads **Session Completed** instead |

**The therapist and the admin must see the same answer at the same moments.**
A window open for one party and shut for the other is a **P1** - somebody sits
waiting in a meeting nobody else can enter.

**If there is no meeting link**, ask the admin to check System Health before
you raise it: an unconfigured Google account is a state, not a fault, and a
**home visit never has one by design**.

### `PT-18` - Cancel, and the refund window · P0

**Do this.** Cancel a paid session **outside** the 24-hour window, then
another **inside** it.

**Expect**

| | Outside | Inside |
| --- | --- | --- |
| Refund | **Full** | **None** |
| The card says | The refund and when | **Why not**, naming the window that applied |

* Every refund **states a reason**, including the forfeiture. A blank reason
  line on a cancelled session is a **P2**.
* The no-refund explanation names **the window that actually applied** - a
  home visit has its own, different window, so quoting the online 24 hours on
  a cancelled visit is wrong.
* A refund the clinic has decided is **not owed** says **nothing** to the
  patient. The cancelled card already explains the window; repeating it as a
  refund line announces a refund to somebody who is not getting one.

### `PT-19` - Rate a delivered session · P2

**Do this.** Rate a completed session **4 stars** with a comment.

**Expect.** It saves, and the therapist's own header starts quoting it. If an
admin later reopens that session, **the rating is destroyed** - and the patient
was not promised otherwise.

---

## 7. Buying a programme

A patient cannot buy a programme from a price list. It comes only from a
recommendation a therapist wrote after a session they ran.

### `PT-20` - Nothing is visible until the clinic approves it · P0

**Preconditions.** A therapist has submitted a recommendation for you, and no
admin has approved it.

**Expect: nothing.** Not a greyed-out card, not "your therapist has
recommended something, pending approval" - **nothing at all** on any of your
screens. A visible pending recommendation is a **P1**.

**Then try to buy it anyway**, in the console:

```js
const r = await fetch("/api/care-plan/create-order", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ carePlanId: "<any uuid>" }),
});
({ status: r.status, body: await r.text() });
```

**Expect. Refused.** Hiding a card is presentation; refusing the order is the
rule. A `200` is a **P0**.

### `PT-21` - Read and buy the offer · P0

**Preconditions.** The admin has approved it.

**Do this.** Open **Suggested Sessions**, read the card, and pay with the test
card.

**Expect**

* The card quotes **₹9,999** and **6 sessions** - the figures from the
  clinic's catalogue, never anything the therapist typed. There is no price,
  session count or discount a clinician could have set.
* An expiry, counted from **when the clinic approved it**, not from when the
  therapist wrote it. A plan that waited two days in a queue must not reach
  you with two days already spent.
* After paying, the screen lands on **a confirmation and one next step** -
  what arrived, what you own, then the scheduler. **A blank screen here is a
  P1**: this is the highest-intent moment in the product.
* "I'll do it later" is a real, unpunished option.

### `PT-22` - Schedule the whole run · P0

**Expect.** The calendar opens **already answered** - a whole run of dates
proposed from the clinician's own cadence (twice a week, 24 hours apart,
maximum three a week, inside the 90-day validity).

* A day that cannot take the run's hour is **skipped, not substituted**.
  Somebody who asked for five o'clock and was handed nine in the evening has
  been given a schedule they did not ask for.
* It **stops at the validity** - fewer sessions rather than sessions you would
  lose.
* Every booked session is **auto-assigned to the same therapist and
  confirmed**, each with its own meeting link. The first therapist on a
  programme locks it.
* A slot that clashes is **fixable in place**, not a list you can only close.

**Then the two batch rules.** Try to book two sessions **12 hours apart**, and
**four in one week**.

**Expect.** Both refused, readably. Those are the programme's own rules
reaching the booking.

### `PT-23` - The dashboard keeps asking · P1

**Do this.** Leave one session of the programme unbooked and open **Overview**.

**Expect.** An item **pinned to the top** of the feed until the balance is
spent. It does not sink as it ages - a programme paid for a month ago with a
session unbooked is exactly the item that must not drift down the list.

**And the balance agrees everywhere**: the programme widget, the scheduler,
and what the admin's Purchases screen shows. A figure that disagrees between
two of them is a **P1**.

### `PT-24` - A therapist proposes a time · P1

**Preconditions.** Therapist-suggested sessions is on, and your therapist has
proposed one.

**Do this.** Open **Suggested Sessions**.

**Expect**

* The proposed time and the therapist's note, with **Accept** and **Decline**.
* **Accepting books it** - and only then does the balance fall by one. A
  suggestion that spends a session before you accept is a **P1**: declining
  would then have to refund one.
* **Declining costs nothing.**
* A suggestion whose slot has fallen inside the 12-hour lead time simply
  **stops being acceptable**. Nothing anywhere marks it "expired".
* Answer the same suggestion from two browsers at once: **one wins**, not two
  bookings.
* Accept with the network dropped mid-request: you are left **exactly where
  you were**, not cleared into a state that never happened.

---

## 8. Home visits

### `PT-25` - Book a visit, paying online · P0

**Do this.** Open `/book-home-visit` (header should read **Step 1 of 4**),
enter pincode `560038`, tap **Check**, then work through.

**Expect**

* A teal line: *"Yes - we visit Indiranagar, Bengaluru. Travel to this area is
  ₹150 per visit."*
* The notice says home visits need at least **24 hours'** notice - deliberately
  longer than the online 12, and read from its own setting.
* **Review and pay shows three figures**: programme `₹2,499`, travel `₹150`,
  total `₹2,649`.
* **The button charges ₹2,649** - the total shown, not the programme price.
  Quoting one figure and charging another is a **P0**, and this is where it has
  happened before.
* The visit appears on **Sessions**, and the **Video / Home visit** filter now
  appears because you have both.

### `PT-26` - The address is frozen at purchase · P1

**Do this.** Change your saved address, then re-open the booked visit.

**Expect.** The visit still carries the **old** address. Editing a saved
address must never rewrite a visit already booked or delivered.

### `PT-27` - An address we do not visit · P1

**Do this.** Enter `560025` and tap **Check**. Then leave a waitlist entry.

**Expect**

* An amber panel: *"We don't visit 560025 yet."* and *"Leave your number and
  we'll tell you the moment we do. Nothing has been charged."*
* **No address form and no package picker appear.** Serviceability is checked
  before an address is even collected.
* A link to an **online consultation**, which is available anywhere.
* After submitting: *"Thanks - we'll be in touch."*

**And the four bad pincodes:** `56003`, `0560038`, `abcdef` and blank are each
refused with `Enter a valid 6-digit pincode.`

### `PT-28` - A four-visit package cannot be bought · P0

**Expect.** Only the **single** visit has a Book button, on `/home-visit` and
on the dashboard's booking screen. Two or more visits is a programme, and a
programme comes from a recommendation.

**Then call the route directly** with a multi-visit package id:

```js
const r = await fetch("/api/home-visit/create-order", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ packageId: "<the 4-visit package id>", pincode: "560038" }),
});
({ status: r.status, body: await r.text() });
```

**Expect. Refused.**

**And a stale link.** Open `/book?package=<any id>`.

**Expect.** Not silence and not a different amount of money - a panel reading
*"Programmes come from your therapist now"* with a **Book a first session**
link.

### `PT-29` - Pay at the door · P1

**Do this.** Book a visit choosing **Pay at the visit**.

**Expect.** The purchase is created and the visit confirmed, and it stays
**unpaid** for its whole life. **That is correct for cash** - never read a
home-visit purchase's payment status the way you would an online one.

**Then, with cash switched off** by the admin: the option is gone from Step 4,
and the route refuses it if called directly.

### `PT-30` - Cancel a visit · P0

**Expect.** The home visit's **own** refund window applies - not the online
one. Outside it, the refund **includes the travel** that was charged;
refunding the service line alone leaves you paying for a journey nobody made.
A **cash** visit becomes a hand-back for somebody at the clinic to do, and the
card says so.

---

## 9. Money off

Four discounts exist, and the patient can trigger two of them. Every one of
them sends a **name**, never a figure.

### `PT-31` - The first-session offer · P0

**Preconditions.** The admin has switched it on at **₹500** off.

**Do this.** As **Patient D** (never paid), reach Step 3 on a ₹1,999 category.

**Expect. ₹1,499**, on the screen *and* in the Razorpay sheet. Then book a
**second** session: **full ₹1,999**. A patient is new exactly once, and that is
asked of the database rather than remembered in a browser.

**And in a private window, signed into nothing**, reach Step 3 on the same
category: **₹1,499 again**. A visitor with no account yet is exactly who the
offer is for.

**The offer is video consultations only.** A home visit still quotes travel and
no offer.

### `PT-32` - A promo code · P1

**Preconditions.** The admin has created `QASPINE20`, 20% off, cap 2.

| Do | Expect |
| --- | --- |
| Type `QASPINE20` at Step 3 | **₹1,599**. The request carries the **code**, never an amount |
| Be the third patient to claim it | Refused - the cap means two |
| Apply it, abandon checkout, wait out the hold | The claim **stops counting**. Nothing writes an "expired" status |
| A code that does not exist | Refused, readably |
| A **paused** campaign | Nothing applied, and the screen says which |
| Apply a valid code, have the admin pause it, **then pay** | **Checkout refuses** rather than quietly charging list price. You were shown a figure with the code applied, and taking more money than somebody was quoted is the one outcome a payment screen must never produce |

### `PT-33` - An invite from another patient · P1

**Preconditions.** Invites on; friend gets ₹200, inviter gets ₹200.

| Do | Expect |
| --- | --- |
| A brand-new patient claims Patient A's code and pays | Their first session is ₹200 cheaper |
| Look at Patient A's next booking | ₹200 cheaper, **once** - and only after the friend actually **paid**, never on their signup |
| Patient A claims **their own** code | Refused |
| The friend claims **a second** invite | Refused |
| A patient who has already paid claims one | Refused |
| The admin lowers the reward before an unspent one is used | The patient gets **what was promised**. Amounts are snapshotted at claim |

### `PT-34` - A goodwill discount · P1

An admin applies this to one **unpaid** session of yours with a reason.

**Expect.** Your Step 3 quotes the reduced figure and checkout charges it.
Applied to something already **paid**, it is refused - that would be a refund,
which has its own route.

### `PT-35` - When it all comes off · P0

| Do | Expect |
| --- | --- |
| Qualify for two discounts at once | **One** applies - the **largest**. They never stack, and you pay the lowest price any rule would have given |
| Apply any discount to a **home visit** | It comes off the **service line only**; travel is added back at full price. Discounted travel makes the therapist fund their own transport - **P0** |
| Use a **100%-off** code | Total reads **Free**, the button reads **Confirm booking - free**, and **no Razorpay screen opens at all**. Being charged ₹1 instead is a **P0** |
| Double-tap that free confirmation | **One** booking. It is idempotent |

**And prove the browser does not decide.** With **no** discount running:

```js
const r = await fetch("/api/appointments/confirm-free", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ appointmentId: "<an unpaid appointment of yours>" }),
});
({ status: r.status, body: await r.text() });
```

**Expect: 409**, *"This booking still has an amount to pay."*, and the booking
stays unpaid. If a booking can be confirmed free by asking, every session in
the app is free - **P0**.

---

## 10. Payments and refunds

### `PT-36` - The Payments screen · P1

**Expect**

* Every payment this patient has made, each opening a receipt.
* The sidebar word is **Payments** - money going *out* from the patient. Not
  "Earnings", which is what money owed *to* somebody is called.
* A refunded session shows the refund **in the patient's voice**: whether they
  are getting their money back and when, with the clinic's stated reason - not
  the admin's chip wording.
* A **failed** refund is a **pinned item on the Overview**. It is the one
  refund state nothing in the clinic's screens will move without the patient.
* A **partly** refunded completed session shows the refund as its own line -
  the session still reads delivered, not "Refunded".

---

## 11. What a patient must never be able to do

### `PT-37` - Another patient's anything · P0

Signed in as **Patient B**, try to reach Patient A's health profile, sessions,
receipts and uploaded documents - by URL where there is no link.

**Expect. Refused, every time**, and no error names a table or a column. Any
path by which one patient's clinical data or money reaches another is a **P0**
that stops the run.

### `PT-38` - Any other role's screens · P0

| Open | Expect |
| --- | --- |
| `/therapist/dashboard` | Bounced. One account carries one role. |
| `/hospital/dashboard` | Bounced |
| `/admin/dashboard` | Redirected to **`/get-started`** - never to `/admin/login`, which would confirm the back office exists and name its door |

### `PT-39` - Any route that is not theirs · P0

Signed in as the patient:

```js
const routes = [
  "/api/admin/approve-account",
  "/api/admin/settle-therapist-payout",
  "/api/admin/cancel-appointment",
  "/api/therapist/save-availability",
  "/api/therapist/care-plan/submit",
  "/api/therapist/reveal-contact",
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

**Expect. 403 on every one.**

### `PT-40` - Tampering · P0

| Send | Expect |
| --- | --- |
| `{"role":"admin"}` to a profile-update route | Ignored or refused |
| Somebody else's appointment id to cancel | Refused |
| An amount in the body of `create-order` | **Ignored** - the figure is re-derived server-side from the category row |
| Invalid JSON, an empty body, an array, a bare string | Always **4xx**, never a **500** |

---

## 12. On a phone

### `PT-41` - The whole journey at 390px · P2

Walk the home page, `/book` end to end, and every dashboard screen.

**Expect.** Nothing scrolls sideways. Tap targets are finger-sized. The sidebar
becomes a drawer with **Back to Home** in it. Dialogs fill the screen rather
than sitting half off it. The Razorpay sheet works. A dialog opened from inside
another dialog covers the **whole screen**, not just the panel it came from.

### `PT-42` - Keyboard and screen reader · P2

Tab through `/book` and the dashboard with the mouse away.

**Expect.** Every control reachable in a sensible order with a **visible focus
ring**. A dialog moves focus into itself, traps Tab, closes on **Escape**, and
returns focus to whatever opened it. Every control has a name. Small grey text
on white is readable - a pale label, count or hint is a real accessibility
failure, not a taste question.

---

## 13. Sign-off

| | Should be |
| --- | --- |
| Steps run | 42 |
| Pass | |
| Fail | |
| Blocked | |
| N/A | |
| P0 raised | |
| P1 raised | |

**Confirm each of these before signing.**

| | |
| --- | --- |
| Registered inside the booking wizard, with no email-confirmation step | ☐ |
| The figure on the button matched the figure in the payment sheet | ☐ |
| Paying approved them on the attempt; abandoning checkout still let them in | ☐ |
| The dashboard opened on four figures, a feed and quick actions, in that order | ☐ |
| Read-only on the health record until a therapist filled it, with the CTA absent rather than disabled | ☐ |
| Their own record exported as a PDF named after them, with no session note in it | ☐ |
| A session joined only in its window, and cancelled inside and outside the refund window | ☐ |
| A refund read in the patient's own voice, with a failed one pinned on the dashboard | ☐ |
| A recommendation invisible until approved, then bought, then scheduled | ☐ |
| Unbooked sessions kept asking until the balance was spent | ☐ |
| A home visit quoted programme **plus travel**, and an unserviceable address refused honestly | ☐ |
| Every discount quoted what checkout charged; a free total took nothing | ☐ |
| A 429 was never read as "invalid" or "expired" | ☐ |
| One patient reached nothing of another's, at the screen and at the routes | ☐ |
| The whole journey worked at phone width | ☐ |

**Signed** ......................... **Date** .................

**Build / commit tested** .........................

---

**Any open P0 is a No.** For this role that means: charged a figure they were
not quoted, a free total taking money, another patient's record reachable, a
route answering 200 that should refuse, or a programme buyable without a
recommendation.

**What a clean run of this document proves.** That a patient's own journey -
registering, paying, being treated, being recommended to and being refunded -
behaved on one machine, in one browser, against test payment keys, once. It
does not cover real money (Razorpay is in test mode), email or SMS delivery
(`.test` addresses cannot receive), load, browsers other than the one you
used, or the database's own guards. Nor does it prove the other roles' views
of the same rows agree; each of them has a document of its own.
