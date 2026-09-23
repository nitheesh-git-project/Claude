## 1. Who this is, and what must exist first

**The account.** The **Master Admin** - the one desk that opens all seven
sections of the back office at the level that can change things. Every other
admin is a narrowed version of this one, and three of them have documents of
their own.

**What the sidebar says.** The dashboard **names itself**: `Master Admin`, in
the sidebar brand above "Admin Panel" and again as the eyebrow over the
section heading. Twice, because the sidebar collapses to icons and is a closed
drawer on a phone while the header is on every screen at every width. **A
dashboard that just says "Admin Panel" is a P2** - four desks that differ only
in which sidebar entries are missing make an admin infer which one they are on
from an absence.

**What this plan covers.** All seven sections, every screen in each, and the
capabilities that exist nowhere else: impersonation, the activity log and its
retention floor, the data reset, scope management, and the money overrides.

**The accounts this plan uses.**

| Label | Email | Password | Note |
| --- | --- | --- | --- |
| **Master Admin** | *your existing admin* | *yours* | Survives the reset at `MA-02` |
| **Operations** | `qa.admin.ops@example.test` | *generated at `MA-58`* | Created from User Access |
| **Finance** | `qa.admin.finance@example.test` | *generated at `MA-58`* | |
| **Clinical** | `qa.admin.clinical@example.test` | *generated at `MA-58`* | |

**And the non-admin accounts this plan needs**, created as the steps reach
them. All use `QaTest!2024pass`.

| | Email |
| --- | --- |
| Patient A | `qa.patient.a@example.test` |
| Patient B | `qa.patient.b@example.test` |
| Therapist A | `qa.therapist.a@example.test` |
| Therapist B | `qa.therapist.b@example.test` |
| Hospital A | `qa.hospital.a@example.test` |

### 1.1 Before you start

| You need | Why | How to check |
| --- | --- | --- |
| The application running at `http://localhost:3000` | Everything | The home page renders with a teal splash |
| A **throwaway** Supabase project | `MA-02` empties it | Open its dashboard and confirm nothing in it matters |
| `ALLOW_DEBUG_DATA_RESET=true` in the **server** environment | `MA-02` | Without it the reset route answers **404**, not 403 |
| One admin account that already exists | The reset keeps admins and deletes everyone else | Sign in at `/admin/login` |
| Razorpay **test** keys | Every payment step | The Razorpay sheet says *Test Mode* |
| Chrome or Edge, and **four** profiles | Tabs share cookies | F12 opens the console |

> **If money can move for real, stop.** Check the key in the server
> environment starts `rzp_test_` before any payment step, not after.

### 1.2 How to record a result

Mark every step **Pass**, **Fail**, **Blocked** or **N/A**. Raise a failure
with: the step id, what you did, what you expected, what happened, a
screenshot, any console error in full, how many times out of how many it
reproduced, and **which account you were signed in as**.

**Severity.** **P0** - money, clinical data or access control is wrong: stop
and report. **P1** - a main journey is broken with no workaround. **P2** -
wrong with a workaround. **P3** - cosmetic.

### 1.3 Calling a route without a terminal

Many steps call an API directly, because this application enforces its rules
twice - once in the screen, once in the route - and a hidden button proves
only the first. Sign in as the person the step names, press **F12**, open
**Console**, paste and press Enter:

```js
const r = await fetch("/api/some/route", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ some: "value" }),
});
({ status: r.status, body: await r.text() });
```

For an **anonymous** call use a private window; for a **different** admin use
a second browser profile, not a second tab. Never paste the URL in the address
bar: that sends a GET, these are POSTs, and you will get 405.

---

## 2. Getting in, and starting clean

### `MA-01` - The admin door does not announce itself · P0

| Try | Expect |
| --- | --- |
| **Signed out**, open `/admin/dashboard` | The sign-in screen, or bounced - never a rendered dashboard |
| **Signed in as a patient**, open `/admin/dashboard` | Redirected to **`/get-started`**. **Never to `/admin/login`** - that would confirm the back office exists and name its door |
| View the page source of `/admin/login` | `noindex` |
| Search the public pages' markup for `/admin` | Only the debug bar, which is removed at launch |
| Sign in with a wrong password | A generic refusal that does not say whether the address exists |

**A non-admin being sent to `/admin/login` is a P1.**

### `MA-02` - Reset the data, and read what it says · P0

**Do this**

1. Sign in as the Master Admin.
2. Find **Reset data** on the debug bar.
3. Type anything other than the exact phrase, and submit.
4. Type `RESET ALL DATA` exactly, and submit.
5. Read the result line.

**Expect**

* Step 3 is **refused**.
* Step 4 empties every table and deletes every non-admin account.
* Step 5 **names real numbers** - how many accounts were deleted. A result
  reading `0 accounts deleted, 0 admins kept` after a wipe that plainly worked
  is a **P1**: it is indistinguishable from a reset that did nothing, on the
  one control whose result cannot be checked by looking at the screen behind
  it.
* **Your admin account still works.** So do any other admins.
* **The treatment categories and their programmes survive.** They are the part
  an admin builds by hand rather than generates by testing, and emptying them
  would leave the public site looking like the clinic had shut. Home-visit
  packages, service areas, FAQs, testimonials and question templates **are**
  cleared.
* `site_settings` is back to its defaults.

**Then try it as somebody else.** Sign in as a limited admin and call the
route:

```js
const r = await fetch("/api/admin/debug-reset", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ confirmation: "RESET ALL DATA" }),
});
({ status: r.status, body: await r.text() });
```

**Expect a refusal.** Full scope only. **A limited desk wiping the database is
a P0.**

---

## 3. Catalog - building what the clinic sells

### `MA-03` - Create the treatment categories · P1

**Do this.** Open **Catalog → Conditions** and create three:

| Name | Price | Duration | Description |
| --- | --- | --- | --- |
| `QA Back & Spine Care` | `1999` | `60` | `Lower back, disc and posture-driven pain.` |
| `QA Knee & Joint Care` | `1799` | `45` | `Knee, hip and shoulder rehabilitation.` |
| `QA Neuro Rehabilitation` | `2299` | `60` | `Stroke, Parkinson's and balance retraining.` |

**Expect**

* Each appears on `/` and `/conditions` **immediately** - not in five minutes
  when a cache lapses. Those pages are cached, so the save has to invalidate
  them. **An edit invisible on the live site for minutes is a P2**, and is how
  the same edit gets made twice.
* Money is typed in rupees and rendered in rupees. No screen anywhere says
  "paise".
* A new category is created **below** the existing ones, not on top of them at
  the same order number.

### `MA-04` - Ordering is one save of the whole list · P1

**Do this**

1. Use the arrows to move `QA Knee & Joint Care` above `QA Back & Spine Care`.
2. Look at the **Save order** button before and after moving something.
3. Save.
4. Open `/conditions`.

**Expect**

* **Save order is always on screen** and only **enabled** once something moved,
  so saving is visibly the step that publishes.
* Step 3 renumbers the **whole list**, not a pair of rows. Two categories that
  happened to share an order number and were "swapped" would both keep the
  same number and nothing would change - the list would show the move and the
  next render would put it back. **An order that reverts on reload is a P1.**
* Step 4: the public page is in the new order immediately.

### `MA-05` - Covers: upload, position, and what happens with none · P2

**Do this**

1. On one category, **upload** a cover image.
2. Move its focal point away from the centre and save.
3. Open `/conditions`, then open that condition's **detail dialog**.
4. Look at a category with **no** cover.
5. Try to upload a file that is too large, and one of the wrong type.

**Expect**

* Step 1 is an **upload**, not a text box you paste a URL into. Confirm in the
  Network tab that it posts to `/api/admin/upload-catalog-image`.
* Step 3: the card is **4:3** and the dialog is **16:9**, and **the subject is
  correctly placed in both**. That is what the focal point is for - a crop
  would bake one ratio in and make the other wrong. **A head cut off in one of
  the two is a P2.**
* In the dialog, the photograph has **nothing on top of it** and the heading
  sits on its own band **below**. Text over a photograph is the layout this
  replaced, and it needs a scrim dark enough for any image.
* Step 4: a **tinted panel at the same height** with an illustration - a card
  with no photograph must look like one whose photo has not been chosen yet,
  never like one whose image failed to load.
* Step 5: both refused, with the limit named.
* Re-upload a **different format** over the same row: there is exactly one
  cover afterwards, not a stale one of the old format sitting beside it.

### `MA-06` - Featured: the home page leads with four · P2

**Do this**

1. Tick **featured** on two categories.
2. Open `/`, then `/conditions`.
3. Untick everything and open `/` again.
4. Tick six and open `/` again.

**Expect**

* `/` leads with the ticked ones, up to **four**, with the rest a tap away on
  `/conditions`, which still shows everything.
* Step 3: with nothing ticked it falls back to the **first four**. An empty
  band reads as the clinic having shut, not as a setting nobody has set.
* Step 4: more than the limit is **not an error**, and the cap is stated on
  this screen rather than discovered on the live site.
* This is **not** computed from sales. There is no control that says "most
  bought" - a home page that rearranges itself when a booking lands changes
  without anybody deciding.

### `MA-07` - Programmes under a category · P1

**Do this.** Open **Catalog → Packages** and create, under
`QA Back & Spine Care`:

| Name | Sessions | Price | Validity | Recommendable |
| --- | --- | --- | --- | --- |
| `QA Recovery Programme - 6` | `6` | `9999` | `90` days | **yes** |
| `QA Recovery Programme - 12` | `12` | `18999` | `120` days | **yes** |

Set a minimum gap and a maximum per week on the six-session one.

**Expect**

* The **compare-at price** field exists for bundle pricing and is separate
  from the discount rules entirely.
* Marking one recommendable is what puts it in front of a therapist writing a
  care plan.
* **Now open `/` and `/conditions` as a visitor.** There is **no programme
  catalogue on the public pages at all** - only treatment categories and their
  consultation price. **A price list of programmes on a public page is a P0**:
  treatment volume is never sold before an assessment, and a patient must not
  be able to shop from one.
* There is **no setting anywhere** to turn programme prices back on. A toggle
  somebody can flip is not the rule being gone.

### `MA-08` - Home visits: the master switch, areas and packages · P1

**Do this**

1. Settings → Programmes & Home Visits: turn **home visits on**.
2. **Catalog → Service Areas**: add `560038` at **₹150** travel, and `560001`
   at **₹200**.
3. **Catalog → Packages**: create home-visit packages:

| Name | Visits | Price | Travel included |
| --- | --- | --- | --- |
| `QA Home Visit - Single` | `1` | `2499` | no |
| `QA Home Visit - 4 Pack` | `4` | `8999` | no |

4. Open `/home-visit` as a visitor.
5. Turn the master switch **off** and reload `/home-visit`, `/`, and the
   footer.

**Expect**

* Step 4: `/home-visit` shows **single visits only**. The four-pack is not on
  it - a multi-visit programme comes from a care plan.
* Step 5: `/home-visit` **404s**, and **every surface that lists the site's
  pages drops it** rather than linking into a dead end: the header nav, the
  footer, the home page's connector grid and the "where to go next" strip on
  the other pages. **A link to a 404 is a P1.**
* Turn it back on.

### `MA-09` - Deleting a category that has bookings · P1

Do this **after** Part 5 has created bookings.

**Do this.** Try to delete `QA Back & Spine Care`.

**Expect**

* It is **refused**, in a **dialog** - not an 11px line clipped beside the
  button, which is how a refusal that did fire gets reported as a delete that
  did nothing.
* The refusal **names what is in the way and counts it**: sessions, purchases,
  home-visit packages. "It has bookings" alone would send you to delete
  sessions and be refused a second time by something you were never told
  about.
* It **offers the alternative**: turn it off instead.
* Now delete an **empty** category you just created. It goes, and the screen
  says so.
* **A delete that removes nothing and reports success is a P1.** Watch for it:
  the screen refreshes, is told it worked, and paints the row still sitting
  there.

### `MA-10` - Purchases, and the five money actions · P0

Do this **after** a programme has been bought.

**Do this.** Open **Catalog → Purchases** and open Patient A's programme.

**Expect** the detail offers: **extend expiry**, **reassign the locked
therapist**, **refund**, **restore a session**, and **grant / reverse /
revive credits**.

| Try | Expect |
| --- | --- |
| Extend the expiry to a nonsense date | Refused |
| Reassign the locked therapist | **Future sessions only.** A completed session keeps whoever actually ran it - **P0** if it does not |
| Grant credits with a reason of `ok` | **Refused.** Ten characters minimum, enforced by the database and not only by the form |
| Grant credits with a real reason | Lands, and appears in the ledger |
| Try to **edit** a ledger entry | There is no way to. An admin can change any balance and cannot change any history |
| Refund the purchase | **Voids what is available, never what is consumed.** A delivered session stays delivered |
| Open the same modal as **Operations** | The money controls **do not render** |

---

## 4. People - the directory and the accounts

### `MA-11` - Approve, decline, and what each does · P1

Create Patient A, Patient B, Therapist A, Therapist B by self-registration,
then:

**Do this.** Open **Today → Approvals**.

| Do | Expect |
| --- | --- |
| Approve Therapist A | They reach their dashboard and appear on `/team` **immediately** |
| Decline Therapist B with a reason | They read the reason; they are **not** on `/team` |
| Approve Patient A | They reach their dashboard |
| Leave somebody pending | The Today count matches the list exactly |

**Expect also.** Approving a **therapist** invalidates `/team`; approving a
**patient** does not need to, and should not throw the page away for nothing.

### `MA-12` - Create an account from the back office · P1

**Do this.** Open **Settings → User Access** and use the **Account type**
picker.

**Expect**

* It is **one dropdown** listing all six in two groups: **Clinic** (Patient,
  Therapist) and **Back office** (Master Admin, Operations, Finance,
  Clinical).
* There is **no** "Admin" entry that then reveals a second "Access level"
  select. Hiring somebody into Operations meant picking a word nobody uses and
  then finding a control that was not on screen a moment earlier: **P2** if it
  has come back.
* The four back-office entries read **Master Admin**, **Operations**,
  **Finance**, **Clinical** - the names of desks people sit at. Not "Full
  access". Those same four words appear on the dashboard's own brand line and
  on an existing admin's row: one set of words doing three jobs.
* Creating an account **generates a password and shows it once**, and it
  **stays on screen** - it must not vanish mid-sentence because the screen
  refreshed for its own write. **P1** if it does.
* That password is **not** in the activity log.

### `MA-13` - Patients directory and detail · P2

**Do this.** Open **People → Patients**, open Patient A, and read the whole
page.

**Expect**

* Sessions, purchases, uploaded documents, notes, and the money controls.
* **The refund state is on every session row it applies to** - a chip saying
  what happened to the money, with the date and who did it. A refunded session
  that looks exactly like an unrefunded one is a **P1**: the one question this
  screen could not answer was whether the patient had had their money back.
* An **unrefunded** session shows **nothing** there, not an empty chip.
* Change the patient's contact email. Then open the log: the entry records
  **the old value and the new one**, not merely that something changed.
* Write an admin note. The log records its **length**, not its text - this log
  is readable by every admin and a note about one patient must not be
  reproduced across the back office.

### `MA-14` - Reset somebody's password · P1

**Do this.** Reset Patient A's password from their profile.

**Expect**

* A password is **generated and shown once**, and stays on screen.
* The log records **who reset what and when**, and **not the password**.
* Sign in as Patient A with it, then set their own. The admin's screen now
  shows they are **no longer on a password the clinic issued**.
* **No screen ever shows a password somebody chose themselves.** That value is
  not in the database. A screen offering it is a **P0**.

### `MA-15` - The therapists directory · P2

**Do this.** Open **People → Therapists**.

| Do | Expect |
| --- | --- |
| Set Therapist A's revenue share to `60%` online, `65%` home visit | Saves, and their own dashboard says `Your Revenue Share: 60%` |
| Hide them from `/team` | They come off the public page immediately |
| **Suspend** them | They come off `/team` immediately too |
| Look at the "Hide from /team" button while they are suspended | **Disabled, naming which of the two is the reason.** A control that cannot change what anyone sees says so, rather than offering an action that would do nothing |
| Un-suspend | They return to **whatever visibility the admin had chosen**, not to a default |
| Hide their rating from the public pages | Their own dashboard's rating line ends ` - hidden from public pages` |

### `MA-16` - Partners · P1

**Do this.** Open **People → Partners** and create Hospital A at a **15%**
revenue share.

**Expect**

* A password and a **referral code** are generated and shown once.
* The revenue-share editor and the two share figures render for you. Open the
  same screen as **Operations**: **People is theirs, but the revenue share is
  a money control and must not render.** A section a desk can open does not
  mean every control on it is theirs: **P1** if it shows.
* The referral list carries each patient's **phone and preferred language
  under their name**.

### `MA-17` - Deleting an account, and why it usually refuses · P1

**Do this**

1. Try to delete Patient A, who has sessions and payments.
2. Try to delete an account created by mistake with no history at all.
3. Try to delete **yourself**.
4. Try to delete the **last** Master Admin who can still sign in.

**Expect**

* Step 1 is **refused**, with the reasons **counted and grouped the way a
  person describes them** - not a list of fifty column names - and **with
  suspension offered beside them**. Thirty-five tables point at a profile; a
  "proper" delete would mean deleting the money and the clinical record too.
* Step 2 **succeeds**. That is the whole lawful case: a typo'd email, a
  duplicate, one created against the wrong person.
* Steps 3 and 4 are **refused**. A single mis-click must not lock everyone out
  permanently.
* The delete is **full scope only** - try it as Operations, who can manage
  People, and be refused. **P0** if they can.
* The audit row is written **before** the delete, since afterwards there is no
  row left to name, and a failed attempt is worth recording on the one action
  with no undo.

### `MA-18` - Global search · P2

**Do this.** Search for a patient's name, a session code and a purchase code.

**Expect.** Each opens the thing it found. Then sign in as **Clinical** and
search a **purchase** code: they are told it does not exist. A result that
opens a screen their desk cannot open would be a dead link that looks like it
worked.

### `MA-19` - The detail page behind the overlay · P2

**Do this**

1. Tap a patient's name from the directory - it opens as an **overlay**.
2. **Reload** that page.
3. Press an action inside the overlay - Mark Done on something.

**Expect**

* Step 2: the reloaded page **still looks like the back office** - same dark
  rail, same section list, same header shape. It must not become a bare page
  with a small "back" link, which reads as being thrown out of the admin
  dashboard onto a different, plainer site. **P2.**
* Step 3: the confirmation dialog covers the **whole screen**, centred, and
  **does not slide away as you scroll the panel behind it**. A dialog pinned
  to the top of scrolled content instead of in front of the reader is a **P2**
  - and the dialog itself is fine; it is being measured against the wrong box.

---

## 5. Sessions

### `MA-20` - The queue, and assigning · P1

**Do this.** With a paid, unassigned session waiting:

1. Open **Today → Inbox** and read the unassigned count.
2. Tap it.
3. Assign the session.

**Expect**

* Step 2 opens **exactly the rows it counted** - not the whole table with you
  left to filter it by hand.
* It **clears the screen's other filters first**, or a remembered therapist or
  date range would hide rows the count included.
* Tapping the same figure again **re-applies** it, and moving to another
  screen **drops** it, so a preset never becomes a filter you cannot find the
  source of.
* Step 3: where no therapist has ever been assigned, every surface says **Tap
  to assign**, not "Reschedule / Reassign". Assigning is not reassigning, and
  the word has to say which: **P2**.
* The assign form **honours the therapist the patient asked for**, if they
  asked for one.

### `MA-21` - Auto-assignment, when it fires and when it waits · P1

**Do this**

1. Settings → turn **auto-assign** on.
2. With **exactly one** therapist rostered and free for a slot, have a patient
   pay for it.
3. With **two** therapists free, have another pay.
4. With the patient having **requested** a specific therapist who is among the
   free ones, have a third pay.
5. Turn it off and repeat step 2.

**Expect**

* Step 2: **assigned automatically**, confirmed, with its meeting link.
* Step 3: **left in your queue**, unassigned, exactly as before. Assigning the
  wrong clinician is far worse than the wait this removes. **An arbitrary pick
  between two is a P1.**
* Step 4: **assigned to the requested therapist.**
* Step 5: back to the queue.
* **It does not change the times a patient is offered.** The roster still does
  not filter the booking picker.

### `MA-22` - Rescheduling, and the lead time as an override · P1

**Do this**

1. Open a confirmed session and move it to a slot **inside** the 12-hour
   window.
2. Open **Sessions → New Booking** and book a patient a session inside the
   window.
3. Tick the "book inside the window anyway" box and try again.
4. Try to book **into the past**, box ticked.

**Expect**

* Step 1 **succeeds**: moving a session that already exists is not a booking,
  so the lead time is zero there.
* Step 2 is **refused** by the lead time.
* Step 3 **opens the grid up** and the route accepts it. The two must agree -
  a grid that offers a slot the route then refuses, or a route that accepts
  one the grid would not offer, is a **P1**.
* Step 4 is **refused**. Zero lead time still cannot reach into the past.
* Everywhere: the control is the **same calendar and hour chips** the patient
  sees. A time like `6:52` cannot be produced at all. **A raw
  `datetime-local` on any admin screen that sets a session time is a P1.**

### `MA-23` - Cancelling, refunding, and stating why · P0

**Do this**

| Cancel | Expect |
| --- | --- |
| A session **outside** the 24-hour window | **Full refund**, recorded with a reason |
| A session **inside** it | **No refund**, and the forfeiture is recorded with **the rule's own sentence** naming the window that applied - never the cancellation's reason, because no money moved and the window is what the patient will dispute |
| A **home visit** | Its **own** window applies, not the online one. The no-refund hover quotes **that** window's hours |
| A directly-paid **home visit** | The refund includes the **travel fee**. Travel is excluded from revenue but the gateway took it, so refunding the service line alone leaves the patient paying for a journey nobody made: **P0** |

**And check all four states render**: processed, awaiting cash by hand,
failed, and not-eligible. A **failed** refund is the most urgent precisely
because nothing was watching it - confirm it is a pinned item on the patient's
own dashboard and counted on the admin's alerts strip, filed under
**Sessions** rather than Money, because that is where it is fixed.

### `MA-24` - Completing on somebody's behalf · P0

**Do this.** Complete a session the therapist was refused - one before its
window, one with no payment.

**Expect.** Both **succeed** for you. An admin is subject to neither gate: a
backfill or a correction is exactly what the override lane is for.

**Then as Finance**, try the same. **Refused** - and the two buttons should not
render for them either. **Finance completing a session is a P0.**

### `MA-25` - Reopening · P1

**Do this.** Reopen a completed session. Then have **two admins** reopen the
same one at the same moment from two browsers.

**Expect**

* Reopening **destroys both sides' ratings** and says so before it does.
* The completion time is **cleared**, not left behind. A row reading
  `confirmed` with a completion stamp on it is exactly the evidence that
  should no longer exist.
* Only **one** of the two concurrent reopens takes effect.

### `MA-26` - Recommendations: the three outcomes · P1

**Do this.** With a therapist's submission waiting on **Sessions →
Recommendations**:

| Do | Expect |
| --- | --- |
| Read the queue | **Oldest first**, aged in words rather than dated, each card stating **how many sessions that patient already has unused** |
| Approve one, plainly | **One tap, no reason required.** Taxing an approval with a sentence meaning "fine" is how a reason column fills with "ok" and stops being worth reading |
| Turn one down with `ok` | **Refused.** Ten characters, for the two outcomes that take something away |
| Turn one down with a real reason | The therapist reads it, in their feed **and** on the patient's chart |
| Approve one **with different numbers** | A **new version** attributed to the clinician and entered by you. The original stays, superseded. **The clinician's version being rewritten is a P0** |
| Approve one whose package has since been **re-priced** | **Blocked**, with a sentence naming the drift. Better you catch it than the patient's payment being refused at checkout |
| **Reject** one whose package moved | **Allowed.** Refusing to close a thread because its package moved would trap exactly the recommendation that most needs closing |
| Withdraw a **queued** one | Allowed - otherwise the queue holds a thread nobody intends to approve while the patient's one-plan slot stays taken |
| Withdraw a **purchased** one | **Refused.** The patient has paid and the sessions exist; the honest lane is a refund |

**And the offer window**: it is stamped at **approval**, not at authoring. A
plan that waited two days must not reach the patient with two days spent.
Check the expiry on an approved one.

### `MA-27` - Writing one on a therapist's behalf · P1

**Do this.** On that same screen, use the panel that writes a recommendation
for a clinician who cannot reach their dashboard.

**Expect**

* The **same rules as the therapist's own dialog**: the package comes from the
  whitelist, the source must be a **completed session that therapist ran**,
  the text is scanned, and **there is no price, session-count or discount
  field**. **A price input here is a P0.**
* Programmes are **narrowed to the chosen session's own condition**, and
  changing the session **drops the draft**, so a package for somebody else's
  condition cannot be carried across.
* **Whose name it goes out in is stated at the button**, not in a subtitle two
  screens up.
* A mandatory reason, and an audit row.
* With **no session to write against or no recommendable package**, the panel
  still renders and **says which of the two is missing**. An admin opens this
  screen because a patient is waiting; a panel that is simply absent reads as a
  feature that does not exist. **P2.**

### `MA-28` - The roster, from the admin's side · P1

**Do this.** Open **Sessions → Roster**.

**Expect**

* It opens on a **list of therapists**, not on a calendar date and an
  eighteen-column grid.
* The editor is the **same one** the therapist uses, working in **periods**.
* **You** can write a **date exception**; a therapist cannot. Set one, and
  confirm it owns **only its own date** - the weekly template is untouched.
* Set a therapist **on leave**: the schedule survives intact.
* **Nothing here moves a booking.** Remove hours a session sits in: it names
  who is affected and says the session stays as booked. **P0** if it cancels
  or moves one.

### `MA-29` - Schedule, Delivery, and the figures that must agree · P1

| Screen | Expect |
| --- | --- |
| **Schedule** | Every session on its own day in clinic time. Tapping a day opens the **same** drawer the list does, not a parallel screen. An unassigned row carries the same **Tap to assign** chip |
| **Delivery** | No-show rate, cancellation rate, repeat-booking rate, sessions per therapist. **Under Sessions, not Money** - a no-show rate is about how the clinic runs, not its books |

**Compare any Delivery figure that also appears on a Money screen.** They are
computed in one pass, so they **cannot** disagree. **If they do, that is a
P1.**

### `MA-30` - All Sessions, its presets and its export · P0

| Do | Expect |
| --- | --- |
| Apply filters, leave, come back | The filters are remembered **per browser** - but **not the date range**, which goes stale |
| Use the **Refunded** payment filter | It returns the refunded rows. It used to match nothing at all, because a refund does not live on the payment status |
| Export as CSV, then as PDF | **Both offered**, and the two describe the **same rows** - the filtered ones you are looking at |
| Export as **Operations** or **Clinical** | **The amount and the refund are not in the file.** They do not render on screen for those desks either, and a scope enforced in the markup but not in the file the markup produces is not enforced: **P0** |
| Look for a JSON export | There is none, anywhere in the back office |
| Scroll a long list | It **pages**, and the range total describes the whole filtered set rather than the page |

---

## 6. Money

### `MA-31` - Summary, and the two identities · P0

**Do this.** Open **Money → Summary**.

**Expect**

* Two arithmetic identities hold, every time:
  **net = gross − refunds**, and
  **clinic share = splittable net − therapists' share − partners' share**.
  **Either failing is a P0.**
* A therapist's share is earned by **delivering**: only a completed **and**
  paid session adds to it. Counting every paid session would deduct a share
  nobody will be paid and understate the clinic's take on every forfeited late
  cancellation.
* A home visit's **travel fee is part of the therapist's share and never
  revenue**.
* A **refund reverses the partner's commission, not the therapist's** - a
  refunded session was cancelled, so it never earned a therapist share.
* A session whose split is **unknowable** - no therapist share set, or a
  partner with none configured - is **excluded from the split and surfaced as
  a named count**. **A guessed percentage to make the numbers tie is a P0.**
* **Each figure appears once.** Net revenue printed twice on one screen is a
  **P2**.

### `MA-32` - Open a total · P2

**Do this.** Tap **See the sessions** on each of the four split figures.

**Expect.** Each lists **exactly the rows behind it**, and the rows **sum to
the figure that opened them**. A drill-down that disagrees with its own total
is worse than none, because it makes a correct figure look wrong: **P1**.

It exports like every other table, both formats, same rows.

### `MA-33` - Scope chips, and a balance that is not date-filtered · P1

**Do this.** Narrow the date range and watch each figure.

**Expect**

* Flows move: revenue, refunds, what was settled.
* **Balances do not.** "Owed to therapists" is **all-time and net of cash
  held**, matching the Payouts screen and what the Pay button actually
  transfers. **A debt that reads as nothing because you narrowed to a quiet
  week is a P1.**
* Every figure carries a **scope chip** saying which it is, so watching one
  fall while the one beside it holds still does not read as a half-broken
  screen.

### `MA-34` - Net revenue against the period before · P2

**Expect**

* The comparison is the **same number of days immediately before** - never a
  calendar month against a 30-day window, which would move the figure by the
  number of days rather than by the business.
* A **zero baseline yields no percentage at all**. `+100%` and `∞` are both
  lies.
* A move under half a percent reads **level** rather than drawing an arrow
  over noise.

### `MA-35` - The alerts strip · P1

**Expect** it at the top of **all five** Money screens, counting: payout
requests waiting, cash a therapist is holding, refunds to hand back by hand,
and payments attached to nothing.

| Check | Expect |
| --- | --- |
| Refunds awaiting cash | Counts **both** cash visits **and** sessions. A session refunded by hand used to be work no screen could see |
| Cash home visits | Counted **once**, not twice. The home-visit rows are the same table filtered, not a second table |
| A **failed** refund | Counted on its own, as its own row - "go and hand over cash" and "find out why the gateway said no" are different jobs |
| Each item | Links to **the rows it counted** |
| A zero row | **Dropped**, not shown as a zero |

### `MA-36` - Costs, and the kind of each one · P1

**Do this.** Open **Money → Costs** and add:

| Description | Amount | Date | Kind |
| --- | --- | --- | --- |
| `QA Clinic rent - month 1` | `40000` | this month | fixed |
| `QA Physiotherapy consumables` | `6000` | this month | variable |
| `QA Loan interest` | `3500` | this month | interest |

**Expect**

* Each carries a **kind**, deciding whether it sits above or below the
  gross-profit line, whether it is inside break-even's fixed costs, and
  whether EBITDA adds it back. **Nothing is inferred from the wording** -
  somebody will reword it.
* The **gateway fee** is derived automatically from what was collected online,
  charged on **gross** (a processor keeps its fee through a refund) and
  **skipped for cash on visit**, which never touched a gateway.
* It is labelled **Gateway fee %** here - a rate - and the resulting amount is
  what Summary calls Payment fees. Two figures with one name is the collision
  this rule exists to stop: **P2**.
* Costs are dated by **when they were incurred**, not when somebody typed
  them.
* **Discounts given** is **stated, never deducted**. It is already inside
  gross revenue as a smaller number; subtracting it from profit would count it
  twice. **A discount deducted from operating profit is a P0.**
* With no costs recorded, **Operating profit is a ceiling and the screen says
  so** rather than implying a number it cannot know.
* Nothing here is labelled "net profit". Nothing is post-tax.

### `MA-37` - Your Numbers, the three things nobody can derive · P1

**Do this.** Open **Money → Your Numbers** and enter:

| | Value |
| --- | --- |
| Invested | `500000`, life `36` months |
| Ad campaign | `QA Launch`, `20000`, traced by promo code `QALAUNCH` |
| Snapshot | today's date, what the clinic owns and owes |

**Expect**

* The investment's **life in months** is what produces the depreciation and
  amortization inside EBITDA.
* An ad campaign is traced **by promo code or not at all**. Enter untraceable
  spend too: it is **stated separately and held out of the division**, never
  divided into. Leaving it in the denominator would report a campaign as a
  failure purely because nobody tagged it.
* Spend is **pro-rated across the campaign's own days**, and an open-ended one
  runs to **today** - never to the end of whatever range you are looking at,
  or one row would read as a different daily budget every time you moved the
  dates.
* Snapshots sharing an `as of` date are **one snapshot**, and the most recent
  at or before the range end is the one read. Entering this month's balance
  does **not** erase last month's.

### `MA-38` - Business Health: seven figures, and a refusal instead of a zero · P0

**Do this.** Open **Money → Business Health** with nothing entered on Your
Numbers.

**Expect**

* Return on investment, return on ad spend, working capital, gross and net
  margin, EBITDA, break-even, revenue run rate.
* **A figure that cannot be worked out is a sentence naming the missing input
  and a link to the screen that takes it - never a zero.** A zero is read as a
  measurement and acted on. **A zero here is a P1.**
* Revenue and the split come from the same functions Summary reads, so **the
  two screens cannot disagree about what the clinic earned**. Compare them.
* Every figure's (i) carries its **formula and where each input came from**,
  not merely what it means.
* **Working capital** counts money taken for sessions not yet delivered as a
  **current liability**, valued at **what was actually paid** and never at the
  live catalogue price.
* Move the three cost-classification switches. **Gross margin moves; operating
  income and net profit do not.** A switch that moved the bottom line would be
  a way to report a different profit: **P0**.
* Apply a **dimension filter** - one therapist. An **amber line** says the
  comparison is one slice's revenue against the whole clinic's costs, because
  rent is not attributable to a therapist. **Silently filtered profit is a
  P1.**

### `MA-39` - Payouts, and what settling nets off · P0

**Do this.** With Therapist A holding cash and owed a share:

1. Open **Money → Payouts** and read the figure.
2. Settle it.
3. Read the cash ledger.
4. Settle a **second** payout later.

**Expect**

* The transfer is the earned figure **minus the cash they are holding**, and
  **exactly those visits are marked remitted in the same run**.
* Step 4 does **not deduct the same cash again**. **A second deduction is a
  P0** - it asks somebody to chase money already recovered.
* Where the cash **exceeds** what is owed, the transfer **floors at zero**,
  the difference stays as still-owed-to-the-clinic, and those collections stay
  **open on the cash ledger** for a person to chase.
* Correct a cash amount: it needs a **mandatory reason** and an audit row, and
  it **refuses a visit whose cash has already been remitted** - that transfer
  has gone out, so the fix is an adjustment against the next payout.

### `MA-40` - Every Money screen says what it is · P2

On **all** of Summary, Business Health, Transactions, Payouts, Costs,
Breakdown and Your Numbers, confirm:

1. Under the heading, **two lines** - what the screen is in a clinic owner's
   words, and **one concrete example** of something you would come here to do.
   Not the section's own line repeated.
2. The **alerts strip** at the top.
3. The **glossary** at the foot, and an **(i)** on each figure. The glossary is
   the fallback for reading the whole set; the (i) is the answer, because a
   definition at the bottom of the screen is as far from the number as the
   page allows.
4. The promo-code campaigns are on **Costs**, beside **Discounts given** - the
   figure they cost. Following a note that says they are here and finding a
   screen with no promo codes on it is a dead end, not a detour: **P2**.

---

## 7. Discounts

### `MA-41` - The first-session offer · P0

**Do this.** Settings → Offers & Discounts: turn it on at **₹500 off**.

| Do | Expect |
| --- | --- |
| A patient who has **never paid** opens checkout | The quote **and the charge** both carry the offer |
| Read the Pay button against the Razorpay sheet | **The same figure.** A button printing the list price while checkout applies an offer behind it is a **P0** |
| The same patient books a **second** session | No offer. A patient is new exactly once, asked of the database |
| Try to claim it from the console by sending a flag | Ignored - eligibility is never something a browser sends |
| Try it on a **programme** or a **home visit** | Not applied. Video consultations only |
| Set it to **100%** | The total is **zero**, there is **no gateway order at all**, and no ₹1 is charged. A clinic advertising a free first session charging ₹1 is a **P0** |

### `MA-42` - The free-booking path · P0

With a 100% discount in play:

**Expect**

* No `payments` row is written. That table is the record of money that moved,
  keyed on the gateway's own ids; a collection of zero has neither.
* `amount paid` is **zero** with **all four discount facts** recorded: list
  price, amount off, which rule, and why.
* **Everything else still happens**: auto-assignment, the calendar event, the
  invite half settling, the patient's approval. A free session is a session.
* **Double-tap** the confirm: it finds the row paid and answers success, not
  twice.
* Try to confirm something that **is** still owed, from the console:
  **refused with 409**. **A `free: true` flag a browser can send is a P0** - it
  would be a way to book anything for nothing.

### `MA-43` - Goodwill · P1

**Do this.** On an **unpaid** session, apply a goodwill adjustment.

| Try | Expect |
| --- | --- |
| A reason of `ok` | **Refused**, by the route **and** by the database |
| A real reason | Applied, with an audit row |
| An amount **at or above** the session price | **Refused.** That is a number somebody typed with the price on screen; more than the price is a typo, and quietly charging ₹1 is worse than saying no |
| Apply it to a session **already paid for** | **Refused.** A discount on something paid for is a refund, and refunds have their own route |
| Now **collect that session by cash** | The recorded cash is the **discounted** figure, with the list price beside it. Recording the full price would overstate the cash ledger and gross revenue by exactly the amount given away: **P0** |
| As **Operations** | Refused. Goodwill is a **money** capability even though its button sits on a session |

### `MA-44` - Promo codes · P0

**Do this.** On **Money → Costs**, create:

| Code | Kind | Value | Cap | Window |
| --- | --- | --- | --- | --- |
| `QALAUNCH` | percent | `20%` | `2` uses | open now |
| `QAEXPIRED` | flat | `₹300` | `10` | ended yesterday |
| `QAPAUSED` | flat | `₹300` | `10` | paused |

Turn **promo codes on**.

| Do | Expect |
| --- | --- |
| A patient types `QALAUNCH` | The quote says **what it takes off**. **The request contains no amount** - check the Network tab. **A browser-sent figure is a P0** |
| Two patients claim it, then a third | The third is **refused by the cap**, and the cap holds even with both checkouts open at once - it is a row lock, not a count taken a moment earlier |
| One of the two **abandons** checkout | After the hold, their claim **stops counting** and the third can have it |
| `QAEXPIRED` and `QAPAUSED` | Do nothing, and **say which** |
| A code that is refused at create-order | The checkout is **refused with 409**, not quietly charged at list price. Taking more money than somebody was quoted is the one outcome a payment screen must never produce |
| Delete a **claimed** code | **Refused** - pause it instead. A paid session pointing at a campaign nobody can name cannot answer which rule gave the money away |
| Sign in as a **patient** and list `promo_codes` | Nothing. A patient who can list it reads every campaign the clinic has scheduled, including the unstarted ones |

### `MA-45` - Patient invites · P1

**Do this.** Settings → Offers & Discounts: turn invites on, friend gets
**₹400**, inviter gets **₹300**, ceiling **10**.

| Do | Expect |
| --- | --- |
| A new patient claims a friend's code | The **friend's** half comes off their first booking |
| The inviter looks for their reward **before** the friend pays | **Nothing.** The half is earned when the friend's first session is **paid for**, never on a signup |
| The friend pays | The inviter's half appears, off their **next** booking |
| A patient claims **their own** code | Refused |
| A patient claims a **second** invite | Refused - a unique index, not a route check |
| A patient who has **already paid** claims one | Refused. A patient is new exactly once |
| Lower the reward, then check an **unspent** half | It is **honoured at the amount promised**. Amounts are snapshotted at claim |
| Switch invites **off**, then check an unspent half | Still honoured. The switch stops new claims; it does not withdraw a promise |
| One inviter earns eleven | The eleventh is refused, worded so it does **not** tell the invitee about somebody else's account |

**And the word.** Nothing in the referral flow says "invite". **An invite is
not a referral**, and the hospital's own link is a **registration link**.

### `MA-46` - They never stack, and travel is never discounted · P0

**Do this.** Contrive a booking where a goodwill adjustment, a promo code and
an invite half all apply.

**Expect**

* **One** applies - **the largest** - and the other candidates are
  **released** so they do not count against their own caps for nothing.
* A **tie** goes to the more deliberate decision: goodwill, then the code the
  patient typed, then the campaign that runs itself.
* On a **home visit**, the discount applies to the **service line only** and
  the **travel fee is added back afterwards, undiscounted**. **Discounted
  travel is a P0** - the therapist would be funding their own transport to
  subsidise the clinic's marketing.
* All four facts are recorded on every discounted booking.

---

## 8. Logs - Master Admin's alone

### `MA-47` - All Activity · P1

**Do this.** Open **Logs → All Activity**.

| Do | Expect |
| --- | --- |
| Read it | Every action this run has taken, by every admin |
| Use the **type filter** | Derived from the actions' own domains, so it cannot offer a category that does not exist |
| Search, and set a date range | Both work over the whole log |
| Scroll past the first page | Older pages load **by cursor**, not by offset. Rows are written continuously, and an offset skips whichever entry crossed the boundary mid-scroll |
| Export | **CSV and PDF**, describing the same rows |
| Try to **edit** any entry | There is no way to, anywhere |

**Then spot-check the coverage.** Every mutating thing you have done in this
plan should be here - including **settling a payout**, **resetting a
password**, **changing a patient's sign-in email**, and **impersonating
somebody**. **A mutating admin action with no log entry is a P1.**

### `MA-48` - An entry says what changed from what · P1

**Do this.** Tap a row that changed a value - a revenue share, a price, a
contact email.

**Expect**

* The **before and after**, both of them. An entry saying a patient's sign-in
  address was altered without saying what it had been is unusable for the one
  question it gets asked. **P1.**
* Values are **read, not dumped**: money as rupees, a timestamp as a date in
  clinic time, a boolean as Yes/No, an absent value as a dash. **The word
  "paise" never reaches the screen.**
* **Nothing is dropped.** A field the dialog does not recognise is listed
  plainly, and the raw entry is behind a toggle - the unrecognised key is
  exactly the one somebody is looking for.
* A **note** about a person records its **length**, not its text.
* A **generated password** is nowhere in it.

### `MA-49` - The subject timeline · P2

**Do this.** Tap an entry's **subject**.

**Expect**

* Every entry against **that subject**, keyed on their id rather than their
  name - so a patient renamed between two entries is still one person, not
  two. **P1** if the timeline splits on a rename.
* An entry with **no subject** is offered **no timeline** rather than one built
  by guessing.
* Opening the timeline **closes the entry behind it**. Two stacked dialogs over
  a table leave a reader unable to tell which Escape closes what.

### `MA-50` - Archive & Clear, and the floor nothing gets under · P0

**Do this**

1. Open **Logs → Archive & Clear**.
2. Look at the **Clear** button before downloading anything.
3. Try a cutoff **inside the last 30 days**.
4. Download the export.
5. Now clear with a legitimate cutoff, typing the required phrase.
6. Open All Activity.

**Expect**

* Step 2: **Clear is locked** until a download has **actually been produced** -
  not a checkbox saying one was. A record that is gone and was never kept is
  destroyed; one downloaded first has only been moved.
* Step 3 is **refused**. The newest month - where anything worth hiding would
  be - is out of reach **at every setting**. **A cutoff inside 30 days landing
  is a P0.**
* Step 5 asks for a **typed phrase**.
* Step 6: the **clearing itself is logged**, with the cutoff and the count, and
  it is inside the protected window - **so a clear can never remove the record
  of a clear**.
* The count of what is about to go is taken **server-side**, because the screen
  holds one page.
* The screen does **not** promise entries can never be deleted by anyone. A
  screen making a promise the product stopped keeping is worse than the
  feature.

### `MA-51` - Logs is refused to the other three, at the screen and at the routes · P0

**Do this.** As each of **Operations**, **Finance** and **Clinical**:

| Try | Expect |
| --- | --- |
| Look for **Logs** in the sidebar | **Absent** |
| Open the Logs URL directly | Refused, and the screen **says their scope is why**, in one dismissible line - rather than silently landing them somewhere else, which looks like it worked |
| Call `/api/admin/activity-log` | **403** |
| Call `/api/admin/clear-activity-log` | **403** |

**Any of the three reaching either route is a P0.** Operations, Finance and
Clinical read their own desk's work on **Today → Activity** instead.

---

## 9. Settings

### `MA-52` - Every screen says what it is · P2

Open all nine: Brand & Contact, Public Site, Booking Rules, Offers &
Discounts, Programmes & Home Visits, Clinical Questions, User Access, System
Health, Account Security.

**Expect on each**: two lines under the heading - what the screen is, and one
concrete example of something you would come here to do. **Not** the section's
own line ("How the product behaves") repeated nine times, which is how eight
screens end up explaining nothing.

**And confirm the old Booking Rules split held.** It is three screens now:
**Booking Rules** (one video session), **Offers & Discounts** (money off, to
win a patient), and **Programmes & Home Visits** (more than one appointment,
arranged in advance). Offers carries a note saying where promo codes and
goodwill live. **One screen with six unlabelled stacks is a P2** - an owner
opening it to change a refund window scrolls past the discount that decides
what every new patient pays.

### `MA-53` - Brand & Contact · P2

**Do this.** Change the site name to `QA Physio Clinic`, plus the tagline,
description, contact email, WhatsApp number, contact phone and footer
copyright. Save, then open any public page.

**Expect.** The **navbar** and the **footer** carry the new strings
**immediately**. They are read once at the top of the site and passed down, so
a page still showing the old name after a reload is a **P2**.

### `MA-54` - Public Site: mission, vision, promises and limits · P1

**Do this**

1. Rewrite the **mission** and the **vision**.
2. Open `/` and `/mission`.
3. **Clear** the mission box entirely and save.
4. Open `/mission` again.
5. Add a **promise** and a **limit**, reorder each band, switch one off.
6. Delete every row in one band.
7. Try a word count well over fifteen, and a character count over the cap.

**Expect**

* Step 2: both pages carry the new sentence **immediately** - they are cached,
  so the save has to invalidate them. Rewording the sentence the site leads
  with and watching the old one stay up for five minutes reads as a save that
  failed: **P2**.
* Step 4: **blank is the undo.** The shipped wording comes back. It is the one
  text setting where blank is a value rather than an error.
* Step 5: ordering is **one save of the whole band**, and a row switched off
  **drops the band's section-rail entry too** - a rail entry pointing at a
  section that does not render sends the scroll arrow somewhere wrong.
* Step 6: allowed, and **the shipped wording comes back** - and the screen says
  so, or a delete whose visible effect is the original text reappearing reads
  as a failed delete.
* The **icon is a picker**, not a text box. Free text there is a way to put an
  empty square on the mission page.
* Step 7: the word count **warns and still saves**; the character cap
  **refuses**, in the route as well as the form.
* **No heading counts the cards.** "Four things, every patient" over three
  cards is a number nobody remembered to change.

### `MA-55` - Public Site: splash, testimonials, FAQ · P2

| Do | Expect |
| --- | --- |
| Set the splash's name line, wording, hold and away threshold | They take effect on a cold open |
| Leave the name line **blank** | It follows the site name. Blank is the undo here too |
| Set the away threshold to **0** | "Greet the first load only." There is deliberately **no** value meaning "greet on every tab focus" - that is the setting that would splash over a checkout in progress |
| Reload a page repeatedly | **No splash.** It greets a cold open and a long-absent tab, nothing else. **A splash on every navigation is a P1** for a patient paying by UPI who leaves the tab for their bank's app |
| Ask for reduced motion | **No splash at all.** It is decoration over content already rendered |
| Read the seeded testimonials | The form says **at the point of entry** that these are illustrative copy, **not real patients** |
| Add, edit and delete one | Each reaches `/` and `/mission` immediately |
| Add an FAQ, reorder, delete | The same, on `/faq` |
| Turn the rating summary off | The real number disappears from the public pages |

### `MA-56` - Booking Rules, and the settings that are read not hardcoded · P1

**Do this.** Change each, then check the behaviour actually moved:

| Setting | Check |
| --- | --- |
| Online booking lead time | The patient's picker and the route both move |
| Cancellation refund window | The refund outcome moves |
| **Session Completed cutoff** | Every screen a session appears on flips at the same moment - patient, therapist **and** admin. **One screen still saying "Tap to Join" is a P1** |
| Join window | The join control opens and closes accordingly |
| Meet on/off | New sessions get or do not get a link; **home visits still get a calendar event either way**, because the invite is the only outbound message this platform sends |
| Idle timeout, sign-out banner duration | Behave as set |
| Booking languages | The wizard offers exactly those |

**A value that did not move when you changed the setting is hardcoded
somewhere: P1.**

### `MA-57` - Clinical Questions · P1

**Do this**

1. Open **Settings → Clinical Questions**.
2. Confirm there is **one tab per condition type**, not three stacked lists.
3. Reword one orthopaedic question and save.
4. As a patient, look at the health profile.
5. Remove **Neurological** from the types triage offers.
6. As a therapist, triage a new patient - then **re-triage** a patient who
   already has a neurological record.

**Expect**

* Step 2: **tabs.** Twenty-odd textareas stacked is the wall-of-fields shape
  this product keeps correcting.
* Step 3's wording appears on the patient's screen.
* Step 5 removes it from **triage only**. The existing patient's record
  **keeps rendering**, and a therapist re-triaging them is **still offered**
  it. Removing a type from the menu must not strand the patients already on
  it: **P1**.
* **Orthopaedic can never be switched off.**
* The paediatric caregiver fields are **not** part of the seven-question
  count. Who is speaking for the child is provenance, not a clinical question.

### `MA-58` - User Access: the matrix, and creating the three desks · P1

**Do this**

1. Open **Settings → User Access**.
2. Read the **matrix**: rows are the jobs people describe, columns are the four
   desks.
3. Create the three scoped admins from §1.
4. Try to change **your own** scope.
5. Narrow the **last** Master Admin who can still sign in.
6. As **Operations**, try to create an admin.

**Expect**

* The matrix is **derived from the same module the routes enforce with**, so
  it **cannot claim an access nobody has**. Check one cell against reality -
  Finance opening Sessions - and confirm the screen and the behaviour agree.
* **The cells are not checkboxes.** A tick that does not change a route is a
  lie. Changing what a desk reaches is a code change, reviewed. **Editable
  cells here are a P1.**
* Every group has at least one read-only row, without which a group cannot
  show the difference between **view** and **none**.
* Steps 4 and 5 are **refused**. Nobody changes their own scope, and a single
  mis-click must not lock everyone out.
* Step 6 is **refused** - the group being absent from their picker is
  presentation; the route is what stops them.
* **Suspending, never deleting.** An admin's id is on every audit row they
  wrote.

### `MA-59` - System Health: five checks, one shape · P1

**Do this.** Open **Settings → System Health**.

**Expect**

* Each check has a **status word as well as a colour**: Healthy, Needs a look,
  Needs you now, Not set up, Not checked.
* **`off` and `unknown` are not faults.** An owner who never wired Google up
  has not got a problem, and painting that red is how red stops meaning
  anything. **A red card for an unconfigured integration is a P2.**
* **Anything not healthy carries numbered steps the owner can follow alone.**
  A red card with no way out is the screen this replaced. **P1** if one has
  none.
* The teaching text is **behind the (i)**, never on the card.
* The **sidebar badge counts checks, not rows** - so it equals the verdict
  strip. Counting rows badges **0** for the two failures with no rows behind
  them, which are the two worst.
* The Google card, when broken, states the token's **length**, an
  **eight-character fingerprint** and whether it carries **surrounding
  whitespace**, plus which Google app it is presented to. That is what
  separates "the permission died" from "the deploy is still running the old
  value" - the same error for both, with different fixes. It reports the
  **shape** of the credential, never the credential.
* It says **when it was checked**, and the relative time renders after the page
  loads rather than being computed on the server - "4 minutes ago" computed
  server-side is already wrong in the browser.
* A **red** check puts one line on **Today**; an amber one does not. A banner
  that is usually there is a banner nobody reads.
* **Books & Sessions Agree** reports disagreement and **never repairs**. A
  silent auto-fix on a money record is how a discrepancy becomes permanent.
* **Session Links** lists only genuinely unsynced sessions. **Every confirmed
  home visit sitting in it is a P1** - a home visit has no meeting link by
  design, and judging it by one lists every visit as broken.
* Press **Retry** on a home visit: it must **not** mint a second calendar
  event. Check the calendar. **A duplicate invite per click is a P0.**
* The two fix buttons render only for a scope that can **manage** Settings.

### `MA-60` - Account Security · P2

**Do this.** Change the admin's own password through it, then sign in again.

**Expect.** It works, **no password is shown back to you**, and the change is
in the log **without the password in it**.

---

## 10. Impersonation - the most dangerous control here

### `MA-61` - Signing in as somebody · P0

**Do this**

1. From Patient A's profile, use the impersonation control.
2. Try a reason of `test`.
3. Use a real reason: `Patient reports payment button does nothing on submit.`
4. Look at the screen you land on.
5. Do something that writes - book a session, save a profile field.
6. Press **Exit**.
7. Open the log.

**Expect**

* Step 2 is **refused**. Ten characters minimum.
* Step 3: **the browser genuinely becomes that account.** Same routes, same
  data, every control working, every write real. It is a session swap, not a
  preview - which is exactly what makes a bug that only appears on submit
  reproducible.
* Step 4: an **amber bar on every screen**, naming the account, saying the
  actions are real, counting the window down, and carrying **Exit**.
* Step 5's write is recorded **as that patient**. No column anywhere says an
  admin was at the keyboard - that is a real, accepted cost of the swap, which
  is why the record in step 7 matters.
* Step 6 puts you back as yourself.
* Step 7: the impersonation row is there, **written before the swap**, with
  your reason, and **you cannot rewrite it**.

### `MA-62` - The five fences · P0

| Try | Expect |
| --- | --- |
| Impersonate **another admin** | **Refused.** That is one admin using another's authority - and an admin in trouble can simply be asked what they see |
| Impersonate a **suspended** account | Refused |
| Impersonate **yourself** | Refused |
| As **Operations**, who manages People, impersonate anybody | **Refused.** Full scope only, checked directly - a section scope would hand this to whoever can edit a phone number. **P0** if they can |
| Leave the window open past thirty minutes | The **proxy** signs you out, not the browser. A forgotten tab is an open window into a health record |
| Impersonate while the log write fails | The **whole thing is refused**. A session with no record behind it must not exist |

### `MA-63` - The route does not name the back office · P0

**Do this, in a private window with no session at all:**

```js
const r = await fetch("/api/admin/stop-impersonation", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
({ status: r.status, body: await r.text() });
```

Then try again with a forged marker cookie.

**Expect.** Both answer **`/dashboard`** - never `/admin/dashboard` and never
`/admin/login`. This route runs no admin check by design (the caller is signed
in as the patient at that point), so its refusal branches are reachable by
anybody. **A response body naming the back office is a P1**: check what a
route *says* as well as what it lets you do.

---

## 11. Today, and the things only this screen shows

### `MA-64` - The Master Admin's own Today · P1

**Expect**

* The brand reads **Master Admin**, and so does the eyebrow over the heading.
* **"Needs you" agrees with the list beneath it.** A figure summing queues the
  list has already filtered is the commonest defect in this product's history:
  **P2**.
* Every quick action **lands somewhere you can open**. An action for an
  unreachable section is **dropped**, never rendered carefully.
* A **red** System Health line, if any, is here as a banner.
* Your dashboard gets **no "Your access" card** - that is for a limited scope,
  as the sentence saying its shorter sidebar was on purpose.

### `MA-65` - Risk · P1

**Do this.** Open **Today → Risk**.

| Do | Expect |
| --- | --- |
| Read the thresholds | Two ship **disabled** - the two needing a clinic baseline nobody has yet. A threshold invented before anyone knows the normal rate fires on everyone or on nobody |
| Look for action buttons | **There are none.** A flag is never an accusation and never carries a penalty: nothing here suspends an account, holds a payout or hides a therapist. **An action button on this tab is a P1** - that separation is what makes running heuristics over clinical data safe at all |
| Open a signal | It **links to the rows behind it**, not to a score. An admin who can only see a verdict cannot disagree with it |
| Review one with `ok` | **Refused.** Ten characters. "Dismissed" with no reason reads the same as "not read" |
| Review one properly | Lands, and **appends** - you cannot edit or delete a review |
| Dismiss one, then cause the same thing again | A **fresh** signal is raised rather than the old one reopening. That is correct: it is new information |
| Open it as **Finance** | They see the **money** rules - a cash variance, a session completed with no payment - and not the clinical ones. The **flagged messages** and the **contact reveal log** stay yours alone. A desk with no rule of its own is **told so** rather than shown a locked empty screen |

### `MA-66` - Activity, scoped by desk · P2

**Do this.** Open **Today → Activity** as yourself, then as each limited desk.

**Expect**

* You see **everything**, unfiltered.
* A limited desk sees an entry only when the action's **domain** is a section
  they can work **and** the **actor** sits at that desk. So it runs **sparse**
  in a small clinic where the Master Admin does most of the work - which is
  why the screen **says the list is their desk's** rather than showing an
  empty panel that reads as "nothing happened". **P2** if it just looks empty.

### `MA-67` - Live updates count rather than rebuild · P2

**Do this.** With the admin dashboard open, have somebody else book a session.

**Expect**

* The screen **does not rebuild underneath you**. The header's **Refresh**
  turns teal and says **how many changes are waiting**.
* Press it: it fetches, the count clears, and the button is **disabled while it
  runs**.
* **Your own actions do not raise the count.** A control that changes a row and
  refreshes has already fetched what it changed; counting it would leave a
  badge standing for rows you just read. **A count that ticks up on every
  button you press is a P2.**
* Watch for a page that reloads on its own **thirty seconds after** you tapped
  something - that is the same bug with a delay on it, and it reads as the
  page reloading by itself.
* The **other three** dashboards do rebuild, and should - a patient watching
  for a therapist's suggested time is waiting for exactly that row.

---

## 12. Across every screen

### `MA-68` - The progress bar, and controls that release · P2

**Do this.** Press a mutating control anywhere in the back office and watch.

**Expect**

* A **teal bar** above the chrome for the duration of the work, including the
  refresh that follows - which outlives the button, because the row it sat in
  is refreshed away.
* **No percentage, ever.** Nothing in the browser knows how far a server render
  has got, and a bar sitting at 90% is a lie people learn to ignore.
* It **waits a moment before drawing**, so a fast action does not flash.
* The **button itself** releases when **its own request** lands, not when the
  refresh does. A button that stays disabled and spinning through a full
  re-render is reported as a hang: **P2**.
* Asking for reduced motion **keeps the bar and drops the travel** - somebody
  who asked for less movement still needs to know the app is thinking.

### `MA-69` - A change that leaves no trace says what it was · P2

**Do this.** Flip any settings toggle.

**Expect** a confirmation that **names the thing and its new state** -
`Home visits are on`, never `Saved`. A confirmation that does not name the
thing tells you a request finished, which you could already see. And it
**survives the refresh the control itself fires**.

### `MA-70` - Paging, filtering, exporting · P2

On **every** list in the back office:

1. It **pages**, with a page size remembered **per list**, and an "x-y of n"
   count.
2. Filtering, sorting, totals and both exports run over the **whole filtered
   set** - only what is painted is paged. **An export that only contains the
   current page is a P1.**
3. Filter chips appear only when **two of them** would have rows behind them.
   A filter nobody can act on is noise.

### `MA-71` - Dates, money and contrast · P2

| Check | Expect |
| --- | --- |
| Every date and time | **India Standard Time**, whatever your machine is set to. A session booked for 6 PM IST printing as 12:30 PM is a **P1** |
| A session's slot | Shown in **the zone the patient booked it in** |
| Money | Rupees everywhere. The word "paise" appears on no screen |
| Small grey text on white cards | Readable. A label, count or hint you have to lean in for is a **P2** |
| Every icon-only button | Has an accessible name - check with a screen reader or the accessibility inspector |
| Any dialog | Escape closes it, Tab is trapped inside it, focus returns where it was, and the page behind does not scroll |

### `MA-72` - Error boundaries do not leak · P1

**Do this.** Force an error - open a detail route with a nonsense id.

**Expect.** The error screen shows a **reference code and nothing else**. No
column name, no row id, no stack. Patients see these screens too. **A thrown
message on screen is a P1.**

---

## 13. The route sweep, from the top

### `MA-73` - What a Master Admin may call · P2

As yourself, spot-check that the routes you have been using answer **200 or a
real validation error**, never 403. A Master Admin refused their own control is
a **P1** - and the case that actually happens is the **session refresh race**,
where many requests go out at once and the one carrying a token another has
just rotated comes back with no user.

**Watch specifically for an intermittent 403** on a control you use every day.
It should answer **401 or 503** - both retryable, both answered before anything
is written - rather than a flat "Forbidden". **A retryable failure reported as
a refusal is a P1**: it tells a Master Admin they are not allowed to do their
job.

### `MA-74` - What nobody outside may call · P0

**In a private window, signed out**, sweep the admin surface:

```js
const routes = [
  "/api/admin/approve-account",
  "/api/admin/create-account",
  "/api/admin/delete-account",
  "/api/admin/set-admin-scope",
  "/api/admin/settle-therapist-payout",
  "/api/admin/refund-session-partial",
  "/api/admin/grant-session-credits",
  "/api/admin/apply-goodwill-discount",
  "/api/admin/save-promo-code",
  "/api/admin/clear-activity-log",
  "/api/admin/activity-log",
  "/api/admin/start-impersonation",
  "/api/admin/update-setting",
  "/api/admin/debug-reset",
  "/api/admin/create-booking",
  "/api/admin/mark-paid-by-cash",
];
console.table(await Promise.all(routes.map(async (route) => {
  const r = await fetch(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return { route, status: r.status, body: (await r.text()).slice(0, 90) };
})));
```

**Expect 401 or 403 on every one, and never a 500.** A 500 means the body was
parsed before the caller was checked, and the honest answer to a bad body is
**400** anyway. **A 200 is a P0 that stops the run.**

Then send each a **malformed body** - `"{"`, `null`, `[]`, `"hello"` - and
confirm **400**, not 500. The request was the caller's to get right.

---

## 14. Sign-off

| | Should be |
| --- | --- |
| Steps run | 74 |
| Pass | |
| Fail | |
| Blocked | |
| N/A | |
| P0 raised | |
| P1 raised | |

**Every screen in the back office. Tick each one you actually opened.**

**Today** - Inbox · Approvals · Risk · Activity

**Sessions** - Schedule · All Sessions · Roster · Delivery · Recommendations · New Booking

**People** - Patients · Therapists · Partners · Global search

**Money** - Summary · Business Health · Transactions · Payouts · Costs · Breakdown · Your Numbers

**Catalog** - Conditions · Packages · Service Areas · Purchases

**Logs** - All Activity · Archive & Clear

**Settings** - Brand & Contact · Public Site · Booking Rules · Offers & Discounts · Programmes & Home Visits · Clinical Questions · User Access · System Health · Account Security

**On every one of them, three things are true or they are a defect:**

1. Under the heading, **two lines** - what the screen is, and one concrete
   example. Not the section's own line repeated.
2. Every list **pages**, and every list with a dimension **filters**.
3. Every export offers **CSV and PDF**, and the two describe the same rows.

**And confirm each of these before signing.**

| | |
| --- | --- |
| The reset ran, reported real numbers, kept the admins and kept the catalogue | ☐ |
| The catalogue built, ordered as a whole list, with a positioned cover | ☐ |
| No programme price is on any public page, and no setting brings one back | ☐ |
| Auto-assignment fired on exactly one free therapist and waited on two | ☐ |
| The lead time held, and the override opened the grid and the route together | ☐ |
| Both refund windows, all four refund states, and travel refunded | ☐ |
| All three recommendation outcomes, with the window stamped at approval | ☐ |
| Both money identities held, on Summary and on Business Health alike | ☐ |
| A payout settled once, with cash netted once | ☐ |
| Every discount rule, never stacking, never on travel, and zero never ₹1 | ☐ |
| The log complete, readable, uneditable, and clearable no closer than 30 days | ☐ |
| Impersonation fenced five ways and recorded before the swap | ☐ |
| Logs refused to all three limited desks, at the screen and at both routes | ☐ |
| 401 or 403 on every admin route while signed out, and 400 on a bad body | ☐ |

**Signed** ......................... **Date** .................

**Build / commit tested** .........................

---

**What a clean run of this document proves.** That the back office's routes,
screens, money rules and access controls behaved on one machine, in one
browser, against test payment keys, once. It does not prove the three limited
desks are correctly narrowed - each has a document of its own - nor that real
money, email or SMS delivery, load, or other browsers behave. Those are not
covered here and a clean run should not be read as covering them.
