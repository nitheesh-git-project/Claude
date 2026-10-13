#!/usr/bin/env node
// npm run check:merge-ready [-- --e2e [--append-only]] [-- --base <ref>]
//                            [-- --runner <name>] [-- --skip-static]
//
// --runner <name> runs exactly the specs CI's <name> runner owns in
// e2e/coverage-manifest.json (patient, therapist, session, admin, hospital,
// platform, integrity), changed or not: the one-to-one local stand-in for a
// CI runner when Docker (and so the disposable stack) is not available.
// --skip-static skips verify/coverage/context-budget when an earlier run in
// the same sitting already passed them.
//
// The quality gate, run here before the push instead of learnt from CI
// after it. Every red gate on the bug-pass PRs was catchable locally -- a
// table missing from realtime, a selector matching a hidden admin section,
// a spec account the tutorial covered -- and each one cost a push, a
// seven-runner wait and a log read. This runs the same static checks CI's
// first jobs run, then only the Playwright specs the change can reach
// (scripts/ci/lib/affectedSpecs.mjs), and prints failures and nothing else.
// Full output goes to .merge-ready/, read only on a failure.
//
// Without --e2e it stops after the static checks and prints the specs it
// would run. --e2e is opt-in because the specs write to whichever Supabase
// project .env.local names, and that must never be one holding real
// patients (CLAUDE.md, "Destructive tooling").
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { selectSpecs } from "./lib/affectedSpecs.mjs";

const args = process.argv.slice(2);
const runE2e = args.includes("--e2e");
const allowAppendOnly = args.includes("--append-only");
const skipStatic = args.includes("--skip-static");
const runnerIdx = args.indexOf("--runner");
const runner = runnerIdx >= 0 ? args[runnerIdx + 1] : null;
const baseIdx = args.indexOf("--base");
const base = baseIdx >= 0 ? args[baseIdx + 1] : "origin/staging";
// Not under test-results/: Playwright empties that folder at the start of
// every run, which deleted these logs mid-run.
const outDir = ".merge-ready";
mkdirSync(outDir, { recursive: true });

const results = [];

function sh(cmd, cmdArgs, opts = {}) {
  return spawnSync(cmd, cmdArgs, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });
}

/** A check, its output to a file, one line on screen -- plus the lines that
 *  say why, when it failed. */
function check(name, cmd, cmdArgs, env) {
  const started = Date.now();
  if (process.stdout.isTTY) process.stdout.write(`… ${name}\r`);
  const r = sh(cmd, cmdArgs, { env: { ...process.env, ...env } });
  const log = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const file = join(outDir, `${name.replace(/[^a-z0-9]+/gi, "-")}.log`);
  writeFileSync(file, log);
  const ok = r.status === 0;
  const secs = Math.round((Date.now() - started) / 1000);
  console.log(`${ok ? "✓" : "✗"} ${name} (${secs}s)${ok ? "" : `  -> ${file}`}`);
  if (!ok) {
    const lines = log.split("\n");
    const why = lines.filter((l) => /error|fail|✗|✖|×|expected|received/i.test(l) && !/^\s*at /.test(l));
    console.log((why.length ? why : lines).slice(-25).map((l) => `    ${l}`).join("\n"));
  }
  results.push({ name, ok });
  return ok;
}

// 1. Static: what CI's context-budget, coverage-manifest and verify jobs run.
if (!skipStatic) {
  check("verify (lint + unit + build)", "npm", ["run", "verify"]);
  check("coverage manifest", "npm", ["run", "check:coverage"]);
  check("context budget", "npm", ["run", "check:context-budget"]);
}

// 2. Which specs this change can reach.
sh("git", ["fetch", "-q", "origin", base.replace(/^origin\//, "")]);
const lines = (out) => (out ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
const changed = [
  ...new Set([
    ...lines(sh("git", ["diff", "--name-only", `${base}...HEAD`]).stdout),
    ...lines(sh("git", ["diff", "--name-only", "HEAD"]).stdout),
    ...lines(sh("git", ["ls-files", "--others", "--exclude-standard"]).stdout),
  ]),
];
const specSources = Object.fromEntries(
  readdirSync("e2e")
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => [f, readFileSync(join("e2e", f), "utf8")])
);
const sel = selectSpecs(changed, specSources);
const manifestAll = JSON.parse(readFileSync("e2e/coverage-manifest.json", "utf8"));
if (runner) {
  // CI parity: the runner's whole share of the suite, not just what changed.
  const owned = Object.entries(manifestAll.specs ?? {})
    .filter(([name, v]) => v.runner === runner && specSources[name])
    .map(([name]) => name)
    .sort();
  if (!owned.length) {
    console.error(`No specs belong to runner "${runner}" in e2e/coverage-manifest.json.`);
    process.exit(2);
  }
  sel.specs = owned;
  sel.wholeSuite = false;
  sel.reasons = Object.fromEntries(owned.map((n) => [n, [`runner ${runner}`]]));
}
// Specs the manifest marks destructive stay on CI's disposable stack unless
// --append-only says the target may keep append-only rows (the care-plan
// specs write rows no cleaner can delete). admin-degraded-schema drops
// columns, so it never runs from here at all.
const NEVER_LOCAL = ["admin-degraded-schema.spec.ts"];
const manifest = manifestAll;
const destructive = sel.specs.filter(
  (s) => NEVER_LOCAL.includes(s) || (manifest.specs?.[s]?.destructive && !allowAppendOnly)
);
sel.specs = sel.specs.filter((s) => !destructive.includes(s));

console.log(`\n${changed.length} files changed since ${base}; ${sel.specs.length} spec(s) reach them${sel.wholeSuite ? " (a shared fixture changed: whole suite)" : ""}:`);
for (const s of sel.specs) console.log(`  ${s}${sel.reasons[s] ? `  <- ${sel.reasons[s].slice(0, 2).join(", ")}${sel.reasons[s].length > 2 ? ", ..." : ""}` : ""}`);
if (destructive.length) {
  console.log(`  (left to CI's disposable stack: ${destructive.join(", ")}${allowAppendOnly ? "" : "; add --append-only to run the append-only ones here"})`);
}
if (sel.schemaChanged) {
  console.log("\n! supabase/schema.sql changed: apply it to the test project TWICE before the specs, and to production by hand at release.");
}

// 3. The specs, only when asked.
if (!runE2e) {
  console.log(`\nStatic checks only. To run the specs above against the project in .env.local:\n  npm run check:merge-ready -- --e2e`);
} else if (sel.specs.length) {
  // The specs read the service-role key and the project URL from the
  // environment, the way `set -a; . ./.env.local` would provide them.
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  const target = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(NEXT_PUBLIC_SUPABASE_URL unset)";
  console.log(`\nRunning ${sel.specs.length} spec(s) against ${target} ...`);
  const jsonFile = join(outDir, runner ? `playwright-${runner}.json` : "playwright.json");
  const ok = check(runner ? `e2e (runner ${runner})` : "e2e (affected specs)", "npx", ["playwright", "test", ...sel.specs.map((s) => `e2e/${s}`), "--reporter=line,json"], {
    PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile,
    ...(allowAppendOnly ? { E2E_ALLOW_APPEND_ONLY_WRITES: "1" } : {}),
  });
  if (!ok && existsSync(jsonFile)) {
    // The failing tests by name, with the first lines of each error: what a
    // CI failure bundle says, without the rest of the log.
    const report = JSON.parse(readFileSync(jsonFile, "utf8"));
    const failures = [];
    const walk = (suite, file) => {
      for (const s of suite.suites ?? []) walk(s, s.file ?? file);
      for (const spec of suite.specs ?? []) {
        for (const t of spec.tests ?? []) {
          const last = t.results?.[t.results.length - 1];
          if (last && !["passed", "skipped"].includes(last.status)) {
            const msg = (last.error?.message ?? last.status).replace(/\u001b\[[0-9;]*m/g, "");
            failures.push(`${file}: ${spec.title}\n      ${msg.split("\n").slice(0, 4).join("\n      ")}`);
          }
        }
      }
    };
    for (const s of report.suites ?? []) walk(s, s.file);
    console.log(`\n  Failing tests:\n  ${failures.join("\n  ")}`);
  }
}

const failed = results.filter((r) => !r.ok);
const verdict = failed.length
  ? `NOT merge-ready: ${failed.map((r) => r.name).join(", ")}`
  : runE2e
    ? "Merge-ready."
    : "Static checks pass; the specs above have not run (add -- --e2e).";
console.log(`\n${verdict}`);
process.exit(failed.length ? 1 : 0);
