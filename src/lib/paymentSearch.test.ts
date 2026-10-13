import { describe, expect, it } from "vitest";
import { groupSearchRefs, matchSearchRef, type SearchRef } from "@/lib/paymentSearch";

const REFS: SearchRef[] = [
  { kind: "session", value: "SS00041" },
  { kind: "payment", value: "pay_TmU8X3gjNWTQ16" },
  { kind: "order", value: "order_Tm1abcDEF" },
  { kind: "session", value: "SS0004" },
];

describe("matchSearchRef", () => {
  it("finds a pasted payment id, ignoring case and stray whitespace", () => {
    expect(matchSearchRef(REFS, "  pay_TmU8X3gjNWTQ16\n")).toEqual(REFS[1]);
    expect(matchSearchRef(REFS, "PAY_TMU8X3GJNWTQ16")).toEqual(REFS[1]);
  });

  it("prefers the exact session code over a longer one containing it", () => {
    expect(matchSearchRef(REFS, "SS0004")).toEqual(REFS[3]);
    expect(matchSearchRef(REFS, "ss00041")).toEqual(REFS[0]);
  });

  it("matches part of an id once the query is long enough to mean something", () => {
    expect(matchSearchRef(REFS, "order_Tm1")).toEqual(REFS[2]);
    expect(matchSearchRef(REFS, "pay")).toBeNull();
  });

  it("returns null for no refs or no match", () => {
    expect(matchSearchRef(undefined, "pay_TmU8X3gjNWTQ16")).toBeNull();
    expect(matchSearchRef(REFS, "pay_nothere")).toBeNull();
  });
});

describe("matchSearchRef - programme IDs", () => {
  const PROGRAMMES: SearchRef[] = [
    { kind: "programme", value: "PED_PKG0010" },
    { kind: "programme", value: "PED_PKG001" },
    { kind: "programme", value: "SP0004" },
    { kind: "programme", value: "ORT_HV002" },
  ];

  it("finds the new ID exactly, ahead of a longer one containing it", () => {
    expect(matchSearchRef(PROGRAMMES, "ped_pkg001")).toEqual(PROGRAMMES[1]);
  });

  it("finds it pasted with progress that has since moved on", () => {
    expect(matchSearchRef(PROGRAMMES, "PED_PKG001-2/6")).toEqual(PROGRAMMES[1]);
    expect(matchSearchRef(PROGRAMMES, " ORT_HV002-0/4 ")).toEqual(PROGRAMMES[3]);
  });

  it("still finds the old purchase code and part of a new one", () => {
    expect(matchSearchRef(PROGRAMMES, "SP0004")).toEqual(PROGRAMMES[2]);
    expect(matchSearchRef(PROGRAMMES, "_HV00")).toEqual(PROGRAMMES[3]);
    expect(matchSearchRef(PROGRAMMES, "NEU_PKG001")).toBeNull();
  });
});

describe("groupSearchRefs", () => {
  it("groups by patient and drops blanks and duplicates", () => {
    const grouped = groupSearchRefs([
      { patientId: "p1", kind: "payment", value: "pay_A" },
      { patientId: "p1", kind: "payment", value: "pay_A" },
      { patientId: "p1", kind: "session", value: "SS0001" },
      { patientId: "p2", kind: "order", value: " order_B " },
      { patientId: null, kind: "payment", value: "pay_orphan" },
      { patientId: "p2", kind: "payment", value: null },
    ]);
    expect(grouped.get("p1")).toEqual([
      { kind: "payment", value: "pay_A" },
      { kind: "session", value: "SS0001" },
    ]);
    expect(grouped.get("p2")).toEqual([{ kind: "order", value: "order_B" }]);
    expect(grouped.size).toBe(2);
  });
});
