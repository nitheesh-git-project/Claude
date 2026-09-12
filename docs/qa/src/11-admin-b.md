---

## 15. Admin test plan — Part B (Settings, and configuration → dependent feature)

> **How to test a setting.** Every settings case follows the same four beats: **change it → reload the admin screen (it must persist) → open the dependent feature and prove it changed → change it back**. A setting whose dependent feature you did not check has not been tested.

Every setting below is read through one shared settings module with defaults. **Every dashboard page selects the same column list**, so a new setting cannot silently read as its default on whichever page forgot it.

### 15.1 Settings → Brand & Contact

#### `ADM-SET-001` — Brand & Contact Details · P1

**What it controls.** `site_name`, `site_tagline`, `site_description`, `contact_email`, `whatsapp_number`, `contact_phone`, `footer_copyright_text`.
**What depends on it.** The **root layout** is the one place these are read (through a public/anon client, so ISR-cached pages under it are not forced dynamic) and it passes them into `Navbar` and `Footer` **as props**. Those two components must never fetch their own copy or hardcode a string.

**Steps**
1. Open **Settings → Brand & Contact**.
2. Change **Site name** to `QA Physio Clinic`. Save.
3. Reload the admin page. Confirm the value persisted.
4. Open `/` in a new tab.
5. Change **Footer copyright text** to `QA Physio Clinic. All rights reserved.` Save. Reload `/`.
6. Change **Contact email** to `not-an-email` and save.
7. Restore every original value.

**Expected Result.** Step 4: the navbar and the page title/description show `QA Physio Clinic`. Step 5: the footer shows the new line. Step 6: refused with a validation message (`Enter a valid email address.`). Step 3 and every reload: values persist. Existing records are unaffected — this is presentation only.
**Interaction worth checking:** the **splash** brand line is **blank by default and falls back to the site name**, so changing the site name also changes the splash greeting until an admin deliberately parts them.

---

### 15.2 Settings → Public Site

#### `ADM-SET-004` — Ratings visibility · P2
**Steps.** Toggle **ratings visible publicly** off. Open `/team` and `/`.
**Expected Result.** The public rating summary disappears from public surfaces. Individual therapist rating visibility is a **separate** per-therapist toggle on their detail page; verify both independently.

#### `ADM-SET-005` — Home page walkthrough pace · P1
**Steps.** Set the walkthrough seconds to `2`. Open `/` and watch the "How the process works" widget. Then set it to `0`.
**Expected Result.** At `2`, each step holds ~2 seconds before the next takes over. At **`0` it does not advance on its own** — the same "0 is off" convention used by the session timeout. Values over 300 are refused (`Keep this to 300 seconds or less.`).
**Accessibility interaction:** a visitor with **reduced motion** requested must not be subjected to auto-rotation.
**Do not confuse this widget with the care-area showcase**, which **never advances by itself** — a second moving thing while you read the first is worse than either alone. Their `aria-label`s must stay distinct: "How the process works" vs "Areas of practice".

#### `ADM-SET-006` — The opening splash, all five settings · P1

**Feature.** A teal sheet painted over the site for a beat. It greets a **cold open** — the first load of a browser tab — and a **return to a tab that has been in the background longer than the away threshold**. It deliberately does **not** show on every navigation, every reload or every tab focus, because a patient paying by UPI leaves the tab for their bank's app and comes back mid-checkout, and **splashing over a payment in progress is the one thing this must never do.**

| Setting | Test |
| --- | --- |
| **On/off** | Off → no sheet on a cold open in a fresh tab |
| **Name above the line** | Blank → falls back to the site name. Set it → the splash and the navbar deliberately differ. **Blank is a value here, not an error** — it is how the override is undone. |
| **The one line** | Changing it changes the greeting text |
| **Hold (seconds)** | A longer hold visibly holds longer |
| **Away minutes** | Set `1`. Open a tab, switch away for 90 seconds, switch back → greeted again. Set `0` → **first load only**, and returning is never greeted. **There is deliberately no value meaning "greet on every tab focus".** |

**Expected Result also to check:** a **reload** of an already-greeted tab is **not** greeted. Someone who has asked for **reduced motion is skipped outright**. The overlay's markup is present in every page's HTML and visibility is driven by a `data-splash` attribute on `<html>` — not React state — so there must be **no hydration warning** in the console.

#### `ADM-SET-007` — Testimonials · P1
**Steps.** Create a testimonial with patient name `QA Story` and quote `The exercises made a real difference in six weeks.` Save. Open `/` and `/mission`.
**Expected Result.** It appears **immediately** in the same band on **both** pages (the route invalidates `/` and `/mission`, both ISR-cached) — one component serves both, because the two bands make the same claim and a visitor may see both in one session. The avatar is optional; with none, the **patient's initial** is shown, never a generic silhouette.
**Critical check:** the five rows the schema seeds are **illustrative copy, not real patients**, and the admin form must **say so at the point of entry**. Never present a seeded testimonial as real. The only place a **real** number is quoted is the public rating summary.
**Negatives:** `Missing patientName or quote`; editing requires `Missing id, patientName, or quote`.

#### `ADM-SET-008` — FAQ · P2
**Steps.** Create, edit, reorder and delete an FAQ. Open `/faq`.
**Expected Result.** The public accordion reflects each change **immediately** — `/faq` is ISR-cached and every FAQ route invalidates it. Negatives: `Missing question or answer`, `Missing id, question, or answer`.

---

### 15.3 Settings → Booking Rules, Offers & Discounts, Programmes & Home Visits

**These were one tab and are now three.** "Booking Rules" had grown six unrelated stacks with no heading between them, so an admin opening it to change a refund window scrolled past the discount that decides what every new patient pays. What lives where now:

| Screen | What it covers |
| --- | --- |
| **Booking Rules** | One video session, start to finish: when it may be booked, when it may be cancelled with a refund, when the Join button works, and the Google Meet / Calendar switches. Plus the two platform-wide odds and ends (idle timeout, sign-out message). |
| **Offers & Discounts** | Money off, to win a patient: the first-session offer and patient invites. A note on the screen points at Money → Costs for promo codes and at the session itself for a goodwill discount. |
| **Programmes & Home Visits** | More than one appointment, arranged in advance: the recommendation settings, the package settings, and the nine home-visit settings. |

**Every Settings screen also states what it is and gives one example**, under its heading — check that line renders and matches the screen you are on. The cases below keep their original IDs; the **Where** line on each says which of the three screens it is now on.

Where a case below still says "Settings → Booking Rules", that is correct — it did not move.

#### `ADM-SET-009` — Every Settings screen says what it is · P2

**Steps.** Open each of the nine Settings screens in turn: Brand & Contact, Public Site, Booking Rules, Offers & Discounts, Programmes & Home Visits, Clinical Questions, User Access, System Health, Account Security. Then open both Logs screens: All Activity and Archive & Clear.

**Expected Result.** Under the page heading, each one shows **two lines**: one plain sentence saying what the screen is, and a second beginning **"For example:"** with one concrete thing you would come there to do. The sentences differ per screen — none of them says "How the product behaves", which is the section's line and is what every one of these screens used to show. No jargon, no database column names, no feature names.

**Spot checks.** Offers & Discounts ends with a **"Looking for promo codes?"** note pointing at **Money → Costs**, and saying a goodwill discount is applied to a session rather than set up here. Booking Rules holds **only** the single-session rules and the Google Meet block — no discount, no package and no home-visit settings on it any more.

**Critical check:** these are the same ten screens the sidebar lists and the same ten `?tab=` values. A screen reachable from the sidebar with no sentence under its heading, or a sentence on a screen that is not in the sidebar, means `adminNav.ts` and the shell have drifted.

#### `ADM-SET-010` — Online Booking Lead Time → the booking wizard · P0

**Configuration.** `online_booking_lead_time_hours`, default **12**.
**Dependent features.** The `/book` Step 1 calendar and hour list **and** `/api/appointments/create`'s own validator — deliberately the same setting, so the picker can never offer a slot the server rejects.

**Steps**
1. Note the current earliest bookable slot on `/book` under simulated time `2026-09-10T10:00`.
2. In **Settings → Booking Rules → Online Booking Lead Time**, change `12` to `48`. Save.
3. Reload the admin page and confirm it persisted.
4. Reload `/book` under the same simulated time.
5. Attempt a booking at the old boundary (10 September 22:00) by any means, including a direct API call.
6. Change it back to `12`.

**Expected Result.** Step 4: the earliest offered slot is now **12 September at 10:00**, and 10–11 September are greyed. Step 5: the API refuses with **409** and `Please pick a slot at least 48 hours from now.` Step 6: the picker returns to the 12-hour boundary. **Existing bookings are untouched** — this rule applies to new bookings only.
**Negatives:** `value must be a non-negative whole number`.

#### `ADM-SET-011` — Online Cancellation Refund Window → the cancel dialog and the refund · P0
**Configuration.** `online_cancellation_refund_hours`, default **24**.
**Steps.** Change it to `72`. Reload `/book` Step 3 and read the cancellation notice. Then cancel a paid session whose slot is 48 hours away.
**Expected Result.** Step 3's notice now reads *"Free cancellation up to 72 hours before your slot…"*. The 48-hour-away cancellation now falls **inside** the window: the dialog says it will not be refunded, and **no refund is processed**. Restore `24`.
**Independence check:** this must **not** change the **home-visit** refund dialog, which reads its own setting.

#### `ADM-SET-012` — Booking Languages → the Step 1 chips · P1
**Steps.** Add `Hindi` and `Kannada`. Save. Reload `/book`. Then remove every language and save.
**Expected Result.** Three chips appear in Step 1 in the configured order; the first is auto-selected. A language not on the list is **dropped server-side** rather than stored as a preference nobody is matched on. Removing all is refused with `Keep at least one language — booking needs something to offer.` — booking must never present an empty language picker. Duplicates that differ only by case are de-duplicated.

#### `ADM-SET-013` — Home Visit master switch → six surfaces at once · P0

**Configuration.** `home_visit_enabled`, default **off**.
**Dependent features.** `/home-visit` (404s when off), the header nav, the footer Explore column, the home page connector grid, every "Where to go next" strip, the hospital's **Session Type** option, `/book-home-visit`, and `/api/care-plan/create-order`'s re-check.

**Steps.** With it **off**, check all seven surfaces. Switch it **on**, check all seven again. Then, with a **live unpurchased home-visit recommendation** outstanding, switch it off and have the patient try to buy.
**Expected Result.** Off: `/home-visit` is a 404 and the entry is **dropped from every list rather than linking into a dead end**; the hospital cannot choose a home-visit referral. On: everything appears. The care-plan purchase with the switch off is refused with `Home visits aren't available right now. Please talk to your therapist.` — **an admin who switches home visits off has stopped the service, and a recommendation written before that must not stay purchasable.**

#### `ADM-SET-014` — The remaining home-visit settings · P1

| Setting | Default | Dependent feature to verify |
| --- | --- | --- |
| Allow cash on visit | on | The cash option on `/book-home-visit` Step 4; `/api/home-visit/book-cash` refuses when off |
| Booking lead time | 24 h | The wizard's Step 2 copy and its picker; **must stay independent of the online 12 h** |
| Travel buffer | 45 min | A locked therapist's conflict check is padded by this on **both** sides of a new visit; online passes **0** |
| Full-refund window | 24 h | The home-visit cancel dialog and the refund actually paid |
| Default package validity | 90 d | A new home-visit purchase's expiry when the package leaves it blank |
| Bulk scheduling limit | 8 | `Too many slots in one request.` above this |
| Page heading / subheading | (defaults) | The `/home-visit` page's own copy |

#### `ADM-SET-015` — Session Timeout of Inactivity · P2
**Steps.** Set it to `1` minute. Sign in as a patient and leave the tab idle.
**Expected Result.** The idle dialog appears and signs the patient out to **their own login page** (`/patient/login`, `/therapist/login`, `/hospital/login` — the door they came in through). **`0` means off. Admins are exempt from the inactivity timeout entirely.**

#### `ADM-SET-016` — Sign-out message duration · P3
**Steps.** Set `farewell_banner_seconds` to `2`, then `0`. Sign out each time.
**Expected Result.** At `2`, the banner clears after two seconds. At **`0` it stays until dismissed**.

#### `ADM-SET-017` — Google Meet toggle, join window, and the Session Completed cutoff · P0

| Setting | Default | Verify |
| --- | --- | --- |
| **Auto-Create Meet Links** | on | Off → a newly confirmed **online** session gets no Meet link. **A home visit still gets a calendar event** — this toggle gates the Meet conferencing only, not event creation. |
| **Join Button Window (before)** | 15 min | Set `5`; the join control goes live 5 minutes before the slot on **every** surface |
| **Join Button Window (after)** | 15 min | The short grace period for a late arrival |
| **Session Completed Cutoff** | 60 min | Set `30`; 31 minutes after the slot **every** join control on **every** surface — patient, therapist and **admin** — reads **Session Completed** |

**Note:** the cutoff is **not** the same thing as the after-window. See `XR-CUTOFF-001` for the cross-role check.

#### `ADM-SET-018` — Package settings · P1

| Setting | Default | Dependent feature |
| --- | --- | --- |
| **Assign a Therapist Automatically** | **off** | See `ADM-SET-021` |
| **Therapist Lock (site-wide)** | on | Off → later sessions on a purchase are not auto-assigned to the first therapist |
| **Session Balances From The Ledger** | **off** | See `ADM-SET-019` |
| **Therapist-Suggested Sessions** | **on for a fresh database** | Off → `/api/therapist/suggest-session` returns `Suggesting sessions is switched off.` and the control is absent. The column default is now true, but that only applies to a new `site_settings` row — **an existing database keeps its current value until an admin toggles it, or a reset restores defaults.** Check the toggle before running `THR-SUGG-*` rather than assuming |
| **Default Validity** | 90 d | A new purchase's expiry when the package leaves it blank |
| **Bulk Scheduler Limit** | 8 | `Too many slots in one request.` above this |
| **Expiry Reminder Lead Time** | 14 d | When the expiry nudge appears on the patient's dashboard |

#### `ADM-SET-022` — Recommendation settings · P0

At **Settings → Programmes & Home Visits**, above the package settings.

| Setting | Default | Dependent feature |
| --- | --- | --- |
| **Approve recommendations before the patient sees them** | **on** | Off → a therapist's submission publishes on save and the patient sees it immediately, as it did before the review step. On → it lands in Sessions → Recommendations and the patient sees nothing. See `ADM-CARE-004..008`. **Fails closed:** an unreadable column holds the recommendation rather than publishing it. Read in its own query, not through `SITE_SETTINGS_SELECT` — the same treatment **Therapist-Suggested Sessions** gets, so a database one apply behind loses this one control instead of resetting every setting on the page |
| **How long a recommendation holds** | 30 d | The patient's answering window, counted **from approval**, not from when the therapist wrote it |
| **Most sessions a week a clinician may ask for** | 5 | A ceiling over the programme's own `max_sessions_per_week`, whichever is lower. Above it: `This programme allows at most N sessions a week.` |

Note there is no longer a **Show programme prices publicly** switch. Programmes are not advertised on the public site at all — see `PUB-CAT-002`.

#### `ADM-SET-023` — First session offer · P0

At **Settings → Offers & Discounts**, above Patient invites.

| Setting | Default | Dependent feature |
| --- | --- | --- |
| **First session offer** | **off** | On → a patient who has never paid for a session is charged the offer price for a video consultation. Off → everyone pays list price |
| **Offer type** | `A set price` | `A set price` names what they pay ("₹499"); `A percentage off` adapts across categories priced differently |
| **Offer value** | 0 | Rupees or whole percent depending on the type. The panel previews what a real category's session would cost a new patient |

**Steps.** Turn it on, set a set price of ₹499. Read the preview. Book and pay as a **brand-new** patient, then as one who has paid before.
**Expected Result**
* The preview quotes a real category's price — *"A ₹1,200 session would cost a new patient ₹499."*
* The new patient is charged **₹499**; the returning patient is charged **₹1,200**. Eligibility is decided server-side from payment history, so it cannot be requested, repeated, or sent from the browser.
* Programmes and home visits are **not** discounted by it.
* Values the route must refuse: a type other than `fixed`/`percent`, a value of 0 or negative, a non-boolean for the switch.
* Set 100% off: the patient is charged the ₹1 minimum rather than zero — Razorpay refuses a zero-amount order, so an unguarded 100% would be a 500 at the last step of checkout.

#### `ADM-SET-021` — Automatic therapist assignment · P0

**Feature.** When a session is paid for and **exactly one** therapist is unambiguously free for it, assign them and confirm the booking immediately instead of leaving it in the admin queue. It reads the roster (weekly template + that date's exceptions + leave) and the same conflict check the admin's assign form uses. **It does not change what times a patient is offered** — the roster still does not filter the picker.

| # | Set up | Expected |
| --- | --- | --- |
| 1 | Switch **off**. Book and pay a session. | Session is `requested`, **unassigned**, in the queue — the pre-existing behaviour. |
| 2 | Switch **on**. Roster **only** Therapist A for the slot's hour. Book and pay. | Assigned to Therapist A, `confirmed`, Meet link created, and the therapist sees it immediately. The unassigned badge does **not** rise. |
| 3 | Roster **both** Therapist A and B for that hour, neither busy. Book and pay. | **Nothing is assigned.** The session waits in the queue. Two free clinicians is a choice for a person. |
| 4 | Both rostered, but Therapist B already has a clashing session. | Assigned to **A** — one free candidate. |
| 5 | Both rostered and free, and the patient booked via `/book?therapist=<B>`. | Assigned to **B**, not A. A stated preference beats the count. |
| 6 | Patient requested B, but B is busy; A is free. | Assigned to **A**. The preference is dropped rather than the session waiting. |
| 7 | Patient requested a therapist who is **not rostered** for that hour. | Falls back to the count. A stale `?therapist=` link never overrides the roster. |
| 8 | Nobody rostered for that hour. | Nothing assigned; queue as before. |
| 9 | Therapist A rostered but **on leave**. | Not a candidate. |
| 10 | Therapist A rostered but **unapproved** or **inactive**. | Not a candidate. |
| 11 | A **home visit**, with two therapists free but one finishing a visit within the travel buffer. | The buffered one is treated as busy — the conflict check is padded by `home_visit_travel_buffer_minutes` on both sides. |
| 12 | Pay, then close the tab before the callback lands (webhook configured). | The **webhook** applies the same assignment. Both paths use one decision, so they cannot disagree about who is free. |

**Expected Result throughout.** No session is ever assigned to a therapist who is unavailable, on leave, unapproved, inactive or already booked. When it declines to choose, the outcome is **identical to the switch being off**. A failure inside this logic must never fail the payment — the appointment is still marked paid either way.

**Cross-check `XCFG-ROSTER-001` afterwards:** rostering changes must still leave `/book`'s picker byte-identical.

#### `ADM-SET-019` — The ledger authority switch · P0

**Feature.** Whether a balance shown and offered is read from the **credit ledger** or from the older `sessions_used` / `visits_used` counters is **one admin switch**, off by default and **reversible in a second** — both are written either way.

**Steps**
1. Open **Settings → System Health** and confirm **Books & Sessions Agree** is `Healthy`, and that **Google Connection** is not red.
2. Turn **Session Balances From The Ledger** **on**.
3. Check every surface that shows a balance: the patient's package widget, the therapist's programme list, both purchase detail modals, the admin Purchases table, and the bulk scheduler.
4. Turn it back off and check them all again.

**Expected Result.** Every surface reads the same shape and follows the switch **together** — the substitution happens once, where the row is loaded. A refunded package still reads its original `6 sessions` with none pending rather than becoming a 1-session package. A purchase with **no** entitlement behind it is untouched, so a database without the backfill behaves exactly as before.
**Important:** the switch **does not change how a session is claimed.** The counter's compare-and-swap still wins the booking race, with the ledger's row lock beside it. Flipping the switch must not change any booking outcome.
The screen warns you to turn it on only once System Health has been clean.

#### `ADM-SET-020` — Clinical Questions · P0

**Feature.** The Health Profile question sets and the Pain Map templates. **Editing these changes what is asked from here on; answers already submitted are untouched.**

**Steps**
1. Open **Settings → Clinical Questions**.
2. Confirm the question bank is presented as **one tab per specialty**, not three stacked sections.
3. On the **Orthopaedic** tab, change the wording of `severity` and save.
4. Open a patient's intake wizard.
5. Open an existing patient's already-answered profile.
6. On **Enabled condition types**, switch **Paediatric** off.
7. As a therapist, open triage for a new patient, and then re-triage an existing paediatric patient.
8. Attempt to switch **Orthopaedic** off.

**Expected Result**
* Step 2: tabs, because twenty-odd textareas stacked is the wall-of-fields shape this product keeps correcting.
* Step 4: the new wording is shown. A new question requires **`helpText`** (why this answer matters, in the patient's words) and a **`shortLabel`** alongside its label — a question added without them is a defect.
* Step 5: **the already-submitted answer is unchanged.**
* Step 7: Paediatric is **removed from the triage picker** — and **an existing profile carrying it still renders**, and a therapist **re-triaging such a patient is still offered it**. If a live paediatric chart blanks, that is a P0 defect.
* Step 8: **Orthopaedic can never be switched off.**
* `schema_version` is **per specialty**, so changing a neuro question must **not** fire the "we've changed some of these questions" banner at orthopaedic patients.
* Pain Map templates edit per region and question; unknown values are refused with `Unknown region` / `Unknown questionKey for this region`.

#### `ADM-SET-025` — User Access: scopes · P0

**Steps**
1. Open **Settings → User Access**.
2. Read the admin list.
3. Attempt to change **your own** scope.
4. Narrow every other `full` admin, then attempt to narrow the last one.

**Expected Result.** Step 3: refused with `You can't change your own access. Ask another Master Admin.` Step 4: the last `full` admin (**Master Admin** in the picker) **cannot be narrowed** — otherwise a single mis-click locks everyone out permanently. Only a `full` admin can change scopes or mint another admin.

#### `ADM-SET-025a` — User Access: what each level can do · P1

**Steps.** On **Settings → User Access**, switch the toggle from **People** to **What each level can do**.

**Expected Result.** A table: rows are jobs in plain words, grouped by section (Today, Sessions, People, Money, Catalog, Settings); columns are **Master Admin · Operations · Finance · Clinical**. A legend names the three levels — **View and edit**, **View only**, **No access**. Each group heading also states the level each desk holds for that whole section.

**Spot checks.**
* Under **Sessions**, Finance shows a **View only** mark on *"See every session and who is running it"* and **No access** on *"Assign or change a session's therapist"*.
* Under **Money**, Operations and Clinical show **No access** on every row.
* Under **Settings**, only Master Admin shows anything.

**Critical checks.**
* **There are no checkboxes here.** Every cell is a read-only mark. If any cell can be clicked, that is the bug — a tick that does not also change what the server allows is worse than no tick.
* **It agrees with reality.** Pick any row showing access for a scope, sign in as that scope, and confirm the control is there. Pick any row showing none, and confirm both that the control is absent *and* that calling the route directly returns 403 (see `ADM-SET-027`).

#### `ADM-SET-025b` — Suspend and restore a back-office account · P0

**Steps**
1. On **Settings → User Access → People**, note each admin's status chip (**Active** / **Suspended**).
2. Suspend `qa.admin.ops@example.test`. Sign in as them.
3. Restore them. Sign in again.
4. Attempt to suspend **yourself**.
5. Suspend every other Master Admin, then attempt to suspend the last one who can still sign in.

**Expected Result.** Step 2: the row reads **Suspended**, and that account **cannot get in** — `getAdminUser` and the proxy both refuse an inactive admin, so a still-valid session cookie cannot POST an admin route either. Step 3: access returns. Step 4: refused with `You can't suspend your own access. Ask another Master Admin.` Step 5: refused — `This is the only Master Admin who can still sign in. Make someone else a Master Admin first.`

**Critical checks.**
* **The account is suspended, never deleted.** Their name still appears on every activity-log row they wrote. An account that could be deleted would take the record of what it did with it.
* A suspended admin **stays listed**, with a note saying how many are suspended.
* Only a **Master Admin** sees the Suspend button at all, and `POST /api/admin/set-admin-active` answers **403** to any other scope.

#### `ADM-PEOP-011` — The detail page behind the overlay is still the back office · P1

**Feature.** A patient's, therapist's or condition's detail is normally an overlay over the dashboard. Interception only covers client-side navigation, so a reload, a shared link, a new tab and any `router.refresh()` from inside the overlay land on the real page — which used to be a bare panel with a small "Back to Dashboard" link and none of the dashboard around it.

**Steps**
1. **People → Patients → a patient → Profile.** Press **Mark Done** on a session and confirm.
2. Look at what you are on afterwards: is there a sidebar?
3. Copy the URL, open it in a **new tab**, and reload it.
4. Use the sidebar from that page — tap **Sessions**, then come back and tap **Back to the dashboard**.
5. Repeat 1–4 for a **therapist** and for a **patient condition**.
6. Sign in as **Operations**, then **Finance**, then **Clinical**, and open a patient detail URL directly.
7. Watch the screen while it loads on a slow connection.

**Expected Result**
* Steps 1–3: the dark **sidebar**, the **Master Admin** brand and the section list are all present. It reads as the back office, not as a different, plainer site.
* Step 4: every entry lands on a **real dashboard screen**, and Back to the dashboard returns to Today.
* Step 5: identical on all three.
* Step 6: the sidebar shows **only the sections that scope can open** — it is built from the same list and the same scope grid the dashboard's own sidebar uses, so the two can never disagree. Logs is absent for all three.
* Step 7: the skeleton **keeps the sidebar rail** rather than blanking the chrome and putting it back.

#### `ADM-SET-025d` — Delete an account, and be refused when it has history · P0

**Feature.** Delete account sits on all four roles' screens — the Back office rows, and a patient's, therapist's and partner hospital's own page — for a **Master Admin only**. It can only ever succeed on an account with no history at all. That is the database's rule: thirty-five tables reference `profiles(id)` with no delete behaviour, so removing an account that has done anything would mean removing the books and the audit trail with it.

**Steps**
1. Create a throwaway patient with a typo'd email and, without doing anything else with it, delete it from their profile.
2. Delete a patient who has at least one session, one payment and a programme.
3. Delete a therapist who has run sessions and written notes.
4. Delete an admin who has performed any action at all.
5. Try to delete **your own** row in Back office.
6. Leave exactly one active Master Admin and try to delete it.
7. Sign in as **Operations**, then **Finance**, then **Clinical**, and look for the button. Then POST `/api/admin/delete-account` directly as each.
8. Open **Logs → All Activity** after step 1.
9. After step 1, try to sign in as that deleted account.

**Expected Result**
* Step 1: a **dialog** first, naming the account and saying this only works with no history, with Suspend named as the alternative. Confirming deletes it; the page returns to the directory it came from.
* Steps 2–4: **nothing is deleted**, and a dialog names what is on file — *"3 sessions, 2 money records, 1 programme and 12 back-office actions"* — and says to suspend instead. Each group is counted separately and pluralised on its own count. A refusal is never an 11px line beside the button: it is a paragraph and it belongs in a dialog.
* Step 5: refused — *"You can't delete your own account."* The button does not render on your own row either.
* Step 6: refused — the last Master Admin who can still sign in cannot be deleted, the same guard suspension carries, and this one has no undo at all.
* Step 7: **no button** for any of the three, and the direct POST is **403** for all three — deleting is Master Admin's alone even though every one of those desks can manage People.
* Step 8: an **`Deleted an account`** entry naming who did it, the account's name and role, and the email. It is written **before** the delete runs, because afterwards there is no row left to name.
* Step 9: the login no longer exists.

#### `ADM-SET-026` — Create the three scoped admins · P0
**Steps.** Create `qa.admin.ops@example.test` (Operations), `qa.admin.finance@example.test` (Finance), `qa.admin.clinical@example.test` (Clinical).
**The Account type picker is one control, not two.** It lists six entries in two groups — **Clinic**: Patient, Therapist · **Back office**: Master Admin, Operations, Finance, Clinical — using the same four names the dashboards call themselves. There is no separate **Access level** dropdown; picking a back-office desk shows that desk's one-line description under the picker. As a **non-`full`** admin, the whole Back office group is **absent** (only a Master Admin may mint an admin, and `create-account` enforces that with a full-only check, not a section gate — see §2).
**Expected Result.** Each is created with a generated password that is shown on the panel **and kept on that admin's own row in Back office** until they set their own, and is **never logged** (`ADM-SET-026b`). Signing in as each shows only their allowed sections in the sidebar — Operations: Today, Sessions, People, Catalog. Finance: Today, **Sessions (read-only)**, People, Money. Clinical: Today, Sessions, People.

#### `ADM-SET-026b` — The issued password survives, and the chosen one is never shown · P0

**Feature.** Every route in this app that generates a password now stores the plaintext on a service-role-only table, so a credential cannot be lost to a re-render. Create-account was the last one that did not: it held the password in React state alone, and the `profiles` row it had just inserted fired a realtime refresh that took it off the screen mid-sentence.

**Steps**
1. Create a back-office account. **Without touching anything**, wait for the dashboard to refresh (or have a second admin approve something so a realtime event fires).
2. Reload the page entirely and open **Settings → User Access**.
3. Press **Copy** on that row.
4. Create a **patient** and a **therapist** the same way, then open each of their profiles under **People**.
5. Sign in as the new admin and change the password through the forgot-password flow. Reopen User Access.
6. Look for anywhere in the product that displays the password they just chose.
7. **[SQL]** `select * from admin_account_notes;` as an authenticated non-service-role session.
8. **[SQL]** Search `admin_activity_log` for any generated password.

**Expected Result**
* Steps 1–2: the password is **still readable** on that admin's row — the panel going away does not lose it. The row reads *Still on the password we issued*, with the date it was issued.
* Step 3 puts it on the clipboard.
* Step 4: the same password appears on the patient's and the therapist's profile, in the existing **Current admin-set password** panel beside Reset Password.
* Step 5: the row now reads **Signing in with their own password** and the password is gone — cleared by `/api/clear-temp-password`, so the screen never offers a credential that no longer works.
* Step 6: **nowhere, by design.** A password somebody chose is stored by Supabase as a bcrypt hash and cannot be read back by this app or anyone else. The lane for a locked-out account is **Reset Password**, which issues a new one and puts the row back into the first state.
* Step 7: **no rows** — the table carries no RLS policies at all, so only the service role reads it. A plain column on `profiles` would be handed straight back to the account owner by `profiles_select_own`, which is why these four tables exist.
* Step 8: **no password anywhere in the log**, which every admin can read.

#### `ADM-SET-025c` — Suspend and Create release the button, not the page · P1

**Feature.** Both controls used to run their request and the dashboard refresh inside one transition, so the button stayed disabled and spinning until the whole Server Component had re-run — every screen, ~40 queries — which reads as a hang rather than as work. The button now owns its request only; the teal bar at the top of the page owns the refresh.

**Steps**
1. On **Settings → User Access**, tap **Suspend access** on an admin and watch the button and the top of the page.
2. Do the same for **Restore access**, and for the **Access level** dropdown.
3. Create an account and watch the **Create account** button.
4. Double-tap Suspend as fast as you can.
5. Put the browser offline (devtools) and tap Suspend.
6. With a second admin signed in on another machine, have them approve something and watch how many times your dashboard rebuilds.

**Expected Result**
* Steps 1–3: the button returns to its normal label **as soon as the request lands** — a beat, not seconds — and the **teal progress bar** carries the remaining wait. The row's new state appears when the refresh finishes. Neither control sits disabled through the rebuild.
* Step 4: **one** request. The second tap is refused by a synchronous guard, not by the disabled attribute, which lands a render too late.
* Step 5: an error under the control saying the server could not be reached. Never a button that silently did nothing — an unhandled throw inside the old transition put nothing on screen at all.
* Step 6: **one** rebuild, not two. `admin_activity_log` sits on the 30-second realtime channel with the other append-only records; while it was on the 2-second one, every admin action anywhere rebuilt every admin's dashboard a second time for the log entry describing it.

#### `ADM-SET-026c` — "Forbidden" means forbidden, and nothing else · P1

**Feature.** Create account intermittently answered **Forbidden** to a Master Admin. The cause was not permissions: this dashboard fires many requests at once, Supabase rotates refresh tokens, and a request carrying one that another request has just rotated comes back with no user — which the guard reported the same way it reports a stranger. A failed profile read did the same.

**Steps**
1. Create several accounts in a row, quickly, while the dashboard is busy (have a second admin acting at the same time). Watch for any refusal.
2. As an **Operations** admin, try to create a **Master Admin** from the Account type picker, and POST `/api/admin/create-account` with `{"role":"admin"}` directly.
3. Signed out entirely, POST the same route.
4. As an Operations admin, POST it with `{"role":"patient"}`.

**Expected Result**
* Step 1: **no spurious refusal.** A session blip is answered 401 (*"Your session has expired. Sign in again and retry."*) or 503 (*"Could not check your access just now."*), and the form **retries once by itself** before showing either — both are answered before anything is written, so there is no account to duplicate. What must never appear is *Forbidden* for an admin who is allowed.
* Step 2: the Back office group is **absent from the picker**, and the direct POST is **403 Forbidden** — flat, with no detail. Only a Master Admin may mint an admin, and the refusal stays opaque so a limited admin cannot map what exists beyond their access.
* Step 3: **401**, not 403 — being signed out is not a statement about what you may do.
* Step 4: **succeeds.** Creating a patient is an operations capability.

#### `ADM-SET-026a` — Each scope opens on its own dashboard · P1
There is one admin login (`/admin/login`) and one dashboard route; the scope decides what it opens on. Sign in as each of the four in turn and read the Today screen without tapping anything.

| Admin | Sidebar brand and header read | Today leads with | Quick actions |
| --- | --- | --- | --- |
| Master Admin | **Master Admin** | Sessions today | Approvals · All sessions · Money summary |
| Operations | **Operations** | Unassigned sessions | Assign a session · Approvals · Roster · New booking |
| Finance | **Finance** | Owed to therapists | Money summary · Payouts · Transactions · Costs |
| Clinical | **Clinical** | Recommendations | Recommendations · Patients · All sessions · Roster |

**Expected Result.** The dashboard names itself in two places on every screen — the sidebar brand (above **Admin Panel**) and the eyebrow above the section heading — so an admin never has to work out which dashboard they are on from which sidebar entries are missing.

Three further checks, each one a bug this replaced:
* **Every quick action lands somewhere.** Tap all of them for each scope. None may bounce to a different screen — a link into a section the scope cannot open silently falls back to the first allowed one, which looks like it worked.
* **"Needs you" agrees with the list below it.** The figure counts only the queues in the **Queues** card beside it. Add up the badges; they must match. It must not count queues this scope cannot open **or can only read** — a Finance admin's figure must exclude the session queues under Sessions, since nothing they can do would ever bring that number down.
* **A limited scope gets a "Your access" card** under Queues, naming the sections it opens, the ones it can only **read** (Finance: Sessions — *nothing to change here*), and the ones it does not open at all. **Master Admin gets no such card** — nothing is withheld, so there is nothing to account for.

#### `ADM-SET-027` — Scope is enforced at the route, not the sidebar · P0
For each scoped admin, do **both**: navigate to a forbidden section by URL, **and** call a route in that section directly.

| Admin | Forbidden URL | Forbidden route | Expected |
| --- | --- | --- | --- |
| Operations | `?section=money&tab=payouts` | `POST /api/admin/settle-therapist-payout` | Page falls back to an allowed screen; route **403** |
| Operations | `?section=settings&tab=booking` | `POST /api/admin/update-setting` | Same |
| Finance | `?section=sessions&tab=all` — **reachable, read-only** | `POST /api/admin/assign-appointment` | Page **opens** and shows the list with no action buttons; route **403** |
| Finance | `?section=sessions&tab=new` | `POST /api/admin/create-booking` | Tab is **not in the sidebar** and the URL falls back to an allowed screen; route **403** |
| Finance | `?section=catalog&tab=packages` | `POST /api/admin/create-package` | Same |
| Clinical | `?section=money&tab=summary` | `POST /api/admin/refund-package` | Same |
| Clinical | `?section=settings&tab=team` | `POST /api/admin/set-admin-scope` | Same |
| All three | `?section=today&tab=risk` | — | The tab opens with **only the signals that desk can act on**, and the flagged-message and reveal-log trails and the threshold editor are absent (`ADM-RISK-004`) |
| All three | `?section=logs&tab=all` | `POST /api/admin/clear-activity-log` | Logs is **not in the sidebar** and the URL falls back to an allowed screen; route **403** (`ADM-LOG-003`) |

**Expected Result.** **Every** one returns 403 at the route. The sidebar hiding a section is presentation only — a session cookie can call any route directly.
**Do not report the three full-only routes as violations.** `set-admin-scope`, `debug-reset` and `create-account` guard with an explicit `scope !== "full"` check rather than `requireAdminScope`, deliberately: a section gate would let a scoped admin widen its own access or mint a full admin. They are stricter than the rule, not exceptions to it.

#### `ADM-SET-028` — The section is chosen by the capability, not the button's location · P1
**Purpose.** A refund is `money` scope **even though its button lives on a Catalog screen**.
**Steps.** As **Admin Ops** (who *can* open Catalog), open **Catalog → Purchases** and look for the refund control. Then call `POST /api/admin/refund-package` directly.
**Expected Result.** **The refund control does not render** — a control an admin's scope cannot call must not be shown, or they get a 403 with nothing to explain it. The route returns **403**.

#### `ADM-SET-029` — Contact controls · P1
**Steps.** On **Settings → User Access**, change `contact_scan_mode` through `flag_and_block` → `flag_only` → `off`, and toggle `contact_masking_enabled`.
**Expected Result.** As per `THR-LEAK-006` and `THR-SESS-003`. Note the deliberate asymmetry: **`contact_scan_mode` fails open, `contact_masking_enabled` fails closed** — the safe answer to "I don't know" is opposite for the two, on purpose.
This tab also surfaces the `communication_flags` and `contact_reveal_log` evidence, **read-only**.

#### `ADM-SET-030` — System Health · P0

**Steps.** Open **Settings → System Health**. Read the verdict strip at the top, then tap the **i** button on each check.
**Expected Result.** A verdict strip naming how many checks need a person (`All 5 checks healthy`, `2 checks need you`, or `Nothing is broken` when a check is switched off or could not be run), with a jump chip per failing check, followed by five cards in a fixed shape: **Payment Confirmations**, **Google Connection**, **Session Links**, **Waiting Room**, **Books & Sessions Agree**. Every card carries a status **word** as well as a colour — `Healthy`, `Needs a look`, `Needs you now`, `Not set up`, `Not checked` — a one-line plain-words headline, and, whenever it is not healthy, a numbered **How to fix it yourself**. The **i** button expands *What this watches* and *For example* inside the same card and nothing else moves. **Books & Sessions Agree** reports where the entitlement **cache**, the **ledger** and the **legacy counter** disagree, plus captured payments attached to nothing and delivered sessions with nothing behind them. **It reports and never repairs** — a silent auto-fix on a money record is how a discrepancy becomes permanent, and that card deliberately has no fix button. The badge on this tab is the number of **checks** needing a person, and it matches the strip's own count and its chips exactly.
**Negative:** a missing `RAZORPAY_WEBHOOK_SECRET` and a dead Google credential both badged **0** before this, because the badge counted rows and those two failures have no rows.

#### `ADM-SET-030a` — System Health reaches the admin who never opens it · P1

**Steps.** Unset `RAZORPAY_WEBHOOK_SECRET` (or revoke the Google refresh token) and open **Today**. Then fix it and reload. Then, on **Settings → System Health**, read the line at the foot of each card and press **Copy for my developer** on a failing one. Finally sign in as an **Operations**, **Finance** and **Clinical** admin and open Today.
**Expected Result.** One red line at the top of Today naming the failing check and carrying its own headline, linking straight to Settings → System Health; it is gone once the check is green. **Only a red check does this** — an amber one (a Google account connected without Meet permission, sessions still being retried) puts nothing on Today. Each card's foot reads `Checked just now`, except **Google Connection**, which reports the age of its own cached probe (up to ten minutes after a success, one minute after a failure) — so an owner who has just re-run the token script can tell a stale answer from a disagreement. **Copy for my developer** puts the check name, its status, the headline and the numbered steps on the clipboard as plain text; a healthy card offers no such button. The three scoped admins see **no banner at all** — they cannot open Settings, and a banner linking somewhere they cannot follow would land them on a different screen through `findTab`'s fallback.

#### `ADM-SET-031` — Session Links retry · P1
Covered by `ADM-SESS-003`.

#### `ADM-SET-033` — Activity Log · P0

**Steps**
1. Open **Logs → All Activity**.
2. Confirm each of these earlier actions appears with actor, action, target and timestamp: account approval, therapist revenue-share change, care-plan withdrawal, care-plan authored on behalf, payout settlement, cash amount correction, credit adjustment, hospital onboarding, password reset.
2a. Confirm the same for the actions that used to leave no trace at all: `Changed a patient's contact details` (`ADM-PEOP-003`'s contact edit), `Edited notes on a patient`, `Changed whether a therapist appears on Team`, `Excluded a session rating from the average`, `Changed a home visit's address`, `Decided a record-access request` and `Decided a health-profile change` (`ADM-PEOP-004`), `Reworded an intake question` (`ADM-SET-020`), `Reviewed a risk signal` (`ADM-RISK-002`) and `Retried a Meet sync` (`ADM-SET-031`).
3. Search the log for any of the generated passwords from `ADM-SET-026` or `ADM-PEOP-009`.
4. **[SQL]** Attempt `insert into admin_activity_log …` as an authenticated (non-service-role) session, and attempt `update`/`delete`.

**Expected Result.** Step 2: **every one is present.** `payout.settle` is the largest money move in the application and must be attributed — if it is missing, that is a P0 defect. Step 3: **no password appears anywhere in the log.** Step 4: the insert is refused (there is a select policy and deliberately **no insert policy**), and the log is append-only from any session.
**Ordering guarantee:** each log row is written **after** the route's compare-and-swap, so the log can never record a settlement or cancellation that lost its race.

#### `ADM-SET-034` — Reading one entry: what changed, from what · P1

**Feature.** Tapping a row opens the whole entry. It used to expand the route's raw JSON into the table cell (`{"fromPercent":40,"toPercent":55}`) — a developer's view of a record whose purpose is to be read months later by somebody asking what a colleague altered and what it was before.

**Steps**
1. Change a therapist's revenue share from one percentage to another, then open **Logs → All Activity** and tap that row.
2. Tap a row for **Changed a patient's contact details**.
3. Tap a row for a **plain care-plan approval** (no reason required).
4. Tap **Show the exact record** on any entry that has one.
5. Tap a row for **Edited notes on a patient**.

**Expected Result**
* A **dialog**, not an inline expander: admin, when, subject and amount at the top, then **What changed** as `40% → 55%` — the old value struck through in red, the new one in green — then **Also recorded** for everything else in the entry.
* Step 2 names **both old and new email and phone**. It previously recorded `emailChanged: true` — an entry saying a patient's sign-in address was altered without saying what it had been is unusable for the only question it gets asked.
* Step 3 says the action **recorded no further detail**, and that who/what/when is the whole entry — never an empty table that reads as missing data.
* Money reads as **₹2,499**, not `249900`; a date reads as a date in IST; `true`/`false` read as **Yes**/**No**; an absent value is a dash. A field the screen does not recognise is **still listed** — in an audit record the unfamiliar key is the one somebody is looking for — and the raw record stays available behind the toggle.
* Every dialog ends with the line saying the entry **cannot be edited by anyone**, including the admin who wrote it, and that after 30 days a Master Admin can clear it and that clearing is logged too. The first half is enforced by the table having no update policy; the second half is there because the screen must not promise something the product stopped keeping when Archive & Clear shipped.
* Step 5 shows a **note length**, never the note's text: this log is readable by every admin, and a note written about one patient must not be reproduced across the whole back office.
**The one action logged after the fact on purpose:** `Reset all data` (`SETUP-RESET-001`). The wipe truncates `admin_activity_log`, so the row is written **after** the reset returns — open the log on a freshly reset database and it holds exactly one row, naming who emptied it. A log that is completely empty after a reset means that row is missing, and the most destructive action in the product is unattributed.

### 11.x Logs

The Logs section is **Master Admin only**. Operations, Finance and Clinical have no such section in their sidebar and read their own desk's work on **Today → Activity**, filtered to their own domain and their own desk.

#### `ADM-LOG-001` — Finding one entry in a long log · P1

**Feature.** The log grows for ever, so All Activity is built around finding one row rather than reading the list. The dashboard's own render carries the newest 200 entries; older ones are fetched on demand.

**Steps**
1. Open **Logs → All Activity** as a Master Admin.
2. Type a patient's name into the search box. Then type an admin's first name and a word from an action together, e.g. `asha refund`.
3. Set **Any type** to **Money**, then to **Sessions**.
4. Set a **From**/**To** range covering yesterday only, then press **Clear filters**.
5. Press **Load older entries** twice, watching the `x of n loaded` count.
6. Press it repeatedly until the button is replaced by a line saying there is nothing older.
7. Export CSV and PDF with a filter applied.

**Expected Result**
* Search matches the **action's label as well as its stored key** — typing `refund` finds `refund.issue`, and typing `settled` finds `Settled payout` — and also the subject and the admin's name. Two terms **narrow**, they do not widen.
* The type dropdown offers **only categories that have rows behind them**; a category with nothing in it is not listed. Each row carries its type as a chip, and the categories are the dashboard's own section names plus **Master Admin only** for the four capabilities no desk holds.
* **Clear filters** appears only while something is set, and returns the count to `n of n loaded`.
* Each **Load older entries** press adds up to 200 more and the count rises. No entry is ever listed twice, including one written while the page was open.
* When the log is exhausted the button is replaced by *"That is the whole log"*.
* Both exports carry **exactly the filtered rows**, with a Category column, and the note under the button says filters and exports run over what is loaded.

#### `ADM-LOG-003a` — One subject's whole history · P1

**Feature.** The log answers *"what did this admin do"* well and *"what happened to this patient"* badly — and the second is the question asked when somebody complains. Tapping an entry's subject fetches every entry recorded against that record.

**Steps**
1. Do three different things to one patient as an admin (edit their contact details, refund a session, grant a credit).
2. Open **Logs → All Activity**, tap the refund row, and press **See everything done to this record**.
3. Tap another entry inside the timeline.
4. **Rename the patient**, then do one more action on them, and open the timeline again.
5. Tap a row whose Subject is a dash, or one whose action recorded no record (`Reset all data`).

**Expected Result**
* Step 2: a dialog listing all three, newest first, each with the actor, the time, the amount where there is one and its type chip. The entry you came from is marked **This entry**.
* **The entry dialog closes when the timeline opens** — one dialog at a time, never two stacked over the table.
* Step 3 opens that entry's own detail, including one **older than anything the screen had loaded** — the timeline is fetched by record, not filtered from the loaded page.
* Step 4: **all four entries are still one history.** The timeline is keyed on the record's id, not on the name snapshotted into each entry, so a rename does not split one patient into two.
* Step 5: **no button is offered** — an action that named no record has no history to trace, and the footer says the list is entries recorded against that exact record rather than claiming to be everything.

#### `ADM-LOG-002` — Archive & Clear, and the floor under it · P0

**Feature.** The only way a row ever leaves `admin_activity_log`. The whole point of the design is that an admin cannot act and then remove the record of having acted.

**Steps**
1. Open **Logs → Archive & Clear**. Try to find any control offering a cutoff inside 30 days.
2. Choose **Older than 365 days** and press **Count them**.
3. Try to press **Clear** before downloading anything.
4. Press **Prepare the archive**, then download the CSV.
5. Type `clear logs` in lower case, then `CLEAR LOGS`, and press Clear.
6. Change the cutoff to a different choice after step 4 and look at the screen.
7. Open **All Activity** afterwards.
8. **[API]** POST `/api/admin/clear-activity-log` with `{"olderThanDays": 1, "confirm": "CLEAR LOGS"}`, and again with `{"olderThanDays": 365}` and no `confirm`.
9. **[API]** POST the same route as an **Operations**, **Finance** and **Clinical** admin.
10. **[SQL]** `select public.purge_admin_activity_log(1);` against a scratch database.

**Expected Result**
* Step 1: **no such control exists.** The choices are 30, 90, 180 and 365 days, and nothing shorter is offered.
* Step 2: a count from the **server**, not from the rows on screen. Zero says plainly there is nothing to clear.
* Step 3: the Clear button is **disabled** until a download has actually been produced — a checkbox saying a copy was taken is deliberately not what unlocks it.
* Step 5: the lower-case phrase is refused; only the exact phrase works.
* Step 6: changing the cutoff **resets the count, the archive, the download and the typed phrase** — a copy taken for one year must not unlock a clear at three months.
* Step 7: entries older than the cutoff are gone, everything newer is intact, and there is a new **`Cleared older log entries`** row naming the cutoff, the protected window and the number removed. **That row cannot be cleared by any later clear**, because it is inside the 30-day floor.
* Step 8: both are refused with 400 and nothing is removed.
* Step 9: **403** for all three, the same answer a stranger gets.
* Step 10: the function **raises** — the floor holds where no route check runs, which is the case the database half exists for.

#### `ADM-LOG-003` — Who can open Logs at all · P0

**Steps**
1. Sign in as **Operations**, then **Finance**, then **Clinical**. Look for a Logs entry in the sidebar.
2. For each, navigate directly to `/admin/dashboard?section=logs&tab=all`, and to `&tab=retention`.
3. Open **Settings** as a Master Admin and look for an Activity Log screen.
4. Open **Settings → User Access** as a Master Admin and read the matrix.

**Expected Result**
* Step 1: **no Logs section** for any of the three.
* Step 2: each lands on a screen their scope can open — never a heading over nothing, and never the log.
* Step 3: Settings has **nine** screens and Activity Log is **not** among them; it moved to the Logs section, which is the whole of it in one place.
* Step 4: the matrix carries a **Logs** group with a read row and a clear row, ticked for Master Admin and blank for the other three — derived from the same module the routes enforce with, so it cannot claim access nobody has.

#### `ADM-SET-035` — Account Security · P2
**Steps.** Open **Settings → Account Security** and change the admin's own password.
**Expected Result.** The change succeeds and the new password works. Admins are exempt from the idle timeout, so no timeout dialog appears while working here.

---

### 15.4 Configuration → dependent feature: the full matrix

Every row here is a required test. The **Verify** column is what proves the change actually landed.

| # | Configuration | Where it is changed | Dependent feature | Verify | Test |
| --- | --- | --- | --- | --- | --- |
| 1 | Online booking lead time | Settings → Booking Rules | `/book` picker **and** the create-appointment validator | Earliest offered slot moves; a boundary API call returns 409 | `ADM-SET-010` |
| 2 | Online cancellation refund window | Settings → Booking Rules | `/book` Step 3 notice; the cancel dialog; the refund paid | Notice text changes; a 48h-away cancel stops refunding at 72h | `ADM-SET-011` |
| 3 | Booking languages | Settings → Booking Rules | Step 1 chips; the stored `preferred_language` | New chips appear; an off-list language is dropped | `ADM-SET-012` |
| 4 | Treatment category price | Catalog → Conditions | `/book` header, Step 3 fee, the Razorpay amount | All three show the new price; an old cached page still charges the new one | `ADM-CAT-002` |
| 5 | Treatment category duration | Catalog → Conditions | The appointment's `duration_minutes`; overlap checks | A new booking stores the new duration | `ADM-CAT-002` |
| 6 | Category active/inactive | Catalog → Conditions | The concern dropdown; the create route | Absent from the dropdown; API returns 409 | `PAT-BOOK-013` |
| 7 | Package definition | Catalog → Packages | The therapist's recommendation dropdown | The new package is offered for its condition only | `THR-CARE-001` |
| 8 | Package price | Catalog → Packages | The patient's offer card and what is charged | Card and charge both move — **for new plans only** | `PAT-CARE-002` |
| 9 | Package edited after purchase | Catalog → Packages | An existing purchase | **Nothing changes** — snapshot frozen | `ADM-CAT-006` |
| 10 | Package min gap / max per week | Catalog → Packages | The bulk scheduler | Violating slots are refused | `ADM-CAT-007` |
| 11 | Package default validity | Settings → Programmes & Home Visits | A new purchase's expiry | Expiry date matches | `ADM-SET-018` |
| 12 | Bulk scheduler limit | Settings → Programmes & Home Visits | `/api/appointments/book-package-sessions` | `Too many slots in one request.` | `ADM-SET-018` |
| 13 | Therapist lock switch | Settings → Programmes & Home Visits | Auto-assignment of later package sessions | Off → later sessions are not auto-assigned | `ADM-SET-018` |
| 14 | Therapist suggestions switch | Settings → Programmes & Home Visits | The suggest control and its route | Off → control absent, route 403 | `THR-SUGG-001` |
| 15 | Ledger authority | Settings → Programmes & Home Visits | Six balance surfaces | All six follow together | `ADM-SET-019` |
| 16 | Service area created/deleted | Catalog → Service Areas | `/book-home-visit` check; every purchase route | Serviceable ↔ waitlist | `ADM-CAT-010` |
| 17 | Travel fee per area | Catalog → Service Areas | The quoted total and the therapist's payout | Total = programme + fee × visits | `PAT-CARE-003` |
| 18 | Home visit master switch | Settings → Programmes & Home Visits | Seven surfaces + care-plan purchase | 404 / entries dropped / purchase refused | `ADM-SET-013` |
| 19 | Cash on visit | Settings → Programmes & Home Visits | Step 4 option; `book-cash` | Option absent; route refuses | `PAT-HV-007` |
| 20 | Home visit lead time | Settings → Programmes & Home Visits | The home-visit picker only | Online picker unchanged | `ADM-SET-014` |
| 21 | Travel buffer minutes | Settings → Programmes & Home Visits | The locked therapist's conflict check | Padded both sides for visits, 0 for online | `ADM-SET-014` |
| 22 | Home visit refund window | Settings → Programmes & Home Visits | The home-visit cancel dialog only | Online dialog unchanged | `PAT-CANCEL-003` |
| 23 | Join window before/after | Settings → Booking Rules | Every join control | Goes live earlier/later everywhere | `ADM-SET-017` |
| 24 | Session Completed cutoff | Settings → Booking Rules | Every join control on every role | All three read **Session Completed** together | `XR-CUTOFF-001` |
| 25 | Google Meet toggle | Settings → Booking Rules | New online sessions' Meet link | No link; **home visit still gets an event** | `ADM-SET-017` |
| 26 | Session timeout | Settings → Booking Rules | The idle dialog on all three non-admin dashboards | Signs out to the right login; admins exempt | `ADM-SET-015` |
| 27 | Farewell banner seconds | Settings → Booking Rules | The post-logout banner | Duration changes; 0 = until dismissed | `ADM-SET-016` |
| 28 | Clinical question wording | Settings → Clinical Questions | The intake wizard | New wording; old answers untouched | `ADM-SET-020` |
| 29 | Enabled condition types | Settings → Clinical Questions | The triage picker only | Removed from triage; existing charts render | `ADM-SET-020` |
| 30 | Pain Map templates | Settings → Clinical Questions | The exam dialog | New questions per region | `ADM-SET-020` |
| 31 | Admin scope | Settings → User Access | Every admin route and the sidebar | Route 403 + control hidden | `ADM-SET-027` |
| 32 | Contact scan mode | Settings → User Access | Every cross-role free-text write | block → flag → none | `THR-LEAK-006` |
| 33 | Contact masking | Settings → User Access | Therapist session cards | Masked ↔ plain; **fails closed** | `THR-SESS-003` |
| 34 | Risk signals on/off + thresholds | Today → Risk | The detector sweep | Sweep stops; thresholds change what fires | `ADM-RISK-003` |
| 35 | Brand & contact details | Settings → Brand & Contact | Navbar, Footer, page metadata, splash fallback | All update | `ADM-SET-001` |
| 36 | Walkthrough seconds | Settings → Public Site | The home page walkthrough | Pace changes; 0 = static | `ADM-SET-005` |
| 37 | Splash (5 settings) | Settings → Public Site | The opening splash | Each behaves as documented | `ADM-SET-006` |
| 38 | Testimonials | Settings → Public Site | `/` and `/mission` bands | Both update from one component | `ADM-SET-007` |
| 39 | FAQ | Settings → Public Site | `/faq` | Accordion updates | `ADM-SET-008` |
| 40 | Public ratings visibility | Settings → Public Site | `/team`, `/` | Summary hidden | `ADM-SET-004` |
| 41 | Therapist revenue share | People → Therapists | Earnings, Payouts, Money split | All three move together | `ADM-PEOP-006` |
| 42 | Therapist home-visit share | People → Therapists | Home-visit payout maths | Falls back to online share when unset | `THR-EARN-002` |
| 43 | Hospital revenue share | People → Partners | Partner Earnings, Money breakdown | Both move; unset ⇒ **excluded, not guessed** | `HOS-MONEY-002` |
| 44 | Therapist team visibility | People → Therapists | `/team`, `?therapist=` resolution | Hidden ⇒ link resolves to nothing, silently | `PAT-BOOK-008` |
| 45 | Payment gateway fee % | Settings (Costs context) | Operating profit on Money → Costs | The automatic fee line moves | `FIN-COST-002` |
| 46 | **Therapist roster (any change)** | Sessions → Roster | **`/book` picker** | **Nothing changes — this is the guard** | `XCFG-ROSTER-001` |
