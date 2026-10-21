import { describe, expect, it } from "vitest";
import { achievedAgeLabel, pedsMilestoneWindows, PEDS_WALKING_REFERRAL_MONTHS } from "@/lib/pedsMilestoneWindows";
import type { PedsFindings } from "@/lib/pedsExam";

// Born at 30 weeks on 1 Jun 2025; on 20 Oct 2026 she is 16.6 months old and
// 14.3 months corrected.
const CHILD = { birthDate: "2025-06-01", weeksAtBirth: 30, todayIso: "2026-10-20" };

const EXAM: PedsFindings = {
  milestones: {
    sitting_without_support: { status: "achieved", firstSeenOn: "2026-01-10", source: "seen" },
    hands_knees_crawling: { status: "achieved", firstSeenOn: "2026-03-02", source: "reported" },
    standing_with_help: { status: "achieved", firstSeenOn: "2026-08-20", source: "seen" },
    walking_with_help: { status: "emerging", source: "seen" },
    standing_alone: { status: "not_yet" },
  },
};

const row = (view: ReturnType<typeof pedsMilestoneWindows>, key: string) => view.rows.find((r) => r.key === key)!;

describe("pedsMilestoneWindows", () => {
  const view = pedsMilestoneWindows({ findings: EXAM, ...CHILD });

  it("lists all six milestones with their windows and definitions", () => {
    expect(view.rows.map((r) => r.key)).toEqual([
      "sitting_without_support",
      "hands_knees_crawling",
      "standing_with_help",
      "walking_with_help",
      "standing_alone",
      "walking_alone",
    ]);
    expect(row(view, "walking_alone").windowMonths).toEqual([8.2, 17.6]);
    expect(row(view, "walking_alone").reachedWhen).toMatch(/five steps/);
    expect(view.verificationNote).toMatch(/to be verified by a senior physiotherapist/);
  });

  it("places an achieved milestone by the corrected age on the day it was first seen", () => {
    const sitting = row(view, "sitting_without_support");
    expect(sitting).toMatchObject({
      status: "achieved",
      achievedAgeMonths: 5,
      achievedAgeBasis: "corrected",
      band: "within_window",
      earlierThanMost: false,
      clinicianLabel: "Within the WHO window",
      patientLabel: "Came at a usual age",
      provenanceLabel: "Seen in a session",
    });
    expect(achievedAgeLabel(sitting)).toBe("5 months corrected");
    expect(row(view, "hands_knees_crawling")).toMatchObject({ achievedAgeMonths: 6.7, band: "within_window", provenanceLabel: "Parent reports" });
  });

  it("calls a milestone that came after its window later than most, gently for the parent", () => {
    expect(row(view, "standing_with_help")).toMatchObject({
      achievedAgeMonths: 12.3,
      band: "later_than_most",
      clinicianLabel: "After the WHO window (later than most)",
      patientLabel: "Came a little later than most children",
    });
  });

  it("places a skill not there yet by the child's age today", () => {
    expect(row(view, "walking_with_help")).toMatchObject({
      status: "emerging",
      band: "not_yet_past_window",
      clinicianLabel: "Emerging. Not yet, past the WHO window",
      patientLabel: "Starting to come. Still working on this one",
      achievedAgeMonths: null,
    });
    expect(row(view, "standing_alone")).toMatchObject({
      status: "not_yet",
      band: "not_yet_within_window",
      clinicianLabel: "Not yet, within the WHO window",
      patientLabel: "Many children are still learning this at this age",
      provenanceLabel: null,
    });
  });

  it("keeps not assessed apart from not yet", () => {
    expect(row(view, "walking_alone")).toMatchObject({
      status: "not_assessed",
      band: "not_assessed",
      clinicianLabel: "Not assessed",
      patientLabel: "Not checked yet",
    });
    expect(view.referral).toBeNull();
  });

  it("marks a skill reached before its window as earlier than most, still within it", () => {
    const early = pedsMilestoneWindows({
      findings: { milestones: { sitting_without_support: { status: "achieved", firstSeenOn: "2025-11-10", source: "seen" } } },
      ...CHILD,
    });
    expect(row(early, "sitting_without_support")).toMatchObject({
      band: "within_window",
      earlierThanMost: true,
      clinicianLabel: "Before the WHO window (earlier than most)",
      patientLabel: "Came at a usual age",
    });
  });

  it("says a skill is not expected yet for a child younger than its window", () => {
    const young = pedsMilestoneWindows({
      findings: { milestones: { walking_alone: { status: "not_yet" } } },
      birthDate: "2026-04-20",
      weeksAtBirth: 39,
      todayIso: "2026-10-20",
    });
    expect(row(young, "walking_alone")).toMatchObject({ band: "not_yet_before_window", patientLabel: "Most children learn this a little later" });
  });

  it("uses chronological age once the child is past two, or when weeks at birth are not known", () => {
    const later = pedsMilestoneWindows({
      findings: { milestones: { walking_alone: { status: "achieved", firstSeenOn: "2026-10-01", source: "seen" } } },
      birthDate: "2024-08-01",
      weeksAtBirth: 30,
      todayIso: "2026-10-20",
    });
    expect(row(later, "walking_alone")).toMatchObject({ achievedAgeBasis: "chronological", band: "later_than_most" });
    expect(achievedAgeLabel(row(later, "walking_alone"))).toBe("2 years 2 months");
    const noWeeks = pedsMilestoneWindows({ findings: EXAM, ...CHILD, weeksAtBirth: null });
    expect(row(noWeeks, "sitting_without_support")).toMatchObject({ achievedAgeMonths: 7.3, achievedAgeBasis: "chronological" });
  });

  it("places nothing without a usable date of birth", () => {
    const unknown = pedsMilestoneWindows({ findings: EXAM, birthDate: null, weeksAtBirth: 30, todayIso: "2026-10-20" });
    expect(unknown.age).toEqual({ status: "no_birth_date" });
    expect(row(unknown, "sitting_without_support")).toMatchObject({
      band: "age_unknown",
      achievedAgeMonths: null,
      clinicianLabel: "Achieved; age not on file",
      patientLabel: "We need the date of birth to show this",
    });
    expect(row(unknown, "standing_alone")).toMatchObject({ band: "age_unknown", clinicianLabel: "Not yet; age not on file" });
    expect(row(unknown, "walking_alone").band).toBe("not_assessed");
    expect(achievedAgeLabel(row(unknown, "sitting_without_support"))).toBeNull();
  });

  it("with no examination, lists every milestone as not checked yet", () => {
    const none = pedsMilestoneWindows({ findings: null, ...CHILD });
    expect(none.rows.every((r) => r.band === "not_assessed")).toBe(true);
    expect(none.referral).toBeNull();
  });
});

describe("the walking referral prompt", () => {
  // Born at 30 weeks on 1 Jan 2025: 19.3 months corrected on 20 Oct 2026.
  const older = { birthDate: "2025-01-01", weeksAtBirth: 30, todayIso: "2026-10-20" };

  it("prompts clinicians when a child is not walking alone by 18 months corrected", () => {
    expect(PEDS_WALKING_REFERRAL_MONTHS).toBe(18);
    for (const status of ["not_yet", "emerging"] as const) {
      const view = pedsMilestoneWindows({
        findings: { milestones: { walking_alone: status === "not_yet" ? { status } : { status, source: "seen" } } },
        ...older,
      });
      expect(view.referral?.clinicianText).toMatch(/Not walking alone at 19\.3 months corrected/);
      expect(view.referral?.clinicianText).toMatch(/doctor's review/);
      expect(view.referral?.clinicianText).toMatch(/to be verified by a senior physiotherapist/);
    }
  });

  it("does not prompt on corrected age under 18 months, even when chronological age is over it", () => {
    // 16.6 months old, 14.3 corrected.
    const view = pedsMilestoneWindows({ findings: { milestones: { walking_alone: { status: "not_yet" } } }, ...CHILD });
    expect(view.referral).toBeNull();
  });

  it("does not prompt once walking alone is achieved, or when it was not assessed", () => {
    const walking = pedsMilestoneWindows({
      findings: { milestones: { walking_alone: { status: "achieved", firstSeenOn: "2026-10-01", source: "seen" } } },
      ...older,
    });
    expect(walking.referral).toBeNull();
    expect(pedsMilestoneWindows({ findings: { milestones: {} }, ...older }).referral).toBeNull();
  });

  it("never prompts without an age", () => {
    const view = pedsMilestoneWindows({
      findings: { milestones: { walking_alone: { status: "not_yet" } } },
      birthDate: null,
      weeksAtBirth: null,
      todayIso: "2026-10-20",
    });
    expect(view.referral).toBeNull();
  });
});

describe("walking alone never assessed", () => {
  const older = { birthDate: "2025-01-01", weeksAtBirth: 30, todayIso: "2026-10-20" }; // 19.3 months corrected

  it("tells clinicians it is not assessed yet - a gap, not a referral prompt", () => {
    const view = pedsMilestoneWindows({ findings: { milestones: { standing_alone: { status: "not_yet" } } }, ...older });
    expect(view.walkingNotAssessed?.clinicianText).toBe("Walking alone not assessed yet.");
    expect(view.referral).toBeNull();
    // With no exam at all the same gap is true.
    expect(pedsMilestoneWindows({ findings: null, ...older }).walkingNotAssessed).not.toBeNull();
  });

  it("is absent under 18 months corrected, once it is assessed, and with no age", () => {
    expect(pedsMilestoneWindows({ findings: { milestones: {} }, ...CHILD }).walkingNotAssessed).toBeNull();
    expect(
      pedsMilestoneWindows({ findings: { milestones: { walking_alone: { status: "not_yet" } } }, ...older }).walkingNotAssessed
    ).toBeNull();
    expect(pedsMilestoneWindows({ findings: { milestones: {} }, birthDate: null, weeksAtBirth: null, todayIso: "2026-10-20" }).walkingNotAssessed).toBeNull();
  });
});

describe("a rough date on a milestone row", () => {
  it("is carried to the row, only for a parent's report", () => {
    const view = pedsMilestoneWindows({
      findings: {
        milestones: {
          sitting_without_support: { status: "achieved", firstSeenOn: "2026-01-01", source: "reported", approximate: true },
          hands_knees_crawling: { status: "achieved", firstSeenOn: "2026-03-02", source: "reported" },
          standing_with_help: { status: "achieved", firstSeenOn: "2026-08-20", source: "seen" },
        },
      },
      ...CHILD,
    });
    expect(row(view, "sitting_without_support").approximate).toBe(true);
    expect(row(view, "hands_knees_crawling").approximate).toBe(false);
    expect(row(view, "standing_with_help").approximate).toBe(false);
    expect(row(view, "walking_alone").approximate).toBe(false);
  });
});
