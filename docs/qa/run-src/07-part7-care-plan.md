## 8. Part 7 - The recommendation, and buying a programme

**What this part does.** The only route by which a patient buys more than one session: the therapist recommends a programme, the clinic approves it, the patient pays, and the whole run of sessions goes into the diary.

**Time.** About 70 minutes.

> **The rule this part exists to prove.** A therapist picks a **package**, never a price. There is no price field, no session-count field and no discount field on a recommendation - not hidden, not disabled, *absent*. If you find one, that is a **P0** and worth stopping for.

---

### Step 7.1 - Write the recommendation

**Who you are.** QA Therapist A.

**Do this**

1. Open the completed session from Part 5 and open its note dialog.
2. Find the recommendation panel.
3. Answer the two questions that decide everything:

| Question | Answer |
| --- | --- |
| Which condition? | `QA Back & Spine Care` |
| How many sessions? | the option that resolves to **`QA Spine Recovery 6 Sessions`** |

4. Fill the four clinical fields:

| Field | Value |
| --- | --- |
| Hands-on required | `Yes` |
| Sessions per week | `2` |
| Why this, for this patient | `Persistent mechanical low back pain, four months, desk-driven. Needs a supervised progression rather than single sessions.` |
| Anything they should do or know | `Keep walking daily. Stop any exercise that sends pain below the knee and tell me at the next session.` |

5. Submit.

**Expect**

* The programme list offers **only** programmes filed under `QA Back & Spine Care` - P1 and P3. `QA Neuro Rehab 8 Sessions` is **not** on offer, because it belongs to a different condition. A programme from somebody else's condition appearing here is a **P1**.
* There is nowhere to type a price, a session count or a discount.
* It saves as **waiting for the clinic** - not live.

**Then check what the patient sees.** Sign in as Patient A.

**Expect: nothing.** Not a greyed-out card, not "your therapist has recommended something, pending approval" - **nothing at all.** The recommendation is absent from their screens entirely until the clinic approves it. A visible pending recommendation is a **P1**, and a *purchasable* one is a **P0**.

---

### Step 7.2 - Try to buy it anyway

**Do this.** Still as Patient A, DevTools → Console:

```js
const r = await fetch("/api/care-plan/create-order", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ carePlanId: "<paste the care plan id if you can find it, or any uuid>" }),
});
({ status: r.status, body: await r.text() });
```

**Expect.** Refused. Hiding a card is presentation; refusing the order is the rule. A `200` here is a **P0**.

---

### Step 7.3 - Read the review queue

**Who you are.** The Master Admin.

**Do this**

1. Open **Today**. Read the inbox row for recommendations.
2. Open **Sessions → Recommendations**.

**Expect**

* The queue is **oldest first**, and each card is aged **in words** - `12 minutes ago` - not stamped with a date. This is a work queue, not a record.
* Today's inbox row is urgent **only** once something has waited past about four hours - not merely because the queue is non-empty. A badge that is always on is a badge nobody reads, and this is the one queue with a patient waiting behind it.
* Each card states **how many sessions or visits that patient already has unused**. Patient A has none. That figure is the commonest reason to turn a recommendation down, and it used to be invisible without leaving the queue.
* The card names the therapist whose judgement it is.

---

### Step 7.4 - Turn it down, then approve the rewrite

Both outcomes are worth seeing, and the rejection is the one that has to reach the therapist.

**Do this**

1. **Turn it down** with the reason:

```
Six sessions is more than this presentation needs. Please propose a shorter block.
```

2. Sign in as QA Therapist A and look for it.
3. Write a **new** recommendation, this time choosing `QA Single Session` (P3), with the same four clinical fields.
4. As the admin, **approve** it in one tap.

**Expect**

* A reason is **required** to turn one down - the therapist has to act on it, and "Not approved" alone says the recommendation is gone without saying what to write instead. Try a reason under ten characters: refused.
* The rejection reaches the therapist **twice**: as an item on their dashboard carrying the reason, **and** on the patient's chart beside the thread. The feed scrolls away; the chart is where a clinician goes to rewrite.
* **Approving needs no reason at all.** One tap. Taxing an approval with a sentence meaning "fine" is how a reason column fills up with "ok" and stops being worth reading - and it makes the patient wait longer for something nobody objected to. If the approve button demands a reason, that is a **P2** in the other direction.
* Every decision is recorded. Check **Logs → All Activity**: there are rows for the rejection and the approval, each naming who and when.

---

### Step 7.5 - Approve with different numbers

Worth doing once, because it is deliberately **not** an edit.

**Do this.** Have the therapist submit one more recommendation (P1, six sessions). As the admin, use **approve with changes** to publish P3 instead, with the reason:

```
Starting with a single review session before committing to a block.
```

**Expect**

* A **new version** is written, attributed to the **therapist** as its author and recording the **admin** as the person who typed it. Both names appear.
* The therapist's original is **still in the thread**, marked superseded. Rewriting a clinician's version under their name would be a lie about who decided what - if the original is gone, that is a **P0**.
* A reason is required here, because this takes something away from somebody.

---

### Step 7.6 - Check a stale offer is caught before the patient meets it

**Do this**

1. Have the therapist submit a recommendation for **P1**.
2. Before approving it, go to **Catalog → Packages** and change P1's price to `12000`.
3. Now try to approve the recommendation.

**Expect.** The approval is **blocked**, with a sentence naming the drift - the session count and the price are the two figures a patient reads and pays, and they no longer match. The alternative is that the patient discovers the clinic's stale data by having their payment refused at the last step of checkout.

**Then try to reject the same one.** It is **allowed**. Refusing to let an admin close a thread because its package moved would trap exactly the recommendation that most needs closing.

Put P1's price back to `9999`.

---

### Step 7.7 - Publish the real one and let the patient buy it

**Do this**

1. As the therapist, submit a recommendation for **`QA Spine Recovery 6 Sessions`** (P1) with the four clinical fields from Step 7.1.
2. As the admin, approve it.
3. Note the moment you approved.

**Expect.** The offer window is stamped **at approval**, not at authoring. A plan that sat in the queue for two days must not reach the patient with two days already spent off its clock. Check the expiry on the patient's card against the approval time, not the writing time.

**Now, as Patient A:**

4. Open **Suggested Sessions**.
5. Read the offer card.
6. Pay for it with the same test card (`4111 1111 1111 1111`, any future expiry, any CVV, **Success**).

**Expect**

* The card quotes **₹9,999** and **6 sessions**, the figures from the admin's catalogue - not anything the therapist typed.
* After paying, the screen lands on a **confirmation and one next step** - what arrived, what they own, then the scheduler. **A blank screen here is a P1**: this is the highest-intent moment in the product, and it used to go blank because the offer card had been accepted and nothing replaced it.
* "I'll do it later" is a real option, not a trap.

---

### Step 7.8 - Schedule the run

**Do this.** On the scheduler that follows the payment, read what it opens with before changing anything.

**Expect**

* The calendar opens **already answered** - a whole run of dates proposed from the clinician's own cadence (two a week, minimum 24 hours apart, maximum three a week, inside the 90-day validity).
* A day that cannot take the run's hour is **skipped**, not substituted. Somebody who asked for five o'clock and was handed nine in the evening because it was the only slot clearing the lead time has been given a schedule they did not ask for.
* It **stops at the validity** - it proposes fewer than six rather than proposing sessions the patient would lose.

**Now book them.** Accept the proposal, or adjust a date and book.

**Expect**

* Every session is booked, **auto-assigned to Therapist A and auto-confirmed** - the first therapist on a programme locks it, and every later session goes to them without passing through the admin's queue.
* Each gets its own Meet link.
* The balance falls to zero as you book them.

**Then check the two batch rules.** Try to book two sessions **12 hours apart**, and try to book **four in one week**.

**Expect.** Both refused, with readable messages - P1's minimum gap is 24 hours and its maximum is three a week. Those are the catalogue's own rules reaching the booking.

---

### Step 7.9 - Leave one unbooked and check the dashboard keeps asking

**Do this.** Cancel one of the booked programme sessions so the balance goes back to one, then open the patient's **Overview**.

**Expect.** An item that stays at the **top** of the feed until the balance is spent - it is waiting on the viewer, so it is pinned above dated items rather than sinking as it ages. A programme paid for a month ago with a session unbooked is exactly the item that must not drift down the list.

**And check the balance agrees everywhere:**

| Screen | Should say |
| --- | --- |
| The patient's programme widget | 6 sessions, 1 unused |
| The therapist's programme list | the same |
| Admin → Catalog → Purchases | the same |
| The scheduler | the same |

A figure that disagrees between two of these is a **P1**.

---

### Step 7.10 - Check a purchase cannot be rewritten by the catalogue

**Do this**

1. As the admin, change **P1** to `4` sessions at `₹12,000`.
2. Open Patient A's programme widget, and the admin's Purchases row.

**Expect.** The purchase still reads **6 sessions at ₹9,999** - what was actually bought. A purchase that follows the live catalogue is a **P0**: an admin re-pricing a package would silently rewrite what somebody already owns.

Put P1 back to `6` sessions at `₹9,999`.

---

### Step 7.11 - Withdraw one, and find what cannot be withdrawn

**Do this**

1. Have the therapist submit another recommendation and leave it queued.
2. As the admin, **withdraw** it with the reason `Therapist is on leave and cannot revise this.`
3. Then try to withdraw **the purchased** plan from Step 7.7.

**Expect**

* The queued one closes, freeing the patient's one-open-plan slot. Refusing here would leave the queue holding a thread nobody intends to approve while the patient's slot stayed taken.
* The **purchased** one cannot be withdrawn at all. The patient has paid and the sessions exist; the honest lane is a refund or a credit adjustment, each with its own screen.

---

### Step 7.12 - Write one on a therapist's behalf

**Do this**

1. As the admin, put **QA Therapist A** on leave.
2. Open **Sessions → Recommendations** and find the panel for writing one on their behalf.
3. Write a recommendation against one of Therapist A's own completed sessions, with the reason `Therapist on leave, patient waiting on a plan.`

**Expect**

* The panel is **there** even when there is no session to write against or no recommendable programme - it says which of the two is missing rather than being simply absent. An admin opens this screen because a patient is waiting, and a missing panel reads as a feature that does not exist.
* The programmes offered are narrowed to **the chosen session's own condition**, and changing the session **drops the draft** so a package for somebody else's condition cannot be carried across.
* Whose name it goes out in is stated **at the button**, not in a subtitle two screens up.
* The saved version names the **therapist** as author and the **admin** as the person who entered it.
* There is still no price field.

Take Therapist A off leave.

---

### Step 7.13 - Checkpoint

| | Should be |
| --- | --- |
| Patient A | One purchased programme, 6 sessions, 1 still unbooked |
| Sessions | Five more in the diary, all with Therapist A, all confirmed |
| Recommendations | One rejected, one approved-with-changes, one withdrawn, one purchased |
| Logs | A row for every one of those decisions |

---
