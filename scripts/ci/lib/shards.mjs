// How a runner is split into parallel jobs, as pure functions.
//
// scripts/ci/runner-shards.json is the one place the split is decided. Three
// things read it and must agree, so all three call into here:
//   - scripts/ci/plan-shards.mjs turns it into the workflow's job matrix
//   - scripts/ci/run-runner.mjs <runner> --shard i/n runs one shard's files
//   - scripts/ci/lib/gate.mjs requires a `passed` summary from every shard
//
// A shard is a set of whole spec files, plus a 1/n slice of each "split" file
// (a file whose tests are independent, divided by Playwright's own --shard).
// Files are spread by measured duration, longest first, onto the shard with
// the least work so far: deterministic, so CI, a local re-run and the gate
// all compute the same assignment from the same inputs.
//
// The integrity scripts and the SQL checks run on shard 1 only, and a runner
// that owns any of them may not be split at all (validateShardConfig): some of
// those checks read rows the runner's specs leave behind, and a split runner
// would leave them on a different machine.

import { PROJECTS, RUNNERS, selectSpecs } from "./manifest.mjs";

/** Parses "2/8" into {index: 2, total: 8}; null for anything else. */
export function parseShardArg(value) {
  const m = /^(\d+)\/(\d+)$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const index = Number(m[1]);
  const total = Number(m[2]);
  if (!(total >= 1) || !(index >= 1) || index > total) return null;
  return { index, total };
}

/** The name a shard's artifacts, summary and job carry. An unsplit runner
 *  keeps its plain name, so `e2e-artifacts/hospital/` stays where it was. */
export function shardLabel(runner, index = 1, total = 1) {
  return total > 1 ? `${runner}-${index}of${total}` : runner;
}

export function shardCount(config, runner) {
  const n = config?.shards?.[runner];
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function splitFiles(config) {
  const files = config?.splitFiles?.files;
  return new Set(Array.isArray(files) ? files : []);
}

export function secondsFor(config, file) {
  const s = config?.seconds?.bySpec?.[file];
  if (typeof s === "number" && s >= 0) return s;
  const d = config?.seconds?.defaultSeconds;
  return typeof d === "number" && d >= 0 ? d : 30;
}

/** Every runner × shard the workflow must run, in RUNNERS order. */
export function expectedShards(config) {
  return RUNNERS.flatMap((runner) => {
    const total = shardCount(config, runner);
    return Array.from({ length: total }, (_, i) => ({
      runner,
      shard: i + 1,
      total,
      label: shardLabel(runner, i + 1, total),
    }));
  });
}

/** The `strategy.matrix` the plan job emits. With the manifest, the longest
 *  shards come first: if GitHub's concurrency limit ever queues some, the
 *  ones left waiting are the short ones. */
export function buildMatrix(config, manifest) {
  const include = expectedShards(config);
  if (!manifest) return { include };
  const est = new Map(estimateShardSeconds(manifest, config).map((e) => [e.label, e.seconds]));
  return { include: include.map((e, i) => ({ e, i })).sort((a, b) => est.get(b.e.label) - est.get(a.e.label) || a.i - b.i).map((x) => x.e) };
}

/**
 * Spreads a runner's spec files over `total` shards.
 *
 * @param {{file: string, project: string, destructive: boolean}[]} specs
 * @returns {{file: string, project: string, destructive: boolean, split: boolean}[][]}
 *          one list per shard; a split file appears in every shard
 */
export function assignShards(specs, total, config) {
  const split = splitFiles(config);
  const shards = Array.from({ length: total }, () => ({ load: 0, specs: [] }));
  const whole = [];
  for (const spec of specs) {
    if (total > 1 && split.has(spec.file)) {
      for (const shard of shards) {
        shard.specs.push({ ...spec, split: true });
        shard.load += secondsFor(config, spec.file) / total;
      }
    } else {
      whole.push(spec);
    }
  }
  // Longest first onto the least-loaded shard; ties go to the lower index and
  // the file name, so the result never depends on object key order.
  whole.sort((a, b) => secondsFor(config, b.file) - secondsFor(config, a.file) || byName(a, b));
  for (const spec of whole) {
    let target = shards[0];
    for (const shard of shards) if (shard.load < target.load) target = shard;
    target.specs.push({ ...spec, split: false });
    target.load += secondsFor(config, spec.file);
  }
  return shards.map((s) => s.specs.sort(byName));
}

const byName = (a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0);

/** A runner's specs across both projects, in the manifest's stable order. */
export function runnerSpecs(manifest, runner) {
  return PROJECTS.flatMap((project) =>
    selectSpecs(manifest, runner, project).map((s) => ({ file: s.file, project, destructive: s.destructive }))
  );
}

/** Estimated seconds of spec time per shard, for the docs and the plan log. */
export function estimateShardSeconds(manifest, config) {
  return expectedShards(config).map(({ runner, shard, total, label }) => {
    const specs = assignShards(runnerSpecs(manifest, runner), total, config)[shard - 1];
    const seconds = specs.reduce((t, s) => t + secondsFor(config, s.file) / (s.split ? total : 1), 0);
    return { label, files: specs.length, seconds: Math.round(seconds) };
  });
}

/** Does this runner's manifest flows cite any integrity script or SQL check? */
export function runnerHasScripts(manifest, runner) {
  return (manifest?.flows ?? []).some((f) => f.runner === runner && (f.scripts ?? []).length > 0);
}

/**
 * Checks the shard config against the manifest and the spec sources.
 *
 * @param {object} config   parsed scripts/ci/runner-shards.json
 * @param {object} manifest parsed e2e/coverage-manifest.json
 * @param {Record<string,string>} [specSources] file -> source text
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateShardConfig(config, manifest, specSources) {
  const errors = [];
  const fail = (m) => errors.push(m);
  if (!config || typeof config !== "object" || !config.shards || typeof config.shards !== "object") {
    return { ok: false, errors: ["runner-shards.json has no `shards` object"] };
  }
  for (const runner of RUNNERS) {
    const n = config.shards[runner];
    if (!Number.isInteger(n) || n < 1) fail(`runner "${runner}" needs a shard count (a whole number, 1 or more)`);
  }
  for (const runner of Object.keys(config.shards)) {
    if (!RUNNERS.includes(runner)) fail(`shard config names "${runner}", which is not a runner`);
  }
  const jobs = expectedShards(config).length;
  const max = config.maxRunnerJobs;
  if (Number.isInteger(max) && jobs > max) {
    fail(`${jobs} runner jobs is over maxRunnerJobs (${max}): GitHub runs 20 jobs at once on this plan, and verify needs one`);
  }
  for (const runner of RUNNERS) {
    if (shardCount(config, runner) > 1 && runnerHasScripts(manifest, runner)) {
      fail(
        `runner "${runner}" owns integrity scripts or SQL checks and cannot be split: ` +
          "some read rows its specs leave behind, which a split would put on another machine"
      );
    }
  }
  const specs = manifest?.specs ?? {};
  for (const file of splitFiles(config)) {
    if (!(file in specs)) {
      fail(`splitFiles names "${file}", which the manifest does not own`);
      continue;
    }
    const source = specSources?.[file];
    if (specSources && typeof source !== "string") {
      fail(`splitFiles names "${file}", which does not exist in e2e/`);
    } else if (typeof source === "string" && !/test\.describe\.configure\(\s*\{\s*mode:\s*["']parallel["']\s*\}\s*\)/.test(source)) {
      fail(
        `"${file}" is in splitFiles but does not declare test.describe.configure({ mode: "parallel" }); ` +
          "without it Playwright puts the whole file in one shard"
      );
    }
  }
  // Every shard must have something to run, or it reports empty and the gate
  // is red on every pull request.
  for (const { runner, shard, total, label } of expectedShards(config)) {
    const assigned = assignShards(runnerSpecs(manifest, runner), total, config)[shard - 1];
    if (assigned.length === 0) fail(`shard ${label} would run no spec -- lower ${runner}'s shard count`);
  }
  return { ok: errors.length === 0, errors };
}
