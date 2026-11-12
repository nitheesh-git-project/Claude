import { describe, expect, it } from "vitest";
import { mirrorPoint, rotatePointClockwise } from "@/lib/angleMeasure";
import { applyAffine, displaySize, fitView, flipAcross, frameToPicture, IDENTITY, pictureToFrame, turnClockwise, zoomView } from "@/lib/angleView";

const SIZE = { width: 1000, height: 600 };

describe("turn and flip", () => {
  it("a quarter turn agrees with rotatePointClockwise", () => {
    const m = turnClockwise(IDENTITY, SIZE);
    for (const p of [{ x: 0, y: 0 }, { x: 1000, y: 600 }, { x: 250, y: 400 }]) expect(applyAffine(m, p)).toEqual(rotatePointClockwise(p, SIZE));
    expect(displaySize(m, SIZE)).toEqual({ width: 600, height: 1000 });
  });
  it("four turns come home", () => {
    let m = IDENTITY;
    for (let i = 0; i < 4; i++) m = turnClockwise(m, SIZE);
    expect(applyAffine(m, { x: 123, y: 45 })).toEqual({ x: 123, y: 45 });
  });
  it("a flip agrees with mirrorPoint and a second flip undoes it", () => {
    const m = flipAcross(IDENTITY, SIZE);
    expect(applyAffine(m, { x: 100, y: 50 })).toEqual(mirrorPoint({ x: 100, y: 50 }, SIZE));
    expect(applyAffine(flipAcross(m, SIZE), { x: 100, y: 50 })).toEqual({ x: 100, y: 50 });
  });
  it("turning after a flip keeps the corners inside the displayed picture", () => {
    const m = turnClockwise(flipAcross(IDENTITY, SIZE), SIZE);
    const d = displaySize(m, SIZE);
    for (const p of [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 600 }, { x: 1000, y: 600 }]) {
      const q = applyAffine(m, p);
      expect(q.x).toBeGreaterThanOrEqual(-1e-9);
      expect(q.y).toBeGreaterThanOrEqual(-1e-9);
      expect(q.x).toBeLessThanOrEqual(d.width + 1e-9);
      expect(q.y).toBeLessThanOrEqual(d.height + 1e-9);
    }
  });
});

describe("the frame", () => {
  const frame = { width: 400, height: 300 };
  it("fits and centres the picture", () => {
    const v = fitView(SIZE, frame);
    expect(v.scale).toBeCloseTo(0.4, 9);
    expect(v.x).toBeCloseTo(0, 9);
    expect(v.y).toBeCloseTo(30, 9);
  });
  it("round-trips a point", () => {
    const v = fitView(SIZE, frame);
    const p = { x: 321, y: 123 };
    const back = frameToPicture(v, pictureToFrame(v, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });
  it("zooms about a point and stays within its limits", () => {
    const fit = fitView(SIZE, frame);
    const at = { x: 200, y: 150 };
    const before = frameToPicture(fit, at);
    const z = zoomView(fit, 2, at, fit);
    expect(z.scale).toBeCloseTo(fit.scale * 2, 9);
    const after = frameToPicture(z, at);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(zoomView(fit, 0.1, at, fit).scale).toBeCloseTo(fit.scale, 9);
    expect(zoomView(fit, 1000, at, fit).scale).toBeCloseTo(fit.scale * 8, 9);
  });
  it("has a safe view for an empty frame", () => {
    expect(fitView(SIZE, { width: 0, height: 0 })).toEqual({ scale: 1, x: 0, y: 0 });
  });
});
