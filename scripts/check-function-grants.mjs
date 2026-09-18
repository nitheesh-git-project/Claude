#!/usr/bin/env node
/**
 * Fails the lint when a SECURITY DEFINER function in schema.sql is not
 * revoked from PUBLIC.
 *
 * This check exists because of a real, live vulnerability. Postgres grants
 * EXECUTE on every new function to PUBLIC, and Supabase's `anon` and
 * `authenticated` roles inherit it. So
 *
 *     revoke execute on function f(...) from anon, authenticated;
 *
 * revokes a grant those roles never held directly and leaves the PUBLIC one
 * untouched. The statement succeeds. The ACL changes. Nothing is protected.
 *
 * And "from public" alone is not enough either. This project's
 * pg_default_acl grants EXECUTE to anon and authenticated **explicitly** on
 * every new function in schema public, so a function created on a fresh
 * database arrives with those grants written out and a revoke naming only
 * PUBLIC removes neither. Both forms are wrong in a different case, which
 * is why this check requires all three roles named.
 *
 * Eleven functions were written that way, including `record_payment_capture`
 * (mark a booking paid) and `grant_session_credits` (mint sessions), and all
 * of them were callable over PostgREST by anyone holding the publishable
 * anon key -- no account required. `debug_reset_all_data` used the correct
 * form, `from public`, and was correctly unreachable, which is what made the
 * pattern obvious once someone looked.
 *
 * Like check-realtime-coverage.mjs, this catches a failure with no runtime
 * symptom: the function works, the revoke reports success, and the hole is
 * visible only in pg_proc.proacl.
 */
import { readFileSync } from "node:fs";

const SCHEMA = "supabase/schema.sql";
const sql = readFileSync(SCHEMA, "utf8");

// Functions that must stay executable by anon/authenticated, each with the
// reason. Adding to this list is a deliberate decision, not a default.
const INTENTIONALLY_PUBLIC = new Map([
  [
    "is_admin",
    "RLS policies call it as the querying role, so revoking PUBLIC would " +
      "break all 23 of them. Takes no argument and reads one row keyed on " +
      "auth.uid(), so a caller cannot steer it.",
  ],
]);

// A trigger function cannot be called by name -- Postgres refuses with
// "trigger functions can only be called as triggers" -- so an EXECUTE grant
// on one is not reachable.
const TRIGGER_RETURNS = /returns\s+(trigger|event_trigger)\b/i;

const failures = [];
const warnings = [];

// Every `create [or replace] function name(...)` and the body that follows,
// up to the closing `$$;`.
const fnRe = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi;

const seen = new Set();
let m;
while ((m = fnRe.exec(sql))) {
  const name = m[1];
  const body = sql.slice(m.index, sql.indexOf("$$;", m.index) + 3);
  if (!/security\s+definer/i.test(body)) continue;
  if (TRIGGER_RETURNS.test(body)) continue;
  if (INTENTIONALLY_PUBLIC.has(name)) continue;
  seen.add(name);
}

// Statements, not a regex over the whole file. A pattern matching across
// `;` quietly picked up the `alter default privileges ... from anon` lines
// as though they were revokes on whichever function was named earlier, and
// the check then passed a schema with the hole reintroduced -- found by
// deliberately breaking the file and watching the guard stay green.
const statements = sql
  .split(";")
  .map((line) => line.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim().toLowerCase())
  .filter((line) => line.startsWith("revoke ") && line.includes(" on function "));

for (const name of [...seen].sort()) {
  // A revoke aimed at this function: "on function [public.]name(" exactly,
  // so `claim_invite` does not also satisfy `claim_invite_half`.
  const aimedHere = statements.filter((line) =>
    new RegExp(`\\bon function (?:public\\.)?${name}\\s*\\(`).test(line)
  );

  if (!aimedHere.length) {
    failures.push(
      `${name}: security definer with no revoke at all. Callable over ` +
        `PostgREST by anyone with the anon key.`
    );
    continue;
  }

  // The roles named after the closing paren, across all of them together.
  const covered = new Set();
  for (const line of aimedHere) {
    const from = line.slice(line.lastIndexOf(")") + 1);
    for (const role of ["public", "anon", "authenticated"]) {
      if (new RegExp(`\\b${role}\\b`).test(from)) covered.add(role);
    }
  }

  const missing = ["public", "anon", "authenticated"].filter((r) => !covered.has(r));
  if (missing.length) {
    failures.push(
      `${name}: revoked from ${[...covered].join(", ") || "nobody"} but not ` +
        `from ${missing.join(", ")}. PUBLIC carries the implicit grant; anon ` +
        `and authenticated get explicit ones from pg_default_acl on a fresh ` +
        `database. All three have to be named.`
    );
  }
}

// The default-privileges line is what stops the next function shipping with
// the same grant.
for (const role of ["public", "anon", "authenticated"]) {
  const re = new RegExp(
    `alter\\s+default\\s+privileges\\s+in\\s+schema\\s+public\\s+revoke\\s+execute\\s+on\\s+functions\\s+from\\s+[^;]*\\b${role}\\b`,
    "i"
  );
  if (!re.test(sql)) {
    warnings.push(
      `No "alter default privileges in schema public revoke execute on ` +
        `functions from ${role}" -- new functions will ship granted to ${role}.`
    );
  }
}

if (warnings.length) {
  console.warn("Function grant warnings:");
  for (const w of warnings) console.warn("  ! " + w);
}

if (failures.length) {
  console.error(
    `\nFunction EXECUTE grants: ${failures.length} security definer ` +
      `function(s) in ${SCHEMA} are reachable by anon/authenticated.\n`
  );
  for (const f of failures) console.error("  x " + f);
  console.error(
    "\nUse: revoke all on function public.<name>(<arg types>) from public;\n" +
      "Revoking from anon and authenticated does not remove the implicit " +
      "PUBLIC grant those roles inherit.\n"
  );
  process.exit(1);
}

console.log(
  `Function grants OK - ${seen.size} security definer function(s), all ` +
    `revoked from public, anon and authenticated ` +
    `(${INTENTIONALLY_PUBLIC.size} intentionally reachable).`
);
