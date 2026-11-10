import { describe, expect, it } from "vitest";
import { startEarly } from "./startEarly";

describe("startEarly", () => {
  it("starts a lazy thenable immediately", async () => {
    let started = false;
    const lazy = { then: (resolve: (v: number) => void) => { started = true; resolve(7); } };
    const p = startEarly(lazy as unknown as PromiseLike<number>);
    expect(started).toBe(true);
    expect(await p).toBe(7);
  });

  it("keeps a failure for the await, without an unhandled rejection", async () => {
    const p = startEarly(Promise.reject(new Error("read failed")));
    await new Promise((r) => setTimeout(r, 0));
    await expect(p).rejects.toThrow("read failed");
  });
});
