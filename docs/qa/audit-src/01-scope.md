# QA Audit Report — Dr. Pooja's Physio

| | |
| --- | --- |
| **Report type** | Senior QA audit against the manual E2E test plan v1.0 |
| **Subject** | Dr. Pooja's Physio — branch `claude/complete-e2e-testing-plan-910y5z` |
| **Method** | Static source verification plus every check that is executable without a live environment |
| **Date** | 2 September 2026 |
| **Verdict** | **Conditional pass.** Build, lint and all 153 unit tests green. Six findings, none blocking a test run; one (F-01) invalidates the plan's own Step 0 and should be fixed before the first execution. |

---

## 1. Scope — read this before anything else

**This report is not a record of the test plan having been executed.** It could not be. Executing the plan requires a running application, a throwaway Supabase project, Razorpay test keys and a browser driving real screens. None of those exist in this environment. Any document claiming pass/fail results for `PAT-BOOK-003` or `FIN-SUM-001` without them would be fabricated, and for a product that moves money and holds clinical records that is worse than no report at all.

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
| `npm install` | **PASS** | Dependencies resolved |
| `npm run test` | **PASS** | **153 tests, 9 files, 0 failures**, 1.65 s |
| `npm run lint` | **PASS** | Includes `check:realtime` |
| `npm run build` | **PASS** | Full production build; every route in the plan's route map appears in the build output |

### 2.1 Unit test detail

```
✓ src/lib/carePlans.test.ts            20 tests
✓ src/lib/availabilityRequest.test.ts  16 tests
✓ src/lib/availabilityRanges.test.ts   41 tests
✓ src/lib/homeVisitPricing.test.ts     11 tests
✓ src/lib/contactLeakScan.test.ts      33 tests
✓ src/lib/contactMasking.test.ts       13 tests
✓ src/lib/adminSettings.test.ts         8 tests
✓ src/lib/riskSignals.test.ts           7 tests
✓ src/lib/consultationFirst.test.ts     4 tests
Test Files  9 passed (9)      Tests  153 passed (153)
```

**What this covers, and what it does not.** These are the dependency-free modules in `src/lib` — the roster's range↔hour conversion, the home-visit price and payout maths, the contact-leak scanner's two tiers, phone/email masking, the settings parser, the care-plan rules and the consultation-first rule. That is genuine coverage of the business arithmetic the finance and clinical sections of the plan depend on.

It does **not** cover `adminMetrics.ts` — the module holding `moneyByBucketFor`, which is the single source of the clinic's revenue split and the one place both money identities are computed. **The most financially consequential module in the application has no unit test.** See F-06.

### 2.2 Realtime coverage check

```
Realtime coverage OK — 38 subscribed table(s), all published.
(1 published but unsubscribed: home_visit_purchase_events)
```

The unsubscribed table is benign — a publication entry with no subscriber costs nothing. The check exists to catch the opposite case (a subscribed table that was never published), which has no runtime symptom at all: the subscription succeeds and simply never fires.

### 2.3 Build route inventory

The production build emitted every route the plan's §3 map names, with the expected static/dynamic split: the eight public pages plus `/book`, `/book-home-visit` and the four login pages static with a 5-minute revalidate; all dashboard routes server-rendered on demand; the proxy present as middleware. **No route in the plan is missing from the build, and no route in the build is missing from the plan.**
