#!/usr/bin/env node
// The `quality-gate` job's only step. Reads the needs context the workflow
// passes in GATE_NEEDS (`toJSON(needs)`) and every runner's summary.json
// from the directory given as the first argument (the downloaded
// `summary-*` artifacts), then exits 0 only if lib/gate.mjs says every
// required check reported success -- every job, every runner × shard that
// scripts/ci/runner-shards.json names, and every spec the manifest gives a
// runner. The rules are unit-tested there.
//
//   GATE_NEEDS='{"verify":{"result":"success"},...}' node scripts/ci/gate.mjs gate-summaries/

import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateGate, renderGateMarkdown } from "./lib/gate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function findSummaries(dir) {
  const out = {};
  if (!dir || !existsSync(dir)) return out;
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = path.join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "summary.json") {
        try {
          const parsed = JSON.parse(readFileSync(full, "utf8"));
          // Two summaries for one shard would mean the matrix ran twice;
          // keep the worse one rather than the last one read.
          const key = parsed.label ?? parsed.runner;
          const prev = out[key];
          if (!prev || prev.status === "passed") out[key] = parsed;
        } catch {
          // An unreadable summary is the same as a missing one: not a pass.
        }
      }
    }
  };
  walk(dir);
  return out;
}

let needs;
try {
  needs = JSON.parse(process.env.GATE_NEEDS ?? "");
} catch {
  needs = null;
}
if (!needs) console.error("GATE_NEEDS is missing or not JSON -- every job counts as not reported.");

// Read from this checkout, never from an artifact: what must report is the
// commit's own config, not something a runner says about itself. Unreadable
// is not "nothing required" -- evaluateGate's defaults still require one
// summary per runner, and the spec check fails without a manifest.
function readJson(file) {
  try {
    return JSON.parse(readFileSync(path.join(root, file), "utf8"));
  } catch {
    console.error(`${file} is missing or not JSON`);
    return null;
  }
}
const shardConfig = readJson("scripts/ci/runner-shards.json");
const manifest = readJson("e2e/coverage-manifest.json") ?? { specs: { "(manifest unreadable)": { runner: "patient" } } };

const verdict = evaluateGate(needs ?? {}, findSummaries(process.argv[2]), { shardConfig, manifest });
const markdown = renderGateMarkdown(verdict);
console.log(markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
for (const row of verdict.rows.filter((r) => !r.ok)) {
  console.log(`::error title=Quality gate: ${row.name}::${row.detail}`);
}
process.exit(verdict.ok ? 0 : 1);
