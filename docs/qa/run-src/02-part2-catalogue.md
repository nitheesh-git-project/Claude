## 3. Part 2 - Build the catalogue

**What this part does.** Creates everything a patient can be sold: three conditions, three programmes, two home-visit packages and two service areas. Nothing before this point can be booked, because there is nothing to book against.

**Who you are.** Signed in as the Master Admin from Step 1.0, at `/admin/dashboard`.

**Time.** About 45 minutes.

---

### Step 2.1 - Create the three conditions

You need three, and the run refers to them by name from here on. Create them one at a time.

**Do this for each row below**

1. Open **Catalog → Conditions**.
2. Tap the create control.
3. Fill the five fields exactly as the table gives them.
4. Leave the cover image alone for now - Step 2.2 does that.
5. Save.

**Condition 1**

| Field | Value |
| --- | --- |
| Category Name | `QA Back & Spine Care` |
| Price (₹) | `1999` |
| Session Length (min) | `60` |
| Order | `1` |
| Button Text | `Book Assessment` |

**Condition 2**

| Field | Value |
| --- | --- |
| Category Name | `QA Knee & Joint Care` |
| Price (₹) | `1799` |
| Session Length (min) | `45` |
| Order | `2` |
| Button Text | `Book Assessment` |

**Condition 3**

| Field | Value |
| --- | --- |
| Category Name | `QA Neuro Rehabilitation` |
| Price (₹) | `2499` |
| Session Length (min) | `60` |
| Order | `3` |
| Button Text | `Book Assessment` |

**Expect, after all three are saved**

* All three are listed in **Catalog → Conditions** in order 1, 2, 3.
* Open `/` and `/conditions` in another tab **now**, not in five minutes. All three render immediately. These pages are cached for five minutes, and the save is supposed to clear that cache - **a condition that only appears after a wait is a defect**, because it reads as a save that silently failed and gets made twice.
* Open `/book`. The concern dropdown lists `QA Back & Spine Care - ₹1,999 / 60 min` and the other two, with the price and length formatted exactly like that.
* A condition with no cover shows a **tinted placeholder panel at the same height** as a photograph would be - never a broken-image icon.

**Now prove the form refuses bad input.** Open the create form again and try each of these, one at a time. None of them should save.

| What you type | Expected message |
| --- | --- |
| Category Name blank, everything else filled | `Missing title, priceInr, or durationMinutes` |
| Price `0` | `Price must be a positive number` |
| Price `-100` | `Price must be a positive number` |
| Price `abc` | `Price must be a positive number` |
| Session Length `0` | `Session length must be a positive number of minutes` |
| Order `xyz` | `Order must be a number` |

Close the form without saving when you are done.

---

### Step 2.2 - Put a cover on a condition, and position it

**You need a picture.** Any landscape JPG or PNG **whose subject is well off to one side** - that is the whole point of the step. A centred photograph proves nothing here. Save it somewhere you can find it.

**Do this**

1. Open **Catalog → Conditions** and edit `QA Back & Spine Care`.
2. Tap **Upload an image** and choose your file.
3. Read the row that replaces the drop zone.
4. Tap **Preview & position**.
5. Drag the picture until the subject sits where you want it, then tap **Done**.
6. Save the form.

**Expect**

* At step 3, the drop zone becomes a row naming the file, with **Preview & position**, **Replace** and **Remove**, reading `Centred - not positioned yet` until you move it.
* At step 5, **the frame stays still and the picture moves inside it** - dragging right moves the picture right. A rule-of-thirds guide sits over it and the focal point shows as two percentages.
* The three small frames below the picture - **Card**, **Square**, **Dialog** - all move **together** as you drag. This is the entire feature: one position that is correct in every shape. A position right in one frame and wrong in another is a **P0**.
* **Done** only stages it. Nothing on the public site changes until you save the form at step 6, and then it changes immediately.

**Then check the same position holds in all three real frames.** Open, in turn:

| Where | Expect |
| --- | --- |
| `/conditions` | The card crops it 4:3 with your subject where you put it. |
| That condition's **View full details** dialog | Cropped 16:9, subject still where you put it, and the **heading sits on its own band below the picture** - nothing is written over the photograph. |
| `/patient/dashboard/book`, signed in as a patient (you will have one at Step 4.2 - come back then, or take it on trust now) | The same card as the public pages: cover, chips, ticks, price and a Book button. It must **not** be a text-only list. |

**Now the two refusals.** Back on the form, try to upload:

| File | Expected message |
| --- | --- |
| A PDF, or an SVG | `Please upload a JPG, PNG or WebP image.` |
| Any image larger than 5 MB | `That image is larger than 5 MB. Please use a smaller file.` |

---

### Step 2.3 - Create the three programmes

A programme is two or more sessions. **None of these can be bought from a price list** - that is the rule, not a limitation of the data. They reach a patient only through a therapist's recommendation, which you will see happen at Part 7.

**Do this for each.** Open **Catalog → Packages**, tap create, fill in the column, save.

| Field | **Programme P1** | **Programme P2** | **Programme P3** |
| --- | --- | --- | --- |
| Category | `QA Back & Spine Care` | `QA Neuro Rehabilitation` | `QA Back & Spine Care` |
| Package Name | `QA Spine Recovery 6 Sessions` | `QA Neuro Rehab 8 Sessions` | `QA Single Session` |
| Subtitle | `Six weeks, one therapist, measured progress` | `Eight sessions of gait and balance work` | `One assessment` |
| Description | `A structured six-session block for persistent lower-back pain.` | `An eight-session neurological rehabilitation block.` | `A single 60-minute session.` |
| What We Promise (one per line) | `The same therapist every session` / `A written home programme` / `Progress measured, not guessed` | `The same therapist every session` / `Gait retraining` / `Family guidance` | `A full assessment` |
| Sessions Included | `6` | `8` | `1` |
| Bundle Price (₹) | `9999` | `17999` | `1999` |
| Compare-at Price (₹) | *leave blank* | *leave blank* | *leave blank* |
| Therapist Pay Basis | `Discounted package price` | `Category list price` | `Discounted package price` |
| Validity (days) | `90` | `120` | `30` |
| Session Duration (min) | *leave blank* | *leave blank* | *leave blank* |
| Minimum gap between sessions (hours) | `24` | `48` | *leave blank* |
| Maximum sessions per week | `3` | `2` | *leave blank* |
| Maximum purchases per patient | `2` | `1` | *leave blank* |
| Display Order | `1` | `2` | `3` |
| Active | ticked | ticked | ticked |

**Expect**

* All three save.
* **The Category is locked after creation.** Re-open P1 and confirm you cannot change it - live purchases point at it.
* On the public site, a programme appears as a card **with no Buy button**, reading instead *"Arranged by your therapist after your first session."* If any programme here can be bought directly from a public page, that is a **P0** - treatment volume is never sold before an assessment.
* P1 and P3 are offered to a therapist recommending for **Back & Spine** only; P2 for **Neuro Rehabilitation** only.

**Now the five refusals.** On the create form, try each:

| What you type | Expected message |
| --- | --- |
| Package Name blank | `Package Name is required.` |
| Sessions Included `1` | `Sessions Included must be a whole number of 2 or more.` |
| Bundle Price `0` | `Bundle Price must be a positive number.` |
| Compare-at `5000` with Bundle `9999` | `Compare-at Price can't be lower than the Bundle Price.` |
| Display Order `abc` | `Order must be a number.` |

> **P3 has one session and saved anyway.** That is correct and is not a contradiction of the rule above: one session is a consultation, and there is nothing to assess before selling somebody a single appointment. The "2 or more" refusal is on the *Sessions Included* field of a **programme** form; P3 is created as the single-session row the same screen allows.

---

### Step 2.4 - Switch home visits on

Home visits are off by default, and six surfaces change when you switch them on. Check them **before** as well as after, or you cannot tell the switch did anything.

**First, with it still off**, open each of these and note what you see:

| Where | Expect while off |
| --- | --- |
| `/home-visit` | **404.** Not an empty page - a 404. |
| The public header nav | No Home Visit entry. |
| The footer's Explore column | No Home Visit entry. |
| The home page's connector grid at the bottom | No Home Visit tile. |
| Any inner page's "Where to go next" strip | No Home Visit tile. |
| `/book-home-visit` | Refused. |

**Now switch it on**

1. Open **Settings → Programmes & Home Visits**.
2. Find **Home Visit** and switch it **on**. Save.

**Expect.** A confirmation toast naming the thing and its new state - *"Home visits are on"*, not a bare "Saved". Then re-check all six surfaces above: every one of them now has the Home Visit entry, and `/home-visit` renders.

> **Why the off state matters.** While the switch is off the page 404s, so every list that mentions it has to drop the entry rather than link into a dead end. A Home Visit link that is visible while the page 404s is a **P1**.

---

### Step 2.5 - Create the two home-visit packages

Open **Catalog → Packages** and use the home-visit section.

| Field | **HV1** | **HV2** |
| --- | --- | --- |
| Package Name | `QA Home Visit - Single` | `QA Home Visit Recovery - 4 Visits` |
| Subtitle | `One visit at your door` | `Four visits over a month` |
| Description | `A single home assessment.` | `A four-visit home rehabilitation block.` |
| Benefits (one per line) | `A physiotherapist at your door` / `Full assessment` | `The same therapist each visit` / `Family training` |
| Visits Included | `1` | `4` |
| Package Price (₹) | `2499` | `8999` |
| Visit Duration (minutes) | `60` | `60` |
| Validity (days) | `30` | `90` |
| Minimum gap between visits (hours) | *leave blank* | `48` |
| Maximum visits per week | *leave blank* | `2` |
| Travel fee included in price | **unticked** | **unticked** |
| Lock to one therapist | ticked | ticked |
| Active | ticked | ticked |

**Expect**

* Both save and appear on `/home-visit`.
* **Only HV1 is offered with a Book button.** HV2 has four visits, so it is a programme: it can be recommended but not bought. You will prove the route refuses it directly at Step 11.6.

---

### Step 2.6 - Create the two service areas

A home visit cannot be sold anywhere until a pincode is covered.

**Do this.** Open **Catalog → Service Areas** and create both.

| Field | **Area 1** | **Area 2** |
| --- | --- | --- |
| City | `Bengaluru` | `Bengaluru` |
| Area name | `Indiranagar` | `Koramangala` |
| Travel fee (₹ per visit) | `150` | `200` |
| Pincodes | `560038` | `560095` |
| Notes | `Core service area` | `Second phase` |

**Expect.** Both save.

**Now the refusals.** Try to create a third area and check each message:

| What you type | Expected message |
| --- | --- |
| A third area containing `560038` | `Another service area already covers that pincode.` (or `Every pincode in that list is already a service area.`) |
| Pincodes left blank | `Enter at least one pincode.` |
| Pincode `0560038` (leading zero) | `Enter a valid 6-digit pincode.` |
| Pincode `56003` (five digits) | `Enter a valid 6-digit pincode.` |
| City blank | `City is required.` |
| Travel Fee `-50` | `Travel Fee must be zero or a positive number.` |

**Write these two down** - later parts use them:

* **`560038` is serviceable**, travel fee **₹150 per visit**.
* **`560025` is not serviceable** and is the address you will use to test the waitlist at Step 8.7.

---

### Step 2.7 - Confirm the settings this run assumes

You are not changing these yet - you are checking where they stand, so that a later result is not a mystery.

| Setting | Where | Should read | Why it matters here |
| --- | --- | --- | --- |
| **Therapist-Suggested Sessions** | Settings → Programmes & Home Visits | **on** | Part 7 needs it. On a database that predates the change it may still be off - switch it on now if it is. |
| **Assign a Therapist Automatically** | Settings → Programmes & Home Visits | **off** | Parts 4 and 5 expect a paid session to wait in the admin queue. Step 12.4 switches it on deliberately. |
| **Session Balances From The Ledger** | Settings → Programmes & Home Visits | **off** | Step 10.8 flips it and checks the balances still agree. |
| **The clinic approves a recommendation** | Settings → Programmes & Home Visits | **on** | Part 7 is written around the review queue. |
| **First session offer** | Settings → Offers & Discounts | **off** | Part 4 expects the patient to be charged list price. Step 9.1 switches it on. |
| **Promo codes** | Money → Costs | **off** | Step 9.3 switches it on. |
| **Patient invites** | Settings → Offers & Discounts | **off** | Step 9.5 switches it on. |
| **Online Booking Lead Time** | Settings → Booking Rules | **12** hours | Every booking step assumes 12. |
| **Online Cancellation Refund Window** | Settings → Booking Rules | **24** hours | Step 10.2 depends on it. |

**Also check, on any Settings screen you opened:** under the page heading there are **two lines** - one saying what the screen is in plain words, and a second starting **"For example:"**. A Settings screen whose heading is followed by "How the product behaves" and nothing else has lost its own description, which is a **P2**.

---

### Step 2.8 - Choose which four lead the home page

The home page does not list every condition - it leads with **four** and sends
the reader on for the rest. Which four is an admin's choice, not a count of
what sells: a home page that rearranges itself when a booking lands has
changed without anybody deciding, and a condition added today could never
reach it until it had already sold.

**First, look at it with nothing ticked.** Open `/` and read the "what we
treat" band.

**Expect.** Your first four conditions, in order, with a link on to
`/conditions` for the rest. **An empty band is a P1** - nothing is ticked yet,
and the fallback exists precisely so the band is never empty while somebody
has not opened the screen.

**Now choose.** In **Catalog → Conditions**, tick the feature control on
`QA Neuro Rehabilitation` and untick the others. Save, then reload `/`.

**Expect**

* Only the ticked one leads, and the band still links on to `/conditions`,
  which shows **everything**.
* The cap is **stated on the screen that sets it**, so you know how many will
  show before you reload the site.
* Ticking more than the cap is **not an error** - it simply shows the first
  of them.

**Then do the same on Home Visit.** Tick one home-visit package and reload
`/home-visit`.

**Expect.** The page shows the ticked one and **reveals the rest in place**
rather than linking somewhere - it *is* its own full list and has nowhere
else to send anybody. A control that opens a list identical to the one above
it is a dead end with a label on it.

**And check the two controls are not the same control.** On the home-visit
form there are two: one picks whether it leads the page, the other is
**Highlight with a ring**, which is styling. They must read as different
things. Two controls both called "Feature", meaning different things, in the
one place an admin meets both, is a **P2**.

**One more thing to check.** The patient dashboard's **Book a Session** screen
still shows **everything**, ticked or not. That is the screen somebody opens
*to* book, so trimming it hides what they came for.

---
