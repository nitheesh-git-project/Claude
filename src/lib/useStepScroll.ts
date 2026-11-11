"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Brings a multi-step flow's top into view whenever its step changes.
 *
 * Tapping Next swaps the content in place but leaves the page where it was.
 * The button is at the bottom of a long step, and the next step is often
 * shorter, so on a phone the person landed at the footer, under a step they
 * could not see the start of (the booking wizard's Review step did exactly
 * this). Every flow with numbered steps calls this with its own root.
 *
 * - The flow's top goes just under whatever is pinned to the top of the
 *   screen (the debug bar, the site menu, a dashboard's top bar), measured
 *   rather than assumed, so it is right on every page and width.
 * - Inside a pop-up the pop-up's own scroll box goes back to its start.
 * - Focus moves to the step's heading when it carries `data-step-heading`,
 *   so a screen-reader user hears the new step instead of nothing.
 * - Not on the first render: arriving on a page must not jump it.
 */
export function useStepScroll(step: unknown, rootRef: RefObject<HTMLElement | null>) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // The root may itself be the pop-up's scroll box.
    const selfScrolls = /(auto|scroll)/.test(getComputedStyle(root).overflowY) && root.scrollHeight > root.clientHeight;
    if (selfScrolls) {
      root.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      const own = root.querySelector<HTMLElement>("[data-step-heading]");
      own?.focus({ preventScroll: true });
      return;
    }
    const box = scrollParent(root);
    if (box) {
      box.scrollTo({ top: Math.max(0, root.offsetTop - box.offsetTop - 8), behavior: reduce ? "auto" : "smooth" });
    } else {
      const pinned = pinnedTopHeight();
      const top = root.getBoundingClientRect().top + window.scrollY - pinned - 12;
      window.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
    }

    const heading = root.querySelector<HTMLElement>("[data-step-heading]");
    if (heading) {
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }, [step, rootRef]);
}

/** The nearest ancestor that scrolls on its own (a pop-up), or null for the page. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

/** How much of the top of the screen is covered by pinned bars. */
function pinnedTopHeight(): number {
  let bottom = 0;
  for (const el of document.querySelectorAll<HTMLElement>("body *")) {
    const style = getComputedStyle(el);
    if (style.position !== "sticky" && style.position !== "fixed") continue;
    const rect = el.getBoundingClientRect();
    if (rect.height === 0 || rect.height > 200 || rect.top > 2 + bottom || rect.width < window.innerWidth / 2) continue;
    bottom = Math.max(bottom, rect.bottom);
  }
  return bottom;
}
