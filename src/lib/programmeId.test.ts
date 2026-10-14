import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  clampProgress,
  conditionCodeCandidates,
  conditionCodeProblem,
  formatProgrammeCode,
  normaliseConditionCode,
  parseProgrammeId,
  programmeIdWithProgress,
  programmeProgress,
  programmeQueryMatches,
  programmeTag,
  suggestConditionCode,
} from "./programmeId";

describe("condition codes", () => {
  it("takes the first three letters of the first word", () => {
    expect(conditionCodeCandidates("Pediatric")[0]).toBe("PED");
    expect(conditionCodeCandidates("Orthopaedic")[0]).toBe("ORT");
    expect(conditionCodeCandidates("Neurological rehab")[0]).toBe("NEU");
    expect(conditionCodeCandidates("Spine & Posture Rehabilitation")[0]).toBe("SPI");
  });

  it("falls back to initials, then four letters, then letter combinations", () => {
    const c = conditionCodeCandidates("Spine & Posture Rehabilitation");
    expect(c.slice(0, 3)).toEqual(["SPI", "SPR", "SPIN"]);
    expect(c[3]).toBe("SPI"); // first combination repeats the first pick; harmless
    expect(suggestConditionCode("Spine & Posture Rehabilitation", ["SPI"])).toBe("SPR");
    expect(suggestConditionCode("Spine & Posture Rehabilitation", ["spi", "SPR"])).toBe("SPIN");
  });

  it("always has a code to offer, all 2-4 capitals", () => {
    for (const title of ["", "X", "Knee", "Post-Surgical Rehabilitation", "Ünïcode Pain", "12 3"]) {
      const c = conditionCodeCandidates(title);
      expect(c.length).toBeGreaterThan(600);
      for (const code of c) expect(code).toMatch(/^[A-Z]{2,4}$/);
    }
    expect(suggestConditionCode("", [])).toBe("CAA");
  });

  it("normalises and checks a typed code", () => {
    expect(normaliseConditionCode(" pe d ")).toBe("PED");
    expect(conditionCodeProblem("")).toBeNull();
    expect(conditionCodeProblem("ped")).toBeNull();
    expect(conditionCodeProblem("P")).toMatch(/2 to 4 letters/);
    expect(conditionCodeProblem("PEDIA")).toMatch(/2 to 4 letters/);
    expect(conditionCodeProblem("P3D")).toMatch(/2 to 4 letters/);
    expect(conditionCodeProblem("ORT", ["ort"])).toMatch(/already/);
  });

  // The database walks the same list (condition_short_code_candidates). This
  // pins the rule order in both places, so the form's suggestion is the code
  // a new condition actually gets.
  it("matches the database's candidate order", () => {
    const sql = readFileSync(path.resolve(__dirname, "../../supabase/schema.sql"), "utf8");
    const fn = sql.slice(sql.lastIndexOf("create or replace function public.condition_short_code_candidates"));
    expect(fn).toMatch(/left\(v_words\[1\], 3\)[\s\S]*v_words\[1:4\][\s\S]*left\(v_words\[1\], 4\)[\s\S]*left\(v_letters, 12\)/);
  });
});

describe("programme IDs", () => {
  it("formats like the database", () => {
    expect(formatProgrammeCode("PED", "PKG", 1)).toBe("PED_PKG001");
    expect(formatProgrammeCode("ORT", "HV", 42)).toBe("ORT_HV042");
    // lpad truncates in SQL; the thousandth programme must not.
    expect(formatProgrammeCode("PED", "PKG", 1234)).toBe("PED_PKG1234");
  });

  it("parses the ID with and without its progress", () => {
    expect(parseProgrammeId("PED_PKG001")).toMatchObject({ code: "PED_PKG001", prefix: "PED", kind: "PKG", number: 1, done: null });
    expect(parseProgrammeId(" ped_hv012-2/6 ")).toMatchObject({ code: "PED_HV012", kind: "HV", done: 2, total: 6 });
    expect(parseProgrammeId("SP0001")).toBeNull();
    expect(parseProgrammeId("PED_XX001")).toBeNull();
    expect(parseProgrammeId(null)).toBeNull();
  });

  it("shows done over bought, never past either end", () => {
    expect(programmeIdWithProgress("PED_PKG001", 0, 6)).toBe("PED_PKG001-0/6");
    expect(programmeIdWithProgress("PED_PKG001", 1, 6)).toBe("PED_PKG001-1/6");
    expect(programmeIdWithProgress("PED_PKG001", 9, 6)).toBe("PED_PKG001-6/6");
    expect(clampProgress(-1, 4)).toEqual({ done: 0, total: 4 });
    expect(programmeProgress(2, 6)).toEqual({ done: 2, total: 6, pending: 4, percent: 33, label: "2 of 6 done" });
    expect(programmeProgress(0, 0).percent).toBe(0);
  });

  it("tags a programme, falling back to the old code", () => {
    expect(programmeTag({ programmeCode: "PED_PKG001", legacyCode: "SP0004", done: 2, total: 6 })).toEqual({
      code: "PED_PKG001",
      display: "PED_PKG001-2/6",
      done: 2,
      total: 6,
      otherCodes: ["SP0004"],
    });
    expect(programmeTag({ programmeCode: null, legacyCode: "HS0002", done: 0, total: 4 })?.display).toBe("HS0002-0/4");
    expect(programmeTag({ programmeCode: null, legacyCode: null, done: 0, total: 4 })).toBeNull();
  });

  it("finds a programme by its ID, its displayed form, or an old code", () => {
    const codes = ["PED_PKG001", "SP0004", "PED_PKG000"];
    expect(programmeQueryMatches("PED_PKG001", codes)).toBe(true);
    expect(programmeQueryMatches("ped_pkg001-0/6", codes)).toBe(true); // count has since moved
    expect(programmeQueryMatches("pkg00", codes)).toBe(true);
    expect(programmeQueryMatches("sp0004", codes)).toBe(true);
    expect(programmeQueryMatches("ORT_PKG001", codes)).toBe(false);
    expect(programmeQueryMatches("", codes)).toBe(false);
  });
});
