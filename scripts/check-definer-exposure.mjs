#!/usr/bin/env node
/**
 * Which `security definer` functions can a browser actually call?
 *
 * `check-function-grants.mjs` reads `schema.sql` and `check-live-grants.mjs`
 * asks the running database whether the *policies* hold. Neither answers this
 * question, and it is the one that decides how much the input validation
 * inside each function body is load-bearing:
 *
 * - If no argument-taking definer function is reachable by `anon` or
 *   `authenticated`, then every one of them is called by this app's own
 *   routes with the service-role key, and a missing check inside a body is a
 *   bug in a route rather than a door for a stranger.
 * - The moment one *is* reachable, its arguments are attacker-controlled and
 *   every assumption the body makes about them is a hole.
 *
 * So this prints the reachable set and fails on anything not deliberately
 * allowed. It is the durable half of the RPC review: the review was a
 * snapshot, and a function re-created at the end of `schema.sql` arrives
 * carrying `anon` and `authenticated` grants again -- which is the exact
 * mechanism the grant rule already exists for, one layer up.
 *
 * It needs a real database (`SUPABASE_ACCESS_TOKEN` + `NEXT_PUBLIC_SUPABASE_URL`)
 * and is run by hand after a schema change, like `check-live-grants.mjs`.
 *
 * Usage: node scripts/check-definer-exposure.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Functions a browser may reach, each with the reason. Adding to this list is
 * a deliberate decision, and the bar is the one `is_admin()` set: **no
 * arguments**, so a caller cannot steer it, and an answer about nobody but
 * themselves.
 */
const ALLOWED = new Map([
  [
    "is_admin",
    "RLS policies invoke it as the querying role, so revoking it breaks all of " +
      "them. No argument, and it reads one row keyed on auth.uid().",
  ],
  [
    "is_active_therapist",
    "The four clinical read policies invoke it as the querying role. Same " +
      "shape as is_admin: no argument, one row keyed on auth.uid().",
  ],
  [
    "rls_auto_enable",
    "Supabase's own platform function, not ours -- an event trigger that " +
      "enables RLS on newly created public tables. It reads " +
      "pg_event_trigger_ddl_commands(), which returns nothing outside an " +
      "event-trigger context, so calling it directly does nothing at all. " +
      "Listed so a later audit does not re-flag it as ours.",
  ],
]);

function loadEnvLocal() {
  try {
    const text = readFileSync(path.join(rootDir, ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      // .env.local wins, for the reason run-schema.mjs says: an ambient
      // token for another project answers a flat 401 that reads as a bad
      // value in the file.
      if (match) process.env[match[1]] = match[2];
    }
  } catch {
    // Rely on real environment variables instead.
  }
}
loadEnvLocal();

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!accessToken || !supabaseUrl) {
  console.error(
    "Missing SUPABASE_ACCESS_TOKEN or NEXT_PUBLIC_SUPABASE_URL.\n" +
      "This check asks a running database, so it needs both. See scripts/run-schema.mjs."
  );
  process.exit(1);
}
const ref = new URL(supabaseUrl).hostname.split(".")[0];

const QUERY = `
  select p.proname,
         pg_get_function_identity_arguments(p.oid) as args,
         p.proacl::text as acl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.prorettype <> 'trigger'::regtype
  order by p.proname;
`;

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: QUERY }),
});
if (!res.ok) {
  console.error(`Could not read the database (HTTP ${res.status}): ${await res.text()}`);
  process.exit(1);
}
const rows = await res.json();

/**
 * A grant to `anon` or `authenticated`, or PUBLIC's implicit one -- which is
 * what an empty grantee (`=X/owner`) means, and the half the short-form
 * revoke leaves behind.
 */
function browserReachable(acl) {
  if (!acl) return true; // No ACL at all is PUBLIC's default grant.
  return /(^|,)=X\//.test(acl) || /anon=X\//.test(acl) || /authenticated=X\//.test(acl);
}

const reachable = rows.filter((r) => browserReachable(r.acl));
const unexpected = reachable.filter((r) => !ALLOWED.has(r.proname));
const takesArguments = unexpected.filter((r) => (r.args ?? "").trim().length > 0);

console.log(
  `\n${rows.length} security definer function(s) in public, of which ${reachable.length} are reachable by a browser.\n`
);

for (const row of reachable) {
  const why = ALLOWED.get(row.proname);
  const mark = why ? "ok " : " x ";
  console.log(`  ${mark} ${row.proname}(${row.args})`);
  if (why) console.log(`      ${why}`);
}

if (unexpected.length === 0) {
  console.log(
    "\nNo function of ours that takes an argument is reachable by a browser." +
      "\nEvery one is called by this app's own routes with the service-role key, so a" +
      "\nmissing check inside a body is a bug in a route rather than a door for a stranger."
  );
  process.exit(0);
}

console.log(
  `\nFAILED - ${unexpected.length} unexpected function(s) are reachable by anon/authenticated.`
);
if (takesArguments.length > 0) {
  console.log(
    `${takesArguments.length} of them take arguments, so those arguments are ` +
      "attacker-controlled and every assumption the body makes about them is a hole."
  );
}
console.log(
  "\nEither revoke it from public, anon AND authenticated (all three -- see the grant" +
    "\nrule in AGENTS.md), or add it to ALLOWED in this file with the reason. The bar is" +
    "\nis_admin()'s: no arguments, and an answer about nobody but the caller."
);
process.exit(1);
