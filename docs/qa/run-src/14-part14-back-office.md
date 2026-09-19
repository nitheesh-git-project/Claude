## 15. Part 14 - The back office, screen by screen

**What this part does.** Opens **every** screen in the admin dashboard once,
in order, and goes deep on the ones no earlier part has touched. Earlier
parts exercised the back office through the work - assigning, approving,
reconciling. This is the sweep that catches whatever that missed, which is
what makes "we finished the run" mean something.

**Who you are.** The Master Admin, who is the only desk that opens all seven
sections.

**Time.** About 60 minutes.

> **Tick every row of the checklist at Step 14.8 as you go.** A screen you did
> not open is not a screen that passed.

---

### Step 14.1 - Today

Four screens. Two of them you have used; two you have not.

**Inbox.** Covered by Steps 5.1 and 7.3 - confirm once more that each figure
opens exactly the rows it counted, and that the strip agrees with the list
beneath it.

**Approvals.** Covered at Steps 3.4, 4.9 and 8.2.

**Activity.** Open it as the Master Admin, then as each of the three limited
desks.

**Expect.** A Master Admin sees **everything**. A limited desk sees only
entries whose action belongs to a section that desk can **work** *and* whose
actor sits at that desk - so it will look **sparse**, and the screen says the
list is their desk's rather than showing an empty panel that reads as
"nothing happened".

**Risk.** This one has had no step at all until now.

**Do this**

1. Open **Today → Risk**.
2. Read the thresholds, and find the two that ship **disabled**.
3. Open a signal, if the run has produced one - the contact-leak flag from
   Step 5.6 is the likeliest.
4. Review it with the note `Checked the message, clinical context is fine.`
5. Try to review one with the note `ok`.

**Expect**

* **The queue carries no action buttons.** A flag is never an accusation and
  never carries a penalty: nothing here suspends an account, holds a payout or
  hides a therapist. Acting on a finding means going to the screen that owns
  that action and doing it deliberately. **An action button on this tab is a
  P1** - it is the separation that makes running heuristics over clinical data
  safe at all.
* A signal **links to the rows behind it** rather than showing a score. An
  admin who can only see a verdict cannot disagree with it.
* Step 2: two rules are **off** on a fresh database - the two that need a
  clinic baseline nobody has yet. A threshold invented before anyone knows the
  normal rate fires on everyone or on nobody.
* Step 5 is **refused**: a review needs a real note, ten characters minimum.
  "Dismissed" with no reason reads the same as "not read".
* Reviews **append**. You cannot edit or delete one.
* **Dismiss a signal, then cause the same thing again.** A fresh signal is
  raised rather than the old one re-opening - that is correct, because it is
  new information.

**And check the desks.** As **Finance**, open Today → Risk.

**Expect.** They see the rules that are **money** questions - a cash variance,
a session completed with no payment - and not the clinical ones. The
**flagged messages** and the **contact reveal log** stay Master-Admin-only,
because those quote what a colleague wrote and name every patient contact
they opened. A desk with no rule of its own is **told so** rather than shown
a locked screen.

---

### Step 14.2 - Sessions

Six screens.

| Screen | Covered by | What to confirm here |
| --- | --- | --- |
| All Sessions | 5.1, 11.5 | Filters remembered per browser; the date range **not** remembered, because it goes stale |
| Recommendations | Part 7 | - |
| Roster | 3.6 | - |
| **Schedule** | *nothing yet* | see below |
| **Delivery** | *nothing yet* | see below |
| **New Booking** | *nothing yet* | see below |

**Schedule.** Open the calendar.

**Expect.** Every session this run has created, on its own day, in clinic
time. Tapping a day opens the same **session drawer** the list does - not a
second, parallel screen with its own idea of a session. A row with no
therapist carries the same **Tap to assign** chip.

**Delivery.** Open it.

**Expect.** No-show rate, cancellation rate, repeat-booking rate and
sessions-per-therapist. **These live under Sessions, not Money** - a no-show
rate is about how the clinic runs, not about its books. Compare any figure
that also appears on a Money screen: they are computed in one pass, so they
**cannot** disagree. If they do, that is a **P1**.

**New Booking.** This is the admin booking on somebody's behalf.

**Do this**

1. Open **Sessions → New Booking**.
2. Book `QA Patient B` a session against `QA Knee & Joint Care`, two days out.
3. Now try to book one **inside** the 12-hour lead time.
4. Tick the "book inside the window anyway" box and try again.

**Expect**

* The slot picker is the **same calendar and hour chips** the patient sees.
* Step 3 is refused by the lead time.
* Step 4 **opens the grid up** - the override lane - and the route accepts it.
  The two must agree: a grid that offers a slot the route then refuses, or a
  route that accepts one the grid would not offer, is a **P1**.
* The booking cannot reach **into the past** even with the box ticked.
* A time like `6:52` cannot be produced at all - slots start on the hour.

---

### Step 14.3 - People

Four screens, plus the detail pages behind them.

| Screen | Confirm |
| --- | --- |
| **Patients** | Every patient this run created. Open one: sessions, purchases, documents, and the money controls **only** if your desk may see money |
| **Therapists** | All three, with their shares and their `/team` visibility control |
| **Partners** | Hospital A, its referrals, its revenue share |
| **Global search** | Search a patient's name, a session code and a purchase code |

**On the global search**, sign in as **Clinical** and search a **purchase**
code.

**Expect.** They are told it does not exist. A result that opens a screen
their desk cannot open would be a dead link that looks like it worked.

**Then open a patient detail page two ways**, because they behave differently:

1. Tap the patient's name from the directory - it opens as an **overlay**
   over the dashboard.
2. **Reload** that page.

**Expect.** The reloaded page still **looks like the back office** - same dark
rail, same section list, same header shape. It must not become a bare page
with a small "back" link, which reads as being thrown out of the admin
dashboard onto a different, plainer site. **P2.**

**And press an action inside the overlay** - Mark Done on something.

**Expect.** The confirmation dialog covers the **whole screen**, centred, and
does not slide away as you scroll the panel behind it.

---

### Step 14.4 - Money

Five screens, all covered by Part 11. Confirm here only that **every one of
them** carries the alerts strip, the glossary, and an (i) on each figure - and
that each screen says in a plain sentence what it is and gives one example
under its heading.

---

### Step 14.5 - Catalog

Four screens, all built in Part 2 and used since.

| Screen | Confirm |
| --- | --- |
| Conditions | Three, ordered, one with a positioned cover |
| Packages | Three programmes and two home-visit packages |
| Service Areas | Two areas and the waitlist entry from Step 9.2 |
| **Purchases** | see below |

**Purchases** deserves a proper look, because five money actions live in it.

**Do this.** Open **Catalog → Purchases** and open Patient A's programme.

**Expect** the detail modal offers: **extend expiry**, **reassign the locked
therapist**, **refund**, **restore a session**, and **grant / reverse /
revive credits**.

| Try | Expect |
| --- | --- |
| Extend the expiry to a nonsense date | Refused |
| Reassign the locked therapist | **Future sessions only.** A completed session keeps whoever actually ran it - **P0** if it does not |
| Open the same modal as **Operations** | The money controls **do not render** |

---

### Step 14.6 - Settings

Nine screens. Three have had no step at all.

| Screen | Covered by | |
| --- | --- | --- |
| Brand & Contact | *nothing yet* | see below |
| Public Site | 15.11 (mission), 15.10 (splash) | plus testimonials and FAQ, below |
| Booking Rules | 13.4 | |
| Offers & Discounts | Part 12 | |
| Programmes & Home Visits | 2.4, 2.7, 11.8 | |
| Clinical Questions | *nothing yet* | see below |
| User Access | 3.7, 3.8, 13.7 | |
| System Health | 11.10 | |
| Account Security | *nothing yet* | see below |

**Brand & Contact.**

**Do this.** Change the **site name** to `QA Physio Clinic`, the tagline, the
contact email, the WhatsApp number, the contact phone and the footer
copyright line. Save. Then open any public page.

**Expect.** The **navbar** and the **footer** carry the new strings
immediately. They are read once at the top of the site and passed down - so a
page still showing the old name after a reload is a **P2**.

**Clinical Questions.**

**Do this**

1. Open **Settings → Clinical Questions**.
2. Confirm there is **one tab per condition type**, not three stacked lists.
3. Reword one orthopaedic question and save.
4. As Patient A, look at the health profile.
5. Back in Settings, remove **Neurological** from the types triage offers.
6. As a therapist, triage a new patient - and then re-triage Patient C, who
   already has a neurological record.

**Expect**

* Step 3's new wording appears on the patient's screen.
* Step 5 removes it from **triage only**. Patient C's existing record **keeps
  rendering**, and a therapist re-triaging them is **still offered** it -
  removing a type from the menu must not strand the patients already on it.
  **P1** if it does.
* **Orthopaedic can never be switched off.**
* The paediatric caregiver fields are **not** part of the seven-question
  count. Who is speaking for the child is provenance, not a clinical question.

**Account Security.**

**Do this.** Open it and read what it offers. Change the admin's own password
through it, then sign in again with the new one.

**Expect.** It works, it does not show any password back to you, and the
change is recorded in the log without the password in it.

**Testimonials and FAQ** (both on Public Site).

| Do this | Expect |
| --- | --- |
| Read the seeded testimonials | The form says at the point of entry that these are illustrative copy, **not real patients**. Never present one as real. |
| Add one, edit it, delete it | Each change reaches `/` and `/mission` **immediately** |
| Add an FAQ, reorder, delete | The same, on `/faq` |
| Turn the rating summary off | The real number disappears from the public pages |

---

### Step 14.7 - Logs

Both screens are covered at Step 13.6. Confirm here only that **Logs is
absent from the sidebar** for Operations, Finance and Clinical, and present
for you.

---

### Step 14.8 - The checklist

Every screen in the back office. Tick each one you actually opened.

**Today** - Inbox · Approvals · Activity · Risk

**Sessions** - Schedule · All Sessions · Roster · Recommendations · Delivery · New Booking

**People** - Patients · Therapists · Partners · Global search

**Money** - Summary · Breakdown · Costs · Payouts · Business Health · Your Numbers · Cash Ledger

**Catalog** - Conditions · Packages · Service Areas · Purchases

**Logs** - All Activity · Archive & Clear

**Settings** - Brand & Contact · Public Site · Booking Rules · Offers & Discounts · Programmes & Home Visits · Clinical Questions · User Access · System Health · Account Security

**On every one of them**, three things are true or they are a defect:

1. Under the heading there are **two lines** - what the screen is, and one
   concrete example of something you would come here to do. Not the section's
   own line repeated.
2. Every list on it **pages**, and every list with a dimension **filters**.
3. Every export offers **CSV and PDF**, and the two describe the same rows.

---

### Step 14.9 - Checkpoint

| | Should be |
| --- | --- |
| Screens opened | Every row of Step 14.8 |
| Risk | One signal reviewed with a real note, a short note refused, no action buttons on the tab |
| New Booking | One booking made, one refused by the lead time, one made through the override |
| Clinical Questions | One reworded question live, one type removed from triage without stranding its patients |
| Brand & Contact | New strings live in the navbar and footer |
| Blurbs | Two lines under every screen's heading |

---
