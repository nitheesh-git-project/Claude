// Which dashboard nav entries go in the phone's bottom tab bar, and which
// go behind its More button.
//
// Below `lg` the sidebar used to be an off-canvas drawer behind a hamburger,
// which put every screen two taps away and hid where you were. The tab bar
// keeps the four screens a person uses most one tap away and always visible;
// everything else, plus their profile, Back to Home and Log Out, sits in
// the More sheet. Kept free of React so the split can be tested without
// rendering a shell.

export type TabbableItem = { id: string; href?: string };

export type TabSplit<T extends TabbableItem> = {
  /** In tab-bar order. At most four, so with More the bar is five wide. */
  tabs: T[];
  /** The raised centre action (Book, Refer), when it is one of `tabs`. */
  centerId: string | null;
  /** Everything not on the bar, in the sidebar's own order. */
  more: T[];
};

export const MAX_TABS = 4;

/**
 * `tabIds` is the order the bar shows them in. An id whose entry is absent
 * (a patient with no sessions yet has no Sessions entry -- see
 * buildPatientNavItems) is skipped rather than leaving a hole, and the
 * centre id only counts if its entry made it onto the bar.
 */
export function splitTabs<T extends TabbableItem>(
  items: T[],
  tabIds: string[],
  centerId?: string | null
): TabSplit<T> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const tabs: T[] = [];
  for (const id of tabIds) {
    const item = byId.get(id);
    if (item && !tabs.includes(item)) tabs.push(item);
    if (tabs.length === MAX_TABS) break;
  }
  const onBar = new Set(tabs.map((t) => t.id));
  const more = items.filter((item) => !onBar.has(item.id));
  const center = centerId && onBar.has(centerId) ? centerId : null;
  // A centre action sits in the middle of the bar, so with More on the end
  // it belongs at index 2 of a full bar -- moved there whatever order the
  // ids were given in, so a missing entry elsewhere cannot push it sideways.
  if (center && tabs.length === MAX_TABS) {
    const at = tabs.findIndex((t) => t.id === center);
    const [c] = tabs.splice(at, 1);
    tabs.splice(2, 0, c);
  }
  return { tabs, centerId: center, more };
}

/**
 * Whether a nav entry is the screen being looked at. A detail page under a
 * section (a patient's chart under My Patients) keeps that section lit, so
 * the nav is the way back -- but the dashboard's own base path is matched
 * exactly, or Overview would light up on every screen.
 */
export function isNavItemActive(pathname: string | null, basePath: string, href?: string): boolean {
  if (!href || !pathname) return false;
  if (pathname === href) return true;
  return href !== basePath && pathname.startsWith(`${href}/`);
}

/** Whether More should read as the current place: the screen is behind it. */
export function isMoreActive(
  pathname: string | null,
  basePath: string,
  more: TabbableItem[]
): boolean {
  return more.some((item) => isNavItemActive(pathname, basePath, item.href));
}
