import { describe, it, expect } from "vitest";
import { moveIdOnePlace, isOrderChanged } from "./listOrdering";

describe("moveIdOnePlace", () => {
  it("moves a row up", () => {
    expect(moveIdOnePlace(["a", "b", "c"], "c", "up")).toEqual(["a", "c", "b"]);
  });

  it("moves a row down", () => {
    expect(moveIdOnePlace(["a", "b", "c"], "a", "down")).toEqual(["b", "a", "c"]);
  });

  it("leaves the first row alone when moved up", () => {
    expect(moveIdOnePlace(["a", "b"], "a", "up")).toEqual(["a", "b"]);
  });

  it("leaves the last row alone when moved down", () => {
    expect(moveIdOnePlace(["a", "b"], "b", "down")).toEqual(["a", "b"]);
  });

  it("ignores an id that is not in the list", () => {
    expect(moveIdOnePlace(["a", "b"], "zz", "up")).toEqual(["a", "b"]);
  });

  it("does not mutate the array it was given", () => {
    const original = ["a", "b", "c"];
    moveIdOnePlace(original, "a", "down");
    expect(original).toEqual(["a", "b", "c"]);
  });

  it("walks a row to the top one move at a time", () => {
    let ids = ["a", "b", "c", "d"];
    ids = moveIdOnePlace(ids, "d", "up");
    ids = moveIdOnePlace(ids, "d", "up");
    ids = moveIdOnePlace(ids, "d", "up");
    expect(ids).toEqual(["d", "a", "b", "c"]);
    // And stops there rather than falling off the end.
    expect(moveIdOnePlace(ids, "d", "up")).toEqual(["d", "a", "b", "c"]);
  });
});

describe("isOrderChanged", () => {
  it("is false for an untouched list", () => {
    expect(isOrderChanged(["a", "b", "c"], ["a", "b", "c"])).toBe(false);
  });

  it("is true once two rows have traded places", () => {
    expect(isOrderChanged(["b", "a", "c"], ["a", "b", "c"])).toBe(true);
  });

  it("is false again after a move is undone", () => {
    const saved = ["a", "b", "c"];
    const moved = moveIdOnePlace(saved, "b", "up");
    expect(isOrderChanged(moved, saved)).toBe(true);
    expect(isOrderChanged(moveIdOnePlace(moved, "b", "down"), saved)).toBe(false);
  });

  it("is true when the lists are different lengths", () => {
    expect(isOrderChanged(["a", "b"], ["a", "b", "c"])).toBe(true);
  });
});
