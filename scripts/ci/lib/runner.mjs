// A runner's plan and its verdict, as pure functions.
//
// scripts/ci/run-runner.mjs does the I/O: it runs the preflight, Playwright
// and the integrity scripts, and hands what came back to `summarize`. The
// rules that decide whether a runner passed live here so they can be tested
// against hostile inputs -- a report with no tests in it, a skip nobody
// declared, a request the egress guard refused and somebody swallowed.
//
// A runner passes only when every one of these holds:
//   - the preflight found the target safe AND nothing it needs was missing
//   - it selected at least one spec, and Playwright reported at least one test
//   - every Playwright project ran to a report (no crash, no missing file)
//   - no test failed, timed out, was interrupted or was flaky
//   - every skipped test is one the manifest declares, with a reason
//   - every integrity script exited 0
//   - the egress guard refused nothing
// Anything else is `failed`, `blocked` (the target was safe but a required
// credential was absent -- nothing was proven), `unsafe` or `empty`. None of
// those is a pass.

import { PROJECTS, selectSpecs } from "./manifest.mjs";

export const STATUSES = ["passed", "failed", "blocked", "unsafe", "empty"];

/** SQL check files that need fixture rows the specs leave behind (an
 *  appointment, a home-visit package), so they run after the specs. Every
 *  other script runs in the order the manifest lists it. */
const AFTER_SPECS = new Set([
  "scripts/append-only-sql-checks.sql",
  "scripts/booking-idempotency-sql-checks.sql",
]);

/** Scripts that must never run in the gate even if a flow cites one. */
const NEVER_RUN = new Set(["scripts/debug-reset-sql-checks.sql"]);

/**
 * What a runner will execute.
 *
 * Destructive specs go last within their project and run as a separate
 * Playwright invocation, so a dropped column cannot leak into an ordinary
 * spec's view of the schema even if its restore fails.
 *
 * @returns {{runner: string,
 *            projects: {project: string, files: string[], destructive: string[]}[],
 *            scriptsBeforeSpecs: string[], scriptsAfterSpecs: string[],
 *            total: number}}
 */
export function planRunner(manifest, runner) {
  const projects = PROJECTS.map((project) => {
    const selected = selectSpecs(manifest, runner, project);
    return {
      project,
      files: selected.filter((s) => !s.destructive).map((s) => s.file),
      destructive: selected.filter((s) => s.destructive).map((s) => s.file),
    };
  }).filter((p) => p.files.length + p.destructive.length > 0);

  const scripts = [];
  for (const flow of manifest?.flows ?? []) {
    if (flow.runner !== runner) continue;
    for (const script of flow.scripts ?? []) {
      if (!NEVER_RUN.has(script) && !scripts.includes(script)) scripts.push(script);
    }
  }
  const total = projects.reduce((n, p) => n + p.files.length + p.destructive.length, 0);
  return {
    runner,
    projects,
    scriptsBeforeSpecs: scripts.filter((s) => !AFTER_SPECS.has(s)),
    scriptsAfterSpecs: scripts.filter((s) => AFTER_SPECS.has(s)),
    total,
  };
}

/**
 * Flattens a Playwright JSON report into one entry per test.
 * `outcome` is Playwright's own: expected | unexpected | flaky | skipped.
 */
export function flattenReport(report) {
  const out = [];
  const walk = (suite, trail) => {
    const here = suite.title ? [...trail, suite.title] : trail;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const last = (test.results ?? []).at(-1);
        out.push({
          file: spec.file ?? suite.file ?? here[0] ?? "",
          title: [...here.slice(1), spec.title].filter(Boolean).join(" > "),
          project: test.projectName ?? "",
          outcome: test.status,
          error: last?.error?.message ?? last?.errors?.[0]?.message ?? null,
          step: (last?.steps ?? []).filter((s) => s.error).map((s) => s.title).at(-1) ?? null,
          attachments: (last?.attachments ?? []).map((a) => a.path).filter(Boolean),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, here);
  };
  for (const suite of report?.suites ?? []) walk(suite, []);
  return out;
}

/** True when the manifest declares this skip for this spec. */
export function isDeclaredSkip(manifest, file, title) {
  const base = file.split("/").pop();
  const allowed = manifest?.specs?.[base]?.allowedSkips ?? [];
  return allowed.some((entry) => typeof entry?.test === "string" && entry.test !== "" && title.includes(entry.test));
}

/**
 * @param {object} input
 * @param {string} input.runner
 * @param {object} input.manifest
 * @param {{unsafe: boolean, blocked: boolean, reasons: {code: string, kind: string, message: string}[]}} input.preflight
 * @param {ReturnType<typeof planRunner>} input.plan
 * @param {{project: string, phase: string, exitCode: number|null, report: object|null}[]} input.playwright
 * @param {{script: string, exitCode: number|null}[]} input.scripts
 * @param {string[]} input.egressDenials  lines from egress-denied.log
 * @param {Record<string, string>} [input.identity]  commit, run id, versions
 */
export function summarize(input) {
  const { runner, manifest, preflight, plan, playwright = [], scripts = [], egressDenials = [] } = input;
  const problems = [];

  const tests = playwright.flatMap((run) => (run.report ? flattenReport(run.report) : []));
  const counts = { total: tests.length, passed: 0, failed: 0, flaky: 0, skipped: 0, undeclaredSkips: 0 };
  const failures = [];
  const skips = [];
  for (const t of tests) {
    if (t.outcome === "expected") counts.passed += 1;
    else if (t.outcome === "flaky") {
      counts.flaky += 1;
      failures.push({ ...t, reason: "flaky (passed only on a retry)" });
    } else if (t.outcome === "skipped") {
      counts.skipped += 1;
      const declared = isDeclaredSkip(manifest, t.file, t.title);
      skips.push({ file: t.file, title: t.title, declared });
      if (!declared) {
        counts.undeclaredSkips += 1;
        failures.push({ ...t, reason: "skipped, and the manifest declares no such skip" });
      }
    } else {
      counts.failed += 1;
      failures.push({ ...t, reason: t.outcome || "unknown outcome" });
    }
  }

  for (const run of playwright) {
    if (!run.report) problems.push(`Playwright (${run.project}, ${run.phase}) produced no report (exit ${run.exitCode})`);
    else if (run.exitCode !== 0 && !tests.some((t) => t.outcome === "unexpected" || t.outcome === "flaky")) {
      problems.push(`Playwright (${run.project}, ${run.phase}) exited ${run.exitCode} with no failed test to show for it`);
    }
  }
  const expectedRuns = (plan?.projects ?? []).reduce((n, p) => n + (p.files.length ? 1 : 0) + (p.destructive.length ? 1 : 0), 0);
  if (playwright.length < expectedRuns) problems.push(`only ${playwright.length} of ${expectedRuns} Playwright runs happened`);

  const scriptFailures = scripts.filter((s) => s.exitCode !== 0);
  for (const s of scriptFailures) problems.push(`${s.script} exited ${s.exitCode}`);
  const expectedScripts = (plan?.scriptsBeforeSpecs?.length ?? 0) + (plan?.scriptsAfterSpecs?.length ?? 0);
  if (scripts.length < expectedScripts) problems.push(`only ${scripts.length} of ${expectedScripts} integrity scripts ran`);

  if (egressDenials.length > 0) problems.push(`the egress guard refused ${egressDenials.length} outbound request(s)`);

  let status;
  if (preflight?.unsafe) status = "unsafe";
  else if (!plan || plan.total === 0) status = "empty";
  else if (counts.total === 0) {
    status = "empty";
    problems.push("Playwright reported zero tests for a runner that selected specs");
  } else if (failures.length > 0 || problems.length > 0) status = "failed";
  else if (preflight?.blocked) status = "blocked";
  else status = "passed";
  // A blocked preflight is never a pass, whatever the tests did.
  if (status === "passed" && preflight?.blocked) status = "blocked";

  return {
    runner,
    status,
    passed: status === "passed",
    counts,
    failures,
    skips,
    problems,
    scripts,
    egressDenials: egressDenials.slice(0, 50),
    preflight: preflight?.reasons ?? [],
    identity: input.identity ?? {},
    limitations: (manifest?.flows ?? [])
      .filter((f) => f.runner === runner && f.status !== "covered")
      .map((f) => ({ id: f.id, status: f.status, required: f.required, limitation: f.limitation ?? "" })),
  };
}

/** Markdown for $GITHUB_STEP_SUMMARY. Everything in it is already sanitised
 *  by the caller; it is still rendered as text, never as instructions. */
export function renderSummaryMarkdown(summary) {
  const icon = summary.passed ? "PASSED" : summary.status.toUpperCase();
  const lines = [
    `## Runner \`${summary.runner}\`: ${icon}`,
    "",
    `Tests: ${summary.counts.total} (passed ${summary.counts.passed}, failed ${summary.counts.failed}, ` +
      `flaky ${summary.counts.flaky}, skipped ${summary.counts.skipped}, undeclared skips ${summary.counts.undeclaredSkips})`,
  ];
  const id = summary.identity ?? {};
  if (id.commit) lines.push(`Commit: \`${id.commit}\` · run ${id.runId ?? "local"} · ${id.stack ?? ""}`);
  if (summary.preflight.length) {
    lines.push("", "### Preflight");
    for (const r of summary.preflight) lines.push(`- ${r.kind.toUpperCase()} \`${r.code}\`: ${r.message}`);
  }
  if (summary.problems.length) {
    lines.push("", "### Problems");
    for (const p of summary.problems) lines.push(`- ${p}`);
  }
  if (summary.failures.length) {
    lines.push("", "### Failed tests");
    for (const f of summary.failures.slice(0, 40)) {
      lines.push(`- \`${f.file}\` ${f.title} (${f.project}): ${f.reason}${f.step ? ` at step "${f.step}"` : ""}`);
      if (f.error) lines.push(`  \`\`\`\n  ${String(f.error).split("\n").slice(0, 6).join("\n  ")}\n  \`\`\``);
    }
  }
  if (summary.scripts.length) {
    lines.push("", "### Integrity scripts");
    for (const s of summary.scripts) lines.push(`- ${s.exitCode === 0 ? "ok" : `FAILED (exit ${s.exitCode})`} \`${s.script}\``);
  }
  if (summary.limitations.length) {
    lines.push("", "### Known coverage limitations (from the manifest)");
    for (const l of summary.limitations) lines.push(`- \`${l.id}\` ${l.status}: ${l.limitation}`);
  }
  lines.push("", "_A green runner means these tests passed on this commit. It does not prove the application has no bugs._");
  return `${lines.join("\n")}\n`;
}
