// The in-page half of the layout audit (e2e/layout-audit.spec.ts). Runs in
// the browser via page.evaluate, so it must stay self-contained: no imports,
// no closures over Node values.
//
// It reports four kinds of problem at the current viewport size:
//   - "page-overflow": the page scrolls sideways.
//   - "container-overflow": a panel that is not meant to scroll sideways
//                      does -- a dashboard's own scrolling content area
//                      wider than itself is the page overflowing by
//                      another name. Tables and deliberate horizontal
//                      scrollers (overflow-x-auto, snap-x) are allowed.
//   - "offscreen":     a visible element sticks out past the viewport edge
//                      without a scroll container around it to hold it.
//   - "clipped-text":  text cut off by overflow:hidden with no ellipsis or
//                      line clamp saying so on purpose.
//   - "overlap":       two pieces of visible text or controls on top of each
//                      other, measured on what is actually visible (each
//                      box clipped by its overflow ancestors).
export type LayoutIssue = {
  kind: "page-overflow" | "container-overflow" | "offscreen" | "clipped-text" | "overlap";
  where: string;
  detail: string;
};

export function probeLayout(): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const describe = (el: Element): string => {
    const parts: string[] = [];
    let node: Element | null = el;
    for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
      let part = node.tagName.toLowerCase();
      const testId = node.getAttribute("data-testid");
      const aria = node.getAttribute("aria-label");
      if (testId) part += `[data-testid=${testId}]`;
      else if (aria) part += `[aria-label="${aria.slice(0, 30)}"]`;
      else if (node.id) part += `#${node.id}`;
      parts.unshift(part);
    }
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 50);
    return `${parts.join(" > ")}${text ? ` "${text}"` : ""}`;
  };

  const docOverflow = document.documentElement.scrollWidth - vw;
  if (docOverflow > 1) {
    issues.push({ kind: "page-overflow", where: "document", detail: `${docOverflow}px wider than the viewport` });
  }

  // Sideways overflow inside a scroll container that is not a deliberate
  // horizontal scroller.
  for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
    const cs = getComputedStyle(el);
    if (cs.overflowX !== "auto" && cs.overflowX !== "scroll" && cs.overflowX !== "hidden") continue;
    if (el.scrollWidth <= el.clientWidth + 1 || el.clientWidth === 0) continue;
    const cls = typeof el.className === "string" ? el.className : "";
    const deliberate =
      /overflow-x-(auto|scroll)|snap-x|scrollbar|marquee|carousel/.test(cls) ||
      el.querySelector("table, [role=table], [role=grid]") !== null ||
      cs.scrollSnapType !== "none";
    // overflow-hidden is how a clipping frame (an image crop, a rounded
    // card) is built; only report it when real text is being cut.
    if (cs.overflowX === "hidden") continue;
    if (deliberate) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 20) continue;
    let hidden = false;
    for (let n: Element | null = el; n; n = n.parentElement) {
      const c = getComputedStyle(n);
      if (c.display === "none" || c.visibility === "hidden" || n.getAttribute("aria-hidden") === "true") { hidden = true; break; }
    }
    if (hidden) continue;
    issues.push({
      kind: "container-overflow",
      where: describe(el),
      detail: `${el.scrollWidth - el.clientWidth}px wider than its ${el.clientWidth}px panel`,
    });
  }

  type Box = { el: Element; left: number; top: number; right: number; bottom: number; layer: Element | null; interactive: boolean };

  const isHidden = (el: Element): boolean => {
    // A closed <details> hides its body without display:none on it.
    const closed = el.closest("details:not([open])");
    if (closed && !el.closest("summary")) return true;
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return true;
      if (n.getAttribute("aria-hidden") === "true" || (n as HTMLElement).inert) return true;
    }
    return false;
  };

  // The visible part of an element: its box clipped by every ancestor that
  // clips overflow, and its layer (the nearest fixed/sticky ancestor, whose
  // contents legitimately float over the page).
  const visibleBox = (el: Element) => {
    const r = el.getBoundingClientRect();
    let left = r.left, top = r.top, right = r.right, bottom = r.bottom;
    let layer: Element | null = null;
    let scrollContained = false;
    for (let n: Element | null = el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (!layer && (cs.position === "fixed" || cs.position === "sticky")) layer = n;
      const clipsX = cs.overflowX !== "visible";
      const clipsY = cs.overflowY !== "visible";
      if (clipsX || clipsY) {
        const p = n.getBoundingClientRect();
        if (clipsX) { left = Math.max(left, p.left); right = Math.min(right, p.right); }
        if (clipsY) { top = Math.max(top, p.top); bottom = Math.min(bottom, p.bottom); }
        if (cs.overflowX === "auto" || cs.overflowX === "scroll" || cs.overflowX === "hidden" || cs.overflowX === "clip") scrollContained = true;
      }
    }
    const self = getComputedStyle(el);
    if (!layer && (self.position === "fixed" || self.position === "sticky")) layer = el;
    return { left, top, right, bottom, layer, raw: r, scrollContained };
  };

  const candidates = Array.from(
    document.body.querySelectorAll<HTMLElement>(
      "a, button, input, select, textarea, [role=button], h1, h2, h3, h4, h5, h6, p, label, span, li, td, th, dt, dd, img, svg"
    )
  );

  const boxes: Box[] = [];
  for (const el of candidates) {
    // Leaves only for text: a span wrapping other text elements is measured
    // through them.
    const interactive = el.matches("a, button, input, select, textarea, [role=button]");
    const ownText = Array.from(el.childNodes).some((c) => c.nodeType === 3 && (c.textContent ?? "").trim().length > 0);
    const media = el.matches("img, svg");
    if (!interactive && !ownText && !media) continue;
    if (media && el.closest("a, button, [role=button]")) continue;
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    const raw = el.getBoundingClientRect();
    if (raw.width < 2 || raw.height < 2) continue;
    if (isHidden(el)) continue;
    const v = visibleBox(el);
    if (v.right - v.left < 2 || v.bottom - v.top < 2) continue;

    // Off-screen: horizontally only (vertical is just scrolling), and not
    // when a scroll container is holding it, and not inside a fixed layer
    // parked fully off-screen (a closed drawer).
    if (!v.scrollContained && (raw.right > vw + 1 || raw.left < -1)) {
      const layerBox = v.layer?.getBoundingClientRect();
      const parked = layerBox && (layerBox.right <= 0 || layerBox.left >= vw);
      if (!parked) {
        issues.push({ kind: "offscreen", where: describe(el), detail: `spans ${Math.round(raw.left)}..${Math.round(raw.right)} of ${vw}px` });
      }
    }

    // Clipped text: own text cut by its own overflow without saying so.
    if (ownText && !interactive) {
      const cs = getComputedStyle(el);
      const clips = cs.overflowX === "hidden" || cs.overflowX === "clip";
      const intended = cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none" && cs.webkitLineClamp !== "";
      if (clips && !intended && el.scrollWidth > el.clientWidth + 2) {
        issues.push({ kind: "clipped-text", where: describe(el), detail: `${el.scrollWidth - el.clientWidth}px of text cut off` });
      }
    }

    // A wrapped inline element's bounding box covers both its lines and the
    // gap beside them, so measure each line box on its own.
    const lines = Array.from(el.getClientRects()).filter((r) => r.width >= 2 && r.height >= 2);
    if (lines.length > 1) {
      for (const r of lines) {
        const left = Math.max(r.left, v.left), right = Math.min(r.right, v.right);
        const top = Math.max(r.top, v.top), bottom = Math.min(r.bottom, v.bottom);
        if (right - left >= 2 && bottom - top >= 2) boxes.push({ el, left, top, right, bottom, layer: v.layer, interactive });
      }
    } else {
      boxes.push({ el, left: v.left, top: v.top, right: v.right, bottom: v.bottom, layer: v.layer, interactive });
    }
  }

  // Overlaps, swept by top edge. Only within one layer: a fixed header over
  // scrolled content is how a fixed header works.
  boxes.sort((a, b) => a.top - b.top);
  const seen = new Set<string>();
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    if (a.bottom < 0 || a.top > vh * 3) continue;
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      if (b.top >= a.bottom) break;
      if (a.layer !== b.layer || a.el === b.el) continue;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w <= 2 || h <= 2) continue;
      // Ignore a decorative image behind or beside text: only text and
      // controls colliding with each other count.
      const aMedia = a.el.matches("img, svg");
      const bMedia = b.el.matches("img, svg");
      if (aMedia || bMedia) continue;
      const smaller = Math.min((a.right - a.left) * (a.bottom - a.top), (b.right - b.left) * (b.bottom - b.top));
      if (w * h < Math.max(16, smaller * 0.15)) continue;
      const key = `${describe(a.el)}|${describe(b.el)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({ kind: "overlap", where: describe(a.el), detail: `overlaps ${describe(b.el)} (${Math.round(w)}x${Math.round(h)}px)` });
    }
  }
  return issues;
}
