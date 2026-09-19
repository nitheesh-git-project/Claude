## 12. Part 11 - The four ways money comes off

**What this part does.** Switches on each of the four acquisition discounts in turn and proves the rule they all share: **the browser sends a name, never a figure.** Every amount comes from a row an admin created.

**Time.** About 60 minutes.

> **You need patients who have never paid.** Three of these apply only to somebody's first paid session, and Patients A and C have both paid. Register two fresh ones now, through `/patient/register`, and approve them as the admin:
>
> | | **Patient D** | **Patient E** |
> | --- | --- | --- |
> | Full Name | `QA Patient D` | `QA Patient E` |
> | Email | `qa.patient.d@example.test` | `qa.patient.e@example.test` |
> | Phone | `+91 98765 43213` | `+91 98765 43214` |
> | Password | `QaTest!2024pass` | `QaTest!2024pass` |

---

### Step 11.1 - The first-session offer

**Do this**

1. Open **Settings → Offers & Discounts**. Switch the **first session offer** on and set it to take **₹500** off.
2. As **Patient D**, go to `/book` and reach Step 3 against `QA Back & Spine Care` (₹1,999).
3. Read the Session Fee and the button.
4. Pay.
5. Book a **second** session as Patient D and read Step 3 again.

**Expect**

* Step 3 quotes **₹1,499**, and the button says the same. **The figure on the button and the figure Razorpay opens with must match** - this is the exact bug that motivated the whole quote module: the wizard printed ₹1,999 while checkout quietly applied the offer behind it.
* Step 5 quotes the **full ₹1,999**. A patient is new exactly once, and that is asked of the database rather than remembered in a browser.
* The offer is **video consultations only**. Check a home visit still quotes travel and no offer.

**Then check a stranger is quoted it too.** In a **private window**, signed into nothing, open `/book` and reach Step 3 for the same condition.

**Expect: ₹1,499.** A visitor with no account yet is exactly who a first-session offer is for - the account, the booking and the payment all happen further down that same screen. Quoting them list price and then charging the offer is the same bug pointing the other way.

---

### Step 11.2 - The goodwill adjustment

**Do this**

1. As **Patient E**, create a booking against `QA Knee & Joint Care` (₹1,799) but **do not pay**.
2. As the admin, open that session and apply a goodwill discount of **₹300** with the reason `Rescheduled twice by the clinic.`
3. Try it with the reason `Sorry` (five characters).
4. Try it with an amount of **₹1,799** - the whole price.
5. As Patient E, pay.

**Expect**

* Step 2 applies, and writes a row in **Logs → All Activity**.
* Step 3 is **refused** - ten characters minimum, enforced both by the route and deeper down, so no caller gets round it.
* Step 4 is **refused**. This is a number a person typed with the price on screen beside it, so a figure at or above the price is a typo - and quietly charging ₹1 because of it is far worse than saying no. Goodwill is the one rule still floored above zero.
* Step 5 charges **₹1,499**.

**Then try it on something already paid for.**

**Expect.** Refused. A discount on something already paid for is a refund, and refunds have their own route, their own gateway call and their own audit trail.

---

### Step 11.3 - The promo code

**Do this**

1. Open **Money → Costs** - the campaigns sit beside the figure they cost, not in Settings.
2. Switch **promo codes** on.
3. Create a campaign:

| Field | Value |
| --- | --- |
| Code | `QASPINE20` |
| Kind | percentage |
| Amount | `20` |
| Window | today to a month from today |
| Redemption cap | `2` |

4. As a patient with no prior paid session, reach Step 3 on a ₹1,999 condition, type `QASPINE20`, and read the quote.
5. Pay.
6. Have a second patient claim it and pay.
7. Have a **third** patient try to claim it.

**Expect**

* Step 4 quotes **₹1,599**. The request carries the **code**, never an amount - the kind, the figure, the window and the caps all come from the row.
* Step 7 is **refused**: the cap means two, and it holds even while claims are open, because it is enforced under a lock rather than by a count taken a moment earlier.
* A claim that is never paid for **stops counting** after a checkout hold - abandon a checkout with the code applied, wait out the hold, and the slot is free again. Nothing writes an "expired" status anywhere.

**Then the three refusals:**

| Try | Expect |
| --- | --- |
| A code that does not exist | Refused with a readable message |
| A **paused** campaign | Nothing applied, and the screen says which |
| A campaign whose window has passed | The same, naming the reason |

**And the one that matters most.** Apply a valid code at Step 3, then - before paying - have the admin **pause** the campaign. Now pay.

**Expect.** Checkout **refuses** rather than quietly charging list price. The patient was shown a figure with the code applied, and **taking more money than somebody was quoted is the one outcome a payment screen must never produce.**

**Then try to delete a code that has been used.**

**Expect.** Refused - it can be **paused**, never deleted. A paid session pointing at a campaign nobody can name cannot answer which rule gave the money away.

---

### Step 11.4 - The patient invite

**Do this**

1. Open **Settings → Offers & Discounts**, switch **patient invites** on, and set: the friend gets **₹200**, the inviter gets **₹200**, ceiling **10** per patient.
2. As **Patient A** (who has paid), find their invite code.
3. As a brand-new patient - register `QA Patient F`, `qa.patient.f@example.test`, `+91 98765 43215` - claim Patient A's code at checkout and pay.
4. Look at Patient A's next booking.

**Expect**

* Patient F's first session is **₹200** cheaper.
* **Patient A's half is earned when Patient F's session is paid for, not when they signed up.** Check Patient A's reward appears only after the payment lands. A reward that pays out on signups is a reward for creating accounts, and somebody will.
* Patient A's next booking is **₹200** cheaper, once.

**Then the four refusals:**

| Try | Expect |
| --- | --- |
| Patient A claims **their own** code | Refused |
| Patient F claims **a second** invite | Refused - a patient is new exactly once |
| **Patient C**, who has already paid, claims one | Refused |
| Somebody claims a code from an inviter already at the ceiling | Refused, and **worded so it does not tell them about somebody else's account** |

**And check a promise already made is kept.** With an unspent reward outstanding, **lower** the reward to ₹100, then let the patient spend the old one.

**Expect.** They get the **₹200** that was promised. Amounts are snapshotted when claimed - lowering the reward later must not lower what was already agreed. Switch invites **off** entirely and check the same: the switch stops new claims, it does not withdraw a promise.

---

### Step 11.5 - Check they never stack

**Do this.** Set up a patient who qualifies for **two at once** - a first-session offer of ₹500 and a promo code worth ₹300 - and read Step 3.

**Expect**

* **One** discount applies: the **largest**, so ₹500. They never stack.
* The patient pays the **lowest** price any of the rules would have given. The clinic agreed to every one of those prices, so charging a higher one because an admin tried to help would be perverse.
* Where two are equal, the **more deliberate** decision wins: goodwill first, then the code the patient typed, then the campaign that runs itself.
* The losing code is **released** - check it has not counted against its own cap for nothing.

**And check travel is never discounted.** Apply any of these to a **home visit** and read the breakdown.

**Expect.** The discount comes off the **service line only**; travel is added back afterwards at full price. Discounting travel makes the therapist fund their own transport to subsidise the clinic's marketing - **P0**.

---

### Step 11.6 - The free booking

**Do this**

1. Create a promo code `QAFREE100`, **100%** off, cap `1`.
2. As a patient with no prior paid session, apply it at Step 3.

**Expect**

* The total reads **Free**, the lock line changes to *"Nothing to pay - your discount covers this session in full"*, and the button reads **Confirm booking - free**.
* Tapping it books the session with **no Razorpay screen at all**.
* **Being charged ₹1 instead is a P0.** That was the old behaviour, and it charges a figure nobody was quoted.
* The session appears on the patient's dashboard exactly like a paid one - confirmed or pending as usual.

**Then prove the server decides it is free, not the browser.** With **no** discount running, signed in as that patient:

```js
const r = await fetch("/api/appointments/confirm-free", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ appointmentId: "<an unpaid appointment id of yours>" }),
});
({ status: r.status, body: await r.text() });
```

**Expect.** **409**, *"This booking still has an amount to pay."*, and the booking stays unpaid. If a booking can be confirmed free by asking, every session in the app is free - **P0**.

**Then tap the free confirmation twice** on a genuinely free booking.

**Expect.** Success both times, **one** booking. It is idempotent.

**And check what a free booking records.** As the admin, open that session:

| Check | Expect |
| --- | --- |
| A `payments` row | **None.** That table is the record of money that moved, keyed on the gateway's own ids; a collection of zero has neither. |
| The amount recorded | **Zero**, with all four discount facts beside it - list price, amount off, which rule, and why |
| Everything else | Still happened: assignment, the calendar event, any invite half settling, the patient's approval |

---

### Step 11.7 - Check the books can tell cheap from discounted

**Do this.** Open **Money → Costs** and read *Discounts given*.

**Expect**

* A figure **split by rule** - how much the first-session offer cost, how much the promo codes cost, how much goodwill cost, how much invites cost.
* It is **stated, never subtracted** from profit. Compare Operating profit before and after giving a discount: it must fall by the revenue not collected, and **not twice**.
* Every discounted session records **four facts** - the list price, the amount off, which rule, and why. A discount implemented by simply charging less leaves the books unable to tell *"we sold this cheap"* from *"we discounted it"*, and that difference is the one number that decides whether an offer continues.

---

### Step 11.8 - Put the switches back

Unless you were asked to leave them on, return each to how Step 2.7 found it:

| Setting | Back to |
| --- | --- |
| First session offer | **off** |
| Promo codes | **off** |
| Patient invites | **off** |
| Any campaign you created | paused, not deleted, if it has been claimed |

---

### Step 11.9 - Checkpoint

| | Should be |
| --- | --- |
| Each of the four discounts | Applied once, refused where it should be |
| Stacking | Proved not to |
| Travel | Never discounted |
| Free booking | One, with no payment row and all four facts recorded |
| Money → Costs | Discounts given, split by rule, not deducted from profit |

---
