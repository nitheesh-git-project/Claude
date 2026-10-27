import { describe, expect, it } from "vitest";
import {
  conditionChips,
  patientConditionGroup,
  patientConditionTitles,
} from "./patientConditionLabels";

describe("condition names in the patient's words", () => {
  it("maps the clinic's names to the four things a patient looks for", () => {
    expect(patientConditionGroup("Post-Surgical Rehabilitation")?.label).toBe("After surgery");
    expect(patientConditionGroup("Spine & Posture Rehabilitation")?.label).toBe("Back, neck & joint pain");
    expect(patientConditionGroup("Musculoskeletal")?.label).toBe("Back, neck & joint pain");
    expect(patientConditionGroup("Neurological Rehabilitation")?.label).toBe("Stroke & Parkinson's");
    expect(patientConditionGroup("Paediatric Physiotherapy")?.label).toBe("Children");
  });

  it("puts surgery ahead of the joint it was done on", () => {
    expect(patientConditionGroup("Post-surgical knee")?.key).toBe("surgery");
  });

  it("leaves a name it does not recognise exactly as the admin typed it", () => {
    expect(patientConditionGroup("General Consultation")).toBeNull();
    expect(patientConditionTitles(["General Consultation"])).toEqual(["General Consultation"]);
  });

  it("never prints two cards under the same name", () => {
    expect(patientConditionTitles(["Knee Rehab", "Spine & Posture Rehabilitation", "Post-Surgical Rehabilitation"])).toEqual([
      "Back, neck & joint pain",
      "Spine & Posture Rehabilitation",
      "After surgery",
    ]);
  });
});

describe("the hero chips", () => {
  const rows = [
    { id: "a", title: "Spine & Posture Rehabilitation" },
    { id: "b", title: "Post-Surgical Rehabilitation" },
    { id: "c", title: "General Consultation" },
  ];

  it("deep-link into booking with the matching condition", () => {
    expect(conditionChips(rows)).toEqual([
      { key: "surgery", label: "After surgery", href: "/book?category=b" },
      { key: "back-joint", label: "Back & joint pain", href: "/book?category=a" },
    ]);
  });

  it("offers no chip the catalogue cannot answer", () => {
    expect(conditionChips([{ id: "c", title: "General Consultation" }])).toEqual([]);
  });
});
