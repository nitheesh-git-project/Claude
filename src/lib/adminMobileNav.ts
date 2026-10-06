// The admin dashboard's phone navigation, kept free of React so it can be
// tested without rendering the shell.
//
// The back office has seven sections and about forty screens -- too many for
// a tab bar -- so a phone gets two direct shortcuts to the screens an admin
// opens most, plus Search and the full menu. The menu itself can be filtered
// by typing, because scrolling a forty-row list on a phone to find "Payouts"
// is the slowest way there.

export type NavTab = { key: string; label: string; group?: string };
export type NavSection = { key: string; label: string; icon: string; tabs: NavTab[] };

export type Shortcut = { section: string; tab: string; label: string; icon: string };

// Most-opened first. Each is offered only when this admin's scope can open
// it, so a Finance desk does not get a shortcut it would be refused.
const SHORTCUT_CANDIDATES: { section: string; tab: string; label: string; icon: string }[] = [
  { section: "today", tab: "overview", label: "Today", icon: "fa-inbox" },
  { section: "today", tab: "approvals", label: "Approvals", icon: "fa-user-check" },
  { section: "sessions", tab: "all", label: "Sessions", icon: "fa-calendar-check" },
  { section: "money", tab: "summary", label: "Money", icon: "fa-indian-rupee-sign" },
  { section: "people", tab: "patients", label: "Patients", icon: "fa-users" },
];

export const MAX_SHORTCUTS = 2;

export function adminShortcuts(sections: NavSection[]): Shortcut[] {
  const out: Shortcut[] = [];
  for (const c of SHORTCUT_CANDIDATES) {
    const section = sections.find((s) => s.key === c.section);
    if (!section?.tabs.some((t) => t.key === c.tab)) continue;
    out.push(c);
    if (out.length === MAX_SHORTCUTS) break;
  }
  // A scope that reaches none of the candidates still gets its own first
  // screen, so the bar is never only Search and Menu.
  if (out.length === 0 && sections[0]?.tabs[0]) {
    out.push({
      section: sections[0].key,
      tab: sections[0].tabs[0].key,
      label: sections[0].label,
      icon: sections[0].icon,
    });
  }
  return out;
}

export type ScreenMatch = { section: string; sectionLabel: string; tab: string; label: string; icon: string };

/**
 * Every screen whose own name or section name contains the query, ignoring
 * case and extra spaces. Empty query: nothing (the menu shows its normal
 * grouped list instead). "Sessions" finds both the section's screens and
 * "All Sessions"; "pay" finds Payouts and Payments-named screens alike.
 */
export function filterAdminScreens(sections: NavSection[], query: string): ScreenMatch[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return [];
  const out: ScreenMatch[] = [];
  for (const s of sections) {
    const sectionHit = s.label.toLowerCase().includes(q);
    for (const t of s.tabs) {
      const hit =
        sectionHit ||
        t.label.toLowerCase().includes(q) ||
        (t.group ?? "").toLowerCase().includes(q);
      if (hit) out.push({ section: s.key, sectionLabel: s.label, tab: t.key, label: t.label, icon: s.icon });
    }
  }
  return out;
}
