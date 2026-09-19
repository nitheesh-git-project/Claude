## 14. Part 13 - The site itself, and the small things

**What this part does.** The cross-cutting checks that do not belong to one journey: the public pages, what happens on a phone, what happens when something goes wrong, and whether the app ever leaves somebody staring at a screen that is not responding.

**Time.** About 45 minutes.

---

### Step 13.1 - Walk the eight public pages

**Do this.** Signed out, open each of `/`, `/conditions`, `/how-it-works`, `/home-visit`, `/team`, `/mission`, `/faq`, `/hospitals`.

**Expect, on every one**

* The same shape: a hero with a photograph, some bands, a "where to go next" index, and the **same closing band** - so wherever a visitor stops reading, the next step is in the same place.
* **The closing band carries a photograph**, not a wall of text on a dark panel, and it is a picture of **somebody booking**, not of treatment. The little confirmation chip over it labels itself an example.
* Every photograph has a **face**, and a **screen in frame** - a laptop, a tablet or a phone. The two exceptions are the home-visit images, which show hands-on treatment, and the clinician reading a scan, who is concentrating rather than smiling.
* The text is **short**. A hero sentence is about a dozen words; a band's lede is under ten and is often absent because the heading already said it. A band with two paragraphs of prose is a **P3** against the word budget.
* A **section rail** down the side lists what is on the page, and the scroll arrow walks it **top to bottom**. An entry that sends the arrow backwards means the rail is out of order with the page.

**Then check the index is consistent.** Every page's "where to go next" band ends on **booking**, and lists the other pages minus itself.

---

### Step 13.2 - Check the catalogue reads the same everywhere

**Do this.** Compare one programme card in three places: `/conditions`, its **View full details** dialog, and the patient dashboard's **Book a Session** screen.

**Expect**

* The **same card**, with cover, chips, ticks, price and a Book button. The dashboard's booking screen must **not** be a plainer text-only list - a patient who has already signed up meeting a plainer catalogue than a stranger does is a **P2**.
* In the dialog, the photograph gets the full width with **nothing written over it** and the heading on its own band **below**. Text over a photograph needs a scrim dark enough for any image, which is why it moved.
* A card with **no** photograph shows the shared tinted placeholder at the **same height** - it must look like a photo that has not been chosen yet, never like one that failed to load.

**And check the tap targets.** The card body opens the dialog; the **Book** link sits below it and again at the foot of the dialog. A booking link nested *inside* the card's own button is invalid markup and behaves differently per browser - **P2**.

---

### Step 13.3 - Check an admin edit reaches the public site immediately

**Do this.** With `/conditions` open in one tab, as the admin: rename a condition, change its price, and reorder two of them with **Save order**. Reload the public tab **at once**.

**Expect**

* Every change is **already there**. These pages are cached for five minutes, and each of those saves is supposed to clear that cache. A change that only appears after a wait reads as a save that silently failed, and is how the same edit gets made twice - **P2**.
* The reorder **survives a reload** of the admin screen too. A reorder that reverts is the pairwise-swap defect, and it used to happen whenever two conditions shared an order number.
* While there are unsaved moves, the screen says `Not saved yet - the public pages still show the old order.` with an **Undo changes** link, and **Save order** is visible but disabled until something has actually moved.

**Then the conflict.** With two admin tabs open, add a condition in tab B and press **Save order** in tab A.

**Expect.** Refused with `The condition list changed while you were reordering it. Refresh and try again.` Renumbering a subset collides with the rows it never saw.

**And suspend a therapist**, then reload `/team`.

**Expect.** They are gone **immediately**. Their "hide from /team" control is also **disabled** while they are suspended, naming that as the reason rather than offering an action that would change nothing.

---

### Step 13.4 - Delete a condition, three ways

**Do this**

1. Create `QA Spare Condition` with nothing booked under it. Delete it.
2. Try to delete `QA Back & Spine Care`, which has sessions and a purchase.
3. Delete every session under some condition but leave one **home-visit package** filed against it. Delete it again.
4. With two tabs open, delete a condition in one and press Delete on the same row in the other.
5. Press Delete and drop the network mid-request.

**Expect**

| Step | Expect |
| --- | --- |
| 1 | Deletes. The row leaves the list, and `/` and `/conditions` update at once. |
| 2 | A **dialog** - not an eleven-pixel line clipped beside the button - naming the counts and offering **turn it off instead**, with what that preserves. |
| 3 | Names the **home-visit package** specifically. "It has bookings" would send you to delete sessions and be refused a second time by something you were never told about. |
| 4 | `That condition has already been deleted. Refresh to see the current list.` |
| 5 | `Could not reach the server. Nothing has changed.` |

**Never a success on a delete that removed nothing.** If the row is still listed after a success and a refresh, that is a **P0** - it is the exact defect this check was written for.

**And check the log names the condition's title**, not "Treatment category". The row is gone by then, so the log is the only thing left that can say which one it was.

---

### Step 13.5 - Check the app always says it is working

**Do this.** Throttle the network to **Slow 3G** and, on each dashboard, tap something that changes data - approve an account, save a setting, assign a therapist.

**Expect**

* A **teal bar** above the chrome while the work is in flight. It never shows a percentage - nothing in a browser knows how far along a server render is, and a bar sitting at 90% is a lie people learn to ignore.
* It appears only after a short delay, so a fast action does not flash it.
* The button releases when **its own request** finishes; the bar carries the rest. A button that stays disabled and spinning through a full screen rebuild reads as a hang - **P2**.
* Moving between **sidebar sections** on the patient, therapist and hospital dashboards also draws the bar. Those are plain links, so nothing in React learns the navigation started - if there is no bar there, somebody is sitting on the old screen with no acknowledgement at all.
* With **reduced motion** switched on in the operating system, the bar still appears and simply does not travel. Somebody who asked for less movement still needs to know the app is thinking.

**Then check a toggle says what it did.** Change any setting.

**Expect.** A confirmation naming **the thing and its new state** - *"Home visits are on"* - never a bare "Saved". A confirmation that does not name the thing tells somebody a request finished, which they could already see.

---

### Step 13.6 - Check the admin dashboard does not move under you

**Do this.** Open the admin dashboard and leave it. In a second browser, have a patient book a session. Watch the first screen **without reloading**.

**Expect**

* The screen **does not move**. Instead the header's **Refresh** button turns teal and carries **the number of changes waiting**.
* Tapping it fetches everything and clears the count.
* **Your own** actions never raise the count - approve something and watch for thirty seconds: no phantom "1 waiting" arrives for the row you just changed or for the log entry it wrote.
* A burst of ten bookings collapses to a small number, not ten.

The other three dashboards still refresh themselves, which is right - a patient watching for a therapist's suggested time **is** waiting for that row.

---

### Step 13.7 - Break things on purpose

**Do this**

| Do | Expect |
| --- | --- |
| Open a dashboard URL with a nonsense id in it | A friendly error screen, **not** a stack trace. Only an opaque reference code is shown - an error message can carry a column name or a row id, and patients see these screens. |
| Drop the network mid-save anywhere | A readable message saying nothing changed, not a silent failure and not a blank screen |
| Open `/admin/dashboard?section=money&tab=payouts` as the Master Admin | It **server-renders Payouts directly** - it must not paint Today first and jump |
| Open the same link with a **nonsense** tab key | It lands on that section's first screen, and an amber line says so. A silent redirect looks like it worked. |

---

### Step 13.8 - Use the whole thing on a phone

**Do this.** On a real phone, or at a 390px-wide window, walk: the home page, `/book` end to end, the patient dashboard's every screen, and the admin dashboard.

**Expect**

* Nothing scrolls sideways.
* Tap targets are finger-sized. The **body map** in the Pain Map stacks front and back rather than shrinking both until neither can be tapped.
* The sidebars become a **drawer**, and **Back to Home** is in it.
* Dialogs are usable - they fill the screen rather than sitting half off it.
* The **Razorpay sheet** works.
* A dialog opened **from inside another dialog** covers the whole screen, not just the panel it came from. A confirmation that sits at the top of scrolled content and slides away as you scroll is a real defect and has happened here.

---

### Step 13.9 - Check the keyboard and a screen reader can get through

**Do this.** Put the mouse away. Tab through `/book`, then through a dashboard.

**Expect**

* Every control is reachable, in a sensible order, with a **visible focus ring**.
* A dialog **moves focus into itself**, traps Tab while open, closes on **Escape**, and returns focus to whatever opened it.
* Every control has a name. Icon-only buttons - the debug bar's page picker and its simulated-time box included - announce something rather than nothing.
* Small grey text on white is readable. Labels, counts, hints and codes in a pale grey are a real accessibility failure, not a taste question - report them as **P2**.
* The two rotating widgets on the home page have **different** names, and the "areas of practice" picker works with arrow keys.
* Only **one** thing moves on screen at a time. The areas-of-practice carousel must never advance by itself while the walkthrough beside it is rotating.

---

### Step 13.10 - Check the splash one more time

**Do this**

| Do | Expect |
| --- | --- |
| Open the site in a brand-new tab | The splash shows |
| Reload | It does **not** |
| Navigate between pages | It does **not** |
| Leave the tab in the background past the configured minutes and come back | It shows |
| **Start a checkout, leave the tab for your bank's app, come back** | It does **not**. Splashing over a payment in progress is the one thing this must never do - **P1**. |
| Switch reduced motion on | It is skipped entirely |

**Then change its settings** (Settings → Public Site → Opening Splash): the name line, the wording, the hold, and the away threshold. Set the away threshold to `0`.

**Expect.** `0` means **first load only**. There is deliberately no value meaning "greet on every tab focus" - that is the setting that would splash over a checkout.

---

### Step 13.11 - Checkpoint

| | Should be |
| --- | --- |
| Eight public pages | One template, photographs with faces and screens, rail in order |
| Catalogue | The same card on the public page and the patient's booking screen |
| Admin edits | Live on the public site immediately |
| Progress | A bar on all four dashboards, no percentage |
| Phone | No sideways scroll, drawer nav, dialogs usable |
| Keyboard | Everything reachable, dialogs trap and restore focus |

---
