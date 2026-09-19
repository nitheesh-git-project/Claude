## 10. Part 9 - The home visit

**What this part does.** Buys and delivers a visit at the patient's address, both ways of paying for it. The travel fee is the thing to watch throughout: it is a reimbursement paid to the therapist in full, never revenue, and never discounted.

**Time.** About 50 minutes.

---

### Step 9.1 - Book a visit, paying online

**Who you are.** QA Patient A.

**Do this**

1. Open `/book-home-visit`. Confirm the header reads **Step 1 of 4**.
2. Tap **Pincode**, enter `560038`, tap **Check**.
3. Read the line that comes back.
4. Fill the address:

| Field | Value |
| --- | --- |
| Address line 1 | `12, 3rd Cross, Indiranagar` |
| Address line 2 | `Near Metro Station` |
| City | `Bengaluru` |
| State | `Karnataka` |
| PIN | `560038` |

5. **Continue.** On **When suits you?**, pick a date **at least 24 hours out** and an arrival time. Read the notice about notice.
6. **Continue.** On **About you**, choose `QA Home Visit - Single - 1 visit`.
7. **Continue.** On **Review and pay**, read every line of the breakdown before tapping anything.
8. Choose **Pay online** and pay with `4111 1111 1111 1111`, **Success**.

**Expect**

* Step 3: a teal line reading *"Yes - we visit Indiranagar, Bengaluru. Travel to this area is ₹150 per visit."*
* Step 5: the copy says home visits need at least **24 hours'** notice - deliberately longer than the online session's 12, and read from its own setting. If changing the online lead time at Step 13.1 also changes this one, that is a **P1**: the two are independent.
* Step 7: the breakdown shows **three** figures - programme `₹2,499`, travel `₹150`, total `₹2,649`.
* **The button charges exactly the total shown.** ₹2,649, not ₹2,499. Quoting one figure and charging another is a **P0**, and this is the place it has happened before: a four-visit programme in a ₹150 area was ₹600 out because the card printed the programme price alone.
* After paying: a confirmation. The visit appears on the patient's Sessions screen, and the **Video / Home visit** filter now appears there - they have both kinds.

**Then check the address was snapshotted.** Go to **Edit Profile** and change the saved address to something else. Re-open the booked visit.

**Expect.** The visit still carries the **old** address. It was copied onto the appointment at purchase, not referenced live - editing a saved address must never rewrite a visit already booked or delivered. Put the address back.

---

### Step 9.2 - Check the unserviceable path

**Do this**

1. Open `/book-home-visit` again and enter `560025`. Tap **Check**.
2. Leave a waitlist entry: `QA Patient B`, `+91 98765 43211`, then **Tell me when you do**.

**Expect**

* An amber panel: *"We don't visit 560025 yet."* and *"Leave your number and we'll tell you the moment we do. Nothing has been charged."*
* **No address form and no package picker appear.** Serviceability is checked before an address is even collected.
* The panel offers a link to an **online consultation**, which is available anywhere.
* After submitting: *"Thanks - we'll be in touch."*
* As the admin, **Catalog → Service Areas** shows the waitlist entry and its badge count has risen. Change its status and the badge clears.

**And the four bad pincodes:**

| Value | Expect |
| --- | --- |
| `56003` | `Enter a valid 6-digit pincode.` |
| `0560038` | `Enter a valid 6-digit pincode.` |
| `abcdef` | `Enter a valid 6-digit pincode.` |
| *(blank)* | Nothing harmful happens; a validation message appears |

---

### Step 9.3 - Prove a four-visit package cannot be bought

**Do this**

1. Look at `/home-visit` and at the patient dashboard's booking screen.
2. Then, as Patient A, DevTools → Console:

```js
const r = await fetch("/api/home-visit/create-order", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ packageId: "<paste HV2's id from the admin's catalogue>", pincode: "560038" }),
});
({ status: r.status, body: await r.text() });
```

**Expect**

* **HV2 is not offered** on either screen. Only HV1, the single visit, has a Book button. HV2 on the booking screen is a **P0**.
* The console call is **refused**. Two or more visits is a programme, and a programme comes from a recommendation - hiding the card is not the rule, refusing the route is.

**And check the same for a stale link.** Open `/book?package=<any package id>`.

**Expect.** Not silence, and not a different amount of money - a panel reading *"Programmes come from your therapist now"* with an explanation and a **Book a first session** link. Taking a different amount than somebody came for is the one outcome a removed checkout must not produce.

---

### Step 9.4 - Book a second visit, paying cash at the door

**Do this.** Repeat Step 9.1, but at **Review and pay** choose **Pay at the visit**.

**Expect**

* The purchase is created and the visit is confirmed, with `payment_status` still reading unpaid for its whole life. **That is correct for cash** - never read a home-visit purchase's payment status the way you would an online one; check how it is being paid first.
* The patient's screens do not claim it is paid.

**Then switch cash off** (Settings → Programmes & Home Visits → allow cash on visit) and try again.

**Expect.** The cash option is gone from Step 4, and the route refuses it if called directly. Switch it back on.

---

### Step 9.5 - Deliver the cash visit and record the money

**Who you are.** QA Therapist A - assign yourself the visit as the admin first if it is unassigned.

**Do this**

1. Try to mark the cash visit **complete** before recording any cash.
2. Record the cash collection.
3. Then complete it.

**Expect**

* Step 1 is **refused** - a cash visit collects first, which is the right order anyway.
* Step 2 takes **no amount from you**. The therapist asserts that money changed hands; the system owns the number, reconstructed from the purchase. If this screen has a field where the person holding the cash types how much the clinic knows about, that is a **P0** - it is a one-field withdrawal.
* Step 3 succeeds.

**Then, as the admin, correct the amount.** Open **Money → Cash Ledger**, find the collection, and correct it with the reason:

```
Patient was short at the door, agreed the balance next visit.
```

**Expect**

* The correction needs a reason and is recorded in **Logs → All Activity**.
* A correction on a visit whose cash has **already been remitted** is refused - that transfer has gone out, so the fix is an adjustment against the next payout rather than a silent edit of a settled one.

---

### Step 9.6 - Check travel is paid to the therapist, not kept as revenue

**Do this.** As the admin, open **Money → Summary**, then **Money → Payouts**.

**Expect**

* The **₹150** travel on the online-paid visit is part of what **Therapist A is owed**, in full.
* It is **not** in revenue. If the clinic's share moved by ₹150 when that visit was delivered, the travel bill has been folded into revenue - **P0**, and it means the therapist is funding their own transport.
* Therapist A's home-visit share is **65%** (Step 3.5). Check the payout maths uses that rate, not their 60% online rate.

**Then deliver one with Therapist B**, whose home-visit share you deliberately left unset.

**Expect.** Their **55%** ordinary rate applies - not zero, and not Therapist A's 65%.

---

### Step 9.7 - Check the travel buffer

**Do this**

1. As the admin, read the **travel buffer** on Settings → Programmes & Home Visits (default 45 minutes).
2. Book Therapist A a home visit, then try to book them a second visit starting **30 minutes** after the first ends.

**Expect.** Refused as a clash - the conflict check is padded by the buffer on **both** sides of the new visit, because a therapist finishing one visit cannot be at another minutes later. An online session passes **0**, so the same 30-minute gap between two video sessions is allowed.

---

### Step 9.8 - Cancel a visit and check its own refund window

**Do this**

1. Read the **home-visit cancellation refund window** on Settings → Programmes & Home Visits.
2. Cancel a paid home visit **outside** that window.
3. Cancel another **inside** it.

**Expect**

* Outside: refunded, and the refund **includes the travel** that was charged. Refunding the service line alone leaves the patient paying for a journey nobody made - check the figure.
* Inside: not refunded, and the card says **why**, naming the window that actually applied - the home visit's own, not the online 24 hours.
* Every refund states a reason, even the forfeiture. A blank reason line on a cancelled session is a **P2**.
* A **cash** visit refunded has no gateway behind it, so it becomes a hand-back for somebody to do: it shows on the admin's Cash Ledger until an admin confirms the cash was returned.

**Then look at how the same refund reads to each party:**

| Screen | Expect |
| --- | --- |
| Admin → All Sessions | A chip naming the refund state. An **unrefunded** session shows **nothing** - not an empty chip. |
| Admin → the session drawer | The same state, plus when and by whom |
| The patient's Sessions card | A line answering *"am I getting my money back, and when"*, with the clinic's stated reason |
| The patient's Payments screen | The same refund on the matching row |

**One state that must say nothing to the patient:** a decision that **nothing is owed**. The cancelled card already explains the window; repeating it as a refund line announces a refund to somebody who is not getting one.

---

### Step 9.9 - Switch home visits off with a recommendation outstanding

**Do this**

1. Have QA Therapist A recommend **HV2** (the four-visit home programme) to Patient B, and approve it as the admin.
2. **Before** Patient B pays, switch **Home Visit** off in Settings.
3. As Patient B, try to buy it.

**Expect.** Refused, with *"Home visits aren't available right now. Please talk to your therapist."* An admin who switches home visits off has stopped the service, and a recommendation written before that must not stay purchasable.

Switch home visits back **on**.

---

### Step 9.10 - Checkpoint

| | Should be |
| --- | --- |
| Patient A | One online-paid visit (₹2,649 charged), one cash visit delivered |
| Cash ledger | One collection, one correction, both recorded |
| Waitlist | One entry for `560025` |
| Refunds | One processed, one forfeited, one cash hand-back outstanding |

---
