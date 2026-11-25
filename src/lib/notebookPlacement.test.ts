import { describe, expect, it } from "vitest";
import {
  NOTEBOOK_CLEARANCE_PX,
  nextNotebookHintValue,
  placeNotebook,
  shouldShowNotebookHint,
  type Box,
} from "./notebookPlacement";

const VH = 800;
// A 44 x 52 button resting 16px above the bottom-right corner of a 390-wide screen.
const button: Box = { top: VH - 16 - 52, bottom: VH - 16, left: 330, right: 374 };

describe("placeNotebook", () => {
  it("stays put with nothing in the way", () => {
    expect(placeNotebook(button, [], VH)).toEqual({ lift: 0, tucked: false });
  });

  it("lifts above a pinned bar that spans its column", () => {
    const payBar: Box = { top: VH - 72, bottom: VH, left: 0, right: 390 };
    const p = placeNotebook(button, [payBar], VH);
    expect(p.tucked).toBe(false);
    expect(button.bottom - p.lift).toBe(payBar.top - NOTEBOOK_CLEARANCE_PX);
  });

  it("ignores things in another column", () => {
    const leftCard: Box = { top: VH - 100, bottom: VH - 10, left: 10, right: 200 };
    expect(placeNotebook(button, [leftCard], VH).lift).toBe(0);
  });

  it("ignores content higher up the page", () => {
    const above: Box = { top: 100, bottom: 300, left: 300, right: 390 };
    expect(placeNotebook(button, [above], VH).lift).toBe(0);
  });

  it("takes the tallest of several obstacles", () => {
    const toast: Box = { top: VH - 120, bottom: VH - 60, left: 200, right: 390 };
    const bar: Box = { top: VH - 70, bottom: VH, left: 0, right: 390 };
    const p = placeNotebook(button, [bar, toast], VH);
    expect(button.bottom - p.lift).toBe(toast.top - NOTEBOOK_CLEARANCE_PX);
  });

  it("tucks into the edge instead of climbing half the screen", () => {
    const cookieCard: Box = { top: VH - 420, bottom: VH - 12, left: 12, right: 378 };
    expect(placeNotebook(button, [cookieCard], VH)).toEqual({ lift: 0, tucked: true });
  });

  it("ignores hidden and off-screen elements", () => {
    const empty: Box = { top: 700, bottom: 700, left: 0, right: 390 };
    const below: Box = { top: VH + 10, bottom: VH + 60, left: 0, right: 390 };
    expect(placeNotebook(button, [empty, below], VH).lift).toBe(0);
  });
});

describe("notebook hint memory", () => {
  it("shows on the first visits, then stops", () => {
    let stored: string | null = null;
    let shows = 0;
    for (let i = 0; i < 6; i++) {
      if (shouldShowNotebookHint(stored)) {
        shows++;
        stored = nextNotebookHintValue(stored);
      }
    }
    expect(shows).toBe(3);
  });

  it("never shows again once the notebook was opened", () => {
    expect(shouldShowNotebookHint("opened")).toBe(false);
    expect(nextNotebookHintValue("opened")).toBe("opened");
  });

  it("treats junk in storage as a fresh start", () => {
    expect(shouldShowNotebookHint("abc")).toBe(true);
    expect(nextNotebookHintValue("abc")).toBe("1");
  });
});
