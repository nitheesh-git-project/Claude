import { describe, expect, it } from "vitest";
import { activeSectionId } from "./sectionNavActive";

const view = (scrollY: number, scrollHeight = 5000, innerHeight = 720) => ({
  scrollY,
  innerHeight,
  scrollHeight,
});

describe("activeSectionId", () => {
  const sections = [
    { id: "a", top: -900, bottom: -100 },
    { id: "b", top: -100, bottom: 600 },
    { id: "c", top: 600, bottom: 1400 },
  ];

  it("lights nothing at the very top, even with a section under the centre", () => {
    expect(activeSectionId(sections, view(0))).toBeNull();
  });

  it("lights the section crossing the vertical centre", () => {
    expect(activeSectionId(sections, view(800))).toBe("b");
  });

  it("lets the inner of two nested sections win", () => {
    const nested = [
      { id: "outer", top: -500, bottom: 1500 },
      { id: "inner", top: 200, bottom: 500 },
    ];
    expect(activeSectionId(nested, view(400))).toBe("inner");
  });

  it("lights nothing mid-page when the centre sits between sections", () => {
    const gap = [
      { id: "a", top: -400, bottom: 200 },
      { id: "b", top: 500, bottom: 1200 },
    ];
    expect(activeSectionId(gap, view(1000))).toBeNull();
  });

  it("at the bottom, a tall footer under the centre still leaves the last section lit", () => {
    // Scrolled to the end: the last section's tail is on screen, the footer
    // (568px of a 720px window) holds the centre.
    const atEnd = [
      { id: "explore", top: -1400, bottom: -600 },
      { id: "get-started", top: -415, bottom: 190 },
    ];
    expect(activeSectionId(atEnd, view(4280, 5000))).toBe("get-started");
  });

  it("at the bottom, a section scrolled wholly off the top is not lit", () => {
    const gone = [{ id: "get-started", top: -700, bottom: -20 }];
    expect(activeSectionId(gone, view(4280, 5000))).toBeNull();
  });

  it("tolerates a sub-pixel shortfall at the bottom", () => {
    const atEnd = [{ id: "last", top: -300, bottom: 100 }];
    expect(activeSectionId(atEnd, view(4279.5, 5000))).toBe("last");
    expect(activeSectionId(atEnd, view(4200, 5000))).toBeNull();
  });
});
