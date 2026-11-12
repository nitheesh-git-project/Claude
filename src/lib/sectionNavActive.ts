/**
 * Which section the public pages' "jump to section" rail lights up, from the
 * page's scroll position. Dependency-free so it can be tested without a
 * browser; `SectionNav` feeds it the live rects on every scroll frame.
 *
 * - At the very top nothing is active: the visitor has landed, not arrived.
 * - Otherwise the section crossing the viewport's vertical centre wins (the
 *   last match, so a section nested in another resolves to the inner one).
 * - At the very bottom of the page, when nothing crosses the centre, the last
 *   section still on screen wins. The footer under the last section is taller
 *   than half a laptop screen once its links became 44px rows, so scrolled to
 *   the end the centre sat in the footer and the rail went blank -- on the
 *   one position a visitor can certainly reach.
 */
export type SectionRect = { id: string; top: number; bottom: number };

export function activeSectionId(
  sections: readonly SectionRect[],
  view: { scrollY: number; innerHeight: number; scrollHeight: number }
): string | null {
  if (view.scrollY <= 0) return null;
  const centre = view.innerHeight * 0.5;
  let found: string | null = null;
  for (const s of sections) {
    if (s.top <= centre && s.bottom >= centre) found = s.id;
  }
  if (found !== null) return found;

  // A pixel of slack: fractional device pixels leave scrollY a hair short of
  // the maximum on some zoom levels.
  const atBottom = view.scrollY + view.innerHeight >= view.scrollHeight - 1;
  if (!atBottom) return null;
  let lastOnScreen: string | null = null;
  for (const s of sections) {
    if (s.bottom > 0 && s.top < view.innerHeight) lastOnScreen = s.id;
  }
  return lastOnScreen;
}
