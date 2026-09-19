## 10. Part 9 - The partner referral, end to end

**What this part does.** Follows one referred patient from the hospital's form to a delivered session and the commission it earns. This is the one flow where the clinic has to reach somebody who has no account yet, which is why a phone number is required.

**Time.** About 50 minutes.

---

### Step 9.1 - Refer a patient

**Who you are.** `QA Sunrise Hospital` (`qa.hospital@example.test`, the generated password from Step 3.10).

**Do this**

1. Open `/hospital/dashboard/refer`.
2. Fill it in:

| Field | Value |
| --- | --- |
| Patient Full Name | `QA Referred Patient C` |
| Patient Phone Number | pick the country, then `9876543210` |
| Session Type | `Online` |
| Address | `8, 100 Feet Road, Indiranagar, Bengaluru` |
| Preferred Language | `English` |
| Medical Issue | `Right-sided weakness following a stroke six weeks ago` |
| Treatment Needed | `Gait and balance retraining, twice weekly` |

3. Submit.

**Expect**

* A teal confirmation: *"Referral submitted - our team will review and reach out."*
* The form resets and Session Type returns to `Online`. The phone field clears with the rest.
* It appears under **Your Referrals** as **Pending Review**, and in the admin's **People → Partners** with the badge raised.
* **The Pincode field is not required** for an online referral.

**Then try it with the phone blank.**

**Expect.** Refused with `Enter the patient's phone number so our team can reach them.` The number is required because the clinic **rings this patient before sending the registration link** - they have no account to message.

---

### Step 9.2 - Refer a home visit, and find the pincode rule

**Do this.** Submit a second referral for the same patient, choosing **Home visit**, leaving **Pincode** blank. Then `56003`. Then `560038`.

**Expect**

| Value | Expect |
| --- | --- |
| blank | `Enter the patient's 6-digit pincode for a home visit referral.` |
| `56003` | the same refusal |
| `560038` | accepted |

**And check the switch reaches here too.** As the admin, switch **Home Visit** off, then reload the referral form.

**Expect.** The **Home visit** option is **not offered at all**. A partner must not be offered a delivery mode the platform has not turned on. Switch it back on.

---

### Step 9.3 - Watch the admin drive the pipeline

**Who you are.** The Master Admin, with the hospital's screen open in the other browser so you can watch it change.

**Do this.** Open **People → Partners → Patient Referrals** and find `QA Referred Patient C`.

**Expect, before you touch anything.** The patient's **phone number** and **preferred language** are printed directly under their name. This is the one flow where the clinic must reach somebody who has no account, and the number being a click away is the point. If the number is missing but the rest of the card renders, the database may simply predate that column - check the referral list itself is intact before reporting it.

**Now drive each transition, checking the hospital's screen after each:**

| Do this | Hospital's Your Referrals should read |
| --- | --- |
| Nothing yet | **Pending Review** |
| Assign a therapist and a slot | **Therapist Assigned** |
| Send the registration link | **Invite Sent** |
| *(after Step 9.5)* the patient registers | **Registered** |

**Expect.** The hospital sees **status only** - never the patient's clinical record, never a session note, never a health profile.

**When you assign the slot**, look at the control you are given.

**Expect.** The same compact calendar and hour chips the patient's own booking screen uses, obeying the **same 12-hour lead time**. An admin must not be able to promise a referred patient a slot the platform's own rule would refuse - two answers to "when can this be booked", in the one flow where the person choosing is not the person who lives with it. A raw date-and-time box here is a **P1**.

---

### Step 9.4 - Try to withdraw at the wrong moment

**Do this.** As the hospital, withdraw a referral that is still **Pending Review**. Then try to withdraw the one that is **Invite Sent**.

**Expect**

* The pending one withdraws.
* The invited one is refused with `An invite has already been sent for this referral, so it can't be withdrawn`.
* Declining from the admin side **requires a reason**: `A reason is required to decline.`

---

### Step 9.5 - Register Patient C, carrying the attribution

Two ways in. Do both, on two different referrals.

**Way one - typing the code.** As a signed-out visitor, open `/book`, complete Step 1, and on Step 2 enter:

| Field | Value |
| --- | --- |
| Full Name | `QA Referred Patient C` |
| Email Address | `qa.patient.c@example.test` |
| Phone | `+91 98765 43212` |
| Password | `QaTest!2024pass` |
| Referral Code | Hospital A's code from Step 3.10 |
| What would you like help with? | `QA Neuro Rehabilitation` |

Tab out of the Referral Code field and read the line.

**Expect.** `Checking code...`, then in teal `Valid - referred by QA Sunrise Hospital`. Complete the booking and pay (`4111 1111 1111 1111`, Success).

**And the two negatives:**

| Code | Expect |
| --- | --- |
| `ZZZZZZ` | **Continue is blocked** with `That referral code isn't recognized…` |
| blank | Nothing is blocked; the booking proceeds unattributed |

**Way two - the registration link.** Copy the link from the admin's Partners screen and open it in a **private window**, then register.

**Expect.** The card is already associated with that referral, the account is created with a session immediately (no email step), and attribution is set **without the patient typing a code**. The referral becomes **Registered**.

> **The words matter here.** This is a **registration link**, never an "invite link". An invite in this product is one patient telling another, which is a different feature with different money attached - and one back office cannot have two things called an invite.

---

### Step 9.6 - Deliver a session and check the commission

**Do this**

1. As the admin, assign Patient C's paid session to **QA Therapist A** and have it delivered and completed (as in Part 5).
2. Cancel and **refund** a second paid session of Patient C's.
3. As the hospital, open **Earnings**.

**Expect**

* The completed ₹2,499 session contributes **10%** - `₹249.90`.
* The refunded session contributes **₹0**. A refund **reverses the partner's commission**, because the commission is a cut of money the clinic kept.
* The figures here match the admin's **Money → Breakdown** for the same range **exactly**. Two screens disagreeing about one commission is a **P0**.
* The sidebar's money word is **Earnings**, matching the therapist's. Not "Revenue & Payouts".
* Balances are **not** date-filtered; flows are - and each label says which it is.

---

### Step 9.7 - Check the two states that must not collapse

This is subtle and it is worth doing carefully, because collapsing them hides real money.

**Do this**

1. Have **QA Therapist B** deliver a completed paid session for Patient C. Therapist B has a revenue share (55%), so first **clear it** so they have none configured.
2. Open the admin's **Money → Summary** and **Money → Breakdown**.

**Expect**

| Case | What must happen |
| --- | --- |
| A patient **not** referred by any hospital | Hospital cut of **0**, and the appointment **stays in** the split |
| A patient referred by a hospital whose share is **unconfigured** | The appointment is **excluded from the split entirely** - it still counts in Gross, Refunds and Net, and contributes to **none** of therapist cut, hospital cut or clinic share |
| A session whose **therapist** share is unset | The same exclusion |

* Every excluded appointment is surfaced as a **named count** and a named revenue figure, not silently dropped.
* **No percentage is guessed to make the numbers tie.** If a 0% hospital cut and an unconfigured hospital produce identical figures, the split has lost the distinction - **P0**.

Put Therapist B's share back to **55**.

---

### Step 9.8 - Check the hospital is fenced in

**Do this, each as `QA Sunrise Hospital`:**

| Try | Expect |
| --- | --- |
| Open **Your Referrals** | Only Hospital A's rows. Never Hospital B's. |
| Open `/admin/dashboard` | Redirected to **`/get-started`** - never to `/admin/login`. Naming the back office's door to somebody outside it is the failure. |
| Open `/patient/dashboard/health-profile` | Redirected away. No clinical data. |
| Open `/book` | The wrong-account panel, pointing at referring. |

**Then two console calls, signed in as the hospital:**

```js
// 1. Someone else's referral
const a = await fetch("/api/hospital/withdraw-referral", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ referralId: "<a referral id that is not Hospital A's>" }),
});
console.log("withdraw:", a.status, (await a.text()).slice(0, 120));

// 2. A patient's uploaded report
const b = await fetch("/api/medical-documents/view", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ documentId: "<Patient A's report id>" }),
});
console.log("document:", b.status, (await b.text()).slice(0, 120));
```

**Expect.** Both refused - **403** or **404**, and Hospital B's referral is unchanged. Neither answer names a table or a column. A **200** on either is a **P0** that stops the run.

---

### Step 9.9 - Suspend the hospital

**Do this.** As the admin, suspend `QA Sunrise Hospital`. Then, in the hospital's still-open browser, reload the dashboard and run one console call.

**Expect**

* The dashboard redirects to **`/account-suspended`**.
* The API call is refused.
* **The suspension reaches further than the screen.** A suspended account whose cookie still works against the data layer is the gap this check exists for.

Restore the hospital.

---

### Step 9.10 - Checkpoint

| | Should be |
| --- | --- |
| Patient C | Registered through a referral, attributed to Hospital A, one completed paid session, one refunded |
| Hospital | Earnings showing ₹249.90, matching the admin's Breakdown |
| Referrals | One withdrawn, one declined with a reason, two registered |
| Exclusions | The unconfigured-share case counted and named, never estimated |

---
