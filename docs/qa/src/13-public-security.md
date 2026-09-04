---

## 17. Public marketing site test plan

### 17.0 Feature guide

The eight public pages are **one template, not eight layouts**. Every page assembles from the same design system: a hero (photo right, one headline, one sentence, up to two calls to action), a trust bar, some section bands, an "explore" strip, and a closing call to action. **Every page ends the same way on purpose** — wherever a visitor stops reading, the next step is in the same place.

The site's own index lives in **one array**, which the header nav, the footer's Explore column, the home page's connector grid and every "Where to go next" strip all read. So a page cannot exist in the header and be missing from the index, and a renamed page cannot leave a stale description behind.

**Every Explore band ends on Book a session**, on all eight pages, in the same full-width photo-beside-text tile — booking was on the home page's grid alone, so the six inner pages ended their index on another page to read. And **the page tiles above it square up**: the count varies (the page you are on is always missing, and Home Visit drops out when the clinic switches it off), so a row that would end short stretches its leftover tiles across it rather than leaving dead cells on the right.

#### `PUB-EXP-001` — The Explore band, on every public page · P1

**Steps.** Open each of `/`, `/conditions`, `/how-it-works`, `/home-visit`, `/team`, `/mission`, `/faq`, `/hospitals` and read the Explore band at the foot.
**Expected Result.** Every one ends with **Book a session** → `/book`, as the last tile, full width, photo beside the text. Above it: every other page, never the one you are on, and never Home Visit while the master switch is off.
**Alignment.** With the usual **seven** page tiles: two rows of three, then the seventh **stretched across the whole row** in the same wide layout — no empty cells to the right of it. Switch Home Visit off and reload: **six** tiles, two clean rows of three, nothing stretched. Narrow the window to the two-column breakpoint and repeat both: the last row must still be full.
**Critical check:** this is arithmetic, not a hand-placed exception (`src/lib/exploreGridSpans.ts`, unit-tested). A tile that is full width on a tablet and half width on a desktop must **not** switch to the photo-beside-text layout — that would read as two designs rather than one stretched tile.

**Word budgets are numbers, not a vibe** — the rewrite exists because visitors could not tell what the site was, and the second round of feedback was that there was still too much to read:

| Slot | Budget |
| --- | --- |
| Hero subtitle | 12 words |
| Section lede | 9 words — and dropped entirely when the heading already says it |
| Icon card / step / split-feature body | 10 words |
| Bullet / check | 5 words |
| Care-area blurb 8 words · detail 14 words |
| Page blurb | 8 words |
| Closing call-to-action body | 12 words |
| Mission / vision sentence | 15 words |

**Photography is load-bearing, not decoration.** A visitor should be able to tell what a page is about with the text blurred out. Three rules hold:
1. **Every photograph shows a screen** — a laptop, tablet or phone in frame — **except the two home-visit images**, which show hands-on treatment. This clinic sells video consultations; a site of clinic photography reads as a walk-in practice.
2. **Every photograph shows a face, and the face is glad to be there.** The one exception is the clinician reading a scan, who is concentrating — a physiotherapist grinning at an X-ray is the opposite of reassuring.
3. Photos are **static imports**, never `/photos/x.jpg` strings and never remote URLs, so a missing file is a compile error.

#### `PUB-HOME-001` — The home page · P1
**Steps.** Open `/`. Scroll to the bottom.
**Expected Result.** Hero → trust bar → care-area showcase → walkthrough → programmes → testimonials → mission band → connector grid. The **mission band gives the mission and vision in full** (they are two sentences; paraphrasing would make the home page a weaker version of the same claim) while the **four promises appear as titles only**, each linking to the mission page's promises anchor. The connector grid shows the other seven pages **plus booking** — the index of the site always ends on the one action the site exists for.

#### `PUB-COND-001` — Care areas show one photograph at a time · P1
**Steps.** On `/` and `/conditions`, use the care-area showcase: swipe, the arrow buttons, and the picker.
**Expected Result.** **One panel at a time** — photograph left, the answer right, the other five one tap away. All three controls go through one selection path so they cannot disagree about what is showing. The picker is a real tablist with **roving focus and arrow keys**. **It never advances by itself** — the home page already carries the auto-rotating walkthrough, and two moving things is worse than either alone. Its accessible name is **"Areas of practice"**, distinct from the walkthrough's **"How the process works"**.

#### `PUB-NAV-001` — The section rail and the scroll arrow · P1
**Steps.** On each public page, use the section rail's entries and then the bottom-right scroll arrow repeatedly.
**Expected Result.** Every rail entry corresponds to a section that **actually rendered** (several bands are conditional on admin-controlled catalog data), and the entries are in **DOM order**. The arrow walks the list **top to bottom** — if it ever sends you backwards, an entry is out of order.

#### `PUB-CAT-001` — A catalog card opens a dialog; booking is its own button · P1
**Steps.** On `/` and `/conditions`, tap a programme (treatment category) card's **body**. Then tap its **Book …** link.
**Expected Result.** The card body is **one tap target that opens a detail dialog** carrying the long description and what the programme covers. The **Book …** link sits **below the card** and again at the foot of the dialog, **outside** the tap-target button (a link nested inside a button is invalid markup and behaves differently per browser). It goes to `/book?category=<id>` — a **first session**, never a course of them.
**Cover images:** a card with no photo shows the **shared placeholder panel at the same height** as one with a photo. It must never look like an image that failed to load.

#### `PUB-CAT-002` — No course of treatment is advertised anywhere public · P0

**Feature.** A course of treatment is a clinical recommendation, so the public site does not carry a price list of them. Removed outright rather than hidden behind a setting: a toggle somebody can flip back on is not the rule being gone.

**Preconditions.** Packages P1–P3 exist, are `active`, and have `visible_on_home` and `visible_on_conditions` on. That matters — this is an absence tested against rows that genuinely could have rendered.

**Steps.** Read `/` and `/conditions` end to end, including inside every programme detail dialog. Then read `/home-visit`.
**Expected Result**
* **No session package appears anywhere** — no card, no title, no price, and no "Where this usually leads" list inside a programme's dialog.
* **No link anywhere matches `/book?package=`.** A card still linking to package checkout would take money for something the server now refuses; this is the assertion that catches a partial revert.
* `/home-visit` shows **single**-visit packages only. `HV1` (1 visit) is there and books directly; `HV2` (4 visits) is **absent** — it is a recommendation, not a product.
* There is **no admin switch** for any of this. "Show programme prices publicly" no longer exists on Settings; if you find it, that is a defect.

#### `PUB-TEAM-001` — Team · P2
**Expected Result.** Only approved, active, team-visible therapists appear. Tapping one opens a popup with their profile and a **Book with …** action carrying `?therapist=` into the wizard.

#### `PUB-FAQ-001` — FAQ · P2
**Expected Result.** The accordion renders the admin-managed FAQs in order. With none configured, the page shows a sensible empty state rather than a broken band.

#### `PUB-HV-001` — Home visit page · P1
Covered by `PAT-HV-001` and `ADM-SET-013`.

---

## 18. Security and authorization test plan

> **The rule for this whole section: do not only verify that the UI hides something.** Every case has a route-level twin. The application enforces its gates in two places — the proxy for navigation, and `requireActiveProfile` / `requireAdmin` / `requireAdminScope` inside the routes — because a valid session cookie can call the API around the UI.

**How to call a route as a given user.** Sign in as that user in a browser, copy the session cookie from DevTools → Application → Cookies, and use it with curl:

```
curl -i -X POST http://localhost:3000/api/<route> \
  -H 'Content-Type: application/json' \
  -b '<paste the cookie header>' \
  -d '{ ...body... }'
```

### 18.1 Signed-out access

#### `SEC-ROUTE-001` — Every protected route redirects a signed-out visitor · P0
**Steps.** In a private window, navigate to `/patient/dashboard`, `/patient/dashboard/health-profile`, `/therapist/dashboard`, `/therapist/dashboard/earnings`, `/hospital/dashboard`, `/hospital/dashboard/revenue`, `/admin/dashboard`, `/admin/dashboard/patients/<id>`.
**Expected Result.** Each redirects to that role's own login page. **No protected content is rendered even for a frame.**

#### `SEC-ROUTE-002` — Every mutating route refuses an anonymous caller · P0
**Steps.** Call a representative route from each family with **no cookie**: `/api/appointments/create`, `/api/appointments/cancel`, `/api/patient/condition-profile/submit`, `/api/therapist/save-availability`, `/api/therapist/care-plan/submit`, `/api/hospital/withdraw-referral`, `/api/admin/approve-account`, `/api/admin/settle-therapist-payout`, `/api/medical-documents/view`, `/api/razorpay/create-order`.
**Expected Result.** **401 `Not signed in`** or **403 `Forbidden`** on every one. **None returns 200, and none leaks data in the error body.**

### 18.2 Cross-role access

#### `SEC-ROUTE-003` — A signed-in user of the wrong role is sent to Get Started · P0
**Steps.** As each of patient / therapist / hospital, navigate to each of the other three dashboards.
**Expected Result.** Every one redirects to **`/get-started`**.

#### `SEC-ROUTE-004` — The back office is never named to an outsider · P0
**Steps.** As a signed-in **patient**, navigate to `/admin/dashboard`. Then view the page source of `/`, `/patient/dashboard` and `/team`, and search for `/admin/login` and `/admin/dashboard`.
**Expected Result.** The navigation redirects to **`/get-started`**, never to `/admin/login` — which would confirm the back office exists and name its door. **No admin path appears in any public client bundle**: the role→dashboard mapping is resolved **server-side** at `/dashboard`, and `Navbar` and the wrong-account panel link to `/dashboard`.
**The Debug Bar is the deliberate exception** — it still lists the admin routes, and is deleted before release. If you find an admin path in a public bundle **outside** the debug bar, that is a P0.

#### `SEC-ROUTE-005` — `/admin/login` is not indexed · P2
**Expected Result.** The page carries `robots: noindex`.

#### `SEC-ROUTE-006` — `/dashboard` routes by role, server-side · P1
**Steps.** As each role, open `/dashboard`. Then open `/dashboard?hash=<something>` and `/dashboard?hash=//evil.example.com`.
**Expected Result.** Each role lands on their own dashboard. A legitimate `hash` becomes a real fragment (the anchor-based shells need it) and is **pattern-checked**; a value that could smuggle a host is rejected. **No open redirect.**

### 18.3 Horizontal privilege (one user reaching another's data)

#### `SEC-DATA-001` — Patient A cannot read Patient B · P0
**Steps.** As Patient A: (a) call `/api/packages/purchase-detail` with Patient B's purchase id; (b) call `/api/home-visit/purchase-detail` likewise; (c) call `/api/appointments/cancel` with Patient B's appointment id; (d) call `/api/medical-documents/view` with Patient B's document id; (e) call `/api/patient/condition-profile/export` and check whose record comes back.
**Expected Result.** (a)–(d) all refused. The purchase-detail routes query with **the caller's own RLS-scoped client**, so **a row coming back at all is the authorization check** — there is deliberately no manual ownership branch duplicating what the policies guarantee. (e) returns **only Patient A's** record.

#### `SEC-DATA-002` — Therapist A cannot reach Therapist B's data · P0
Covered by `THR-SEC-001`, `THR-SEC-002`. Additionally: `/api/therapist/record-cash-collection` with Therapist B's appointment id → refused; `/api/therapist/session-notes/submit` for Therapist B's session → refused; `/api/therapist/suggest-session` on a programme locked to Therapist B → `That isn't your programme.`

#### `SEC-DATA-003` — Hospital A cannot reach Hospital B · P0
Covered by `HOS-SEC-001`.

#### `SEC-DATA-004` — Private documents · P0
**Steps.** Upload a report as Patient A. Copy the signed URL. (a) Open it in a private window **within** 120 seconds. (b) Open it **after** 120 seconds. (c) Try to guess/construct a direct Storage object URL for the `medical-reports` bucket. (d) As Therapist A (assigned), view it. (e) As Therapist B (not assigned), request it.
**Expected Result.** (a) opens — a signed URL is a bearer token by design, which is why it is short-lived. (b) **fails**. (c) **fails — the bucket is private**, unlike `avatars`. A scan report is the most sensitive thing this application holds, and a public bucket would make the object URL itself the only secret. (d) allowed. (e) refused.
**Also confirm:** `patient_medical_documents` has **no bytea/base64 column** — a handful of MRI PDFs stored inline would dominate the database's size and ride along on every read of a patient's chart.

#### `SEC-DATA-005` — Contact information exposure · P0
Covered by `THR-SESS-003` (masking, and the plaintext number absent from the page source) and `THR-SESS-004` (the reveal log).
Additionally: check the **admin export** of patients — a masked field must mask the same way there, and no export anywhere emits JSON.

### 18.4 Vertical privilege (scope)

#### `SEC-ADMIN-001` — Scoped admins · P0
Covered by `ADM-SET-027` and `ADM-SET-028`. Run the whole table.

#### `SEC-ADMIN-002` — A non-admin cannot call an admin route · P0
**Steps.** With **each** of a patient's, a therapist's and a hospital's cookie, call ten admin routes across different sections.
**Expected Result.** **403 on every one.**

#### `SEC-ADMIN-003` — Scope changes are self-protecting · P0
Covered by `ADM-SET-025`: no self-change, and the last `full` admin cannot be narrowed.

#### `SEC-AUTH-006` — A suspended account is locked out everywhere · P0
**Steps.** Suspend Patient A, Therapist A and Hospital A in turn. With each still-valid cookie: load the dashboard, then call a self-service route.
**Expected Result.** Dashboard → **`/account-suspended`**. Route → **403** (`Your account has been suspended.` / `Your account is not active.`). **A live cookie must not outlive suspension.**
**Contrast:** an **admin** is refused on `active` but **deliberately not on `approved`** — an admin is promoted by hand rather than through the signup queue, so gating on approval would lock out the people it protects. Verify an admin with `approved=false` **can still sign in**.

### 18.5 Input tampering

#### `SEC-TAMPER-001` — Manipulated ids · P0
**Steps.** For ten routes, substitute another user's id, a random UUID, an empty string, `null`, and a non-UUID string.
**Expected Result.** Each returns a **readable 400/403/404**. **No 500 with a database message.** No response body contains a table name, a column name, a row id belonging to somebody else, or a stack trace.

#### `SEC-TAMPER-002` — Manipulated prices · P0
Covered by `PAY-AMT-001` and `PAY-AMT-002`.

#### `SEC-TAMPER-003` — Manipulated session counts · P0
**Steps.** Attempt to book more package sessions than remain by sending extra slots; attempt to set `sessions_granted` through any route.
**Expected Result.** Refused. **There is no route that accepts a session count from the client.** The count comes from the frozen snapshot.

#### `SEC-TAMPER-004` — Manipulated permissions · P0
**Steps.** As a patient, send `{"role":"admin"}` and `{"admin_scope":"full"}` in the body of a profile-update route. As a scoped admin, call `set-admin-scope` on yourself.
**Expected Result.** All refused or ignored. **Never trust a role, an id, or an amount sent from the client — it is re-derived server-side.**

#### `SEC-TAMPER-005` — Malformed bodies · P1
**Steps.** POST invalid JSON, an empty body, a deeply nested object, and a 5 MB string field to ten routes.
**Expected Result.** `Malformed payload` or a specific field message, always **4xx**, never a 500 and never a crash.

#### `SEC-TAMPER-006` — Duplicate submissions · P0
Covered by `PAT-BOOK-017`, `PAT-SUGG-004`, `THR-AVAIL-004`, `FIN-PAY-002`, `PAY-DUP-004`.

### 18.6 Authentication behaviour

#### `SEC-AUTH-004` — No email-confirmation step exists · P0
**Steps.** Register through **all four** sign-up call sites: `/patient/register`, the `/book` wizard, the `/book-home-visit` wizard, and `/therapist/login` → Apply to Join.
**Expected Result.** Every one returns a session immediately. **None shows a "check your email" instruction.** If a sign-up returns no session, the app reports it as a **failure** (`Your account was created but we couldn't sign you in to finish this booking. Please sign in and try again.`) — because that state means the Supabase project has *Confirm email* switched on, which is a misconfiguration, not a step.

#### `SEC-AUTH-005` — Session expiry · P2
**Steps.** Invalidate the session server-side (sign out elsewhere / delete the cookie) and then submit a form mid-flow.
**Expected Result.** A readable message such as `Your session expired. Please refresh the page and try again.` — not a raw 401 body, and not a silent no-op.

#### `SEC-AUTH-007` — A display code outlives the role that generated it · P2 **[SQL]**
**Purpose.** Every self-signup is inserted as a patient, so an account later promoted to admin or hospital **keeps its `PT####`**.
**Steps.** Promote a patient to hospital, then register a new patient.
**Expected Result.** The new signup succeeds. The uniqueness of codes is scoped to the **column**, not the role, and the sequence resync takes its max over **every** non-null code regardless of role. **A signup failing intermittently with a 500 from `auth.signUp` and an empty body is the symptom of this being broken.**
