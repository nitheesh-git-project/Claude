// The quality gate's verdict, as a pure function.
//
// The `quality-gate` job runs with `if: always()` so it reports even when
// something upstream failed -- which is exactly the situation in which a
// careless aggregator turns green: GitHub marks a job whose dependency
// failed as `skipped`, and a required check that is skipped does not block
// a merge. So this does not ask "did anything fail?". It asks "did every
// single thing that must succeed report success?", and anything else --
// failure, cancelled, skipped, a job missing from `needs` entirely, a runner
// or shard that uploaded no summary, a summary that is not `passed`, a
// summary with zero tests, a runner whose shards between them were not given
// every spec it owns -- is a red gate. Which shards must report comes from
// scripts/ci/runner-shards.json (lib/shards.mjs), the same file the
// workflow's matrix is built from.

import { expectedShards } from "./shards.mjs";

/** Jobs the gate requires, by their job id in quality-gate.yml. */
export const REQUIRED_JOBS = ["context-budget", "coverage-manifest", "verify", "plan", "runner"];

/**
 * @param {Record<string, {result?: string}>} needs   `toJSON(needs)` from Actions
 * @param {Record<string, object|null|undefined>} summaries shard label -> parsed summary.json
 * @param {{requiredJobs?: string[], shardConfig?: object,
 *          requiredShards?: {runner: string, shard: number, total: number, label: string}[],
 *          manifest?: object}} [options]
 *        `requiredShards` defaults to every runner × shard in `shardConfig`
 *        (scripts/ci/runner-shards.json). With `manifest`, the shards of each
 *        runner must between them have been given every spec it owns.
 * @returns {{ok: boolean, rows: {name: string, ok: boolean, detail: string}[]}}
 */
export function evaluateGate(needs, summaries, options = {}) {
  const requiredJobs = options.requiredJobs ?? REQUIRED_JOBS;
  const requiredShards = options.requiredShards ?? expectedShards(options.shardConfig);
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

  const byLabel = summaries && typeof summaries === "object" ? summaries : {};
  for (const { runner, shard, total, label } of requiredShards) {
    const s = byLabel[label];
    const name = `runner ${label}`;
    if (!s || typeof s !== "object") {
      rows.push({ name, ok: false, detail: "no summary.json was uploaded -- the runner did not finish" });
      continue;
    }
    const count = Number(s?.counts?.total ?? 0);
    const sIndex = Number(s?.shard?.index ?? 1);
    const sTotal = Number(s?.shard?.total ?? 1);
    if (s.runner !== runner) {
      rows.push({ name, ok: false, detail: `summary names runner "${s.runner}"` });
    } else if (sIndex !== shard || sTotal !== total) {
      rows.push({ name, ok: false, detail: `summary is for shard ${sIndex}/${sTotal}, expected ${shard}/${total}` });
    } else if (s.status !== "passed" || s.passed !== true) {
      const why = (s.problems ?? []).concat((s.preflight ?? []).map((r) => r.message)).slice(0, 3).join("; ");
      rows.push({ name, ok: false, detail: `${s.status ?? "unknown"}${why ? ` -- ${why}` : ""}` });
    } else if (!(count > 0)) {
      rows.push({ name, ok: false, detail: "reported passed with zero tests" });
    } else {
      rows.push({ name, ok: true, detail: `passed (${count} tests)` });
    }
  }

  // The shards between them must have been given every spec the runner
  // owns: a planner bug that dropped a file would otherwise leave every
  // shard green and the file unrun.
  if (options.manifest) {
    const runners = [...new Set(requiredShards.map((r) => r.runner))];
    for (const runner of runners) {
      const owned = Object.keys(options.manifest.specs ?? {}).filter((f) => options.manifest.specs[f]?.runner === runner);
      const given = new Set(
        requiredShards
          .filter((r) => r.runner === runner)
          .flatMap((r) => (Array.isArray(byLabel[r.label]?.specs) ? byLabel[r.label].specs : []))
      );
      const missing = owned.filter((f) => !given.has(f)).sort();
      rows.push({
        name: `specs ${runner}`,
        ok: missing.length === 0,
        detail:
          missing.length === 0
            ? `all ${owned.length} owned specs were given to a shard`
            : `${missing.length} owned spec(s) ran in no shard: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""}`,
      });
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
