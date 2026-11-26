/**
 * How far a visitor scrolls before the hero's "See what's below" cue
 * (HeroScrollCue) steps aside and the corner arrow (ScrollHint) takes over.
 * One number for both, so the two never show at once or leave a gap. It was
 * 120 px, which left the cue sitting there after the visitor had plainly
 * started scrolling; a slight scroll now hides it.
 */
export const HERO_CUE_HIDE_AFTER_PX = 8;

/** Whether the cue is still on duty at this scroll position. */
export function heroCueAtTop(scrollY: number): boolean {
  return scrollY < HERO_CUE_HIDE_AFTER_PX;
}
