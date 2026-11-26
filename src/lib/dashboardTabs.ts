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
 *
 * A raised centre action (Book, Refer) has to sit in the middle, and with
 * More on the end that needs an odd number of slots: two entries or four,
 * never three. A bar a missing entry left at three borrows the first of
 * `fallbackIds` that exists, in the gap's place; with none to borrow it
 * gives up its last other entry to More instead. Without a centre action
 * the columns simply share the width, however many there are.
 */
export function splitTabs<T extends TabbableItem>(
  items: T[],
  tabIds: string[],
  centerId?: string | null,
  fallbackIds: string[] = []
): TabSplit<T> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const tabs: T[] = [];
  let gapAt = -1;
  for (const id of tabIds) {
    if (tabs.length === MAX_TABS) break;
    const item = byId.get(id);
    if (item && !tabs.includes(item)) tabs.push(item);
    else if (!item && gapAt === -1) gapAt = tabs.length;
  }
  let center = centerId && tabs.some((t) => t.id === centerId) ? centerId : null;
  if (center && tabs.length % 2 === 1) {
    const stand = fallbackIds
      .map((id) => byId.get(id))
      .find((item): item is T => !!item && !tabs.includes(item));
    if (stand) {
      tabs.splice(gapAt === -1 ? tabs.length : gapAt, 0, stand);
    } else if (tabs.length > 1) {
      let last = tabs.length - 1;
      while (last >= 0 && tabs[last].id === center) last--;
      if (last >= 0) tabs.splice(last, 1);
    }
  }
  // Alone beside More there is no middle to raise it into: an ordinary tab.
  if (center && tabs.length === 1) center = null;
  // Moved to the middle whatever order the ids were given in, so a missing
  // entry elsewhere cannot push it sideways.
  if (center && tabs.length % 2 === 0) {
    const mid = tabs.length / 2;
    const at = tabs.findIndex((t) => t.id === center);
    const [c] = tabs.splice(at, 1);
    tabs.splice(mid, 0, c);
  }
  const onBar = new Set(tabs.map((t) => t.id));
  const more = items.filter((item) => !onBar.has(item.id));
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
