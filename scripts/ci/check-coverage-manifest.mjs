#!/usr/bin/env node
// npm run check:coverage -- the coverage manifest against the repository.
//
// Fails (exit 1) when a spec has no owner, an owner names a spec that is gone,
// a required flow is a gap or blocked, a flow cites a test that no longer
// exists, a runner would select nothing, or something the baseline recorded
// has disappeared without a reason. See scripts/ci/lib/manifest.mjs for every
// rule and e2e/coverage-manifest.json for the data.
//
//   node scripts/ci/check-coverage-manifest.mjs
//   node scripts/ci/check-coverage-manifest.mjs --update-baseline
//        rewrite e2e/coverage-baseline.json from the current manifest. Only
//        meaningful after a deliberate, reviewed change that adds coverage.
//   node scripts/ci/check-coverage-manifest.mjs --root <dir> [--manifest f] [--baseline f]
//        check a different tree (the negative fixtures use this)

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderCoverageDoc, snapshotBaseline, validateManifest } from "./lib/manifest.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function parseArgs(argv) {
  const args = { root: defaultRoot, updateBaseline: false, writeDoc: false, manifest: null, baseline: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--update-baseline") args.updateBaseline = true;
    else if (arg === "--write-doc") args.writeDoc = true;
    else if (arg === "--root") args.root = path.resolve(argv[++i]);
    else if (arg === "--manifest") args.manifest = path.resolve(argv[++i]);
    else if (arg === "--baseline") args.baseline = path.resolve(argv[++i]);
    else {
      console.error(`unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const e2eDir = path.join(args.root, "e2e");
const manifestPath = args.manifest ?? path.join(e2eDir, "coverage-manifest.json");
const baselinePath = args.baseline ?? path.join(e2eDir, "coverage-baseline.json");

function readJson(file, what) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`check:coverage: cannot read ${what} (${path.relative(args.root, file)}): ${error.message}`);
    process.exit(1);
  }
}

const manifest = readJson(manifestPath, "the manifest");

if (args.updateBaseline) {
  writeFileSync(baselinePath, `${JSON.stringify(snapshotBaseline(manifest), null, 2)}\n`);
  console.log(`check:coverage: wrote ${path.relative(args.root, baselinePath)}`);
  process.exit(0);
}

const baseline = existsSync(baselinePath) ? readJson(baselinePath, "the baseline") : null;
if (!baseline) {
  console.error("check:coverage: e2e/coverage-baseline.json is missing -- coverage cannot be shown not to have shrunk");
  process.exit(1);
}

const specFiles = readdirSync(e2eDir).filter((name) => name.endsWith(".spec.ts")).sort();
const specSources = {};
for (const file of specFiles) specSources[file] = readFileSync(path.join(e2eDir, file), "utf8");

const result = validateManifest(manifest, specFiles, baseline, {
  specSources,
  ruleExists: (rule) => existsSync(path.join(args.root, rule)),
});

if (!result.ok) {
  console.error(`check:coverage FAILED (${result.errors.length}):`);
  for (const message of result.errors) console.error(`  - ${message}`);
  process.exit(1);
}

// docs/ci/COVERAGE.md is generated from the manifest; a stale copy would be
// a coverage claim nobody re-checked.
const docPath = path.join(args.root, "docs", "ci", "COVERAGE.md");
const doc = renderCoverageDoc(manifest);
if (args.writeDoc) {
  writeFileSync(docPath, doc);
  console.log(`check:coverage: wrote ${path.relative(args.root, docPath)}`);
} else if (!existsSync(docPath) || readFileSync(docPath, "utf8") !== doc) {
  console.error("check:coverage FAILED: docs/ci/COVERAGE.md is missing or stale -- run node scripts/ci/check-coverage-manifest.mjs --write-doc");
  process.exit(1);
}

const flows = manifest.flows;
const count = (status) => flows.filter((f) => f.status === status).length;
console.log(
  `check:coverage ok -- ${specFiles.length} specs owned, ${flows.length} flows ` +
    `(${count("covered")} covered, ${count("partial")} partial, ${count("gap")} gap, ${count("blocked")} blocked)`
);
