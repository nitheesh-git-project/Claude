/**
 * Scrolling helpers shared by the section rail and the scroll-cue arrow so
 * the two can never disagree about where a section starts.
 *
 * Each section carries its own `scroll-mt-*` for the sticky navbar, so the
 * true top of a section is its box top minus that scroll margin -- read off
 * computed style rather than hardcoded, since a section with a taller header
 * offset would otherwise be considered "already passed" and get skipped.
 */
export function sectionOffsetTop(el: HTMLElement): number {
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  return el.getBoundingClientRect().top - margin;
}

export function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * The nearest section that still starts below the current scroll position.
 * Chosen by measured position rather than by list order, so the arrow lands
 * correctly even if a page lists its sections out of document order. The 4px
 * slack absorbs sub-pixel layout rounding, which would otherwise make a tap
 * re-target the section already sitting at the top of the viewport.
 */
export function nextSectionId(ids: string[]): string | null {
  let best: { id: string; top: number } | null = null;
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const top = sectionOffsetTop(el);
    if (top > 4 && (best === null || top < best.top)) best = { id, top };
  }
  return best?.id ?? null;
}
