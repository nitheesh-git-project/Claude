---

## 8. Test Data Library

Use these exact values everywhere. Every test in this plan refers to them by label (for example "Patient A"). All emails use the reserved `.test` TLD so nothing can be delivered to a real inbox.

### 8.1 Standard password

**All test accounts use the same password:** `QaTest!2024pass`

Where a test needs a *second, different* password (a change-password test), use `QaTest!2024new`.

### 8.2 Admin accounts

| Label | Email | Scope | Purpose |
| --- | --- | --- | --- |
| **Admin Full** | `qa.admin@example.test` | `full` | The main admin. Survives the reset. |
| **Admin Ops** | `qa.admin.ops@example.test` | `operations` | Proves Money and Settings are blocked. |
| **Admin Finance** | `qa.admin.finance@example.test` | `finance` | Proves Sessions and Catalog are blocked. |
| **Admin Clinical** | `qa.admin.clinical@example.test` | `clinical` | Proves Money, Catalog and Settings are blocked. |

Admin Full is created by hand in Supabase before Step 0 (set `role='admin'`, `active=true`, `admin_scope='full'`). The other three are created from **Settings → Team & Access** in `ADM-SET-026`.

### 8.3 Patients

| Field | **Patient A** (main journey) | **Patient B** (isolation/negative) | **Patient C** (hospital-referred) |
| --- | --- | --- | --- |
| Full name | `QA Patient A` | `QA Patient B` | `QA Referred Patient C` |
| Email | `qa.patient.a@example.test` | `qa.patient.b@example.test` | `qa.patient.c@example.test` |
| Password | `QaTest!2024pass` | `QaTest!2024pass` | `QaTest!2024pass` |
| Phone | `+91 98765 43210` | `+91 98765 43211` | `+91 98765 43212` |
| Date of birth | `1990-04-12` | `1985-11-30` | `1978-02-05` |
| Gender | `Female` | `Male` | `Female` |
| Address line 1 | `12, 3rd Cross, Indiranagar` | `44 Residency Road` | `8, 100 Feet Road, Indiranagar` |
| Address line 2 | `Near Metro Station` | *(leave blank)* | `Above the pharmacy` |
| City | `Bengaluru` | `Bengaluru` | `Bengaluru` |
| State | `Karnataka` | `Karnataka` | `Karnataka` |
| PIN code | `560038` (serviceable) | `560025` (**not** a service area) | `560038` |
| Emergency contact | `QA Contact A`, `+91 98765 43299` | *(leave blank)* | `QA Contact C`, `+91 98765 43298` |
| Referral code | *(blank)* | *(blank)* | The code from Hospital A (`HOS-AUTH-002`) |
| Concern | `Lower back pain` | `Knee pain after running` | `Post-stroke weakness, right side` |
| Booking notes | `Desk job, pain worse after sitting all day. Goal: sit through a full workday.` | `Pain on stairs for six weeks.` | `Discharged last week, needs home programme.` |

**Negative-test values** (used to prove validation, never to create an account):

| Purpose | Value |
| --- | --- |
| Invalid email | `not-an-email` |
| Too-short password | `abc12` (5 characters; minimum is 6) |
| Mismatched confirm password | Password `QaTest!2024pass`, confirm `QaTest!2024pas` |
| Invalid phone | `12345` |
| Invalid PIN code | `0560038` (leading zero — the pattern requires `[1-9]` first) and `56003` (5 digits) |
| Unknown referral code | `ZZZZZZ` |
| Contact-leak **block** text | `Pay me on UPI 9876543210@okhdfc instead` |
| Contact-leak **flag** text | `Call me on 9876543210` |
| Clinical text that must **not** flag | `Grade III PA mobilisation ×3 sets, 30s hold. Repeat 10 reps, twice daily.` |

### 8.4 Clinical answers — Orthopaedic (Patient A)

The orthopaedic intake is **seven questions**. Question keys are fixed and globally unique.

| Question (as shown) | Key | Answer to enter |
| --- | --- | --- |
| What's the main issue you'd like help with? | `chief_complaint` | `Lower back pain that spreads into my right hip` |
| How long has this been going on? | `since_when` | `About four months` |
| Overall severity right now (0–10) | `severity` | `6` |
| Where does it hurt? (tap each area, rate 0–10) | `area_pain` | Tap **Lower back** → rate `7`; tap **Right hip** → rate `5` |
| What makes it worse? | `worsens` | `Sitting for more than an hour, and bending to pick things up` |
| What helps or relieves it? | `helps` | `Walking, and lying flat for ten minutes` |
| Anything else the therapist should know? | `notes` | `I work at a desk nine hours a day. No previous surgery.` |

### 8.5 Clinical answers — Neurological (Patient C)

All neurological keys are prefixed `neuro_`.

| Question | Key | Answer |
| --- | --- | --- |
| What is the neurological condition or event, and when did it start? | `neuro_diagnosis` | `Ischaemic stroke, six weeks ago` |
| Which part of the body is affected? | `neuro_affected_side` | `Right side` |
| How do you move around indoors right now? | `neuro_mobility` | `With a walking stick and someone nearby` |
| Day-to-day independence right now (0–10) | `neuro_independence` | `4` |
| Which of these are present? | `neuro_symptoms` | Tick `Weakness on one side` and `Difficulty with balance or walking` |
| Falls in the last three months? | `neuro_falls` | `One` |
| What would you most like to be able to do again? | `neuro_goal` | `Walk to the end of my street without help` |

### 8.6 Clinical answers — Paediatric (Patient D, if used)

Paediatric keys are prefixed `peds_`. **The two caregiver fields are a pre-step, not part of the seven-question count** — the answered counter must never include them.

| Question | Key | Answer |
| --- | --- | --- |
| Your name | `peds_caregiver_name` | `QA Caregiver D` |
| How are you related to the child? | `peds_caregiver_relationship` | `Mother` |
| What is the main concern about your child? | `peds_concern` | `He is not walking on his own yet at 20 months` |
| How was your child born? | `peds_birth_history` | `Born at 34 weeks, two weeks in special care` |
| Which of these can your child do on their own today? | `peds_milestones` | Tick `Sits without support` and `Pulls to stand` |
| Has a doctor given a diagnosis, or ordered any tests? | `peds_diagnosis` | `No diagnosis yet, an MRI is booked` |
| Does your child use a brace, splint, walker, wheelchair or special footwear? | `peds_equipment` | `Ankle splints on both feet` |
| What is hardest for your child in a normal day? | `peds_daily_difficulty` | `Standing long enough to play at the table` |
| What would you most like your child to be able to do in the next few months? | `peds_goal` | `Take a few steps holding my hand` |

### 8.7 Triage answers (therapist asks these at first contact)

Triage is four questions. Its answers are stored separately from the patient's own record and are never shown to the patient.

| Question | For an **ortho** outcome (Patient A) | For a **neuro** outcome (Patient C) |
| --- | --- | --- |
| How old is the patient? | `18 to 64` | `65 or older` |
| What brought them in? | `Injury, strain or overuse` | `After a stroke, brain or spinal injury` |
| Any of these present? | `None of these` | `Weakness on one side` + `Difficulty with balance or walking` |
| Any concern about milestones…? | *(not shown — only appears when age is `Under 18`)* | *(not shown)* |

Expected suggestion: **Orthopaedic** for Patient A, **Neurological** for Patient C. The suggestion is shown with its reason and is **never auto-accepted** — the therapist confirms.

### 8.8 Therapists

| Field | **Therapist A** (main) | **Therapist B** (isolation tests) | **Therapist C** (leave / spare) |
| --- | --- | --- | --- |
| Full name | `QA Therapist A` | `QA Therapist B` | `QA Therapist C` |
| Email | `qa.therapist.a@example.test` | `qa.therapist.b@example.test` | `qa.therapist.c@example.test` |
| Password | `QaTest!2024pass` | `QaTest!2024pass` | `QaTest!2024pass` |
| Phone | `+91 90000 10001` | `+91 90000 10002` | `+91 90000 10003` |
| Qualifications & License / Council Reg No. | `MPT (Ortho), KSCP Reg 44821` | `MPT (Neuro), KSCP Reg 44822` | `BPT, KSCP Reg 44823` |
| Specialty / display note | `Spine and lower-limb rehabilitation` | `Stroke and neurological rehabilitation` | `Paediatric physiotherapy` |
| Experience | `9 years` | `12 years` | `5 years` |
| Bio | `Works with desk-based patients on posture-driven back pain.` | `Post-stroke gait and balance retraining.` | `Early-intervention paediatric care.` |
| Revenue share % (set by admin) | `60` | `55` | `50` |
| Home-visit revenue share % | `65` | *(leave unset — must fall back to 60/55)* | *(unset)* |
| Weekly schedule | Mon–Fri `09:00–13:00` and `14:00–18:00` | Mon–Fri `10:00–16:00` | Tue/Thu `09:00–12:00` |
| Date exception | `2026-09-15`: `14:00–18:00` only, reason `Clinic audit in the morning` | — | — |
| Leave dates | — | — | `2026-09-14` to `2026-09-18`, reason `Annual leave` |
| Timezone | Whatever the browser reports; the roster header states it | same | same |

### 8.9 Hospitals / partners

| Field | **Hospital A** (main) | **Hospital B** (isolation) |
| --- | --- | --- |
| Organisation name | `QA Sunrise Hospital` | `QA Lakeside Clinic` |
| Contact person | `QA Hospital Admin A` | `QA Hospital Admin B` |
| Email | `qa.hospital@example.test` | `qa.hospital.b@example.test` |
| Phone | `+91 80400 10001` | `+91 80400 10002` |
| Address | `18 Airport Road` | `5 Lake View Street` |
| City / State / PIN | `Bengaluru` / `Karnataka` / `560017` | `Bengaluru` / `Karnataka` / `560034` |
| Revenue share % | `10` | `12` |
| Referral code | Generated at onboarding — **write it down**, Patient C needs it | Generated at onboarding |

**Referral payload (Hospital A → Patient C)**

| Field | Value |
| --- | --- |
| Patient Full Name | `QA Referred Patient C` |
| Session Type | `Online` (and `Home visit` for the second referral) |
| Address | `8, 100 Feet Road, Indiranagar, Bengaluru` |
| Preferred Language | `English` |
| Pincode | `560038` (required only for a home-visit referral) |
| Medical Issue | `Right-sided weakness following a stroke six weeks ago` |
| Treatment Needed | `Gait and balance retraining, twice weekly` |

### 8.10 Treatment categories (conditions)

Create these in **Catalog → Conditions**.

| Category Name | Price (₹) | Session Length (min) | Order | Button Text |
| --- | --- | --- | --- | --- |
| `QA Back & Spine Care` | `1999` | `60` | `1` | `Book Assessment` |
| `QA Knee & Joint Care` | `1799` | `45` | `2` | `Book Assessment` |
| `QA Neuro Rehabilitation` | `2499` | `60` | `3` | `Book Assessment` |

Negative values for validation tests: Price `0`, Price `-100`, Price `abc`, Session Length `0`, Order `xyz`.

### 8.11 Session packages (programmes)

Create in **Catalog → Packages**. Every one of these has `session_count ≥ 2`, so **none of them is directly purchasable** — they can only reach a patient through a care plan. That is the rule under test, not a limitation of the fixtures.

| Field | **Package P1** | **Package P2** | **Package P3 (consultation)** |
| --- | --- | --- | --- |
| Category | `QA Back & Spine Care` | `QA Neuro Rehabilitation` | `QA Back & Spine Care` |
| Package Name | `QA Spine Recovery 6 Sessions` | `QA Neuro Rehab 8 Sessions` | `QA Single Session` |
| Subtitle | `Six weeks, one therapist, measured progress` | `Eight sessions of gait and balance work` | `One assessment` |
| Description | `A structured six-session block for persistent lower-back pain.` | `An eight-session neurological rehabilitation block.` | `A single 60-minute session.` |
| What We Promise (one per line) | `The same therapist every session` / `A written home programme` / `Progress measured, not guessed` | `The same therapist every session` / `Gait retraining` / `Family guidance` | `A full assessment` |
| Sessions Included | `6` | `8` | `1` |
| Bundle Price (₹) | `9999` | `17999` | `1999` |
| Compare-at Price (₹) | *(blank — auto-computes from the category price)* | *(blank)* | *(blank)* |
| Therapist Pay Basis | `Discounted package price` | `Category list price` | `Discounted package price` |
| Validity (days) | `90` | `120` | `30` |
| Session Duration (min) | *(blank — inherits 60)* | *(blank)* | *(blank)* |
| Minimum gap between sessions (hours) | `24` | `48` | *(blank)* |
| Maximum sessions per week | `3` | `2` | *(blank)* |
| Maximum purchases per patient | `2` | `1` | *(blank)* |
| Display Order | `1` | `2` | `3` |
| Active | ticked | ticked | ticked |

**Package validation negatives** (expected error text in brackets):

| Input | Expected message |
| --- | --- |
| Package Name blank | `Package Name is required.` |
| Sessions Included `1` | `Sessions Included must be a whole number of 2 or more.` |
| Bundle Price `0` | `Bundle Price must be a positive number.` |
| Compare-at `5000` with Bundle `9999` | `Compare-at Price can't be lower than the Bundle Price.` |
| Order `abc` | `Order must be a number.` |

### 8.12 Home-visit packages

Create in **Catalog → Packages** (home-visit section).

| Field | **HV1 (consultation)** | **HV2 (programme)** |
| --- | --- | --- |
| Package Name | `QA Home Visit — Single` | `QA Home Visit Recovery — 4 Visits` |
| Subtitle | `One visit at your door` | `Four visits over a month` |
| Description | `A single home assessment.` | `A four-visit home rehabilitation block.` |
| Benefits (one per line) | `A physiotherapist at your door` / `Full assessment` | `The same therapist each visit` / `Family training` |
| Visits Included | `1` | `4` |
| Package Price (₹) | `2499` | `8999` |
| Visit Duration (minutes) | `60` | `60` |
| Validity (days) | `30` | `90` |
| Minimum gap between visits (hours) | *(blank)* | `48` |
| Maximum visits per week | *(blank)* | `2` |
| Travel fee included in price | **unticked** | **unticked** |
| Lock to one therapist | ticked | ticked |
| Active | ticked | ticked |

**HV1 is the only home-visit row that may be bought directly** (one visit = a consultation). HV2 (`visit_count > 1`) must be refused by both `/api/home-visit/create-order` and `/api/home-visit/book-cash`.

### 8.13 Service areas (home visit)

Create in **Catalog → Service Areas**.

| Field | **Area 1** | **Area 2** |
| --- | --- | --- |
| City | `Bengaluru` | `Bengaluru` |
| Area name | `Indiranagar` | `Koramangala` |
| Travel fee (₹ per visit) | `150` | `200` |
| Pincodes | `560038` | `560095` |
| Notes | `Core service area` | `Second phase` |

**Not serviceable (use for the negative path):** `560025`. **Invalid formats:** `0560038`, `56003`, `abcdef`.

### 8.14 Documents (patient uploads)

Create small dummy files locally. Content does not matter; the filename and type do.

| Filename | Type to pick in the uploader | Purpose |
| --- | --- | --- |
| `Spine_Report_E2E.pdf` | `Scan or X-ray` | Happy path |
| `Posture_Assessment_E2E.pdf` | `Lab report` | Second upload |
| `Discharge_Note_E2E.pdf` | `Hospital summary` | Third upload |
| `Referral_Letter_E2E.pdf` | `Referral letter` | Fourth |
| `Knee_Xray_E2E.jpg` | `Scan or X-ray` | Image path (browser re-compresses images before upload) |
| `Oversize_Report_E2E.pdf` | `Scan or X-ray` | **Must be larger than 10 MB.** Create with: `head -c 11000000 /dev/urandom > Oversize_Report_E2E.pdf` |
| `Not_Allowed_E2E.txt` | *(the picker will not accept it)* | Wrong MIME type |

**Caps:** 10 MB per file, **20 files per patient**. Both are enforced in the upload route, which is the only writer.

### 8.15 Business expenses (Money → Costs)

| Description | Category | Amount (₹) | Incurred on |
| --- | --- | --- | --- |
| `QA Clinic rent September` | (pick the rent/premises category) | `25000` | `2026-09-01` |
| `QA Software subscriptions` | (pick the software/tools category) | `4000` | `2026-09-03` |
| `QA Marketing test spend` | (pick the marketing category) | `6000` | `2026-08-28` (deliberately outside a September range, to test date filtering) |

### 8.16 Free-text fixtures for the contact-leak scanner

| Text | Expected tier | Where to enter it |
| --- | --- | --- |
| `Pay me directly on 9876543210@okhdfc, it's cheaper` | **block** — the write is refused | Therapist's care-plan *Why this, for this patient* |
| `https://rzp.io/l/abcd1234 pay here` | **block** | Therapist's suggestion note |
| `Call me on 9876543210 before the session` | **flag** — delivered, and recorded | Therapist's suggestion note |
| `Email me at therapist@example.test` | **flag** | Care-plan *Anything they should do or know* |
| `Grade III PA mobilisation ×3 sets, 30s hold. 10 reps, 2× daily. Order ref 90210.` | **no hit** — clinical text with digits must not fire | Session note |
| `Call me on 9876543210` written by the **patient** | **record only** — never blocked | Patient's booking notes on `/book` |

### 8.17 Admin settings this plan assumes

Unless a test says otherwise, leave every setting at its default. The four that matter most for setup:

| Setting | Default | Note |
| --- | --- | --- |
| **Therapist-Suggested Sessions** | **on** | Needed by `THR-SUGG-*` and `PAT-SUGG-*` |
| **Assign a Therapist Automatically** | **off** | `ADM-SET-021` switches it on; several booking tests assume the queue behaviour while it is off |
| **Session Balances From The Ledger** | **off** | `ADM-SET-019` |
| **Home Visit** | **off** | `ADM-SET-013` switches it on for the home-visit journey |

### 8.18 Setup aliases used in preconditions

Several tests name a setup step by a `SETUP-*` alias. Each is simply the catalog test that creates that fixture:

| Alias | Is | Creates |
| --- | --- | --- |
| `SETUP-CAT-001` | `ADM-CAT-001` | The three treatment categories (§8.10) |
| `SETUP-PKG-001` | `ADM-CAT-005` | Packages P1, P2, P3 (§8.11) |
| `SETUP-HVPKG-001` | `ADM-CAT-005` (home-visit section) | HV1 and HV2 (§8.12) |
| `SETUP-AREA-001` | `ADM-CAT-010` | Service Areas 1 and 2 (§8.13) |
