import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RUNNERS } from "./manifest.mjs";
import { flattenReport, isDeclaredSkip, planRunner, renderSummaryMarkdown, summarize } from "./runner.mjs";

const realManifest = JSON.parse(readFileSync(new URL("../../../e2e/coverage-manifest.json", import.meta.url), "utf8"));
const realSpecs = readdirSync(new URL("../../../e2e/", import.meta.url)).filter((f) => f.endsWith(".spec.ts"));

function manifest() {
  return {
    specs: {
      "a.spec.ts": { runner: "admin", levels: ["api"], projects: ["desktop"], integration: "local", destructive: false },
      "z-drop.spec.ts": { runner: "admin", levels: ["db"], projects: ["desktop"], integration: "local", destructive: true },
      "mobile-a.spec.ts": {
        runner: "admin",
        levels: ["browser"],
        projects: ["mobile"],
        integration: "local",
        destructive: false,
        allowedSkips: [{ test: "M-009", reason: "needs a second app instance" }],
      },
    },
    flows: [
      { id: "admin.x", runner: "admin", status: "covered", scripts: ["scripts/a-sql-checks.sql", "scripts/append-only-sql-checks.sql"] },
      { id: "admin.y", runner: "admin", status: "gap", limitation: "not built", required: false },
      { id: "admin.z", runner: "admin", status: "covered", scripts: ["scripts/debug-reset-sql-checks.sql"] },
    ],
  };
}

const report = (tests) => ({
  suites: [
    {
      title: "a.spec.ts",
      file: "a.spec.ts",
      specs: tests.map(([title, status, error]) => ({
        title,
        file: "a.spec.ts",
        tests: [{ projectName: "desktop", status, results: [{ error: error ? { message: error } : undefined, steps: [], attachments: [] }] }],
      })),
    },
  ],
});
const safe = { unsafe: false, blocked: false, reasons: [] };

function verdict(overrides = {}) {
  const m = manifest();
  const plan = planRunner(m, "admin");
  return summarize({
    runner: "admin",
    manifest: m,
    preflight: safe,
    plan,
    playwright: [
      { project: "desktop", phase: "specs", exitCode: 0, report: report([["A-001 works", "expected"]]) },
      { project: "desktop", phase: "destructive", exitCode: 0, report: report([["D-001 drops", "expected"]]) },
      { project: "mobile", phase: "specs", exitCode: 0, report: report([["M-001 phone", "expected"]]) },
    ],
    scripts: [
      { script: "scripts/a-sql-checks.sql", exitCode: 0 },
      { script: "scripts/append-only-sql-checks.sql", exitCode: 0 },
    ],
    egressDenials: [],
    ...overrides,
  });
}

describe("planRunner", () => {
  it("puts destructive specs in their own final phase and never schedules the reset check", () => {
    const plan = planRunner(manifest(), "admin");
    expect(plan.projects).toEqual([
      { project: "desktop", files: ["a.spec.ts"], destructive: ["z-drop.spec.ts"] },
      { project: "mobile", files: ["mobile-a.spec.ts"], destructive: [] },
    ]);
    expect(plan.scriptsBeforeSpecs).toEqual(["scripts/a-sql-checks.sql"]);
    expect(plan.scriptsAfterSpecs).toEqual(["scripts/append-only-sql-checks.sql"]);
    expect([...plan.scriptsBeforeSpecs, ...plan.scriptsAfterSpecs]).not.toContain("scripts/debug-reset-sql-checks.sql");
    expect(plan.total).toBe(3);
  });

  it("selects nothing for a runner that owns nothing", () => {
    expect(planRunner(manifest(), "hospital").total).toBe(0);
  });

  it("routes every real spec to exactly one runner, in the project Playwright runs it in", () => {
    const seen = new Map();
    for (const runner of RUNNERS) {
      const plan = planRunner(realManifest, runner);
      expect(plan.total, `${runner} selects specs`).toBeGreaterThan(0);
      for (const p of plan.projects) {
        for (const f of [...p.files, ...p.destructive]) {
          expect(seen.has(f), `${f} owned twice`).toBe(false);
          seen.set(f, runner);
          expect(p.project).toBe(/^mobile-/.test(f) ? "mobile" : "desktop");
        }
      }
    }
    expect([...seen.keys()].sort()).toEqual([...realSpecs].sort());
  });

  it("keeps the real destructive specs out of the ordinary phase", () => {
    for (const runner of RUNNERS) {
      for (const p of planRunner(realManifest, runner).projects) {
        for (const f of p.files) expect(realManifest.specs[f].destructive).toBe(false);
      }
    }
  });
});

describe("summarize", () => {
  it("passes a clean run", () => {
    const s = verdict();
    expect(s.status).toBe("passed");
    expect(s.passed).toBe(true);
    expect(s.counts).toMatchObject({ total: 3, passed: 3, failed: 0 });
    expect(s.limitations.map((l) => l.id)).toEqual(["admin.y"]);
  });

  it("fails a failed test and records its error", () => {
    const s = verdict({
      playwright: [
        { project: "desktop", phase: "specs", exitCode: 1, report: report([["A-001 works", "unexpected", "expected 200, got 500"]]) },
        { project: "desktop", phase: "destructive", exitCode: 0, report: report([["D-001", "expected"]]) },
        { project: "mobile", phase: "specs", exitCode: 0, report: report([["M-001", "expected"]]) },
      ],
    });
    expect(s.status).toBe("failed");
    expect(s.failures[0]).toMatchObject({ title: "A-001 works", error: "expected 200, got 500" });
  });

  it("fails a flaky test: passing on a retry is not passing", () => {
    const s = verdict({
      playwright: [
        { project: "desktop", phase: "specs", exitCode: 0, report: report([["A-001", "flaky"]]) },
        { project: "desktop", phase: "destructive", exitCode: 0, report: report([["D-001", "expected"]]) },
        { project: "mobile", phase: "specs", exitCode: 0, report: report([["M-001", "expected"]]) },
      ],
    });
    expect(s.status).toBe("failed");
  });

  it("fails an undeclared skip and accepts a declared one", () => {
    const run = (title) =>
      verdict({
        playwright: [
          { project: "desktop", phase: "specs", exitCode: 0, report: report([["A-001", "expected"]]) },
          { project: "desktop", phase: "destructive", exitCode: 0, report: report([["D-001", "expected"]]) },
          {
            project: "mobile",
            phase: "specs",
            exitCode: 0,
            report: { suites: [{ title: "mobile-a.spec.ts", specs: [{ title, file: "mobile-a.spec.ts", tests: [{ status: "skipped", results: [] }] }] }] },
          },
        ],
      });
    expect(run("M-002 unexplained").status).toBe("failed");
    expect(run("M-009 needs a relay").status).toBe("passed");
  });

  it("fails when a Playwright project produced no report (crash, killed, timed out)", () => {
    const s = verdict({
      playwright: [
        { project: "desktop", phase: "specs", exitCode: null, report: null },
        { project: "desktop", phase: "destructive", exitCode: 0, report: report([["D-001", "expected"]]) },
        { project: "mobile", phase: "specs", exitCode: 0, report: report([["M-001", "expected"]]) },
      ],
    });
    expect(s.status).toBe("failed");
    expect(s.problems.join()).toMatch(/produced no report/);
  });

  it("fails when a planned Playwright phase never ran", () => {
    const s = verdict({ playwright: [{ project: "desktop", phase: "specs", exitCode: 0, report: report([["A-001", "expected"]]) }] });
    expect(s.status).toBe("failed");
    expect(s.problems.join()).toMatch(/only 1 of 3 Playwright runs/);
  });

  it("fails a nonzero Playwright exit with no failed test to explain it", () => {
    const s = verdict({
      playwright: [
        { project: "desktop", phase: "specs", exitCode: 1, report: report([["A-001", "expected"]]) },
        { project: "desktop", phase: "destructive", exitCode: 0, report: report([["D-001", "expected"]]) },
        { project: "mobile", phase: "specs", exitCode: 0, report: report([["M-001", "expected"]]) },
      ],
    });
    expect(s.status).toBe("failed");
  });

  it("is empty, not passed, when the reports hold zero tests", () => {
    const empty = { project: "desktop", phase: "specs", exitCode: 0, report: { suites: [] } };
    const s = verdict({ playwright: [empty, { ...empty, phase: "destructive" }, { ...empty, project: "mobile" }] });
    expect(s.status).toBe("empty");
    expect(s.passed).toBe(false);
  });

  it("is empty when the runner selected nothing", () => {
    const m = manifest();
    const s = summarize({ runner: "hospital", manifest: m, preflight: safe, plan: planRunner(m, "hospital") });
    expect(s.status).toBe("empty");
  });

  it("fails a failed or missing integrity script", () => {
    expect(verdict({ scripts: [{ script: "scripts/a-sql-checks.sql", exitCode: 3 }] }).status).toBe("failed");
    expect(verdict({ scripts: [{ script: "scripts/a-sql-checks.sql", exitCode: 0 }] }).problems.join()).toMatch(/only 1 of 2/);
  });

  it("fails when the egress guard refused anything, even if every test passed", () => {
    const s = verdict({ egressDenials: ["... host=www.googleapis.com ..."] });
    expect(s.status).toBe("failed");
  });

  it("is blocked, never passed, when the preflight found a missing credential", () => {
    const s = verdict({ preflight: { unsafe: false, blocked: true, reasons: [{ code: "razorpay-test-keys-missing", kind: "blocked", message: "m" }] } });
    expect(s.status).toBe("blocked");
    expect(s.passed).toBe(false);
  });

  it("is unsafe when the preflight refused the target", () => {
    const s = verdict({ preflight: { unsafe: true, blocked: false, reasons: [] }, playwright: [], scripts: [] });
    expect(s.status).toBe("unsafe");
    expect(s.passed).toBe(false);
  });

  it("renders a summary that says a pass is not a proof", () => {
    expect(renderSummaryMarkdown(verdict())).toContain("does not prove the application has no bugs");
  });
});

describe("flattenReport / isDeclaredSkip", () => {
  it("walks nested describe blocks", () => {
    const r = {
      suites: [{ title: "x.spec.ts", file: "x.spec.ts", suites: [{ title: "group", specs: [{ title: "X-001", file: "x.spec.ts", tests: [{ status: "expected", projectName: "desktop", results: [] }] }] }] }],
    };
    expect(flattenReport(r)).toEqual([
      expect.objectContaining({ file: "x.spec.ts", title: "group > X-001", project: "desktop", outcome: "expected" }),
    ]);
  });

  it("matches a declared skip by test id only for its own spec", () => {
    const m = manifest();
    expect(isDeclaredSkip(m, "e2e/mobile-a.spec.ts", "M-009 relay")).toBe(true);
    expect(isDeclaredSkip(m, "a.spec.ts", "M-009 relay")).toBe(false);
  });
});

describe("stripAnsi", () => {
  it("removes Playwright's colour codes and leaves the text", async () => {
    const { stripAnsi } = await import("./runner.mjs");
    expect(stripAnsi("\u001b[31mTest timeout\u001b[39m of \u001b[2m30000ms\u001b[22m")).toBe("Test timeout of 30000ms");
    expect(stripAnsi(null)).toBeNull();
  });
});

describe("notes", () => {
  it("carries a spec's own annotations into the summary without failing it", async () => {
    const { summarize, planRunner } = await import("./runner.mjs");
    const m = {
      specs: { "a.spec.ts": { runner: "admin", levels: ["api"], projects: ["desktop"], integration: "local", destructive: false } },
      flows: [],
    };
    const r = {
      suites: [{ title: "a.spec.ts", file: "a.spec.ts", specs: [{ title: "C-1", file: "a.spec.ts", tests: [{ status: "expected", annotations: [{ type: "race-not-overlapped", description: "A->B, B->C" }], results: [] }] }] }],
    };
    const s = summarize({ runner: "admin", manifest: m, preflight: { unsafe: false, blocked: false, reasons: [] }, plan: planRunner(m, "admin"), playwright: [{ project: "desktop", phase: "specs-a", exitCode: 0, report: r }] });
    expect(s.passed).toBe(true);
    expect(s.notes).toEqual([{ file: "a.spec.ts", title: "C-1", type: "race-not-overlapped", description: "A->B, B->C" }]);
  });
});
