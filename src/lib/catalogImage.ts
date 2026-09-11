// Catalog cover photographs: where they live, how big they may be, and where
// the subject of one sits inside its frame.
//
// Two problems produced this module, and they are the same problem at
// different distances. Up close: a cover is drawn with `object-fit: cover`,
// which crops to the centre, and the card is 4:3 while the detail dialog is
// 16:9 -- so any photograph whose subject was not dead centre lost a head to
// one of them. Further back: the field was a text box an admin pasted a URL
// into, so in practice nobody filled it in and the public site shipped with
// no photographs at all.
//
// **A focal point, never a crop.** Cropping bakes one aspect ratio into the
// file: get the card right and the dialog is wrong, and changing either shape
// later means re-uploading the whole catalogue. Two percentages rendered as
// `object-position` are non-destructive -- the same file is correct at every
// ratio, including ratios added after the photo was uploaded -- and cost one
// CSS property. Percentages rather than pixels so that replacing a picture
// with a larger version of the same shot keeps the position it was given.
//
// Dependency-free on purpose, per the business-maths rule: the clamping and
// the formatting are unit-tested rather than discovered on a live catalogue.

/** Dead centre, which is what `object-fit: cover` does unaided. Every
 *  existing row defaults here, so adding focal columns changes no pixel until
 *  somebody deliberately repositions something. */
export const FOCAL_DEFAULT = 50;

/** What the upload route accepts. Kept in one place so the route, the input's
 *  `accept` attribute and the message an admin reads cannot disagree. */
export const CATALOG_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type CatalogImageType = (typeof CATALOG_IMAGE_TYPES)[number];

/** 5 MB. Large enough for a real photograph off a phone, small enough that a
 *  catalogue of them does not become the biggest thing this project stores.
 *  Enforced in the route, which is the only writer -- the input's own
 *  attribute is a courtesy, not a limit. */
export const CATALOG_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const CATALOG_IMAGE_TOO_LARGE =
  "That image is larger than 5 MB. Please use a smaller file.";
export const CATALOG_IMAGE_WRONG_TYPE =
  "Please upload a JPG, PNG or WebP image.";

/** The three tables that carry a cover. The value is the folder inside the
 *  bucket, so one glance at storage says what an object belongs to. */
export const CATALOG_IMAGE_KINDS = ["category", "package", "home-visit"] as const;
export type CatalogImageKind = (typeof CATALOG_IMAGE_KINDS)[number];

export function isCatalogImageKind(value: unknown): value is CatalogImageKind {
  return CATALOG_IMAGE_KINDS.includes(value as CatalogImageKind);
}

export function isCatalogImageType(value: unknown): value is CatalogImageType {
  return CATALOG_IMAGE_TYPES.includes(value as CatalogImageType);
}

/**
 * Where an upload is stored.
 *
 * Keyed on the row rather than given a fresh name each time, so replacing a
 * cover overwrites the old one instead of leaving it behind for ever -- the
 * same reasoning as the avatar path. The extension is fixed at the type the
 * route validated, so the object's name never claims something the bytes are
 * not.
 */
export function catalogImagePath(
  kind: CatalogImageKind,
  rowId: string,
  contentType: CatalogImageType
): string {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return `${kind}/${rowId}/cover.${ext}`;
}

/**
 * A focal coordinate, made safe.
 *
 * Anything unreadable becomes centre rather than throwing: this value comes
 * from a database column that may predate the migration, from a drag that may
 * have overshot, and from a request body. A cover photograph in slightly the
 * wrong place is a much better failure than a card that does not render.
 */
export function clampFocal(value: unknown): number {
  // null and "" are checked before Number(), which turns both into 0 rather
  // than NaN -- so without this an unset column would not centre the picture,
  // it would pin it to the top-left corner. That is the whole failure this
  // function exists to prevent, arriving through the commonest input it gets.
  if (value === null || value === undefined || value === "") return FOCAL_DEFAULT;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return FOCAL_DEFAULT;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export type FocalRow = {
  image_focal_x?: number | null;
  image_focal_y?: number | null;
};

/**
 * The `object-position` value for a row, ready to hand to a style attribute.
 *
 * Every surface that renders a cover reads this rather than building the
 * string itself, so the card, the dialog and the admin's own preview cannot
 * end up positioning the same photograph three different ways -- which is the
 * bug the drag tool exists to let somebody see and fix.
 */
export function focalPosition(row: FocalRow | null | undefined): string {
  return `${clampFocal(row?.image_focal_x)}% ${clampFocal(row?.image_focal_y)}%`;
}

/** Whether a row has been deliberately positioned, as opposed to sitting at
 *  the default. Used by the admin form to say "centred" rather than implying
 *  somebody chose it. */
export function hasCustomFocal(row: FocalRow | null | undefined): boolean {
  return (
    clampFocal(row?.image_focal_x) !== FOCAL_DEFAULT ||
    clampFocal(row?.image_focal_y) !== FOCAL_DEFAULT
  );
}
