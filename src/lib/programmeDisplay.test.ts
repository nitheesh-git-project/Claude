import { describe, expect, it } from "vitest";
import { programmeDisplay } from "./programmeDisplay";

const condition = { title: "Paediatrics", src: "/photos/paeds.jpg", focalX: 40, focalY: 30 };

describe("programmeDisplay", () => {
  it("names and pictures a recommended course from its condition, not the hidden row", () => {
    expect(
      programmeDisplay({
        kind: "session",
        packageTitle: "Paediatrics - recommended course",
        packageImageUrl: null,
        isCourse: true,
        condition,
      })
    ).toEqual({ title: "Paediatrics programme", cover: { src: "/photos/paeds.jpg", focalX: 40, focalY: 30 } });
  });
  it("names a recommended home-visit course as home visits", () => {
    expect(
      programmeDisplay({ kind: "home_visit", packageTitle: "x", packageImageUrl: null, isCourse: true, condition }).title
    ).toBe("Paediatrics - home visits");
  });
  it("keeps a catalog package's own title and photo", () => {
    expect(
      programmeDisplay({
        kind: "session",
        packageTitle: "Back Rehab 6",
        packageImageUrl: "/photos/back.jpg",
        isCourse: false,
        condition,
      })
    ).toEqual({ title: "Back Rehab 6", cover: { src: "/photos/back.jpg", focalX: null, focalY: null } });
  });
  it("falls back to the condition's photo when a catalog package has none", () => {
    expect(
      programmeDisplay({ kind: "session", packageTitle: "Back Rehab 6", packageImageUrl: null, isCourse: false, condition })
        .cover?.src
    ).toBe("/photos/paeds.jpg");
  });
  it("has no cover when nothing has a photo, and a plain name when nothing is known", () => {
    expect(
      programmeDisplay({ kind: "home_visit", packageTitle: null, packageImageUrl: null, isCourse: false, condition: null })
    ).toEqual({ title: "Home visits", cover: null });
  });
});
