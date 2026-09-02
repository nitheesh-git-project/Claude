# Dr. Pooja's Physio — Complete Manual E2E Test Plan & Feature Guide

| | |
| --- | --- |
| **Document type** | QA / UAT manual — feature guide plus click-by-click regression suite |
| **Application** | Dr. Pooja's Physio (Next.js 16 App Router, React 19, Supabase, Razorpay, Google Calendar/Meet) |
| **Audience** | A tester who has never used this application before |
| **Version** | 1.0 |
| **Status** | Pre-launch. The application has no real patients. The Debug Bar is deliberately visible in every environment. |

---

## 1. Document purpose

This document does two jobs at once.

1. **Feature guide.** Before every group of test cases there is a plain-English explanation of what the feature is, why it exists, who uses it, which admin configuration controls it, what it interacts with, and what can go wrong. You should be able to read a section and understand the feature without opening the code.
2. **Executable test plan.** Every test case names the exact screen, the exact control, the exact value to type, and the exact result to expect. Nothing says "select a slot" or "verify the dashboard".

### How to read a test case

Every case uses this fixed structure:

| Field | Meaning |
| --- | --- |
| **Test ID** | Stable identifier. Quote it when reporting a defect. |
| **Feature** | The feature under test. |
| **Role** | The account you must be signed in as. |
| **Priority** | P0 critical / P1 high / P2 medium / P3 low. |
| **Purpose** | Exactly what is being verified. |
| **Preconditions** | Everything that must already exist. Usually names an earlier Test ID. |
| **Test Data** | The exact values to enter. |
| **Steps** | Numbered clicks/taps. Each step names one control and one value. |
| **Expected Result** | UI state, message text, navigation, data state, and cross-role visibility. |
| **Cleanup** | What to restore, or "leave in place for <Test ID>". |

### Conventions used in the steps

* **Tap** means click on desktop and tap on mobile. They are the same instruction.
* Control names are written exactly as they appear on screen, in **bold**: *Tap **Sign In***.
* Values to type are written in `code`: *Enter `qa.patient.a@example.test` in the **Email Address** field*.
* Where a control's name is dynamic (a patient's name, a session's time), the step tells you how to identify it — for example, "the row whose **Patient** column reads `QA Patient A`".
* Money is shown to the user in rupees (₹) and stored in the database in **paise** (₹1 = 100 paise). Where a test names a stored figure, it names paise.
* All times in the application's own copy are Asia/Kolkata (IST) unless a screen says otherwise.

### What "verify in the database" means

Some expected results reference database state. You do not need SQL for the ordinary path — the same fact is visible on an admin screen, and the test names that screen. Where a case genuinely needs the table (ledger append-only checks, RLS checks), it says so and gives the query, and it is marked as requiring Supabase SQL editor access.

---

## 2. Application overview

Dr. Pooja's Physio is a production web application for a physiotherapy practice. It has five surfaces:

1. **A public marketing site** — eight pages that explain the service and start a booking.
2. **A patient portal** — book, pay, attend, manage a health profile, answer therapist recommendations.
3. **A therapist portal** — availability, sessions, clinical records, recommendations, earnings.
4. **A hospital/partner portal** — refer patients, track referrals, see partner earnings.
5. **An admin back office** — six sections that run the clinic: Today, Sessions, People, Money, Catalog, Settings.

### The business model in one paragraph

A patient's **first purchase is always one session** — a video consultation, or (if the clinic's home-visit switch is on and their pincode is serviceable) a single home visit. Multi-session programmes cannot be bought from a price list at all: a therapist must run a session, then write a **care plan** recommending an admin-configured package, and an admin must approve it before the patient sees anything. The patient then accepts and pays from their own dashboard. That purchase creates **session credits**, which are spent one at a time as sessions are booked and delivered. Money is split between the therapist (a revenue share, earned only on delivered sessions), the referring hospital (a commission on net revenue), and the clinic.

### Integrations

| Integration | What it does | Failure behaviour |
| --- | --- | --- |
| **Supabase** | Postgres database, authentication, private file storage, realtime updates | Hard dependency. Nothing works without it. |
| **Razorpay** (test mode) | Payment orders, checkout, signature verification, webhooks, refunds | A failed payment leaves an unpaid booking the patient can retry. |
| **Google Calendar / Meet** | Creates the calendar event and video link for a confirmed session | **Never blocks a booking.** Failures are recorded on the appointment and retried. |

### Architectural facts a tester needs

* **There is no cron job and no background worker.** Anything that must happen "when time passes" — a package expiring, a failed Meet sync being retried, risk detection — runs as a bounded sweep at the top of a relevant page render. **Consequence for testing: a time-based state change may not appear until you load the page that owns the sweep.** Each affected test names that page.
* **Email confirmation is deliberately OFF.** A sign-up returns a session immediately. If any sign-up path ever shows you a "check your email" step, that is a defect (see `SEC-AUTH-004`).
* **The public pages are ISR-cached for 300 seconds.** Against a production server (`next start`), a catalog row you just created may not appear on a public page for up to five minutes. Run the tests against `next dev`, where nothing is cached. This is not a bug in the application; it is a property of the server you point at.
* **The Debug Bar is on in every environment on purpose** and is deleted (not switched off) before real launch.
