#!/usr/bin/env node
// Runs one quality-gate runner end to end on the provisioned local stack and
// writes its verdict.
//
//   node scripts/ci/run-runner.mjs <patient|therapist|session|admin|hospital|platform|integrity>
//
// 1. Preflight (scripts/ci/preflight.mjs). An unsafe target stops here and
//    nothing else runs. A blocked one (no Razorpay test keys) still runs the
//    specs for evidence, but the runner can only end `blocked`, never passed.
// 2. Selects the runner's specs from e2e/coverage-manifest.json. Zero is a
//    failure: a runner with nothing to run must not report green.
// 3. Starts one `next dev` for the whole runner (the browser specs must run
//    against dev, not start -- see docs/rules/testing.md) with the egress
//    guard preloaded, so any server-side call to a host that is not
//    loopback, the Razorpay test API or a font host is refused and logged.
// 4. Integrity scripts that build their own fixtures, then the specs per
//    Playwright project (destructive ones in a separate, final invocation),
//    then the SQL checks that read rows the specs leave behind.
// 5. Writes e2e-artifacts/<runner>/summary.json and summary.md (sanitised),
//    appends the summary to $GITHUB_STEP_SUMMARY, and exits 0 only on
//    `passed`. The verdict rules are in lib/runner.mjs and are unit-tested.
//
// It never reads .env.local. Everything comes from the environment that
// scripts/ci/provision-local-stack.sh exported.

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RUNNERS } from "./lib/manifest.mjs";
import { planRunner, renderSummaryMarkdown, summarize } from "./lib/runner.mjs";
import { sanitize, sanitizeDeep, truncate } from "./lib/sanitize.mjs";
import { runPreflight, reportPreflight } from "./preflight.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const runner = process.argv[2];
if (!RUNNERS.includes(runner)) {
  console.error(`usage: run-runner.mjs <${RUNNERS.join("|")}>`);
  process.exit(2);
}

const artifacts = path.join(root, "e2e-artifacts", runner);
mkdirSync(artifacts, { recursive: true });
const egressLog = path.join(artifacts, "egress-denied.log");
const guard = path.join(root, "scripts", "ci", "egress-guard.mjs");
const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

const childEnv = {
  ...process.env,
  ARTIFACT_DIR: artifacts,
  E2E_GATE: "1",
  E2E_BASE_URL: baseUrl,
  // admin-login.spec.ts types into the real form. In the gate the browser
  // reaches the local stack directly, so the same dev server serves it.
  E2E_LOGIN_BASE_URL: process.env.E2E_LOGIN_BASE_URL ?? baseUrl,
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${guard}`.trim(),
};

function identity() {
  const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  const supa = spawnSync("supabase", ["--version"], { encoding: "utf8" });
  return {
    commit: process.env.GITHUB_SHA ?? git.stdout?.trim() ?? "unknown",
    ref: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "",
    runId: process.env.GITHUB_RUN_ID ?? "local",
    attempt: process.env.GITHUB_RUN_ATTEMPT ?? "",
    machine: process.env.RUNNER_NAME ?? "local",
    stack: `local Supabase ${supa.stdout?.trim() || "?"} · node ${process.version}`,
  };
}

function writeLog(name, text) {
  const file = path.join(artifacts, "logs", name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, sanitize(text ?? ""));
}

function runScript(script) {
  console.log(`::group::${script}`);
  const isSql = script.endsWith(".sql");
  const result = isSql
    ? spawnSync("psql", [process.env.DATABASE_URL, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", script], {
        cwd: root,
        env: childEnv,
        encoding: "utf8",
        timeout: 10 * 60_000,
      })
    : spawnSync("node", [script], { cwd: root, env: childEnv, encoding: "utf8", timeout: 15 * 60_000 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  writeLog(`${path.basename(script)}.log`, output);
  console.log(sanitize(truncate(output, 6000)));
  console.log("::endgroup::");
  return { script, exitCode: result.status ?? (result.error ? -1 : null) };
}

function runPlaywright(project, phase, files) {
  const dir = path.join(artifacts, `${project}-${phase}`);
  console.log(`::group::Playwright ${project} (${phase}): ${files.length} spec(s)`);
  const result = spawnSync("npx", ["playwright", "test", `--project=${project}`, ...files.map((f) => `e2e/${f}`)], {
    cwd: root,
    env: { ...childEnv, E2E_ARTIFACT_DIR: dir },
    stdio: "inherit",
    timeout: 90 * 60_000,
  });
  console.log("::endgroup::");
  const reportFile = path.join(dir, "report.json");
  let report = null;
  if (existsSync(reportFile)) {
    try {
      report = JSON.parse(readFileSync(reportFile, "utf8"));
    } catch {
      report = null;
    }
  }
  return { project, phase, exitCode: result.status, report };
}

// The dev server's output goes straight to disk as it is written, so a crash
// or an out-of-memory restart halfway through a runner leaves its evidence
// behind; stopDevServer() sanitises the file in place at the end.
const devLogFile = path.join(artifacts, "logs", "next-dev.log");

async function startDevServer() {
  mkdirSync(path.dirname(devLogFile), { recursive: true });
  const out = openSync(devLogFile, "a");
  const log = { file: devLogFile };
  const child = spawn("npx", ["next", "dev", "-p", new URL(baseUrl).port || "3000"], {
    cwd: root,
    env: childEnv,
    stdio: ["ignore", out, out],
    detached: true,
  });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const res = await fetch(baseUrl, { redirect: "manual" });
      if (res.status > 0) return { child, log };
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    // already gone
  }
  scrubDevLog();
  return { child: null, log };
}

function scrubDevLog() {
  if (existsSync(devLogFile)) writeFileSync(devLogFile, sanitize(readFileSync(devLogFile, "utf8")));
}

function stopDevServer(server) {
  if (!server?.child) return;
  try {
    process.kill(-server.child.pid, "SIGTERM");
  } catch {
    // already gone
  }
  scrubDevLog();
}

function finish(summary) {
  const clean = sanitizeDeep(summary);
  writeFileSync(path.join(artifacts, "summary.json"), `${JSON.stringify(clean, null, 2)}\n`);
  const markdown = renderSummaryMarkdown(clean);
  writeFileSync(path.join(artifacts, "summary.md"), markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log(markdown);
  if (!clean.passed) console.log(`::error title=Runner ${runner} ${clean.status}::see the job summary and the failure-bundle-${runner} artifact`);
  process.exit(clean.passed ? 0 : 1);
}

// Provisioning wrote its logs raw (it runs before any of this exists);
// sanitise them in place so every uploaded log has been through the scrub.
const provisionDir = path.join(artifacts, "provision");
if (existsSync(provisionDir)) {
  for (const name of readdirSync(provisionDir)) {
    const file = path.join(provisionDir, name);
    if (name.endsWith(".log")) writeFileSync(file, sanitize(readFileSync(file, "utf8")));
  }
}

const manifest = JSON.parse(readFileSync(path.join(root, "e2e", "coverage-manifest.json"), "utf8"));
const plan = planRunner(manifest, runner);
const id = identity();

const preflight = runPreflight(process.env);
reportPreflight(preflight);
if (preflight.unsafe) {
  finish(summarize({ runner, manifest, preflight, plan, identity: id }));
}
if (plan.total === 0) {
  finish(summarize({ runner, manifest, preflight, plan, identity: id }));
}

const server = await startDevServer();
const playwright = [];
const scripts = [];
if (!server.child) {
  console.error("::error title=App did not start::next dev did not answer within 180s; see logs/next-dev.log");
  finish(
    summarize({
      runner,
      manifest,
      preflight,
      plan,
      identity: id,
      playwright: plan.projects.map((p) => ({ project: p.project, phase: "app-start", exitCode: null, report: null })),
    })
  );
}

// One Playwright invocation per spec file, with the dev server checked in
// between. `next dev` compiles every route a runner touches into one
// long-lived process: measured on the admin runner, it passed 10 GB resident
// in twelve minutes, and the first full patient run stopped answering
// altogether at test 77 with nothing failing in the app. On a 16 GB CI
// machine that is shared with Postgres and Chromium, it is restarted when it
// grows past GATE_DEV_RSS_LIMIT_MB (default 9216) or stops answering --
// 6144 was tried first and restarted it after almost every file, since one
// browser spec alone takes it to 6.5-8.5 GB, doubling the patient runner's
// time for nothing --
// between files, never inside one, so no test sees a restart. Each file also
// gets its own report, which is what the verdict counts.
const RSS_LIMIT_MB = Number(process.env.GATE_DEV_RSS_LIMIT_MB) > 0 ? Number(process.env.GATE_DEV_RSS_LIMIT_MB) : 9216;
let current = server;
let restarts = 0;

function devServerRssMb() {
  const ps = spawnSync("ps", ["-eo", "rss=,args="], { encoding: "utf8" });
  return Math.round(
    (ps.stdout ?? "")
      .split("\n")
      .filter((line) => line.includes("next-server (v"))
      .reduce((kb, line) => kb + (Number.parseInt(line.trim(), 10) || 0), 0) / 1024
  );
}

async function answers() {
  try {
    const res = await fetch(baseUrl, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    return res.status > 0;
  } catch {
    return false;
  }
}

async function healthyServer() {
  if (current?.child && devServerRssMb() < RSS_LIMIT_MB && (await answers())) return true;
  console.log(`::notice title=Dev server restart::${devServerRssMb()} MB resident or not answering; restarting between spec files`);
  stopDevServer(current);
  await new Promise((r) => setTimeout(r, 2_000));
  current = await startDevServer();
  restarts += 1;
  return Boolean(current.child);
}

async function runFiles(project, phase, files) {
  for (const file of files) {
    const stem = file.replace(/\.spec\.ts$/, "");
    if (!(await healthyServer())) {
      playwright.push({ project, phase: `${phase}-${stem}`, exitCode: null, report: null });
      continue;
    }
    playwright.push(runPlaywright(project, `${phase}-${stem}`, [file]));
  }
}

try {
  for (const script of plan.scriptsBeforeSpecs) scripts.push(runScript(script));
  for (const p of plan.projects) await runFiles(p.project, "specs", p.files);
  for (const script of plan.scriptsAfterSpecs) scripts.push(runScript(script));
  // Destructive specs last, after every other check has read the schema.
  for (const p of plan.projects) await runFiles(p.project, "destructive", p.destructive);
} finally {
  stopDevServer(current);
}
if (restarts > 0) console.log(`dev server restarted ${restarts} time(s) between spec files`);

const denials = existsSync(egressLog) ? readFileSync(egressLog, "utf8").split("\n").filter(Boolean) : [];
finish(summarize({ runner, manifest, preflight, plan, playwright, scripts, egressDenials: denials, identity: id }));
