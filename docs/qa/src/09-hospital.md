---

## 13. Hospital / partner test plan

### 13.0 Feature guide — the partner's world

A hospital is a **referral source**, never a clinical actor. It is **provisioned by an admin** (there is no partner self-signup that produces a working account — the public `/hospitals` page collects an *enquiry*, which becomes a B2B lead an admin converts). Once provisioned it can refer patients, watch their referrals move through a status pipeline, and see the commission it has earned.

**The lifecycle end to end:**

```
/hospitals enquiry  →  admin converts the lead  →  hospital account + referral code
      →  hospital submits a referral  →  admin reviews it
      →  admin assigns a therapist  →  admin sends an invite
      →  the patient registers (via the invite, or by typing the referral code at booking)
      →  the patient books and pays  →  the session is delivered
      →  the partner commission is computed on NET revenue
      →  it appears on the hospital's Earnings and on the admin's Money screens
```

**The commission rule, precisely:** the hospital's cut is `round(net_revenue_paise × hospital_share_percent / 100)` per appointment, where `net = paid − processed_refund`. It is taken on **net**, so a refund reverses it. It is **not** taken on a session whose therapist share is unknown — that whole appointment is excluded from the split and surfaced as a named count instead. **Never guess a percentage to make the numbers tie.**

**Data isolation:** a hospital sees its own referrals and its own commission, and nothing else. It never sees another hospital's rows, another patient's clinical data, or any admin screen.

---

### 13.1 Provisioning

#### `HOS-LEAD-001` — The public enquiry form · P1

**Steps**
1. Open `/hospitals`.
2. Scroll to the enquiry form.
3. Fill it with Hospital A's details from §8.9 and submit.

**Expected Result.** A confirmation appears. A `b2b_leads` row is created. It shows in Admin → People → Partners and raises that tab's badge. **No account is created and no login works yet** — an enquiry is not a partner.
**Negative:** submitting with a blank required field, or an invalid email, is refused with a readable message and creates nothing.

#### `HOS-AUTH-002` — Admin provisions the hospital · P0
*(Executed by the admin; verified here because it produces the partner's credentials.)*

**Steps**
1. As Admin Full, open **People → Partners**.
2. Find the lead `QA Sunrise Hospital`. Tap the onboard control.
3. Enter **Organisation Name** `QA Sunrise Hospital`, **Contact Person** `QA Hospital Admin A`, **Email** `qa.hospital@example.test`, **Revenue Share %** `10`.
4. Submit.
5. **Write down the generated password and the generated referral code.**

**Expected Result.** An account is created with `role='hospital'`, `active=true`, a generated `referral_code`, and `revenue_share_percent=10`. The one-time password is shown **once, in the response** — and **never written into the `admin_activity_log`'s `details`**, because that log is readable by every admin and a generated password there would be a credential leak. An `admin_activity_log` row records *who onboarded whom and when*, with no password.
**Negative:** a share of `-5` or `150` is refused with `Revenue share must be a number between 0 and 100`. A missing email is refused. Re-submitting the same email is refused rather than creating a second account.

#### `HOS-AUTH-001` — Hospital sign-in · P0
**Steps.** Open `/hospital/login`, sign in with `qa.hospital@example.test` and the generated password.
**Expected Result.** Lands on `/hospital/dashboard`. The sidebar reads **Back to Home**, **Overview**, **Refer a Patient**, **Your Referrals**, **Earnings**, **Edit Profile** (children: Logo, Organisation Details, Contact Preferences, Account Security). The money word on this sidebar is **Earnings** — matching the therapist. It must not read "Revenue & Payouts" or any third name for the same thing.

#### `HOS-AUTH-003` — A suspended hospital is locked out · P1
**Steps.** Admin toggles the hospital inactive. With the hospital's cookie, load the dashboard, then call `POST /api/hospital/withdraw-referral`.
**Expected Result.** Dashboard redirects to `/account-suspended`. The API returns **403**.

---

### 13.2 Referrals

#### `HOS-REF-001` — Submit an online referral · P0

**Steps**
1. Open `/hospital/dashboard/refer`.
2. Tap **Patient Full Name**. Enter `QA Referred Patient C`.
3. Under **Session Type**, select `Online`.
4. Tap **Address**. Enter `8, 100 Feet Road, Indiranagar, Bengaluru`.
5. Tap **Preferred Language**. Enter `English`.
6. Tap **Medical Issue**. Enter `Right-sided weakness following a stroke six weeks ago`.
7. Tap **Treatment Needed**. Enter `Gait and balance retraining, twice weekly`.
8. Submit.

**Expected Result.** A teal confirmation: *"Referral submitted — our team will review and reach out."* The form resets and the Session Type returns to `Online`. The referral appears under **Your Referrals** with status **Pending Review**. It appears in Admin → People → Partners and raises the badge. **The Pincode field is not required for an online referral.**

#### `HOS-REF-002` — A home-visit referral requires a pincode · P1

**Preconditions.** The admin master switch **Home Visit enabled** is on (otherwise the Session Type option is absent, which is itself the expected behaviour when it is off — verify that first).
**Steps.** Repeat `HOS-REF-001`, selecting `Home visit`, and submit with the **Pincode** field blank. Then submit `56003`. Then submit `560038`.
**Expected Result.** Blank and `56003` are both refused with `Enter the patient's 6-digit pincode for a home visit referral.` `560038` succeeds. With the master switch off, the **Home visit** option is not offered at all — a partner must not be offered a delivery mode the platform has not turned on.

#### `HOS-REF-003` — Duplicate referral prevention · P1
**Steps.** Submit the identical referral (same patient name, same medical issue) a second time. Also double-tap the submit button on a fresh referral.
**Expected Result.** The double-tap produces exactly **one** row. For a genuine repeat submission, the second row appears in the list — **and the admin's queue makes the duplication visible** so it can be declined rather than silently creating two patient journeys. *(See §19 — the exact duplicate-detection behaviour on a genuinely re-typed referral is one of the items flagged for confirmation.)*

#### `HOS-REF-004` — The referral status pipeline · P0

**Steps.** Watch one referral through every state, driving each transition from the admin side.

| Stage | Driven by | Status shown to the hospital |
| --- | --- | --- |
| Just submitted | Hospital | **Pending Review** |
| Therapist assigned | Admin → assign referral | **Therapist Assigned** |
| Invite sent | Admin | **Invite Sent** |
| Patient registered | Patient uses the invite / referral code | **Registered** |
| Refused | Admin → decline referral (reason required) | **Declined** |

**Expected Result.** Each transition is reflected on the hospital's **Your Referrals** screen. The hospital sees **status only** — never the patient's clinical record. Declining without a reason is refused with `A reason is required to decline.`

#### `HOS-REF-005` — Withdraw a referral · P2
**Steps.** On a **Pending Review** referral, tap the withdraw control. Then try to withdraw one whose status is **Invite Sent**.
**Expected Result.** The pending one is withdrawn. The invited one is refused with `An invite has already been sent for this referral, so it can't be withdrawn`. The same rule guards the admin's decline path with its own wording.

#### `HOS-REF-006` — Referral attribution reaches the patient · P0

**Steps**
1. As Patient C, open `/book`.
2. Complete Step 1, then on Step 2 enter the Patient C details and, in **Referral Code**, enter Hospital A's code. Tab out of the field.
3. Read the validation line.
4. Complete the booking and pay with `success@razorpay`.

**Expected Result.** Step 3 shows `Checking code...` then, in teal, `Valid — referred by QA Sunrise Hospital`. After the booking, Patient C is linked to Hospital A. The hospital's **Your Referrals** shows the referral as **Registered**. **An unknown code (`ZZZZZZ`) blocks Continue** with `That referral code isn't recognized…`; a **blank** code does not block anything.

#### `HOS-REF-007` — Registration through the invite link · P1
**Steps.** Use the invite link the admin copied (Admin → Partners → **Copy invite link**) in a private window, and register.
**Expected Result.** The register card is pre-associated with that referral. The account is created with a session immediately (no email step). The referral becomes **Registered**. Attribution is set without the patient having to type a code.

---

### 13.3 Partner money

#### `HOS-MONEY-001` — Earnings reflects delivered, paid, non-refunded work · P0

**Preconditions.** Patient C (referred by Hospital A, share `10%`) has **one completed paid** online session at ₹2,499 and **one paid, cancelled-and-refunded** session at ₹1,999. Therapist A's share is configured.

**Steps.** Open `/hospital/dashboard/revenue`.

**Expected Result**
* The completed session contributes `2499 × 10% = ₹249.90 → 24990 paise`.
* The refunded session's net is `₹1,999 − ₹1,999 = ₹0`, so it contributes **₹0** — a refund reverses the partner's commission, because the commission is a cut of money **kept**.
* The figures on this screen match Admin → Money → Breakdown's `hospitalCutPaise` for the same range exactly.
* Balances are **not date-filtered**; flows are. The screen labels which is which.

#### `HOS-MONEY-002` — A patient whose therapist share is unset is excluded, not guessed · P0
**Preconditions.** Therapist B has **no** revenue share configured; Patient C had a completed paid session with Therapist B.
**Expected Result.** That appointment is **excluded from the split entirely** — it contributes to Gross, Refunds and Net on the admin screens, but to **none** of therapist cut, hospital cut or clinic share. Admin → Money shows it in the named excluded count and excluded revenue. **No commission is estimated for the hospital.**

#### `HOS-MONEY-003` — A hospital with a share of 0 is not the same as one with none · P1
**Purpose.** These are two different states and must not collapse.
**Expected Result.** A patient **not** hospital-referred → hospital cut of 0, and the appointment stays in the split. A patient referred by a hospital whose share is **not configured** → the appointment is **excluded** from the split. If a 0% hospital cut and an unconfigured hospital produce identical figures, the split maths has lost the distinction and that is a P0 defect.

---

### 13.4 Hospital isolation and authorization

#### `HOS-SEC-001` — Hospital A cannot see Hospital B's referrals · P0
**Steps.** Sign in as Hospital A. Open **Your Referrals**. Then, with Hospital A's cookie, call `POST /api/hospital/withdraw-referral` with a referral id belonging to Hospital B.
**Expected Result.** The list contains only Hospital A's rows. The API returns **403/404** and Hospital B's referral is unchanged.

#### `HOS-SEC-002` — A hospital cannot open a patient's clinical record · P0
**Steps.** As Hospital A, navigate directly to `/therapist/dashboard/health-profile/<Patient C id>` and to `/patient/dashboard/health-profile`. Then call `POST /api/medical-documents/view` with a document id belonging to Patient C.
**Expected Result.** Both pages redirect to `/get-started` (a signed-in user of the wrong role is never shown another role's dashboard). The document route is refused — the metadata row does not come back under the hospital's own RLS-scoped client, and **the row coming back is the authorization**.

#### `HOS-SEC-003` — A hospital cannot reach the admin dashboard · P0
**Expected Result.** `/admin/dashboard` redirects to **`/get-started`**, never to `/admin/login`.

#### `HOS-SEC-004` — A hospital cannot book as a patient · P0
**Steps.** As Hospital A, open `/book`.
**Expected Result.** The wrong-account panel renders and tells the hospital to **refer** instead. A direct `POST /api/appointments/create` returns **403**.

#### `HOS-PROF-001` — Edit Profile · P2
**Steps.** Open `/hospital/dashboard/profile` and walk **Logo**, **Organisation Details**, **Contact Preferences**, **Account Security**.
**Expected Result.** The page is named **Edit Profile** — not "Account Security", which named one section of the page rather than the page. Changing the organisation name updates what the admin's Partners screen shows. A password change signs the partner out of other sessions or requires re-authentication, per the security section's behaviour.

#### `HOS-DASH-001` — Overview · P2
**Expected Result.** The same shape as every other dashboard: a strip of four figures, then the activity feed, then quick actions — in that order. Items still waiting on the partner are pinned to the top of the feed and counted.
