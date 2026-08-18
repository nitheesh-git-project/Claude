// The admin dashboard's information architecture, in one place.
//
// Six sections, each one a job an admin actually does, rather than the 16
// feature-shaped tabs this replaced (a session used to be listed on four of
// them, settings lived on four, and "what needs me now" lived on none). The
// sidebar, the URL (?section=&tab=), the per-screen content map in
// page.tsx, and the scope check in adminScope.ts all read this same list --
// so adding a screen is one entry here plus one entry in the content map,
// and the four can never drift apart.
//
// Order matters: sections run most-frequently-used first (Today is daily,
// Settings is monthly), because a sidebar is read top-down.

export type AdminSectionKey =
  | "today"
  | "sessions"
  | "people"
  | "money"
  | "catalog"
  | "settings";

export type AdminTabDef = { key: string; label: string };

export type AdminSectionDef = {
  key: AdminSectionKey;
  label: string;
  icon: string;
  blurb: string;
  tabs: AdminTabDef[];
};

export const ADMIN_SECTIONS: AdminSectionDef[] = [
  {
    key: "today",
    label: "Today",
    icon: "fa-inbox",
    blurb: "Everything waiting on you, in one list.",
    tabs: [
      { key: "inbox", label: "Action Inbox" },
      // The inbox counts what is waiting; this is where that work is done.
      // Approvals used to sit on the patients directory, which made one
      // screen do three jobs -- a queue is not a person.
      { key: "approvals", label: "Approvals" },
    ],
  },
  {
    key: "sessions",
    label: "Sessions",
    icon: "fa-calendar-check",
    blurb: "What is being delivered, and by whom.",
    tabs: [
      { key: "schedule", label: "Schedule" },
      { key: "all", label: "All Sessions" },
      { key: "roster", label: "Roster" },
      { key: "new", label: "New Booking" },
    ],
  },
  {
    key: "people",
    label: "People",
    icon: "fa-users",
    blurb: "Patients, therapists and partner hospitals.",
    tabs: [
      { key: "patients", label: "Patients" },
      { key: "therapists", label: "Therapists" },
      { key: "partners", label: "Partners" },
    ],
  },
  {
    key: "money",
    label: "Money",
    icon: "fa-sack-dollar",
    blurb: "What came in, what goes out, what is still owed.",
    tabs: [
      { key: "summary", label: "Summary" },
      { key: "transactions", label: "Transactions" },
      { key: "payouts", label: "Payouts" },
      { key: "performance", label: "Performance" },
    ],
  },
  {
    key: "catalog",
    label: "Catalog",
    icon: "fa-tags",
    blurb: "What we sell, at what price, and where.",
    tabs: [
      { key: "conditions", label: "Conditions" },
      { key: "packages", label: "Packages" },
      { key: "areas", label: "Service Areas" },
      { key: "purchases", label: "Purchases" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    icon: "fa-sliders",
    blurb: "How the product behaves.",
    tabs: [
      { key: "brand", label: "Brand & Contact" },
      { key: "public", label: "Public Site" },
      { key: "booking", label: "Booking Rules" },
      { key: "clinical", label: "Clinical Questions" },
      { key: "team", label: "Team & Access" },
      { key: "health", label: "System Health" },
      { key: "activity", label: "Activity Log" },
      { key: "security", label: "Account Security" },
    ],
  },
];

// Resolves whatever is in the URL to a real screen. A stale bookmark, a
// hand-edited query string, or a section this admin's scope can't open all
// land somewhere valid rather than on a blank page -- the shell never
// renders a section that isn't in `allowed`.
export function findTab(
  sectionParam: string | null,
  tabParam: string | null,
  allowed: AdminSectionKey[]
): { section: string; tab: string } {
  const usable = ADMIN_SECTIONS.filter((s) => allowed.includes(s.key));
  const fallback = usable[0] ?? ADMIN_SECTIONS[0];
  const section = usable.find((s) => s.key === sectionParam) ?? fallback;
  const tab = section.tabs.find((t) => t.key === tabParam) ?? section.tabs[0];
  return { section: section.key, tab: tab.key };
}

// Builds the href an in-page link uses to send an admin to another screen --
// e.g. the Today inbox linking each row to where that work is done. A plain
// href (not a router push) so it behaves like any other link: middle-click
// opens a second tab, and the shell's own popstate handler picks the target
// up on load.
export function adminScreenHref(section: AdminSectionKey, tab: string): string {
  return `/admin/dashboard?section=${section}&tab=${tab}`;
}
