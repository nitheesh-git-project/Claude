import { describe, it, expect } from "vitest";
import {
  CATALOG_IMAGE_MAX_BYTES,
  FOCAL_DEFAULT,
  catalogImagePath,
  clampFocal,
  focalPosition,
  hasCustomFocal,
  isCatalogImageKind,
  isCatalogImageType,
} from "@/lib/catalogImage";

describe("clampFocal", () => {
  it("keeps a real coordinate", () => {
    expect(clampFocal(0)).toBe(0);
    expect(clampFocal(37)).toBe(37);
    expect(clampFocal(100)).toBe(100);
  });

  it("pulls an out-of-range drag back to the frame", () => {
    // A drag can overshoot the edge; the picture has no more to give there.
    expect(clampFocal(-40)).toBe(0);
    expect(clampFocal(180)).toBe(100);
  });

  it("rounds, because a column of smallints cannot hold 37.4", () => {
    expect(clampFocal(37.4)).toBe(37);
    expect(clampFocal(37.6)).toBe(38);
  });

  it("falls back to centre for anything unreadable", () => {
    // This value arrives from a pre-migration row, a request body and a drag
    // alike. Centre is what object-fit already does, so the failure is
    // invisible rather than a card that will not render.
    expect(clampFocal(null)).toBe(FOCAL_DEFAULT);
    expect(clampFocal(undefined)).toBe(FOCAL_DEFAULT);
    expect(clampFocal("banana")).toBe(FOCAL_DEFAULT);
    expect(clampFocal(NaN)).toBe(FOCAL_DEFAULT);
    expect(clampFocal(Infinity)).toBe(FOCAL_DEFAULT);
  });

  it("reads a numeric string, since a form field hands back text", () => {
    expect(clampFocal("62")).toBe(62);
  });
});

describe("focalPosition", () => {
  it("formats a positioned row", () => {
    expect(focalPosition({ image_focal_x: 30, image_focal_y: 70 })).toBe("30% 70%");
  });

  it("centres a row that predates the columns", () => {
    // The migration does not backfill, so an older row hands through
    // undefined and must render exactly as it did before.
    expect(focalPosition({})).toBe("50% 50%");
    expect(focalPosition(null)).toBe("50% 50%");
    expect(focalPosition(undefined)).toBe("50% 50%");
  });

  it("centres one axis independently of the other", () => {
    expect(focalPosition({ image_focal_x: 10, image_focal_y: null })).toBe("10% 50%");
  });
});

describe("hasCustomFocal", () => {
  it("is false at the default, so the form does not claim somebody chose it", () => {
    expect(hasCustomFocal({ image_focal_x: 50, image_focal_y: 50 })).toBe(false);
    expect(hasCustomFocal(null)).toBe(false);
  });

  it("is true once either axis moves", () => {
    expect(hasCustomFocal({ image_focal_x: 51, image_focal_y: 50 })).toBe(true);
    expect(hasCustomFocal({ image_focal_x: 50, image_focal_y: 12 })).toBe(true);
  });
});

describe("catalogImagePath", () => {
  it("is keyed on the row, so a replacement overwrites rather than accumulates", () => {
    expect(catalogImagePath("category", "abc-123", "image/jpeg")).toBe(
      "category/abc-123/cover.jpg"
    );
    // Same row, same path -- upsert territory.
    expect(catalogImagePath("category", "abc-123", "image/jpeg")).toBe(
      "category/abc-123/cover.jpg"
    );
  });

  it("names the extension the route actually validated", () => {
    expect(catalogImagePath("package", "p1", "image/png")).toBe("package/p1/cover.png");
    expect(catalogImagePath("home-visit", "h1", "image/webp")).toBe("home-visit/h1/cover.webp");
  });
});

describe("upload guards", () => {
  it("names the three kinds and nothing else", () => {
    expect(isCatalogImageKind("category")).toBe(true);
    expect(isCatalogImageKind("home-visit")).toBe(true);
    expect(isCatalogImageKind("profiles")).toBe(false);
    expect(isCatalogImageKind("")).toBe(false);
  });

  it("refuses a type that is not an image we render", () => {
    expect(isCatalogImageType("image/jpeg")).toBe(true);
    expect(isCatalogImageType("image/svg+xml")).toBe(false);
    expect(isCatalogImageType("application/pdf")).toBe(false);
  });

  it("caps a file at 5 MB", () => {
    expect(CATALOG_IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024);
  });
});
