#!/usr/bin/env node
/**
 * Fails the lint when a SECURITY DEFINER function in schema.sql does not set
 * an explicit, safe `search_path`.
 *
 * A `security definer` function runs as its owner -- here, `postgres`. If it
 * resolves an unqualified name through the *caller's* `search_path`, a caller
 * who can create objects in a schema earlier on that path can shadow the
 * table or function the body meant and have it executed as the owner. That is
 * the classic privilege-escalation shape for definer functions, and it is
 * silent: the function works, the tests pass, and nothing reports anything.
 *
 * All 47 definer functions in this file already set one -- this check is not
 * fixing a hole, it is making sure the next function cannot open one. Same
 * reasoning as check-function-grants.mjs beside it: the failure has no
 * runtime symptom, so a check is the only thing that catches it.
 *
 * "Safe" here means every schema on the path is one only a superuser can
 * create in. `public` qualifies on Supabase (the anon and authenticated roles
 * have no CREATE on it) and so does `auth`. A path naming anything else, or
 * naming `"$user"` or `pg_temp`, is rejected: `pg_temp` is writable by any
 * session and is the exact vector this guards against.
 *
 * Trigger functions are in scope. They cannot be called by name, which is why
 * they need no EXECUTE revokes, but their bodies still resolve names as the
 * owner and so still need a pinned path.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(path.join(root, "supabase", "schema.sql"), "utf8");

/** Schemas nobody but a superuser can create objects in on this project. */
const SAFE_SCHEMAS = new Set(["public", "auth", "extensions", "pg_catalog"]);

// Split on each function definition. The header is everything up to the body
// delimiter; comments are stripped from it so prose mentioning "security
// definer" in a paragraph above is not mistaken for a definition.
const parts = sql.split(/(?=create\s+(?:or\s+replace\s+)?function\s)/i);

const failures = [];
let definerCount = 0;

for (const part of parts) {
  const nameMatch = part.match(/^create\s+(?:or\s+replace\s+)?function\s+([a-z0-9_."]+)\s*\(/i);
  if (!nameMatch) continue;

  const header = part.includes("$$") ? part.split("$$")[0] : part.slice(0, 1200);
  const headerNoComments = header.replace(/--[^\n]*/g, "");
  if (!/security\s+definer/i.test(headerNoComments)) continue;

  definerCount++;
  const name = nameMatch[1];

  const pathMatch = headerNoComments.match(/set\s+search_path\s*=\s*([^\n;]+)/i);
  if (!pathMatch) {
    failures.push(`${name} sets no search_path`);
    continue;
  }

  const schemas = pathMatch[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);

  if (schemas.length === 0) {
    failures.push(`${name} has an empty search_path`);
    continue;
  }

  const unsafe = schemas.filter((s) => !SAFE_SCHEMAS.has(s));
  if (unsafe.length > 0) {
    failures.push(
      `${name} names ${unsafe.map((u) => `"${u}"`).join(", ")} on its search_path - ` +
        `only schemas a superuser alone can create in are safe here`
    );
  }
}

if (failures.length > 0) {
  console.error(
    `search_path check FAILED - ${failures.length} of ${definerCount} security definer function(s):\n`
  );
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    `\nAdd \`security definer set search_path = public\` to the function's header.\n` +
      `A definer function that resolves names through the caller's path can be\n` +
      `made to execute the caller's objects as its owner.`
  );
  process.exit(1);
}

console.log(
  `search_path OK - ${definerCount} security definer function(s), all with an explicit safe search_path.`
);
