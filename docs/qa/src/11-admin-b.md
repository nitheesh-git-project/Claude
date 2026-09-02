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
**Expected Result.** It appears in the same band on **both** pages — one component serves both, because the two bands make the same claim and a visitor may see both in one session. The avatar is optional; with none, the **patient's initial** is shown, never a generic silhouette.
**Critical check:** the five rows the schema seeds are **illustrative copy, not real patients**, and the admin form must **say so at the point of entry**. Never present a seeded testimonial as real. The only place a **real** number is quoted is the public rating summary.
**Negatives:** `Missing patientName or quote`; editing requires `Missing id, patientName, or quote`.

#### `ADM-SET-008` — FAQ · P2
**Steps.** Create, edit, reorder and delete an FAQ. Open `/faq`.
**Expected Result.** The public accordion reflects each change. Negatives: `Missing question or answer`, `Missing id, question, or answer`.

---

### 15.3 Settings → Booking Rules

This tab holds three groups: **Platform Rules**, **Package settings**, and **Home Visit settings**. They were on three different tabs before, which is how the online lead time ended up hardcoded while its home-visit twin was already a setting.

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

At **Settings → Booking Rules**, above the package settings.

| Setting | Default | Dependent feature |
| --- | --- | --- |
| **Approve recommendations before the patient sees them** | **on** | Off → a therapist's submission publishes on save and the patient sees it immediately, as it did before the review step. On → it lands in Sessions → Recommendations and the patient sees nothing. See `ADM-CARE-004..007`. **Fails closed:** an unreadable column holds the recommendation rather than publishing it |
| **How long a recommendation holds** | 30 d | The patient's answering window, counted **from approval**, not from when the therapist wrote it |
| **Most sessions a week a clinician may ask for** | 5 | A ceiling over the programme's own `max_sessions_per_week`, whichever is lower. Above it: `This programme allows at most N sessions a week.` |

Note there is no longer a **Show programme prices publicly** switch. Programmes are not advertised on the public site at all — see `PUB-CAT-002`.

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
1. Open **Settings → System Health** and confirm the accounting check reports **no disagreements**.
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

#### `ADM-SET-025` — Team & Access: scopes · P0

**Steps**
1. Open **Settings → Team & Access**.
2. Read the admin list.
3. Attempt to change **your own** scope.
4. Narrow every other `full` admin, then attempt to narrow the last one.

**Expected Result.** Step 3: refused with `You can't change your own access. Ask another full-access admin.` Step 4: the last `full` admin **cannot be narrowed** — otherwise a single mis-click locks everyone out permanently. Only a `full` admin can change scopes or mint another admin.

#### `ADM-SET-026` — Create the three scoped admins · P0
**Steps.** Create `qa.admin.ops@example.test` (Operations), `qa.admin.finance@example.test` (Finance), `qa.admin.clinical@example.test` (Clinical).
**Expected Result.** Each is created with a one-time password shown once and **never logged**. Signing in as each shows only their allowed sections in the sidebar — Operations: Today, Sessions, People, Catalog. Finance: Today, People, Money. Clinical: Today, Sessions, People.

#### `ADM-SET-027` — Scope is enforced at the route, not the sidebar · P0
For each scoped admin, do **both**: navigate to a forbidden section by URL, **and** call a route in that section directly.

| Admin | Forbidden URL | Forbidden route | Expected |
| --- | --- | --- | --- |
| Operations | `?section=money&tab=payouts` | `POST /api/admin/settle-therapist-payout` | Page falls back to an allowed screen; route **403** |
| Operations | `?section=settings&tab=booking` | `POST /api/admin/update-setting` | Same |
| Finance | `?section=sessions&tab=all` | `POST /api/admin/assign-appointment` | Same |
| Finance | `?section=catalog&tab=packages` | `POST /api/admin/create-package` | Same |
| Clinical | `?section=money&tab=summary` | `POST /api/admin/refund-package` | Same |
| Clinical | `?section=settings&tab=team` | `POST /api/admin/set-admin-scope` | Same |
| All three | `?section=today&tab=risk` | — | The Risk tab is not rendered and its data is not fetched |

**Expected Result.** **Every** one returns 403 at the route. The sidebar hiding a section is presentation only — a session cookie can call any route directly.
**Do not report the three full-only routes as violations.** `set-admin-scope`, `debug-reset` and `create-account` guard with an explicit `scope !== "full"` check rather than `requireAdminScope`, deliberately: a section gate would let a scoped admin widen its own access or mint a full admin. They are stricter than the rule, not exceptions to it.

#### `ADM-SET-028` — The section is chosen by the capability, not the button's location · P1
**Purpose.** A refund is `money` scope **even though its button lives on a Catalog screen**.
**Steps.** As **Admin Ops** (who *can* open Catalog), open **Catalog → Purchases** and look for the refund control. Then call `POST /api/admin/refund-package` directly.
**Expected Result.** **The refund control does not render** — a control an admin's scope cannot call must not be shown, or they get a 403 with nothing to explain it. The route returns **403**.

#### `ADM-SET-029` — Contact controls · P1
**Steps.** On **Settings → Team & Access**, change `contact_scan_mode` through `flag_and_block` → `flag_only` → `off`, and toggle `contact_masking_enabled`.
**Expected Result.** As per `THR-LEAK-006` and `THR-SESS-003`. Note the deliberate asymmetry: **`contact_scan_mode` fails open, `contact_masking_enabled` fails closed** — the safe answer to "I don't know" is opposite for the two, on purpose.
This tab also surfaces the `communication_flags` and `contact_reveal_log` evidence, **read-only**.

#### `ADM-SET-030` — System Health · P0

**Steps.** Open **Settings → System Health**.
**Expected Result.** Two panels: **Sync Health** (failed Meet syncs, with Retry) and the **accounting check**. The accounting check reports where the entitlement **cache**, the **ledger** and the **legacy counter** disagree. **It reports and never repairs** — a silent auto-fix on a money record is how a discrepancy becomes permanent. The badge on this tab is the sum of sync issues and accounting problems.

#### `ADM-SET-031` — Sync Health retry · P1
Covered by `ADM-SESS-003`.

#### `ADM-SET-033` — Activity Log · P0

**Steps**
1. Open **Settings → Activity Log**.
2. Confirm each of these earlier actions appears with actor, action, target and timestamp: account approval, therapist revenue-share change, care-plan withdrawal, care-plan authored on behalf, payout settlement, cash amount correction, credit adjustment, hospital onboarding, password reset.
3. Search the log for any of the generated passwords from `ADM-SET-026` or `ADM-PEOP-009`.
4. **[SQL]** Attempt `insert into admin_activity_log …` as an authenticated (non-service-role) session, and attempt `update`/`delete`.

**Expected Result.** Step 2: **every one is present.** `payout.settle` is the largest money move in the application and must be attributed — if it is missing, that is a P0 defect. Step 3: **no password appears anywhere in the log.** Step 4: the insert is refused (there is a select policy and deliberately **no insert policy**), and the log is append-only from any session.
**Ordering guarantee:** each log row is written **after** the route's compare-and-swap, so the log can never record a settlement or cancellation that lost its race.

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
| 11 | Package default validity | Settings → Booking Rules | A new purchase's expiry | Expiry date matches | `ADM-SET-018` |
| 12 | Bulk scheduler limit | Settings → Booking Rules | `/api/appointments/book-package-sessions` | `Too many slots in one request.` | `ADM-SET-018` |
| 13 | Therapist lock switch | Settings → Booking Rules | Auto-assignment of later package sessions | Off → later sessions are not auto-assigned | `ADM-SET-018` |
| 14 | Therapist suggestions switch | Settings → Booking Rules | The suggest control and its route | Off → control absent, route 403 | `THR-SUGG-001` |
| 15 | Ledger authority | Settings → Booking Rules | Six balance surfaces | All six follow together | `ADM-SET-019` |
| 16 | Service area created/deleted | Catalog → Service Areas | `/book-home-visit` check; every purchase route | Serviceable ↔ waitlist | `ADM-CAT-010` |
| 17 | Travel fee per area | Catalog → Service Areas | The quoted total and the therapist's payout | Total = programme + fee × visits | `PAT-CARE-003` |
| 18 | Home visit master switch | Settings → Booking Rules | Seven surfaces + care-plan purchase | 404 / entries dropped / purchase refused | `ADM-SET-013` |
| 19 | Cash on visit | Settings → Booking Rules | Step 4 option; `book-cash` | Option absent; route refuses | `PAT-HV-007` |
| 20 | Home visit lead time | Settings → Booking Rules | The home-visit picker only | Online picker unchanged | `ADM-SET-014` |
| 21 | Travel buffer minutes | Settings → Booking Rules | The locked therapist's conflict check | Padded both sides for visits, 0 for online | `ADM-SET-014` |
| 22 | Home visit refund window | Settings → Booking Rules | The home-visit cancel dialog only | Online dialog unchanged | `PAT-CANCEL-003` |
| 23 | Join window before/after | Settings → Booking Rules | Every join control | Goes live earlier/later everywhere | `ADM-SET-017` |
| 24 | Session Completed cutoff | Settings → Booking Rules | Every join control on every role | All three read **Session Completed** together | `XR-CUTOFF-001` |
| 25 | Google Meet toggle | Settings → Booking Rules | New online sessions' Meet link | No link; **home visit still gets an event** | `ADM-SET-017` |
| 26 | Session timeout | Settings → Booking Rules | The idle dialog on all three non-admin dashboards | Signs out to the right login; admins exempt | `ADM-SET-015` |
| 27 | Farewell banner seconds | Settings → Booking Rules | The post-logout banner | Duration changes; 0 = until dismissed | `ADM-SET-016` |
| 28 | Clinical question wording | Settings → Clinical Questions | The intake wizard | New wording; old answers untouched | `ADM-SET-020` |
| 29 | Enabled condition types | Settings → Clinical Questions | The triage picker only | Removed from triage; existing charts render | `ADM-SET-020` |
| 30 | Pain Map templates | Settings → Clinical Questions | The exam dialog | New questions per region | `ADM-SET-020` |
| 31 | Admin scope | Settings → Team & Access | Every admin route and the sidebar | Route 403 + control hidden | `ADM-SET-027` |
| 32 | Contact scan mode | Settings → Team & Access | Every cross-role free-text write | block → flag → none | `THR-LEAK-006` |
| 33 | Contact masking | Settings → Team & Access | Therapist session cards | Masked ↔ plain; **fails closed** | `THR-SESS-003` |
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
