import { describe, expect, it } from "vitest";
import {
  isTypableNumber,
  minAllowsNegative,
  shouldBlockNumericInsert,
  stepAllowsDecimal,
} from "./numericInputGuard";

const whole = { allowsDecimal: false, allowsNegative: false };

describe("shouldBlockNumericInsert", () => {
  it("blocks the characters a number box accepts and nothing wants", () => {
    // The bug this exists for: "e" is scientific notation, so the browser
    // takes it, shows it, and reports the box as empty.
    for (const data of ["e", "E", "+", "a", " ", "1e", "12e5"]) {
      expect(shouldBlockNumericInsert({ data, current: "1", ...whole })).toBe(true);
    }
  });

  it("lets digits through", () => {
    expect(shouldBlockNumericInsert({ data: "5", current: "1", ...whole })).toBe(false);
    expect(shouldBlockNumericInsert({ data: "2024", current: "", ...whole })).toBe(false);
  });

  it("never blocks a deletion", () => {
    expect(shouldBlockNumericInsert({ data: null, current: "12", ...whole })).toBe(false);
    expect(shouldBlockNumericInsert({ data: "", current: "12", ...whole })).toBe(false);
  });

  it("judges the result, not the keystroke", () => {
    const money = { allowsDecimal: true, allowsNegative: false };
    // A decimal point is fine once and meaningless twice.
    expect(shouldBlockNumericInsert({ data: ".", current: "12", ...money })).toBe(false);
    expect(shouldBlockNumericInsert({ data: ".", current: "12.5", ...money })).toBe(true);
    // ...and not at all where the step says whole numbers.
    expect(shouldBlockNumericInsert({ data: ".", current: "12", ...whole })).toBe(true);
  });

  it("allows a minus only where the field can go below zero, and only in front", () => {
    const signed = { allowsDecimal: false, allowsNegative: true };
    expect(shouldBlockNumericInsert({ data: "-", current: "", ...signed })).toBe(false);
    expect(shouldBlockNumericInsert({ data: "-", current: "12", ...signed })).toBe(true);
    expect(shouldBlockNumericInsert({ data: "-", current: "", ...whole })).toBe(true);
  });

  it("judges a replacement against what will remain", () => {
    // Everything selected and retyped: the "." lands in an empty box, not
    // after the digits it is replacing.
    expect(
      shouldBlockNumericInsert({
        data: "7",
        current: "12e",
        selection: { start: 0, end: 3 },
        ...whole,
      })
    ).toBe(false);
  });

  it("blocks a pasted value carrying anything but digits", () => {
    expect(shouldBlockNumericInsert({ data: "1 200", current: "", ...whole })).toBe(true);
    expect(shouldBlockNumericInsert({ data: "₹1200", current: "", ...whole })).toBe(true);
    expect(shouldBlockNumericInsert({ data: "1200", current: "", ...whole })).toBe(false);
  });
});

describe("isTypableNumber", () => {
  it("accepts a number somebody is still in the middle of typing", () => {
    expect(isTypableNumber("", whole)).toBe(true);
    expect(isTypableNumber("1.", { allowsDecimal: true, allowsNegative: false })).toBe(true);
    expect(isTypableNumber("-", { allowsDecimal: false, allowsNegative: true })).toBe(true);
    expect(isTypableNumber(".5", { allowsDecimal: true, allowsNegative: false })).toBe(true);
  });
});

describe("stepAllowsDecimal", () => {
  it("reads the step the way the browser does", () => {
    expect(stepAllowsDecimal("1")).toBe(false);
    expect(stepAllowsDecimal("10")).toBe(false);
    expect(stepAllowsDecimal("0.01")).toBe(true);
    expect(stepAllowsDecimal("any")).toBe(true);
    // No step at all is the browser's default of 1 -- whole numbers.
    expect(stepAllowsDecimal(undefined)).toBe(false);
    expect(stepAllowsDecimal("")).toBe(false);
  });
});

describe("minAllowsNegative", () => {
  it("only rules out a minus where the form said so", () => {
    expect(minAllowsNegative("0")).toBe(false);
    expect(minAllowsNegative("1")).toBe(false);
    expect(minAllowsNegative("-5")).toBe(true);
    // A field with no floor stated has not ruled anything out.
    expect(minAllowsNegative(undefined)).toBe(true);
    expect(minAllowsNegative("")).toBe(true);
  });
});
