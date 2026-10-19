#!/usr/bin/env node
// The first step of .github/workflows/staging-smoke.yml: decides whether this
// run checks anything (scripts/ci/lib/smoke-gate.mjs) and writes the reason
// to the job summary, so a run that checked nothing says why rather than
// showing as a bare "skipped". Sets the step output `run=true|false`; exits 1
// when it could not decide.
//
// Reads: EVENT_NAME, DEPLOYED_SHA, DEPLOY_ENVIRONMENT, STAGING_URL,
// GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY.

import { appendFileSync } from "node:fs";
import { decideSmokeRun } from "./lib/smoke-gate.mjs";

async function compareWithStaging(sha) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) return { status: null, error: "GITHUB_REPOSITORY or GITHUB_TOKEN is not set" };
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/compare/${sha}...staging`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(20_000),
    });
    // 404 is a SHA the repository does not have on any branch it can
    // compare -- not on staging, which is an answer rather than a failure.
    if (res.status === 404) return { status: "diverged", error: null };
    if (!res.ok) return { status: null, error: `HTTP ${res.status}` };
    const body = await res.json();
    return { status: typeof body.status === "string" ? body.status : null, error: null };
  } catch (error) {
    return { status: null, error: error instanceof Error ? error.message : String(error) };
  }
}

const eventName = process.env.EVENT_NAME ?? "";
const deployedSha = process.env.DEPLOYED_SHA || undefined;
const needsCompare =
  eventName === "deployment_status" &&
  deployedSha &&
  (process.env.DEPLOY_ENVIRONMENT ?? "").toLowerCase() !== "production";
const compare = needsCompare ? await compareWithStaging(deployedSha) : { status: null, error: null };

const decision = decideSmokeRun({
  eventName,
  stagingUrl: process.env.STAGING_URL || undefined,
  deployedSha,
  environment: process.env.DEPLOY_ENVIRONMENT,
  compareStatus: compare.status,
  compareError: compare.error,
});

console.log(`staging smoke gate: ${decision.reason}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Staging smoke\n\n${decision.reason}\n`);
}
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `run=${decision.run ? "true" : "false"}\n`);
}
if (!decision.run && !decision.fail && /STAGING_URL is not set/.test(decision.reason)) {
  console.log(`::warning title=Staging smoke not configured::${decision.reason}`);
}
if (decision.fail) process.exit(1);
