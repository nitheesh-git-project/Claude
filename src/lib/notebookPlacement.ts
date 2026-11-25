// Where the floating notebook button sits so it never covers something that
// matters. Dependency-free so the arithmetic is testable without a browser;
// NotebookLauncher measures the page and hands the rectangles in.
//
// The button lives in the bottom-right corner. Anything else that claims the
// bottom of the screen marks itself `data-notebook-avoid` (a toast, the cookie
// card, the live-updates banner, the booking wizard's pinned Continue / Pay
// bar, the assessment's action bar). If one of those overlaps the button's
// column, the button lifts to sit just above it. If lifting would push it
// halfway up the screen -- a tall card on a phone -- it tucks into the right
// edge instead, leaving a tab that is still one tap away.

export type Box = { top: number; bottom: number; left: number; right: number };

export type NotebookPlacement = {
  /** How far to raise the button above its resting place, in px. */
  lift: number;
  /** True when lifting would cost too much screen: slide into the edge. */
  tucked: boolean;
};

/** Gap kept between the button and whatever it moves above. */
export const NOTEBOOK_CLEARANCE_PX = 12;

/**
 * @param button   the button's rectangle at rest (no lift applied)
 * @param obstacles rectangles of visible `data-notebook-avoid` elements
 * @param viewportHeight window.innerHeight
 */
export function placeNotebook(button: Box, obstacles: Box[], viewportHeight: number): NotebookPlacement {
  let lift = 0;
  for (const o of obstacles) {
    if (o.bottom <= o.top || o.right <= o.left) continue; // not drawn
    if (o.top >= viewportHeight || o.bottom <= 0) continue; // off screen
    const sharesColumn = o.left < button.right && o.right > button.left;
    if (!sharesColumn) continue;
    // Only things at or below the button's top edge push it: something
    // higher up the page is content the button already sits beneath.
    if (o.bottom < button.top) continue;
    const needed = button.bottom - o.top + NOTEBOOK_CLEARANCE_PX;
    if (needed > lift) lift = needed;
  }
  const maxLift = viewportHeight * 0.45;
  if (lift > maxLift) return { lift: 0, tucked: true };
  return { lift: Math.max(0, Math.round(lift)), tucked: false };
}

/** The hint bubble is a first-few-visits nudge, not a fixture. */
export const NOTEBOOK_HINT_KEY = "mr-notebook-hint-v1";
export const NOTEBOOK_HINT_MAX_SHOWS = 3;

/** Whether to show the hint, given what this browser remembers. */
export function shouldShowNotebookHint(stored: string | null): boolean {
  if (stored === "opened") return false;
  const shown = Number.parseInt(stored ?? "0", 10);
  return !Number.isFinite(shown) || shown < NOTEBOOK_HINT_MAX_SHOWS;
}

/** What to remember after showing the hint once more. */
export function nextNotebookHintValue(stored: string | null): string {
  if (stored === "opened") return "opened";
  const shown = Number.parseInt(stored ?? "0", 10);
  return String((Number.isFinite(shown) ? shown : 0) + 1);
}
