#!/usr/bin/env node
// npm run check:context-budget -- see lib/contextBudget.mjs for the rules.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUDGETS, checkContextBudget } from "./lib/contextBudget.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => (existsSync(path.join(root, rel)) ? readFileSync(path.join(root, rel), "utf8") : null);

const files = Object.fromEntries(Object.keys(BUDGETS).map((name) => [name, read(name)]));
const settings = Object.fromEntries(
  [".claude/settings.json", ".claude/settings.local.json"].map((name) => [name, read(name)])
);
const result = checkContextBudget(files, settings);
for (const finding of result.findings) console.error(`check:context-budget: ${finding}`);
if (!result.ok) process.exit(1);
console.log(
  `check:context-budget ok -- ${Object.entries(result.sizes)
    .map(([name, bytes]) => `${name} ${bytes}/${BUDGETS[name]} bytes`)
    .join(", ")}, no auto-imports, no SessionStart hooks`
);
