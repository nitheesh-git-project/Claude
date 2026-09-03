---

## 3. Application route map

Every route below is covered by at least one test. The rightmost column names the first test that opens it.

### 3.1 Public marketing pages

| Route | What it is | Auth | Covered by |
| --- | --- | --- | --- |
| `/` | Home. Hero, care-area showcase, walkthrough, programmes, testimonials, mission band, connector grid | Public | `PUB-HOME-001` |
| `/conditions` | What we treat, plus the programme cards per condition | Public | `PUB-COND-001` |
| `/how-it-works` | Booking to recovery in four steps | Public | `PUB-NAV-001` |
| `/home-visit` | Home-visit landing page. **404s while the admin master switch is off** | Public | `PUB-HV-001` |
| `/team` | Therapist profiles; "Book with" carries the specialist into the wizard | Public | `PUB-TEAM-001` |
| `/mission` | Mission, vision, four promises, testimonials | Public | `PUB-NAV-001` |
| `/faq` | Admin-managed FAQ accordion | Public | `PUB-FAQ-001` |
| `/hospitals` | Partner pitch plus the hospital enquiry form | Public | `HOS-LEAD-001` |
| `/get-started` | Role hub — where a signed-in user of the wrong role is sent | Public | `SEC-ROUTE-003` |

### 3.2 Booking

| Route | What it is | Auth | Covered by |
| --- | --- | --- | --- |
| `/book` | The 3-step video-consultation booking wizard. Accepts `?category=`, `?therapist=`, and answers a stale `?package=` | Public (guest can sign up inside it) | `PAT-BOOK-001` |
| `/book-home-visit` | The 4-step home-visit wizard (pincode → when → who → pay) | Public | `PAT-HV-001` |

### 3.3 Patient portal

| Route | What it is | Covered by |
| --- | --- | --- |
| `/patient/login` | Sign In / Register Account tabs plus Forgot password | `PAT-AUTH-001` |
| `/patient/register` | Standalone registration (always waits for admin approval) | `PAT-AUTH-004` |
| `/patient/dashboard` | Overview: four figures, activity feed, quick actions | `PAT-DASH-001` |
| `/patient/dashboard/book` | Booking hub inside the portal | `PAT-DASH-002` |
| `/patient/dashboard/suggested` | Suggested Sessions — therapist recommendations and proposed times. **Only in the sidebar when something is waiting** | `PAT-SUGG-001` |
| `/patient/dashboard/sessions` | All sessions, List/Calendar toggle, Upcoming/Past/Cancelled + Video/Home visit filters | `PAT-SESS-001` |
| `/patient/dashboard/packages` | Owned programmes and their remaining credits | `PAT-PKG-001` |
| `/patient/dashboard/payments` | Receipts | `PAT-PAY-010` |
| `/patient/dashboard/health-profile` | Health Profile: intake answers, snapshot, documents, care-plan history | `PAT-HP-001` |
| `/patient/dashboard/profile` | Edit Profile: photo, personal, contact, addresses, account security | `PAT-PROF-001` |

### 3.4 Therapist portal

| Route | What it is | Covered by |
| --- | --- | --- |
| `/therapist/login` | Sign In / Apply to Join | `THR-AUTH-001` |
| `/therapist/dashboard` | Overview | `THR-DASH-001` |
| `/therapist/dashboard/availability` | Weekly schedule, exceptions, leave | `THR-AVAIL-001` |
| `/therapist/dashboard/sessions` | Sessions, join, complete, notes, recommend | `THR-SESS-001` |
| `/therapist/dashboard/earnings` | Earnings, payout requests, receipts | `THR-EARN-001` |
| `/therapist/dashboard/health-profile` | My Patients (Patients / Programmes toggle) | `THR-PAT-001` |
| `/therapist/dashboard/health-profile/[patientId]` | One patient's chart: intake, Pain Map, care plans, notes | `THR-HP-001` |
| `/therapist/dashboard/profile` | Edit Profile | `THR-PROF-001` |

### 3.5 Hospital portal

| Route | What it is | Covered by |
| --- | --- | --- |
| `/hospital/login` | Sign In | `HOS-AUTH-001` |
| `/hospital/dashboard` | Overview | `HOS-DASH-001` |
| `/hospital/dashboard/refer` | Refer a Patient form | `HOS-REF-001` |
| `/hospital/dashboard/referrals` | Your Referrals with status | `HOS-REF-004` |
| `/hospital/dashboard/revenue` | Earnings (partner share) | `HOS-MONEY-001` |
| `/hospital/dashboard/profile` | Edit Profile | `HOS-PROF-001` |

### 3.6 Admin back office

`/admin/login` and `/admin/dashboard`. The dashboard is one page; the screen is chosen by `?section=&tab=`. All 28 screens:

| Section | Tab key | Screen | Covered by |
| --- | --- | --- | --- |
| Today | `overview` | Today | `ADM-TODAY-001` |
| Today | `approvals` | Approvals | `ADM-APPR-001` |
| Today | `risk` | Risk | `ADM-RISK-001` |
| Sessions | `schedule` | Schedule (calendar) | `ADM-SCHED-001` |
| Sessions | `all` | All Sessions | `ADM-SESS-001` |
| Sessions | `roster` | Roster | `ADM-ROST-001` |
| Sessions | `delivery` | Delivery (operational rates) | `ADM-DELIV-001` |
| Sessions | `recommendations` | Recommendations — the clinic's review queue, plus every plan | `ADM-CARE-001`, `ADM-CARE-004` |
| Sessions | `new` | New Booking | `ADM-NEWB-001` |
| People | `patients` | Patients (+ condition requests) | `ADM-PEOP-001` |
| People | `therapists` | Therapists | `ADM-PEOP-005` |
| People | `partners` | Partners | `ADM-PEOP-008` |
| Money | `summary` | Summary | `FIN-SUM-001` |
| Money | `transactions` | Transactions | `FIN-TXN-001` |
| Money | `payouts` | Payouts + payout requests + Cash Ledger | `FIN-PAY-001` |
| Money | `costs` | Costs | `FIN-COST-001` |
| Money | `breakdown` | Breakdown | `FIN-BRK-001` |
| Catalog | `conditions` | Conditions | `ADM-CAT-001` |
| Catalog | `packages` | Packages | `ADM-CAT-005` |
| Catalog | `areas` | Service Areas + waitlist | `ADM-CAT-010` |
| Catalog | `purchases` | Purchases | `ADM-CAT-014` |
| Settings | `brand` | Brand & Contact | `ADM-SET-001` |
| Settings | `public` | Public Site | `ADM-SET-004` |
| Settings | `booking` | Booking Rules | `ADM-SET-010` |
| Settings | `clinical` | Clinical Questions | `ADM-SET-020` |
| Settings | `team` | Team & Access | `ADM-SET-025` |
| Settings | `health` | System Health | `ADM-SET-030` |
| Settings | `activity` | Activity Log | `ADM-SET-033` |
| Settings | `security` | Account Security | `ADM-SET-035` |

Detail routes (open as an overlay from the dashboard, and as a full page on direct navigation):

| Route | Covered by |
| --- | --- |
| `/admin/dashboard/patients/[id]` | `ADM-PEOP-003` |
| `/admin/dashboard/therapists/[id]` | `ADM-PEOP-006` |
| `/admin/dashboard/conditions/[id]` | `ADM-PEOP-004` |

### 3.7 System routes

| Route | What it is | Covered by |
| --- | --- | --- |
| `/dashboard` | Server-side role router. Sends each role to its own dashboard. The admin path never reaches a public bundle. | `SEC-ROUTE-006` |
| `/pending-approval` | Where an unapproved patient/therapist lands | `PAT-AUTH-003` |
| `/account-suspended` | Where a suspended account lands | `SEC-AUTH-006` |
| `/reset-password` | Password reset landing | `PAT-AUTH-006` |

### 3.8 API routes

The application exposes 150+ POST route handlers under `/api`, grouped by audience: `admin/`, `appointments/`, `patient/`, `therapist/`, `hospital/`, `packages/`, `home-visit/`, `care-plan/`, `razorpay/`, and `medical-documents/`. Individual routes are named inside the tests that exercise them. The security section (`SEC-API-*`) tests them directly with `curl`.

---

## 4. Roles, gates and scopes

### 4.1 The four roles

`profiles.role` is a single column with one of four values. **One account carries exactly one role.** A therapist account can never also be a patient — the booking wizards refuse it, and so do the purchase routes.

| Role | How an account is created | Gate before it can be used |
| --- | --- | --- |
| `patient` | Self-registers (at `/patient/register`, or inside either booking wizard) | `approved` + `active`. **Exception:** a genuine payment attempt auto-approves a patient (see below). |
| `therapist` | Self-applies at `/therapist/login` → **Apply to Join** | Admin approval, then `active` |
| `hospital` | Provisioned by an admin (People → Partners → onboard) | `active` |
| `admin` | Promoted by hand in Supabase, or minted by a Master Admin | `active` only — **`approved` is deliberately not checked for admins** |

### 4.2 The two flags

`profiles.approved` and `profiles.active` are enforced in **two** places, and both matter:

1. **`src/proxy.ts`** — blocks dashboard *navigation*.
2. **`requireActiveProfile`** inside self-service API routes — blocks a valid session cookie calling the API around the UI.

A test that only proves the UI hides something has not proved the rule. Every authorization test in this plan has an API-level twin.

### 4.3 The payment-attempt approval rule (important, and easy to mis-report)

For a **single online session**, `/api/razorpay/create-order` flips the paying patient's `approved` to `true` the moment they *genuinely attempt* checkout — on the attempt, not on a completed payment. This is deliberate: a patient whose card fails three times still lands in their dashboard with a pending appointment rather than being bounced to `/pending-approval`.

It does **not** apply to:
* home-visit purchases (`/api/home-visit/create-order` — a *completed* payment vets you), or
* standalone registration at `/patient/register` (always waits for a human admin).

### 4.4 Admin scopes

`profiles.admin_scope` is one of four values. It decides which **sections** an admin may open. **Every** admin route guards on scope — 92 of the 95 with `requireAdminScope(section)`, and three (`set-admin-scope`, `debug-reset`, `create-account`) with an explicit **full-only** check instead, because a section check would be too weak: a `finance` admin passing a section gate could otherwise widen its own access or mint a full admin. The sidebar hiding a section is presentation only.

| Scope | Sections it can open | Cannot |
| --- | --- | --- |
| `full` | Today, Sessions, People, Money, Catalog, Settings | — |
| `operations` | Today, Sessions, People, Catalog | Money, Settings |
| `finance` | Today, People, Money | Sessions, Catalog, Settings |
| `clinical` | Today, Sessions, People | Money, Catalog, Settings |

Rules that must hold (tested in `ADM-SET-025`–`ADM-SET-029`):
* Only a `full` admin can change scopes or create another admin.
* **Nobody can change their own scope.**
* **The last `full` admin cannot be narrowed.**
* An unknown/null scope reads as `full` (so a migration can never lock everyone out).
* The **Risk** queue is `full`-only — a scoped admin's page does not even fetch it.
