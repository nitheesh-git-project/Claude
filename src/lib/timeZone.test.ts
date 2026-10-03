import { describe, expect, it } from "vitest";
import { isValidTimeZone } from "@/lib/timeZone";

describe("isValidTimeZone", () => {
  it("accepts real zones, including multi-segment ones", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isValidTimeZone("America/Indiana/Indianapolis")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("refuses abbreviations, offsets and made-up names", () => {
    expect(isValidTimeZone("IST")).toBe(false);
    expect(isValidTimeZone("GMT+5:30")).toBe(false);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
