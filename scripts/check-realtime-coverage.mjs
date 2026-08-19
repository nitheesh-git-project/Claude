#!/usr/bin/env node
// Fails when a table the UI subscribes to is missing from the
// `supabase_realtime` publication in supabase/schema.sql.
//
// Why this exists: RealtimeRefresh degrades silently. If a table isn't in
// the publication, Supabase never emits postgres_changes for it, the
// subscription still succeeds, and the only symptom is a dashboard that
// quietly stops updating live -- no error, no log line, nothing in review.
// The two lists live in different files (schema.sql and the components'
// realtimeTables props), so they drift the moment someone adds a table and
// wires up the prop without the publication statement. This is the check
// that catches that drift, run as part of `npm run lint`.
//
// Deliberately one-directional: published-but-unsubscribed is fine (a table
// may be published ahead of the UI that will use it, and the only cost is a
// little WAL traffic), while subscribed-but-unpublished is the broken case.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SCHEMA = "supabase/schema.sql";
const SRC = "src";

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (path.endsWith(".tsx") || path.endsWith(".ts")) out.push(path);
  }
  return out;
}

const published = new Set(
  [...readFileSync(SCHEMA, "utf8").matchAll(/add table ([a-z_]+)\s*;/g)].map((m) => m[1])
);

// Two shapes carry the subscription list: the `realtimeTables={[...]}` prop
// every dashboard page passes to DashboardShell, and the module-scope
// `*_REALTIME_TABLES` array AdminShell keeps (module scope so the prop stays
// referentially stable across renders).
const subscribed = new Map(); // table -> first file that subscribes to it
for (const file of walk(SRC)) {
  const source = readFileSync(file, "utf8");
  const blocks = [
    ...source.matchAll(/realtimeTables=\{\[([^\]]*)\]\}/g),
    ...source.matchAll(/REALTIME_TABLES\s*=\s*\[([^\]]*)\]/g),
  ];
  for (const block of blocks) {
    for (const [, table] of block[1].matchAll(/"([a-z_]+)"/g)) {
      if (!subscribed.has(table)) subscribed.set(table, file);
    }
  }
}

const missing = [...subscribed.entries()].filter(([table]) => !published.has(table));

if (missing.length > 0) {
  console.error(
    `\nRealtime coverage check failed: ${missing.length} table(s) are subscribed to in the UI ` +
      `but missing from the supabase_realtime publication in ${SCHEMA}.\n` +
      `Without the publication statement, live updates for these tables silently never arrive.\n`
  );
  for (const [table, file] of missing) {
    console.error(`  ${table}  (subscribed in ${file})`);
  }
  console.error(
    `\nFix: append to the end of ${SCHEMA}, in the same guarded style as the entries already there:\n` +
      missing
        .map(
          ([table]) =>
            `\n  do $$ begin\n` +
            `    alter publication supabase_realtime add table ${table};\n` +
            `  exception when duplicate_object then null;\n  end $$;`
        )
        .join("") +
      "\n"
  );
  process.exit(1);
}

const unused = [...published].filter((table) => !subscribed.has(table)).sort();
console.log(
  `Realtime coverage OK — ${subscribed.size} subscribed table(s), all published.` +
    (unused.length > 0 ? ` (${unused.length} published but unsubscribed: ${unused.join(", ")})` : "")
);
