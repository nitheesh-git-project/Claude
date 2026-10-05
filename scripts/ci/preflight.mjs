#!/usr/bin/env node
// Refuses to continue unless the environment is the gate's own disposable
// stack. Run by scripts/ci/provision-local-stack.sh after provisioning and by
// scripts/ci/run-runner.mjs before any spec; both fail the job on a nonzero
// exit. The rules live in lib/target.mjs and are unit-tested.
//
//   node scripts/ci/preflight.mjs                    safe + test keys present
//   node scripts/ci/preflight.mjs --no-razorpay      do not require test keys
//   node scripts/ci/preflight.mjs --static-only      environment rules only, no
//                                                    database probe (before the
//                                                    schema and marker exist)
//   node scripts/ci/preflight.mjs --tolerate-blocked a missing-keys finding
//                                                    (only) exits 0; the run
//                                                    still reports it BLOCKED
//
// Exit codes: 0 ok, 1 UNSAFE target (never proceed), 3 BLOCKED (safe, but the
// Razorpay test keys are absent so provider-dependent work cannot run).
//
// It reads the process environment only. It never loads .env.local: a
// developer's file points at a real project, and the whole point is that the
// gate cannot be talked into using one.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assessTarget } from "./lib/target.mjs";

/**
 * Asks the database what it holds. `psql` rather than a driver: it is on every
 * GitHub runner, and the connection string never leaves this process's argv.
 * Returns null if the probe cannot be completed.
 */
export function probeDatabase(env = process.env) {
  const sql =
    "select (select count(*) from auth.users where lower(coalesce(email, '')) not like '%@example.test')::text || ' ' || " +
    "(select count(*) from ci_meta.ci_target_marker where purpose = 'quality-gate-local-stack')::text";
  const result = spawnSync("psql", [env.DATABASE_URL, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.status !== 0) return null;
  const match = /^(\d+) (\d+)$/.exec(result.stdout.trim());
  if (!match) return null;
  return { nonFixtureUsers: Number(match[1]), markerPresent: Number(match[2]) > 0 };
}

/** Static rules first, so a hostile URL is rejected before anything connects to it. */
export function runPreflight(env = process.env, options = {}) {
  const staticResult = assessTarget(env, undefined, options);
  if (staticResult.unsafe || options.staticOnly) return { ...staticResult, probed: false };
  const probe = probeDatabase(env);
  return { ...assessTarget(env, probe, options), probed: true, probe };
}

export function reportPreflight(result, write = console.error) {
  const annotate = process.env.GITHUB_ACTIONS === "true";
  for (const reason of result.reasons) {
    const label = reason.kind === "blocked" ? "BLOCKED" : "UNSAFE";
    write(annotate ? `::error title=Preflight ${label}::${reason.message}` : `${label}: ${reason.message} [${reason.code}]`);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const options = { requireRazorpay: !argv.includes("--no-razorpay"), staticOnly: argv.includes("--static-only") };
  const tolerateBlocked = argv.includes("--tolerate-blocked");
  const result = runPreflight(process.env, options);
  reportPreflight(result);

  if (result.unsafe) {
    console.error("preflight FAILED: this is not a target the gate may run against. Nothing was executed.");
    process.exit(1);
  }
  if (result.blocked) {
    if (tolerateBlocked) {
      console.error("preflight: BLOCKED finding tolerated for provisioning; the runner will still report BLOCKED and fail.");
      process.exit(0);
    }
    console.error("preflight BLOCKED: the target is safe, but required credentials are missing.");
    process.exit(3);
  }
  console.log(
    `preflight ok -- loopback stack, ${result.probe ? `${result.probe.nonFixtureUsers} non-fixture users, marker present` : "static checks only"}`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
