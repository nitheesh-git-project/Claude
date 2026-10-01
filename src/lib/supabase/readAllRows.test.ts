import { describe, expect, it } from "vitest";
import { readAllRows, PAGE_SIZE } from "./readAllRows";

/** A fake table that answers `range` the way PostgREST does. */
function fakeTable(total: number) {
  const calls: Array<[number, number]> = [];
  const build = () => ({
    range: (from: number, to: number) => {
      calls.push([from, to]);
      const rows = [];
      for (let i = from; i <= Math.min(to, total - 1); i += 1) rows.push({ i });
      return Promise.resolve({ data: rows, error: null });
    },
  });
  return { build, calls };
}

describe("readAllRows", () => {
  it("walks past PostgREST's cap rather than stopping at one page", async () => {
    // The whole point: a plain select would answer 1,000 rows and no error.
    const { build, calls } = fakeTable(1300);
    const res = await readAllRows<{ i: number }>(build);
    expect(res.error).toBeNull();
    expect(res.truncated).toBe(false);
    expect(res.rows).toHaveLength(1300);
    expect(calls.length).toBeGreaterThan(1);
  });

  it("asks for less than the cap, so a full page is not ambiguous", () => {
    // Requesting exactly max_rows makes "a full page" and "the server
    // truncated me" the same observation.
    expect(PAGE_SIZE).toBeLessThan(1000);
  });

  it("stops at an exact multiple of the page size without an extra guess", async () => {
    const { build } = fakeTable(PAGE_SIZE);
    const res = await readAllRows<{ i: number }>(build);
    expect(res.rows).toHaveLength(PAGE_SIZE);
    expect(res.truncated).toBe(false);
  });

  it("reports hitting its own bound rather than presenting a prefix as a total", async () => {
    const { build } = fakeTable(10_000);
    const res = await readAllRows<{ i: number }>(build, { maxRows: PAGE_SIZE * 2 });
    expect(res.truncated).toBe(true);
    expect(res.rows).toHaveLength(PAGE_SIZE * 2);
  });

  it("returns no rows at all when a page errors", async () => {
    // Half a table presented as a whole one is the failure this module
    // exists to stop, one layer in.
    let n = 0;
    const build = () => ({
      range: (from: number, to: number) => {
        n += 1;
        if (n > 1) return Promise.resolve({ data: null, error: { message: "boom" } });
        const rows = [];
        for (let i = from; i <= to; i += 1) rows.push({ i });
        return Promise.resolve({ data: rows, error: null });
      },
    });
    const res = await readAllRows<{ i: number }>(build);
    expect(res.error).toBeTruthy();
    expect(res.rows).toEqual([]);
  });

  it("handles an empty table in one call", async () => {
    const { build, calls } = fakeTable(0);
    const res = await readAllRows<{ i: number }>(build);
    expect(res.rows).toEqual([]);
    expect(res.truncated).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
