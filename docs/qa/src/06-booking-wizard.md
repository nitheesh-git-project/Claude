---

## 10. Patient Booking Wizard: Complete E2E Flow

This section is the reference for `/book`. Read it before executing any `PAT-BOOK-*` case.

### 10.1 What the booking wizard is, and why it exists

`/book` is the single entry point through which a patient buys their **first** video consultation. It is a three-step wizard that does four jobs in one screen: it picks a time, it creates an account if the visitor does not have one, it records what they need help with, and it takes payment. It exists as one wizard rather than four screens because a visitor who has to register before they can see whether a suitable time exists usually leaves.

It sells **one session**. It cannot sell a programme. A programme comes from a care plan a therapist writes after seeing the patient.

### 10.2 Who uses it

Anyone. A brand-new visitor (creates an account inside Step 2), or a signed-in patient (Step 2 shows "Booking as …" instead of the sign-up fields). A signed-in **therapist, hospital or admin** is refused outright and shown a "wrong account" panel — see 10.10.

### 10.3 What information it collects

| Step | Collected | Required? |
| --- | --- | --- |
| 1 | Preferred **date** | Yes (auto-preselected) |
| 1 | Preferred **hour** | Yes (auto-preselected) |
| 1 | Preferred **language** | Yes (auto-preselected to the first admin-configured language) |
| 2 | Full Name, Email, Create Password, Confirm Password, Phone | Yes — **guests only** |
| 2 | Referral Code | Optional |
| 2 | "What would you like help with?" (treatment category) | **Yes** |
| 2 | "Continue with the same therapist?" | Optional; only shown to a returning patient with previous therapists |
| 2 | Requested specialist (from `?therapist=`) | Optional; carried in, removable |
| 2 | "Anything else we should know?" notes | Optional |
| 2 | Telehealth consent checkbox | **Yes** |
| 3 | Nothing — Step 3 is review and pay | — |

### 10.4 How the wizard decides which **dates** are offered

A date is offerable exactly when **at least one of its hours clears the booking lead time**. The lead time is `site_settings.online_booking_lead_time_hours`, default **12**. The calendar is built from `AVAILABILITY_HOURS` (the clinic's standard hour rows) filtered by that rule.

Consequences you will see and must not report as bugs:

* **"Today" usually drops off entirely.** At 10:00, the first bookable slot is 22:00 the same day; at 23:30, no hour remains today at all and the earliest bookable date is tomorrow.
* The boundary day is **partially** available, not all-or-nothing — early hours are greyed, later ones are live.
* Changing the date **re-preselects that day's earliest eligible hour**. A previously-picked hour is not carried forward, because it may not clear the lead time on the new date.
* The picker's rule and the server's validator read the **same setting**, so the calendar can never offer a slot the server would reject. If it does, that is a genuine defect.
* The date/hour are interpreted in the **browser's local timezone**, which is the timezone Step 1 displays. The detected timezone is shown on Step 1 and stored on the appointment.

### 10.5 How therapist availability affects it — the rule that surprises everyone

**It does not.** The therapist roster (weekly schedule, date exceptions, leave) is the **clinic's planning record** — who can be *offered* a session. It deliberately does **not** filter the patient's `/book` picker, which applies the lead-time rule alone.

This is a deliberate product decision, not an oversight. A patient picks a time they want; an admin then assigns whichever therapist is actually free, and only the admin can see that. Connecting the two is a change with a deploy-sized blast radius.

**So: changing a therapist's roster must never change what `/book` offers.** That is a regression test (`XCFG-ROSTER-001`), not a bug.

### 10.6 How service areas affect it

They do not affect `/book` at all. `/book` books `visit_mode: 'online'` only. Service areas gate `/book-home-visit` exclusively.

### 10.7 How admin configuration reaches the wizard

| Setting | Where an admin changes it | Effect on `/book` |
| --- | --- | --- |
| `online_booking_lead_time_hours` | Settings → Booking Rules → **Online Booking Lead Time** | Which dates/hours the calendar offers, and the server's own validator |
| `online_cancellation_refund_hours` | Settings → Booking Rules → **Online Cancellation Refund Window** | The sentence on Step 3 ("Free cancellation up to N hours…") and the refund actually paid |
| **Booking Languages** | Settings → Booking Rules → Booking Languages | The chips on Step 1. An empty list degrades to `English` — booking must never present an empty language picker. |
| Treatment categories | Catalog → Conditions | The "What would you like help with?" dropdown, each entry showing `Title — ₹price / duration min`. An **inactive** category disappears, and a booking against it is refused server-side. |
| Category **price** and **duration** | Catalog → Conditions | The header price line, Step 3's Session Fee, the Razorpay amount, and the appointment's duration. **All re-derived server-side from the category row, never from the browser** — `/book` is ISR-cached, so the copy the patient filled in can legitimately be older than the one being charged. |
| Therapist `visible_on_team` / approval / active | People → Therapists | Whether a `?therapist=` link resolves at all |

### 10.8 How payment is connected

1. Step 3's primary button reads **Request Booking** the first time.
2. Tapping it creates the account (guest only), runs a client-side self-overlap check, then calls `POST /api/appointments/create`. That route **re-derives** concern, duration, lead time, therapist preference and language server-side, scans the notes for contact leaks (record-only for a patient), and inserts the appointment as `status: 'requested'`, `payment_status: 'unpaid'`, `therapist_id: null`, `visit_mode: 'online'`.
3. The wizard then immediately opens Razorpay checkout via `POST /api/razorpay/create-order`. **That call flips the patient's `approved` flag to true** — on the attempt, not on success.
4. On checkout success, `POST /api/razorpay/verify` checks the signature server-side, marks the appointment paid, auto-confirms it **only if a therapist is already assigned**, creates the Meet event if so, and records the capture.

**Appointments are never inserted by the browser.** If you ever see a raw Postgres string such as `new row violates row-level security policy for table "appointments"` on screen, that is a P0 defect — the failure mode this route exists to prevent.

### 10.9 What happens on each payment outcome

| Outcome | What the patient sees | What is created |
| --- | --- | --- |
| **Success** | Step 3 is replaced by a **Payment Confirmed** panel with a **Go to Dashboard** link | Appointment `payment_status='paid'`, still `requested` until an admin assigns; a `payments` row |
| **Failure** (`failure@razorpay`) | An error message; the primary button now reads **Pay ₹… Now** (not "Request Booking"); attempt counter increments | The appointment already exists and stays `requested` + `unpaid` |
| **Dismissed** (patient closes the checkout modal) | *"Payment was not completed. You can try again below."* | Same as failure |
| **Abandoned** (patient closes the tab) | Nothing | Same. The booking sits in their dashboard as an unpaid session with a **Pay ₹… Now** button. If the webhook secret is set and the order was in fact captured, the webhook confirms it server-side anyway. |
| **Retry** | Tapping **Pay … Now** re-opens checkout against the **same** appointment. `create-order` re-checks the prior order: if Razorpay says it is already paid, the appointment is claimed as paid rather than a second order being minted. | No second appointment, no second order for a paid one |
| **3+ failed attempts** | An amber escape hatch appears: *"Having trouble paying? Your booking is saved as pending…"* with a **Go to Dashboard** link | Nothing new |
| **Back from Step 3 to Step 2** | The draft appointment is deliberately abandoned; the button returns to **Request Booking** | The unpaid appointment remains in the dashboard, exactly as if the tab had been closed |

### 10.10 Refusals the wizard renders instead of the form

| Condition | What renders |
| --- | --- |
| Signed in as therapist / hospital / admin | A **wrong account** panel routing each role to what is theirs (hospitals refer; admins use New Booking; a clinician wanting therapy signs out and uses a separate patient account). Checked **before** every other branch. |
| `?package=<id>` in the URL | *"Programmes come from your therapist now"* plus the explanation and a **Book a first session** link. Ordered **after** the wrong-account branch on purpose. |
| No treatment categories exist | *"No condition categories are available right now — please contact us directly to book."* and no dropdown |

### 10.11 What happens on Back, Refresh and abandonment

| Action | Result |
| --- | --- |
| **Back** on Step 2 | Returns to Step 1. All Step 1 values are preserved. |
| **Back** on Step 3 | Returns to Step 2, **clears the draft appointment id and the failed-attempt counter**, and the primary button becomes **Request Booking** again. |
| **Refresh** at any step | The wizard restarts at Step 1 with fresh auto-picks. **No wizard state is persisted.** Any appointment already created stays in the database and appears in the dashboard as unpaid. |
| **Abandon** (close tab) | Same as refresh. |

### 10.12 What each role sees afterwards

| Role | Where | What |
| --- | --- | --- |
| **Patient** | `/patient/dashboard` and → Your Sessions | The session under **Upcoming**, `Requested` if unassigned, with **Pay ₹… Now** while unpaid |
| **Admin** | Sessions → All Sessions, and Sessions → Schedule | The session in the list and on the calendar. Unassigned sessions raise the **All Sessions** badge. Opening it gives the assign form, with a requested therapist preselected and marked **(requested)**. |
| **Admin** | Money → Transactions | The payment row, once paid |
| **Therapist** | `/therapist/dashboard/sessions` | **Nothing until an admin assigns them.** A `requested` unassigned session belongs to no therapist. |
| **Hospital** | Your Referrals / Earnings | Only if the patient was referred by them |

---

### 10.13 Step-by-step screen reference

#### Step 1 — "When suits you?"

* **Means:** pick a time you would like. It is a *request*, not a locked slot.
* **Expected of the user:** confirm or change three auto-picked values.
* **Controls:** a month calendar (tappable day cells; ineligible days are greyed and not tappable), a row of hour chips, a row of language chips, and **Continue**.
* **On selection:** the day cell highlights; the hour list re-filters to that day's eligible hours; the "we picked this for you" hint disappears from whichever value you changed and never re-fires.
* **Validation on Continue:** date and hour must be set (*"Please select a preferred date and time."*); the slot must clear the lead time (*"Please choose a time at least 12 hours from now."*); a language must be set (*"Please select a preferred language."*).
* **Nothing is created.** No appointment, no account, no charge.

#### Step 2 — Your details and your concern

* **Means:** who you are and what you need.
* **Guest:** Full Name, Email, Create Password (min 6), Phone, Confirm Password, Referral Code (optional). A signed-in patient sees only a teal *"Booking as **Name** (email)"* strip.
* **Everyone:** the concern dropdown, optional therapist preference, optional notes, and a **required** telehealth consent checkbox.
* **Referral code** is validated on blur: `Checking code...` → either `Valid — referred by <Hospital>` in teal, or `Code not recognized — double-check it or leave blank` in red. An invalid code **blocks Continue**; a blank one does not.
* **Validation on Review Booking →**, in this order: name/email/password present and password ≥ 6 (*"Please fill in your name, email, and a password (min 6 characters)."*); email shape (*"Please enter a valid email address."*); phone shape (*"Please enter a valid phone number."*); passwords match (*"Passwords do not match. Please re-enter them."*); referral code not invalid; a category is chosen (*"Please select what you'd like help with."*); consent ticked (*"Please agree to the telehealth consent terms to continue."*).
* **Nothing is created.**

#### Step 3 — Review and pay

* **Means:** confirm the summary, then pay.
* **Shows:** Name, Email, Preferred Time, Language, Concern, and Session Fee, plus two notices — the Razorpay/secure-payment line and the cancellation-window line reading the admin's configured hours.
* **Controls:** **Back** (⅓ width) and the primary button (⅔ width) reading **Request Booking**, then **Pay ₹… Now** after an appointment exists.
* **Records created:** on **Request Booking** — the Supabase auth user (guest only) and the appointment row. On payment success — the `payments` row, the appointment's paid/confirmed state, and (when a therapist is already assigned) the Google Calendar/Meet event.
