import { describe, expect, it } from "vitest";
import { SIX_MINUTE_WALK_EQUATION_NOT_CHOSEN } from "@/lib/clinicalCalculators";
import {
  isChoosableSixMinuteWalkEquation,
  normaliseSixMinuteWalkEquationChoice,
  parseSixMinuteWalkEquationSetting,
  sixMinuteWalkEquationKeyFor,
  sixMinuteWalkEquationOptions,
} from "@/lib/sixMinuteWalkEquation";

describe("the six-minute walk equation setting", () => {
  it("offers only equations that predict, the US one labelled as such", () => {
    const options = sixMinuteWalkEquationOptions();
    expect(options.map((o) => o.key)).toEqual(["enright_sherrill_1998"]);
    expect(options[0].label).toMatch(/US adults/);
    expect(isChoosableSixMinuteWalkEquation(SIX_MINUTE_WALK_EQUATION_NOT_CHOSEN)).toBe(false);
    expect(isChoosableSixMinuteWalkEquation("toString")).toBe(false);
  });

  it("reads null, a removed key and the placeholder as not chosen -- never the US equation", () => {
    for (const raw of [null, undefined, "", "some_removed_equation", SIX_MINUTE_WALK_EQUATION_NOT_CHOSEN, 3]) {
      expect(parseSixMinuteWalkEquationSetting(raw)).toEqual({ key: SIX_MINUTE_WALK_EQUATION_NOT_CHOSEN, chosen: false });
    }
    expect(parseSixMinuteWalkEquationSetting("enright_sherrill_1998")).toEqual({ key: "enright_sherrill_1998", chosen: true });
  });

  it("normalises an admin's choice and refuses an unknown one", () => {
    expect(normaliseSixMinuteWalkEquationChoice("enright_sherrill_1998")).toEqual({ ok: true, value: "enright_sherrill_1998" });
    expect(normaliseSixMinuteWalkEquationChoice(null)).toEqual({ ok: true, value: null });
    expect(normaliseSixMinuteWalkEquationChoice("")).toEqual({ ok: true, value: null });
    expect(normaliseSixMinuteWalkEquationChoice(SIX_MINUTE_WALK_EQUATION_NOT_CHOSEN)).toEqual({ ok: true, value: null });
    expect(normaliseSixMinuteWalkEquationChoice("enright")).toMatchObject({ ok: false });
    expect(normaliseSixMinuteWalkEquationChoice(["enright_sherrill_1998"])).toMatchObject({ ok: false });
  });

  it("an unreadable setting is the placeholder", () => {
    expect(sixMinuteWalkEquationKeyFor({ status: "unreadable" })).toBe(SIX_MINUTE_WALK_EQUATION_NOT_CHOSEN);
    expect(sixMinuteWalkEquationKeyFor({ status: "ok", key: "enright_sherrill_1998", chosen: true })).toBe("enright_sherrill_1998");
  });
});
