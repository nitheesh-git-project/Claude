#!/usr/bin/env node
// Non-destructive smoke check of a deployed staging site. GET requests only,
// no sign-in, no fixtures, nothing written: it is safe against any
// deployment, and it proves only that the deployment answers and that its
// guarded areas stay guarded to an anonymous caller.
//
//   STAGING_URL=https://staging.example.com node scripts/ci/staging-smoke.mjs
//
// Refuses to run without STAGING_URL, against a non-https origin, or against
// the origin in PRODUCTION_URL (when that is set), so it cannot be pointed at
// the live site by accident. Not a required check: deployments are not
// triggered from this repository's workflows.

import { fileURLToPath } from "node:url";

const CHECKS = [
  { path: "/", expect: "ok", why: "the public home page renders" },
  { path: "/get-started", expect: "ok", why: "the sign-in / sign-up entry renders" },
  { path: "/faq", expect: "ok", why: "a static public page renders" },
  { path: "/patient/dashboard", expect: "guarded", why: "an anonymous caller is not shown a patient dashboard" },
  { path: "/therapist/dashboard", expect: "guarded", why: "an anonymous caller is not shown a therapist dashboard" },
  { path: "/admin/dashboard", expect: "guarded", why: "an anonymous caller is not shown the back office" },
];

export function validateTarget(env) {
  const raw = env.STAGING_URL;
  if (!raw) return { ok: false, reason: "STAGING_URL is not set; nothing was checked" };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: `STAGING_URL (${raw}) is not a URL` };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "STAGING_URL must be https" };
  if (env.PRODUCTION_URL) {
    try {
      if (new URL(env.PRODUCTION_URL).host === url.host) {
        return { ok: false, reason: "STAGING_URL is the production origin; this check never runs against production" };
      }
    } catch {
      return { ok: false, reason: "PRODUCTION_URL is set but is not a URL" };
    }
  }
  return { ok: true, origin: url.origin };
}

/** "ok" wants a 200; "guarded" wants anything but a 200 page (a redirect, 401, 403 or 404). */
export function judge(expect, status) {
  if (expect === "ok") return status === 200;
  if (expect === "guarded") return status !== 200 && status > 0 && status < 500;
  return false;
}

async function main() {
  const target = validateTarget(process.env);
  if (!target.ok) {
    console.error(`staging smoke: ${target.reason}`);
    process.exit(1);
  }
  let failed = 0;
  for (const check of CHECKS) {
    let status = 0;
    try {
      const res = await fetch(target.origin + check.path, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
      status = res.status;
    } catch (error) {
      status = 0;
      console.error(`  ${check.path}: ${error.message}`);
    }
    const ok = judge(check.expect, status);
    if (!ok) failed += 1;
    console.log(`${ok ? "  PASS" : "  FAIL"}  ${check.path} -> ${status} (${check.why})`);
  }
  if (failed) {
    console.error(`staging smoke: ${failed} of ${CHECKS.length} checks failed`);
    process.exit(1);
  }
  console.log(`staging smoke ok -- ${CHECKS.length} checks against ${target.origin}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
