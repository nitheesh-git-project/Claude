import { describe, expect, it } from "vitest";
import { initialLanguage, stepOneBlocker } from "./bookingStepOne";

const answered = { serviceChosen: true, dateKey: "2026-10-28", hour: 18, language: "English", languageCount: 2 };

describe("stepOneBlocker", () => {
  it("is null when everything is answered", () => {
    expect(stepOneBlocker(answered)).toBeNull();
  });

  it("names the time while the hour is unselected, even with the date preselected", () => {
    expect(stepOneBlocker({ ...answered, hour: "" })).toBe("Pick a time to continue");
  });

  it("treats hour 0 as an answer, not as nothing", () => {
    expect(stepOneBlocker({ ...answered, hour: 0 })).toBeNull();
  });

  it("asks in screen order: service, date, time, language", () => {
    const none = { serviceChosen: false, dateKey: "", hour: "" as const, language: "", languageCount: 3 };
    expect(stepOneBlocker(none)).toMatch(/help with/);
    expect(stepOneBlocker({ ...none, serviceChosen: true })).toBe("Pick a date to continue");
    expect(stepOneBlocker({ ...none, serviceChosen: true, dateKey: "2026-10-28" })).toBe(
      "Pick a time to continue"
    );
    expect(stepOneBlocker({ ...none, serviceChosen: true, dateKey: "2026-10-28", hour: 9 })).toBe(
      "Pick a language to continue"
    );
  });

  it("never asks for a language when there is nothing to choose between", () => {
    expect(stepOneBlocker({ ...answered, language: "", languageCount: 1 })).toBeNull();
  });
});

describe("initialLanguage", () => {
  it("preselects only a sole language", () => {
    expect(initialLanguage(["English"])).toBe("English");
    expect(initialLanguage(["English", "Hindi"])).toBe("");
    expect(initialLanguage([])).toBe("");
  });
});
