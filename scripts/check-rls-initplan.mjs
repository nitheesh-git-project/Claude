#!/usr/bin/env node
/**
 * Fails the lint when a live RLS policy in schema.sql calls `auth.uid()`
 * bare instead of `(select auth.uid())`.
 *
 * Postgres marks `auth.uid()` volatile -- it reads the request JWT out of a
 * GUC -- so a policy calling it directly is re-evaluated **once per
 * candidate row**. Wrapped in a scalar subquery the planner hoists it into
 * an InitPlan and computes it once for the whole statement. The predicate is
 * identical either way; only the number of calls changes. On a table a
 * patient scans regularly that is the difference between one call and one
 * call per row, and inside an `exists (...)` subquery it is the product of
 * two row counts.
 *
 * Same reasoning as check-function-grants.mjs and check-search-path.mjs
 * beside it: the failure has no runtime symptom. The policy is correct, the
 * tests pass, the page renders -- it is just slower than it needs to be, by
 * an amount that grows with the table. Nothing short of a check catches that
 * before it is a production problem.
 *
 * Only the **live** definition of each policy is checked. schema.sql is
 * re-runnable and later sections supersede earlier ones, so a policy may be
 * declared several times (appointments_insert_own is declared six) and only
 * the last one survives a run. An earlier declaration with a bare call is
 * dead text and is not a finding. A policy whose last mention is a
 * `drop policy if exists` with no later `create` has been withdrawn
 * deliberately and is likewise not a finding -- four of those exist.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(path.join(root, "supabase", "schema.sql"), "utf8");

/** `appointments`, or `storage.objects` -- the schema-qualified form matters:
 *  the avatar policies live on storage.objects, and a name truncated at the
 *  dot would both miss them here and, in generated SQL, produce a DROP
 *  against a table called `storage` that does not exist. */
const TABLE = "([a-z0-9_]+(?:\\.[a-z0-9_]+)?)";

const normalise = (table) =>
  table.startsWith("public.") ? table.slice("public.".length) : table;

const createRe = new RegExp(
  `create\\s+policy\\s+"([^"]+)"\\s+on\\s+${TABLE}(.*?);\\s*(?=\\n)`,
  "gis"
);
const dropRe = new RegExp(
  `drop\\s+policy\\s+if\\s+exists\\s+"([^"]+)"\\s+on\\s+${TABLE}\\s*;`,
  "gis"
);

/** Last `create policy` per (name, table) -- the one a re-run leaves standing. */
const lastCreate = new Map();
for (const m of sql.matchAll(createRe)) {
  lastCreate.set(`${m[1]}\u0000${normalise(m[2])}`, {
    name: m[1],
    table: normalise(m[2]),
    at: m.index,
    text: m[0],
  });
}

/** Last `drop policy` per (name, table). */
const lastDrop = new Map();
for (const m of sql.matchAll(dropRe)) {
  const key = `${m[1]}\u0000${normalise(m[2])}`;
  lastDrop.set(key, Math.max(lastDrop.get(key) ?? -1, m.index));
}

/** Bare, i.e. not already the `(select auth.uid())` form. */
const BARE_AUTH_UID = /(?<!\(select )auth\.uid\(\)/;

const failures = [];
let liveCount = 0;
let withdrawnCount = 0;

for (const [key, policy] of lastCreate) {
  if ((lastDrop.get(key) ?? -1) > policy.at) {
    withdrawnCount += 1;
    continue;
  }
  liveCount += 1;
  if (!BARE_AUTH_UID.test(policy.text)) continue;
  const line = sql.slice(0, policy.at).split("\n").length;
  failures.push(
    `  schema.sql:${line}  policy "${policy.name}" on ${policy.table}` +
      ` calls auth.uid() bare -- write it as (select auth.uid())`
  );
}

if (failures.length > 0) {
  console.error(
    `RLS InitPlan check FAILED - ${failures.length} live polic` +
      `${failures.length === 1 ? "y re-evaluates" : "ies re-evaluate"}` +
      ` auth.uid() per row:\n`
  );
  console.error(failures.join("\n"));
  console.error(
    "\nWrap the call: `auth.uid() = patient_id` becomes" +
      " `(select auth.uid()) = patient_id`. Same predicate, same rows --" +
      " Postgres just stops recomputing a constant for every row it reads." +
      "\nSee the RLS section at the end of schema.sql for the reasoning."
  );
  process.exit(1);
}

console.log(
  `RLS InitPlan OK - ${liveCount} live polic${liveCount === 1 ? "y" : "ies"},` +
    ` all auth.uid() calls wrapped as (select auth.uid())` +
    ` (${withdrawnCount} withdrawn, not checked).`
);
