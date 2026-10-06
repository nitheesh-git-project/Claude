import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The debug data reset must keep the developer's own leads and the two
// switches that publish the contact page. `create or replace` means only the
// LAST declaration of debug_reset_all_data() runs, so that is the one read --
// editing an earlier one would change nothing while looking as though it did.
const schema = readFileSync(join(process.cwd(), "supabase/schema.sql"), "utf8");

function lastResetBody(): string {
  const marker = /create or replace function public\.debug_reset_all_data\(\)/g;
  let start = -1;
  for (const match of schema.matchAll(marker)) start = match.index ?? start;
  expect(start, "debug_reset_all_data() is declared").toBeGreaterThan(-1);
  const rest = schema.slice(start);
  // The body ends at the closing `$$;` after the opening one.
  const open = rest.indexOf("$$");
  const close = rest.indexOf("$$;", open + 2);
  expect(close).toBeGreaterThan(open);
  return rest.slice(open, close);
}

/** SQL with its `--` comments removed, so a comment *explaining* that a table
 *  is kept is not mistaken for a statement that touches it. */
function code(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("debug_reset_all_data keeps the developer's reachouts", () => {
  const body = code(lastResetBody());

  it("does not truncate dev_reachouts", () => {
    const truncate = body.match(/truncate\s+table([\s\S]*?)cascade\s*;/i);
    expect(truncate, "the TRUNCATE statement is found").not.toBeNull();
    expect(truncate![1]).not.toMatch(/dev_reachouts/);
  });

  it("does not delete from or update dev_reachouts either", () => {
    expect(body).not.toMatch(/(delete\s+from|update)\s+(public\.)?dev_reachouts/i);
  });

  it("touches neither dev_contact_ setting", () => {
    expect(body).not.toMatch(/dev_contact_/);
  });

  it("says in a comment why the table is kept", () => {
    expect(lastResetBody()).toMatch(/NOT truncated[\s\S]*dev_reachouts/);
  });
});

describe("debug_reset_all_data keeps the notes on those reachouts", () => {
  const body = code(lastResetBody());

  it("neither truncates, deletes from nor updates dev_reachout_notes", () => {
    expect(body).not.toMatch(/dev_reachout_notes/);
  });

  it("reaches no table the notes depend on through CASCADE", () => {
    const truncate = body.match(/truncate\s+table([\s\S]*?)cascade\s*;/i);
    expect(truncate![1]).not.toMatch(/\bprofiles\b/);
    expect(truncate![1]).not.toMatch(/dev_reachouts/);
  });
});
