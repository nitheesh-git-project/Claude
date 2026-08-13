#!/usr/bin/env node
// Applies supabase/schema.sql to the live project over the Supabase
// Management API (https://api.supabase.com), instead of pasting it into the
// SQL Editor by hand. schema.sql is written to be safely re-runnable (see
// the file's own header + AGENTS.md), so this can be run after every change
// to it.
//
// Why the Management API and not a direct `psql` connection: Supabase's
// direct-connection hostname (db.<ref>.supabase.co) resolves IPv6-only, and
// many sandboxed/CI environments have no outbound IPv6 route (and separately
// may not permit raw Postgres wire-protocol egress at all, only HTTPS). The
// Management API runs over plain HTTPS, which works everywhere the rest of
// this app's tooling already does.
//
// Setup:
//   1. https://supabase.com/dashboard/account/tokens -> generate a Personal
//      Access Token (this is NOT the service role key or DB password).
//   2. Set SUPABASE_ACCESS_TOKEN in .env.local.
//
// Usage:
//   node scripts/run-schema.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  try {
    const text = readFileSync(path.join(rootDir, ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  } catch {
    // .env.local may not exist -- rely on real env vars instead.
  }
}
loadEnvLocal();

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!accessToken) {
  console.error(
    "Missing SUPABASE_ACCESS_TOKEN.\n" +
      "Generate one at https://supabase.com/dashboard/account/tokens and set it in .env.local first."
  );
  process.exit(1);
}
if (!supabaseUrl) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL in .env.local.");
  process.exit(1);
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const sql = readFileSync(path.join(rootDir, "supabase", "schema.sql"), "utf8");

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});

const body = await res.text();
if (!res.ok) {
  console.error(`schema.sql failed (HTTP ${res.status}):\n${body}`);
  process.exit(1);
}
console.log(`schema.sql applied successfully to project ${projectRef}.`);
