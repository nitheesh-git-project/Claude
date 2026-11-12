import { describe, expect, it } from "vitest";
import { steadiCards } from "./steadiCards";
import { latestSteadiTests } from "./geriatricRisk";
import type { MeasurementPoint } from "./outcomeSeries";

function p(measureKey: string, value: number, measuredAt: string, id: string, conditions: Record<string, unknown> = {}): MeasurementPoint {
  return { id, measureKey, value, measuredAt, items: null, conditions, variant: null, side: null } as unknown as MeasurementPoint;
}
const fmt = (iso: string) => iso.slice(0, 10);

describe("the four STEADI test cards", () => {
  const points = [
    p("tug", 14.2, "2026-08-03T05:00:00.000Z", "a"),
    p("tug", 11.1, "2026-10-12T05:00:00.000Z", "b"),
    p("chair_stand_30s", 9, "2026-10-12T05:05:00.000Z", "c"),
    p("four_stage_balance", 2, "2026-10-12T05:10:00.000Z", "d"),
    p("gait_speed_4m", 0.62, "2026-10-12T05:15:00.000Z", "e"),
  ];
  const tests = latestSteadiTests(points, { ageYears: 79, sex: "female" });
  const cards = steadiCards({ tests, points, ageYears: 79, sex: "female", voice: "clinician", formatDate: fmt });

  it("badges each test against its own line and keeps the reading before", () => {
    expect(cards.map((c) => [c.key, c.badge])).toEqual([
      ["tug", "safer"],
      ["chair_stand", "close"], // 9 stands, norm for a woman of 79 is 10
      ["four_stage_balance", "close"], // stage 2, line is stage 3
      ["gait_speed", "not_yet"], // 0.62 is under 85% of 0.8
    ]);
    expect(cards[0].valueText).toBe("11.1 seconds");
    expect(cards[0].wasText).toBe("Was 14.2 seconds on 2026-08-03");
    expect(cards[1].lineText).toBe("Safer range: 10 or more stands (women 75-79)");
    expect(cards[1].wasText).toBeNull();
  });

  it("scores a chair stand with the arms as 0 and says so", () => {
    const pts = [p("chair_stand_30s", 0, "2026-10-12T05:05:00.000Z", "c", { usedArms: true })];
    const t = latestSteadiTests(pts, { ageYears: 79, sex: "female" });
    const [, chair] = steadiCards({ tests: t, points: pts, ageYears: 79, sex: "female", voice: "patient", formatDate: fmt });
    expect(chair.badge).toBe("not_yet");
    expect(chair.valueText).toBe("0 stands (arms used)");
    expect(chair.note).toBe("You used your arms to stand, so this scores 0.");
  });

  it("is recorded but not judged without an age or sex, and not done is not a failure", () => {
    const pts = [p("chair_stand_30s", 12, "2026-10-12T05:05:00.000Z", "c")];
    const t = latestSteadiTests(pts, { ageYears: null, sex: null });
    const c = steadiCards({ tests: t, points: pts, ageYears: null, sex: null, voice: "clinician", formatDate: fmt });
    expect(c[1].badge).toBe("no_norm");
    expect(c[1].lineText).toMatch(/No age-and-sex norm/);
    expect(c[0].badge).toBe("not_done");
    expect(c[0].valueText).toBeNull();
  });
});
