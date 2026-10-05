import { describe, expect, it } from "vitest";
import { csvToRows, loadEnvFile, parseCsv, usesLocalDatabase } from "../../lib/sqlTarget.mjs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const LOCAL = {
  CI_LOCAL_STACK: "1",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
};

describe("usesLocalDatabase", () => {
  it("is true only for a declared local-stack run on loopback", () => {
    expect(usesLocalDatabase(LOCAL)).toBe(true);
  });

  it("is false for a hosted project, however the variables are arranged", () => {
    expect(usesLocalDatabase({})).toBe(false);
    // A stray DATABASE_URL without the declaration does not flip a script into psql.
    expect(usesLocalDatabase({ ...LOCAL, CI_LOCAL_STACK: undefined })).toBe(false);
    expect(usesLocalDatabase({ ...LOCAL, NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBe(false);
    expect(usesLocalDatabase({ ...LOCAL, DATABASE_URL: "postgresql://u:p@db.abc.supabase.co:5432/postgres" })).toBe(false);
    expect(usesLocalDatabase({ ...LOCAL, DATABASE_URL: undefined })).toBe(false);
  });
});

describe("loadEnvFile", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "sqltarget-"));
  const file = path.join(dir, ".env.local");
  writeFileSync(file, "A_KEY=from-file\nB_KEY=also-file\n# comment\nlower=ignored\n");

  it("lets the file win only when asked to", () => {
    const keep = { A_KEY: "ambient" };
    loadEnvFile(file, { env: keep });
    expect(keep).toEqual({ A_KEY: "ambient", B_KEY: "also-file" });
    const win = { A_KEY: "ambient" };
    loadEnvFile(file, { override: true, env: win });
    expect(win.A_KEY).toBe("from-file");
  });

  it("never reads a developer's file on a local-stack run", () => {
    const env = { CI_LOCAL_STACK: "1" };
    expect(loadEnvFile(file, { override: true, env })).toBe(false);
    expect(env).toEqual({ CI_LOCAL_STACK: "1" });
  });

  it("returns false for a missing file unless it is required", () => {
    expect(loadEnvFile(path.join(dir, "nope"), { env: {} })).toBe(false);
    expect(() => loadEnvFile(path.join(dir, "nope"), { required: true, env: {} })).toThrow();
  });
});

describe("psql CSV into Management-API-shaped rows", () => {
  it("parses quoted fields, embedded commas, quotes and newlines", () => {
    expect(parseCsv('a,b\n"x,1","he said ""hi"""\n"l1\nl2",z\n')).toEqual([
      ["a", "b"],
      ["x,1", 'he said "hi"'],
      ["l1\nl2", "z"],
    ]);
  });

  it("recovers integers, booleans, nulls and JSON", () => {
    const csv = 'id,n,ok,gone,rows\nabc-123,7,t,,"[{""id"":""u1"",""email"":""a@b.test""}]"\n';
    expect(csvToRows(csv)).toEqual([
      { id: "abc-123", n: 7, ok: true, gone: null, rows: [{ id: "u1", email: "a@b.test" }] },
    ]);
  });

  it("returns [] for a statement with no result set", () => {
    expect(csvToRows("")).toEqual([]);
  });

  it("leaves uuids, timestamps and ordinary words alone", () => {
    const row = csvToRows("id,at,status\n5b3c1d2e-aaaa-bbbb-cccc-0123456789ab,2026-10-05 10:00:00+00,confirmed\n")[0];
    expect(row).toEqual({ id: "5b3c1d2e-aaaa-bbbb-cccc-0123456789ab", at: "2026-10-05 10:00:00+00", status: "confirmed" });
  });
});
