import { describe, it, expect } from "vitest";
import { defaultExamSide, examSideDiffers, examSideMismatchMessage, reportedSides } from "./examSide";

const rightKnee = [{ region: "knee", side: "right" }];

describe("exam side", () => {
  it("opens on the side the patient marked, never a guessed left", () => {
    expect(defaultExamSide("knee", rightKnee)).toBe("right");
    expect(defaultExamSide("knee", [])).toBeNull();
    expect(defaultExamSide("hip", rightKnee)).toBeNull();
  });

  it("leaves it to the therapist when both sides were marked", () => {
    const both = [...rightKnee, { region: "knee", side: "left" }];
    expect(reportedSides("knee", both)).toEqual(["left", "right"]);
    expect(defaultExamSide("knee", both)).toBeNull();
  });

  it("keeps a side the caller chose", () => {
    expect(defaultExamSide("knee", rightKnee, "left")).toBe("left");
  });

  it("flags an exam on a side the patient did not report", () => {
    expect(examSideDiffers("knee", "left", rightKnee)).toBe(true);
    expect(examSideDiffers("knee", "right", rightKnee)).toBe(false);
    expect(examSideDiffers("knee", "left", [])).toBe(false);
    expect(examSideDiffers("knee", null, rightKnee)).toBe(false);
  });

  it("says which side each is", () => {
    expect(examSideMismatchMessage("left", ["right"])).toContain("reported the right side, and this exam is on the left");
  });
});
