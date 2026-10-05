// Where a script's SQL goes: the Supabase Management API for a hosted
// project (what these scripts have always done), or `psql` for the quality
// gate's own disposable stack on loopback.
//
// Scripts keep their hosted code path byte for byte -- they call
// `usesLocalDatabase()` first and only take the psql path when it is true --
// so nothing about how they treat a hosted project changes. The local path
// exists because a local Postgres has no Management API.
//
// `usesLocalDatabase()` is deliberately strict: the database URL and the
// Supabase URL must both be loopback, and the run must have been declared a
// local-stack run by scripts/ci/provision-local-stack.sh. A developer with a
// .env.local pointing at a hosted project and a stray DATABASE_URL does not
// accidentally flip into it, and a local stack run never reads their file.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { hostOf, isLoopbackHost } from "../ci/lib/target.mjs";

/** True only for a run on the gate's own stack. */
export function usesLocalDatabase(env = process.env) {
  return (
    env.CI_LOCAL_STACK === "1" &&
    isLoopbackHost(hostOf(env.DATABASE_URL)) &&
    isLoopbackHost(hostOf(env.NEXT_PUBLIC_SUPABASE_URL))
  );
}

/**
 * Loads KEY=value lines from an env file into process.env.
 *
 * - On a local-stack run it does nothing at all: a developer's .env.local
 *   points at a real project, and must not be able to override the stack.
 * - `override` makes the file win over the ambient environment (the existing
 *   behaviour of authorization-checks and concurrency-checks); without it the
 *   ambient value wins (seed-qa-accounts, clean-e2e-residue).
 * - `required` rethrows a missing file, which is what those two scripts did.
 */
export function loadEnvFile(file, { override = false, required = false, env = process.env } = {}) {
  if (env.CI_LOCAL_STACK === "1") return false;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if (required) throw error;
    return false;
  }
  for (const line of text.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    if (override || !env[match[1]]) env[match[1]] = match[2];
  }
  return true;
}

/** RFC 4180 CSV into rows of strings. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * psql's CSV for one result set into the shape the Management API returns:
 * an array of row objects. psql prints values as text, so numbers, booleans
 * and JSON are recovered by value (the scripts read `count(*)::int`, `t/f`
 * and `json_agg` columns; none of them keeps a digit-only string or a literal
 * 't' in a text column).
 */
export function csvToRows(text) {
  const table = parseCsv(text);
  if (table.length === 0) return [];
  const [header, ...body] = table;
  return body.map((cells) => {
    const row = {};
    header.forEach((name, i) => {
      row[name] = coerce(cells[i] ?? "");
    });
    return row;
  });
}

function coerce(value) {
  if (value === "") return null;
  if (value === "t") return true;
  if (value === "f") return false;
  if (/^-?\d{1,15}$/.test(value)) return Number(value);
  if (/^-?\d+\.\d+$/.test(value) && value.length < 16) return Number(value);
  if (value[0] === "[" || value[0] === "{") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * Runs SQL on the local stack with psql and returns the last statement's rows,
 * like the Management API does. Throws with psql's message on any error.
 */
export function localSql(query, env = process.env) {
  if (!usesLocalDatabase(env)) {
    throw new Error("localSql called on a target that is not the gate's local stack");
  }
  const result = spawnSync(
    "psql",
    [env.DATABASE_URL, "-X", "-q", "--csv", "-v", "ON_ERROR_STOP=1", "-v", "SHOW_ALL_RESULTS=off", "-c", query],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`SQL failed: ${(result.stderr || result.stdout || "").trim().slice(0, 400)}`);
  }
  return csvToRows(result.stdout);
}
