#!/usr/bin/env node
// Writes e2e-artifacts/<runner>/failure-bundle.md after a runner fails:
// the smallest sanitised package a person (or Claude Code, run by hand with
// docs/ci/INVESTIGATE.md) needs to investigate it, and nothing else.
//
//   node scripts/ci/make-failure-bundle.mjs <runner>      (BASE_SHA optional)
//
// Contents: each failed test with its flow, the failing step and the
// sanitised error; the runner's problems (preflight, egress, scripts); the
// files this change touched relative to the base; the docs/rules/ guides the
// failing flows cite; and the exact command that reproduces each failure.
// Everything in it came from test output and the diff, so it opens with a
// notice that it is data, not instructions.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFailureBundle } from "./lib/bundle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const runner = process.argv[2];
if (!runner) {
  console.error("usage: make-failure-bundle.mjs <runner>");
  process.exit(2);
}
const dir = path.join(root, "e2e-artifacts", runner);
const summaryFile = path.join(dir, "summary.json");
const summary = existsSync(summaryFile) ? JSON.parse(readFileSync(summaryFile, "utf8")) : null;
const manifest = JSON.parse(readFileSync(path.join(root, "e2e", "coverage-manifest.json"), "utf8"));

const base = process.env.BASE_SHA;
let changedFiles = [];
if (base) {
  const diff = spawnSync("git", ["diff", "--name-only", `${base}...HEAD`], { cwd: root, encoding: "utf8" });
  if (diff.status === 0) changedFiles = diff.stdout.split("\n").filter(Boolean);
}

const markdown = buildFailureBundle({ runner, summary, manifest, changedFiles });
writeFileSync(path.join(dir, "failure-bundle.md"), markdown);
console.log(`wrote ${path.relative(root, path.join(dir, "failure-bundle.md"))} (${markdown.length} bytes)`);
