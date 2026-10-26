import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ONBOARDING_GUIDE_SECTION,
  TUTORIAL_SCENES,
  chapterForSection,
  tutorialFor,
  tutorialMayAutoStart,
  tutorialRoleForPath,
  tutorialSectionForFeedItem,
  tutorialStepForFeedItem,
  tutorialSectionForPath,
  tutorialStepCount,
  type TutorialRole,
} from "./tutorial";

const ROLES: TutorialRole[] = ["patient", "therapist", "hospital"];

/** Every dashboard route segment a role has, read from the app directory,
 *  so a page added later without a chapter fails here instead of shipping
 *  an (i) that opens the wrong thing. */
function routeSections(role: TutorialRole): string[] {
  const dir = join(__dirname, "..", "app", role, "dashboard");
  return [
    "",
    ...readdirSync(dir).filter(
      (name) => statSync(join(dir, name)).isDirectory() && !name.startsWith("(") && !name.startsWith("[")
    ),
  ];
}

describe("tutorial content", () => {
  it.each(ROLES)("%s: every dashboard page has a chapter its (i) opens", (role) => {
    for (const section of routeSections(role)) {
      expect(chapterForSection(role, section), `${role} section "${section}"`).not.toBeNull();
    }
  });

  it.each(ROLES)("%s: no section is claimed by two chapters", (role) => {
    const seen = new Map<string, string>();
    for (const chapter of tutorialFor(role)) {
      for (const section of chapter.sections) {
        expect(seen.get(section), `${section} in ${chapter.id}`).toBeUndefined();
        seen.set(section, chapter.id);
      }
    }
  });

  it.each(ROLES)("%s: opens on a welcome and ends on the finish step", (role) => {
    const chapters = tutorialFor(role);
    expect(chapters[0].steps[0].scene).toBe("welcome");
    const last = chapters[chapters.length - 1];
    expect(last.steps[last.steps.length - 1].scene).toBe("finish");
  });

  it.each(ROLES)("%s: ids are unique and every step plays a known scene", (role) => {
    const chapterIds = new Set<string>();
    for (const chapter of tutorialFor(role)) {
      expect(chapterIds.has(chapter.id)).toBe(false);
      chapterIds.add(chapter.id);
      const stepIds = new Set<string>();
      for (const step of chapter.steps) {
        expect(stepIds.has(step.id)).toBe(false);
        stepIds.add(step.id);
        expect(TUTORIAL_SCENES).toContain(step.scene);
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.body.length).toBeGreaterThan(0);
      }
    }
  });

  it("explains the health profile to both the patient and the therapist", () => {
    expect(chapterForSection("patient", "health-profile")!.steps.length).toBeGreaterThanOrEqual(3);
    expect(chapterForSection("therapist", "health-profile")!.steps.length).toBeGreaterThanOrEqual(4);
  });

  it("walks the patient through a session's states, in the screens' own words", () => {
    const journey = chapterForSection("patient", "sessions")!.steps.find((s) => s.id === "journey")!;
    const text = journey.points!.join(" ");
    expect(text).toContain("Waiting for a therapist");
    expect(text).toContain("Tap to Join");
  });

  it("counts steps", () => {
    expect(tutorialStepCount(tutorialFor("patient"))).toBeGreaterThan(10);
  });
});

describe("paths", () => {
  it("finds the role and section of a dashboard path", () => {
    expect(tutorialRoleForPath("/patient/dashboard")).toBe("patient");
    expect(tutorialSectionForPath("/patient/dashboard")).toBe("");
    expect(tutorialSectionForPath("/therapist/dashboard/health-profile/abc")).toBe("health-profile");
    expect(tutorialSectionForPath("/hospital/dashboard/referrals")).toBe("referrals");
  });

  it("is null outside the three dashboards", () => {
    expect(tutorialRoleForPath("/admin/dashboard")).toBeNull();
    expect(tutorialRoleForPath("/patient/dashboardx")).toBeNull();
    expect(tutorialSectionForPath("/book")).toBeNull();
  });
});

describe("feed items", () => {
  it("maps each kind of Home update to the chapter that explains it", () => {
    expect(chapterForSection("patient", tutorialSectionForFeedItem("appt-123")!)!.id).toBe("patient-booking");
    expect(chapterForSection("patient", tutorialSectionForFeedItem("cond-9")!)!.id).toBe("patient-health-profile");
    expect(chapterForSection("patient", tutorialSectionForFeedItem("refund-1")!)!.id).toBe("patient-payments");
    expect(chapterForSection("patient", tutorialSectionForFeedItem("unscheduled-all")!)!.id).toBe("patient-programmes");
    expect(chapterForSection("therapist", tutorialSectionForFeedItem("onboard-1")!)!.id).toBe("therapist-health-profile");
    expect(chapterForSection("therapist", tutorialSectionForFeedItem("care-plan-decision-1")!)!.id).toBe("therapist-health-profile");
    expect(chapterForSection("therapist", tutorialSectionForFeedItem("payout-1")!)!.id).toBe("therapist-earnings");
    expect(chapterForSection("therapist", tutorialSectionForFeedItem("appt-done-1")!)!.id).toBe("therapist-sessions");
    expect(chapterForSection("hospital", tutorialSectionForFeedItem("ref-1")!)!.id).toBe("hospital-referrals");
    expect(tutorialSectionForFeedItem("act-1")).toBeNull();
    expect(tutorialSectionForFeedItem("queue-approvals")).toBeNull();
  });
});

describe("feed item start steps", () => {
  it("opens on the step about that update, and every named step exists", () => {
    expect(tutorialStepForFeedItem("pay-1")).toBe("unpaid");
    expect(tutorialStepForFeedItem("appt-1")).toBe("journey");
    expect(tutorialStepForFeedItem("onboard-1")).toBe("triage");
    expect(tutorialStepForFeedItem("refund-1")).toBeUndefined();
    for (const [role, id] of [
      ["patient", "pay-1"],
      ["patient", "appt-1"],
      ["therapist", "onboard-1"],
      ["therapist", "grant-1"],
      ["therapist", "care-plan-decision-1"],
    ] as const) {
      const chapter = chapterForSection(role, tutorialSectionForFeedItem(id)!)!;
      expect(chapter.steps.map((s) => s.id), `${role} ${id}`).toContain(tutorialStepForFeedItem(id));
    }
  });
});

describe("the onboarding guide", () => {
  it("opens from its own section for a therapist, and only a therapist", () => {
    const guide = chapterForSection("therapist", ONBOARDING_GUIDE_SECTION);
    expect(guide?.title).toBe("How onboarding works");
    expect(chapterForSection("patient", ONBOARDING_GUIDE_SECTION)).toBeNull();
    expect(chapterForSection("hospital", ONBOARDING_GUIDE_SECTION)).toBeNull();
  });

  it("is not part of the first-visit tour", () => {
    const ids = tutorialFor("therapist").map((c) => c.id);
    expect(ids).not.toContain(chapterForSection("therapist", ONBOARDING_GUIDE_SECTION)!.id);
  });

  it("walks every condition type, and every step plays a known scene", () => {
    const guide = chapterForSection("therapist", ONBOARDING_GUIDE_SECTION)!;
    const steps = guide.steps.map((s) => s.id);
    for (const id of ["triage", "ortho", "neuro", "paeds", "save"]) expect(steps).toContain(id);
    for (const step of guide.steps) expect(TUTORIAL_SCENES).toContain(step.scene);
  });
});

describe("the first-visit tour and the guided assessment", () => {
  it("never opens by itself over the live screens, and does everywhere else", () => {
    expect(tutorialMayAutoStart("/patient/dashboard/session")).toBe(false);
    expect(tutorialMayAutoStart("/therapist/dashboard/assessment/abc")).toBe(false);
    expect(tutorialMayAutoStart("/patient/dashboard")).toBe(true);
    expect(tutorialMayAutoStart("/therapist/dashboard/sessions")).toBe(true);
  });
});
