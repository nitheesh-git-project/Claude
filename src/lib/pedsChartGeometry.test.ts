import { describe, expect, it } from "vitest";
import { chartAxisMax, chartTicks, PEDS_CHART_LEGEND, pedsChartGeometry, pedsChartUnplacedReason } from "@/lib/pedsChartGeometry";
import { pedsMilestoneWindows } from "@/lib/pedsMilestoneWindows";
import type { PedsFindings } from "@/lib/pedsExam";

const CHILD = { birthDate: "2025-06-01", weeksAtBirth: 30, todayIso: "2026-10-20" }; // 14.3 months corrected

const EXAM: PedsFindings = {
  milestones: {
    sitting_without_support: { status: "achieved", firstSeenOn: "2026-01-10", source: "seen" }, // 5 corrected
    hands_knees_crawling: { status: "achieved", firstSeenOn: "2026-03-02", source: "reported", approximate: true },
    standing_with_help: { status: "achieved", firstSeenOn: "2026-08-20", source: "reported" },
    walking_with_help: { status: "emerging", source: "seen" },
    standing_alone: { status: "not_yet" },
  },
};
const row = (g: ReturnType<typeof pedsChartGeometry>, key: string) => g.rows.find((r) => r.key === key)!;

describe("the axis", () => {
  it("is 24 months for a young child and grows by sixes, to 48", () => {
    const young = pedsMilestoneWindows({ findings: EXAM, ...CHILD });
    expect(chartAxisMax(young)).toBe(24);
    const three = pedsMilestoneWindows({ findings: null, birthDate: "2023-09-01", weeksAtBirth: null, todayIso: "2026-10-20" }); // 37 months
    expect(chartAxisMax(three)).toBe(42);
    const ten = pedsMilestoneWindows({ findings: null, birthDate: "2016-09-01", weeksAtBirth: null, todayIso: "2026-10-20" });
    expect(chartAxisMax(ten)).toBe(48);
  });

  it("has a tick every 3 months to 24 and every 6 beyond", () => {
    expect(chartTicks(24).map((t) => t.months)).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24]);
    expect(chartTicks(24)[8].xPct).toBe(100);
    expect(chartTicks(48).map((t) => t.months)).toEqual([0, 6, 12, 18, 24, 30, 36, 42, 48]);
  });
});

describe("pedsChartGeometry", () => {
  const view = pedsMilestoneWindows({ findings: EXAM, ...CHILD });
  const g = pedsChartGeometry(view, "clinician");

  it("draws each bar from its window, as a share of the axis", () => {
    const walking = row(g, "walking_alone"); // 8.2 - 17.6 of 24
    expect(walking.barLeftPct).toBeCloseTo(34.17, 1);
    expect(walking.barWidthPct).toBeCloseTo(39.17, 1);
  });

  it("places the today line at the age the windows are read against", () => {
    expect(g.placed).toBe(true);
    expect(g.todayPct).toBeCloseTo((14.3 / 24) * 100, 0);
    expect(g.todayLabel).toBe("Today, 14.3 months corrected");
    expect(g.todayOffAxis).toBe(false);
  });

  it("encodes seen as a solid dot, told as hollow and approximate as a dashed ring", () => {
    expect(row(g, "sitting_without_support").marker).toMatchObject({ shape: "dot", fill: "solid", dashed: false });
    expect(row(g, "hands_knees_crawling").marker).toMatchObject({ shape: "dot", fill: "hollow", dashed: true });
    expect(row(g, "standing_with_help").marker).toMatchObject({ shape: "dot", fill: "hollow", dashed: false });
  });

  it("shows a skill not there yet as a diamond at today's age, and a skill nobody checked as nothing", () => {
    expect(row(g, "walking_with_help").marker).toMatchObject({ shape: "diamond", fill: "half", xPct: g.todayPct });
    expect(row(g, "standing_alone").marker).toMatchObject({ shape: "diamond", fill: "hollow", xPct: g.todayPct });
    expect(row(g, "walking_alone").marker).toBeNull();
    expect(row(g, "walking_alone").statusText).toBe("Not assessed");
    expect(pedsChartGeometry(view, "patient").rows[5].statusText).toBe("Not checked yet");
  });

  it("gives every row a full sentence with 'about' for a rough date", () => {
    expect(row(g, "hands_knees_crawling").summary).toMatch(/Reached at about 6\.\d months corrected/);
    expect(row(g, "hands_knees_crawling").summary).toMatch(/Date approximate: about /);
    expect(row(g, "sitting_without_support").summary).toMatch(/First seen /);
    expect(row(g, "sitting_without_support").summary).toMatch(/Most children: 3\.8 to 9\.2 months\./);
    expect(row(g, "hands_knees_crawling").whenText).toMatch(/^About /);
    expect(row(g, "sitting_without_support").whenText).not.toMatch(/About/);
  });

  it("speaks to a parent in the parent's words", () => {
    const p = pedsChartGeometry(view, "patient");
    expect(row(p, "standing_with_help").whoText).toBe("You told us");
    expect(row(p, "sitting_without_support").whoText).toBe("Seen in a session");
    expect(row(p, "walking_with_help").statusText).toBe("Starting to come");
    expect(JSON.stringify(p)).not.toMatch(/referral|doctor's review|triage|case/i);
  });

  it("places nothing without a usable age, and says why in the reader's voice", () => {
    for (const birthDate of [null, "2001-01-01", "2027-01-01"]) {
      const v = pedsMilestoneWindows({ findings: EXAM, birthDate, weeksAtBirth: null, todayIso: "2026-10-20" });
      const u = pedsChartGeometry(v, "clinician");
      expect(u.placed).toBe(false);
      expect(u.todayPct).toBeNull();
      expect(u.rows.every((r) => r.marker === null)).toBe(true);
    }
    const none = pedsMilestoneWindows({ findings: EXAM, birthDate: null, weeksAtBirth: null, todayIso: "2026-10-20" }).age;
    const adult = pedsMilestoneWindows({ findings: EXAM, birthDate: "2001-01-01", weeksAtBirth: null, todayIso: "2026-10-20" }).age;
    expect(pedsChartUnplacedReason(none, "clinician")).toMatch(/No date of birth/);
    expect(pedsChartUnplacedReason(adult, "clinician")).toMatch(/not plausible/);
    expect(pedsChartUnplacedReason(adult, "patient")).toBe("We're checking your child's date of birth, so the chart is not shown yet.");
    expect(pedsChartUnplacedReason(view.age, "patient")).toBeNull();
  });

  it("pins today to the right edge for a child older than the axis", () => {
    const v = pedsMilestoneWindows({ findings: null, birthDate: "2016-09-01", weeksAtBirth: null, todayIso: "2026-10-20" });
    const old = pedsChartGeometry(v, "clinician");
    expect(old.todayOffAxis).toBe(true);
    expect(old.todayPct).toBe(100);
  });

  it("has a legend entry for every encoding", () => {
    expect(PEDS_CHART_LEGEND.map((l) => l.id)).toEqual(["bar", "seen", "told", "about", "emerging", "not_yet", "today"]);
  });
});
