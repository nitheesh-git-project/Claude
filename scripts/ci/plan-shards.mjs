#!/usr/bin/env node
// The quality gate's `plan` job: turns scripts/ci/runner-shards.json into the
// runner job matrix, so the number of jobs per runner is set in one file that
// run-runner.mjs and the gate's verdict also read (lib/shards.mjs).
//
//   node scripts/ci/plan-shards.mjs            prints the matrix and each shard's estimate
//   (in Actions it also writes `matrix=<json>` to $GITHUB_OUTPUT)
//
// It refuses a config that validateShardConfig rejects -- an unknown runner,
// a split runner that owns SQL checks, more jobs than the plan allows, an
// empty shard -- so a bad edit fails here, before eighteen machines start.

import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMatrix, estimateShardSeconds, validateShardConfig } from "./lib/shards.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const config = JSON.parse(readFileSync(path.join(root, "scripts", "ci", "runner-shards.json"), "utf8"));
const manifest = JSON.parse(readFileSync(path.join(root, "e2e", "coverage-manifest.json"), "utf8"));
const e2eDir = path.join(root, "e2e");
const sources = Object.fromEntries(
  readdirSync(e2eDir)
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => [f, readFileSync(path.join(e2eDir, f), "utf8")])
);

const check = validateShardConfig(config, manifest, sources);
if (!check.ok) {
  for (const e of check.errors) console.log(`::error title=runner-shards.json::${e}`);
  process.exit(1);
}

const matrix = buildMatrix(config, manifest);
console.log(`${matrix.include.length} runner jobs`);
const estimates = new Map(estimateShardSeconds(manifest, config).map((e) => [e.label, e]));
for (const { label } of matrix.include) {
  const e = estimates.get(label);
  console.log(`  ${e.label.padEnd(16)} ${String(e.files).padStart(3)} spec file(s)  ~${e.seconds}s of spec time (measured)`);
}
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(matrix)}\n`);
