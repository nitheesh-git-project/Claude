// The quality gate's verdict, as a pure function.
//
// The `quality-gate` job runs with `if: always()` so it reports even when
// something upstream failed -- which is exactly the situation in which a
// careless aggregator turns green: GitHub marks a job whose dependency
// failed as `skipped`, and a required check that is skipped does not block
// a merge. So this does not ask "did anything fail?". It asks "did every
// single thing that must succeed report success?", and anything else --
// failure, cancelled, skipped, a job missing from `needs` entirely, a runner
// that uploaded no summary, a summary that is not `passed`, a summary with
// zero tests -- is a red gate.

/** Jobs the gate requires, by their job id in quality-gate.yml. */
export const REQUIRED_JOBS = ["context-budget", "coverage-manifest", "verify", "runner"];

/** Runners whose summary.json must be present and passed. */
export const REQUIRED_RUNNERS = ["patient", "therapist", "session", "admin", "hospital", "platform", "integrity"];

/**
 * @param {Record<string, {result?: string}>} needs   `toJSON(needs)` from Actions
 * @param {Record<string, object|null|undefined>} summaries runner -> parsed summary.json
 * @param {{requiredJobs?: string[], requiredRunners?: string[]}} [options]
 * @returns {{ok: boolean, rows: {name: string, ok: boolean, detail: string}[]}}
 */
export function evaluateGate(needs, summaries, options = {}) {
  const requiredJobs = options.requiredJobs ?? REQUIRED_JOBS;
  const requiredRunners = options.requiredRunners ?? REQUIRED_RUNNERS;
  const rows = [];

  const jobs = needs && typeof needs === "object" ? needs : {};
  for (const job of requiredJobs) {
    const result = jobs[job]?.result;
    if (result === undefined) {
      rows.push({ name: `job ${job}`, ok: false, detail: "not in needs -- the gate cannot see it, so it is not a pass" });
    } else {
      rows.push({
        name: `job ${job}`,
        ok: result === "success",
        detail: result === "success" ? "success" : `${result} (only "success" passes; skipped and cancelled do not)`,
      });
    }
  }

  const byRunner = summaries && typeof summaries === "object" ? summaries : {};
  for (const runner of requiredRunners) {
    const s = byRunner[runner];
    if (!s || typeof s !== "object") {
      rows.push({ name: `runner ${runner}`, ok: false, detail: "no summary.json was uploaded -- the runner did not finish" });
      continue;
    }
    const total = Number(s?.counts?.total ?? 0);
    if (s.runner !== runner) {
      rows.push({ name: `runner ${runner}`, ok: false, detail: `summary names runner "${s.runner}"` });
    } else if (s.status !== "passed" || s.passed !== true) {
      const why = (s.problems ?? []).concat((s.preflight ?? []).map((r) => r.message)).slice(0, 3).join("; ");
      rows.push({ name: `runner ${runner}`, ok: false, detail: `${s.status ?? "unknown"}${why ? ` -- ${why}` : ""}` });
    } else if (!(total > 0)) {
      rows.push({ name: `runner ${runner}`, ok: false, detail: "reported passed with zero tests" });
    } else {
      rows.push({ name: `runner ${runner}`, ok: true, detail: `passed (${total} tests)` });
    }
  }

  return { ok: rows.length > 0 && rows.every((r) => r.ok), rows };
}

export function renderGateMarkdown(verdict) {
  const lines = [
    `## Quality gate: ${verdict.ok ? "PASSED" : "FAILED"}`,
    "",
    "| Check | Result |",
    "| --- | --- |",
    ...verdict.rows.map((r) => `| ${r.name} | ${r.ok ? "ok" : "**FAILED**"}: ${r.detail.replace(/\|/g, "\\|")} |`),
    "",
    verdict.ok
      ? "_Every required check reported success on this commit. That is evidence, not proof that the application has no bugs._"
      : "_Any red row blocks the merge, whatever its priority. Download the `failure-bundle-*` artifacts and see docs/ci/INVESTIGATE.md._",
  ];
  return `${lines.join("\n")}\n`;
}
