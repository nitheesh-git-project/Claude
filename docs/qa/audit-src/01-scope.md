# QA Audit Report — Dr. Pooja's Physio

| | |
| --- | --- |
| **Report type** | Senior QA audit against the manual E2E test plan — **second pass** |
| **Subject** | Dr. Pooja's Physio — branch `claude/complete-e2e-testing-plan-ll8qet` |
| **Method** | Pass 1 (2 Sep 2026): static verification plus a live run against a disposable Supabase project. Pass 2 (4 Sep 2026): re-verification against the current branch head, **static and executed only — no live environment was available**, and §2A is retained as the record of the earlier run |
| **Date** | 4 September 2026 (first issued 2 September 2026) |
| **Verdict** | **Pass, after remediation.** The eight findings of pass 1 were re-checked and all eight hold. Pass 2 raised **five** more — one of them the first pass's own fix applied too narrowly — and all five are fixed. `npm run verify` green: **384 unit tests in 23 files**, lint (including the realtime check) and a full production build. |

---

## 1. Scope — read this before anything else

**This report has been through two passes, and the second one had no database.** Pass 1 began as a static audit and became a partial live run: the owner confirmed a Supabase project as disposable, and §2A records what happened when the plan was executed against it — Step 0, 230 automated cases, the webhook suite and the anonymous-API sweep.

**Pass 2 (this issue) re-audited the current branch head with no live environment at all.** What it could do, it did: the four commands ran and their real output is quoted below; every pass-1 finding was re-checked against the code and schema that fix it; and the areas that changed since pass 1 — the Settings split, three access levels, the four scoped dashboards, the whole-hour slot rule, the category reorder, the promo/invite/free-booking paths — were traced afresh. **§2A is not re-run**, and nothing in it should be read as evidence about this branch's runtime behaviour; it stands as the record of what a live run established on 2 September.

**It is still not a complete execution of the plan** — the sections needing a browser with outbound network, a human at a payment widget, or a schema-apply token remain unrun, and §5 says which. Nothing here is reported as passing on the strength of reading code: every claim is either an EXECUTED result with its output, or a VERIFIED-SOURCE trace, or is marked NOT-VERIFIABLE.

What this report **is**: an audit of the same surface area by the two means that *are* available.

### 1.1 The two classes of evidence used

| Class | What it means | Trustworthy for |
| --- | --- | --- |
| **EXECUTED** | A command actually ran here and its output is quoted | The build compiles; lint and the realtime-coverage check pass; the business-maths unit tests pass |
| **VERIFIED-SOURCE** | The rule the test asserts was traced to the code, schema or policy that implements it | Whether a rule *exists* and is enforced where the plan says it is |
| **NOT-VERIFIABLE** | Needs a running app, a database, a browser or a payment gateway | Whether the rule *behaves* correctly at runtime |

Every row in the coverage tables below carries one of these three labels. **Nothing is marked passed on the strength of reading code.** VERIFIED-SOURCE means "the mechanism is present and is the one the plan describes" — it does not mean the screen works.

### 1.2 What this audit can and cannot tell you

**It can tell you:** whether the invariants the plan tests are actually implemented; whether they are implemented in the place the plan says (route vs UI, trigger vs RLS); whether the constraints exist in the schema; whether the money maths is arithmetically correct; and where the plan itself is wrong about the product.

**It cannot tell you:** whether a button is reachable, whether a payment completes, whether a page renders, whether a race condition actually races, whether a mobile layout holds at 390 px, or whether any copy on screen matches the copy quoted in the plan.

Section 5 lists, explicitly, the areas where only a live run will do.

---

## 2. Executed results

All four commands ran in this environment against the branch head.

| Command | Result | Detail |
| --- | --- | --- |
| `npm ci` | **PASS** | 507 packages, clean install |
| `npm run test` | **PASS** | **384 tests, 23 files, 0 failures** (pass 1 ended at 187 in 11) |
| `npm run lint` | **PASS** | Includes `check:realtime` — 40 subscribed tables, all published |
| `npx tsc --noEmit` | **PASS** | No type errors, run after every change this pass made |
| `npm run build` | **PASS** | Full production build; every route in the plan's route map appears in the build output |

### 2.1 Unit test detail

```
✓ src/lib/availabilityRanges.test.ts     41 tests
✓ src/lib/contactLeakScan.test.ts        33 tests
✓ src/lib/adminMetrics.test.ts           24 tests   <- added by this audit
✓ src/lib/carePlans.test.ts              20 tests
✓ src/lib/availabilityRequest.test.ts    16 tests
✓ src/lib/contactMasking.test.ts         13 tests
✓ src/lib/homeVisitPricing.test.ts       11 tests
✓ src/lib/autoAssignTherapist.test.ts    10 tests   <- added by this audit
✓ src/lib/adminSettings.test.ts           8 tests
✓ src/lib/riskSignals.test.ts             7 tests
✓ src/lib/consultationFirst.test.ts       4 tests
Test Files  23 passed (23)     Tests  384 passed (384)
```

The list above is pass 1's. Pass 2 re-ran the suite as it stands today: **23 files, 384 tests, 0 failures**, in 2.6 seconds. The growth from 187 is the work merged between the two passes — the discounts, promo-code, invite, checkout-quote, care-plan-review, admin-home and admin-scope modules all arrived with their own tests, which is the pattern the first pass asked for when it raised F-06.

**What this covers, and what it does not.** These are the dependency-free modules in `src/lib` — the roster's range↔hour conversion, the home-visit price and payout maths, the contact-leak scanner's two tiers, phone/email masking, the settings parser, the care-plan rules and the consultation-first rule. That is genuine coverage of the business arithmetic the finance and clinical sections of the plan depend on.

It did **not** cover `adminMetrics.ts` — the module holding `moneyByBucketFor`, which is the single source of the clinic's revenue split and the one place both money identities are computed. **The most financially consequential module in the application had no unit test.** That is F-06, and it is now fixed: `adminMetrics.test.ts` adds 24 tests, and `autoAssignTherapist.test.ts` a further 10 for the assignment rule shipped in this pass.

### 2.2 Realtime coverage check

```
Realtime coverage OK — 40 subscribed table(s), all published.
(1 published but unsubscribed: home_visit_purchase_events)
```

The unsubscribed table is benign — a publication entry with no subscriber costs nothing. The check exists to catch the opposite case (a subscribed table that was never published), which has no runtime symptom at all: the subscription succeeds and simply never fires.

### 2.3 Build route inventory

The production build emitted every route the plan's §3 map names, with the expected static/dynamic split: the eight public pages plus `/book`, `/book-home-visit` and the four login pages static with a 5-minute revalidate; all dashboard routes server-rendered on demand; the proxy present as middleware. **No route in the plan is missing from the build, and no route in the build is missing from the plan.**
