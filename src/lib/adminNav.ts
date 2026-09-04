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

export type AdminTabDef = {
  key: string;
  label: string;
  /**
   * What this screen does, in the words a clinic owner would use. Rendered
   * under the page heading, in place of the section's own line.
   *
   * A section blurb cannot do this job: eight Settings screens all sat under
   * "How the product behaves", so the header told an admin nothing about the
   * screen they had just opened, and the labels alone ("Brand & Contact",
   * "System Health") name a category rather than an action. No jargon, no
   * column names, no feature names -- if the sentence needs one, the screen
   * is doing too many things and wants splitting.
   */
  blurb?: string;
  /**
   * One concrete thing you would come to this screen to do. The blurb says
   * what the screen is; this says why you are on it, which is the half that
   * makes an unfamiliar screen usable.
   */
  example?: string;
  /**
   * The screen is nothing but actions, so a scope holding this section at
   * `view` must not see it at all. A screen that merely *contains* actions
   * does not want this -- it takes a manage flag and renders read-only,
   * which is better, because the reading half is the reason the level
   * exists. Reach for it only where hiding every control would leave an
   * empty page.
   */
  requiresManage?: boolean;
};

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
      // One screen, not two: the figures, the queues and the activity feed
      // all answer "what needs me today", and splitting them meant an
      // admin checked one and missed the other.
      { key: "overview", label: "Today" },
      // The inbox counts what is waiting; this is where that work is done.
      // Approvals used to sit on the patients directory, which made one
      // screen do three jobs -- a queue is not a person.
      { key: "approvals", label: "Approvals" },
      // What the detectors noticed. Under Today rather than in a section of
      // its own because a signal is a piece of work waiting on somebody,
      // and that is what this section is for.
      { key: "risk", label: "Risk" },
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
      // No-show, cancellation and repeat rates, and sessions per therapist.
      // These lived under Money, which made that section the one place a
      // financial screen answered an operational question -- a no-show rate
      // is about how the clinic runs, not about its books.
      { key: "delivery", label: "Delivery" },
      // Every programme a patient can buy now comes from one of these, so
      // the clinic needs to be able to see them and stop a wrong one --
      // under Sessions because a recommendation is about what is being
      // delivered, not about the books.
      {
        key: "recommendations",
        label: "Recommendations",
        // Approve, turn down, rewrite, withdraw: there is no reading half
        // left once the decisions are gone.
        requiresManage: true,
      },
      {
        key: "new",
        label: "New Booking",
        // A form, and nothing else.
        requiresManage: true,
      },
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
    blurb: "What came in, what goes out, what it costs, what is still owed.",
    tabs: [
      { key: "summary", label: "Summary" },
      { key: "transactions", label: "Transactions" },
      { key: "payouts", label: "Payouts" },
      // What the clinic itself spends. Without it the money screens stop at
      // the clinic's share and no figure anywhere can honestly be called
      // profit.
      { key: "costs", label: "Costs" },
      { key: "breakdown", label: "Breakdown" },
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
    // Every screen here says what it is and gives one example, because a
    // settings list is the part of a back office people open least often and
    // therefore remember least well. Two of them are also new: "Booking
    // Rules" had grown into six unrelated stacks -- when a patient may book,
    // what money comes off, how a programme works, how a home visit works --
    // with no heading between them, so the one screen an owner opened to
    // change a refund window also held the discount that decides revenue.
    tabs: [
      {
        key: "brand",
        label: "Brand & Contact",
        blurb: "Your clinic's name and the contact details patients see.",
        example: "Change the WhatsApp number shown in the website footer.",
      },
      {
        key: "public",
        label: "Public Site",
        blurb: "What visitors read on your website.",
        example: "Add a patient's story to the home page, or answer a new question on the FAQ page.",
      },
      {
        key: "booking",
        label: "Booking Rules",
        blurb: "When a patient may book, cancel, and join a video session.",
        example: "Stop patients booking a slot that is less than 12 hours away.",
      },
      {
        key: "offers",
        label: "Offers & Discounts",
        blurb: "Money off, to bring new patients in.",
        example: "Give every new patient \u20b9200 off their first session.",
      },
      {
        key: "programmes",
        label: "Programmes & Home Visits",
        blurb:
          "Rules for a course of sessions a therapist recommends, and for visits to a patient's home.",
        example: "Make a therapist's recommendation wait for your approval before the patient sees it.",
      },
      {
        key: "clinical",
        label: "Clinical Questions",
        blurb: "The questions a patient answers about their condition, and the ones a therapist fills in after an exam.",
        example: "Reword the question that asks how long the pain has lasted.",
      },
      {
        key: "access",
        label: "User Access",
        blurb: "Who can sign in to this dashboard, what each of them reaches, and how much of a patient's phone number a therapist is shown.",
        example: "Hire somebody into Operations, or take away the access of somebody who left.",
      },
      {
        key: "health",
        label: "System Health",
        blurb: "Warnings when something behind the scenes has failed. Nothing here is set by you \u2014 it is the app reporting on itself.",
        example: "Find a booked session whose Google Meet link was never created, and try again.",
      },
      {
        key: "activity",
        label: "Activity Log",
        blurb: "Every change an admin has made, newest first.",
        example: "Check who refunded a session last Tuesday, and what reason they gave.",
      },
      {
        key: "security",
        label: "Account Security",
        blurb: "Your own login. Nothing here affects patients or the website.",
        example: "Send yourself a password reset email.",
      },
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
  allowed: AdminSectionKey[],
  // Which of those the viewer may change. A section held at `view` drops its
  // action-only screens, and this is where that has to be applied as well as
  // in the sidebar: a hand-typed `?tab=new` would otherwise resolve to a
  // screen the shell does not render, leaving a heading over nothing.
  // Omitted means every allowed section is manageable, which is the answer
  // for every caller that predates levels.
  manageable: AdminSectionKey[] = allowed
): { section: string; tab: string } {
  const usable = ADMIN_SECTIONS.filter((s) => allowed.includes(s.key)).map((s) =>
    manageable.includes(s.key) ? s : { ...s, tabs: s.tabs.filter((t) => !t.requiresManage) }
  );
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
export function adminScreenHref(
  section: AdminSectionKey,
  tab: string,
  // An optional preset the target screen applies to its own filters, so a
  // count links to the rows it counted rather than to the whole table. A
  // link that says "12 sessions with no therapist" and opens 900 sessions
  // makes the reader redo the filtering by hand. The screen decides what
  // each key means (see AdminAllSessionsTab's SESSION_VIEW_PRESETS); an
  // unknown one is ignored, so a stale link still lands somewhere valid.
  // AdminShell drops it from the URL on the next tab change, which is what
  // keeps it a one-shot preset rather than a sticky filter.
  view?: string
): string {
  const base = `/admin/dashboard?section=${section}&tab=${tab}`;
  return view ? `${base}&view=${encodeURIComponent(view)}` : base;
}


// The Today screen's queue rows. They live here rather than in a
// component because every count in them points at a section/tab pair
// defined above.
export type InboxItem = {
  label: string;
  count: number;
  section: AdminSectionKey;
  tab: string;
  /** Filter preset the target screen applies on arrival, so the row opens
   *  the rows it counted rather than the unfiltered list. */
  view?: string;
  /** Why this matters / what to do -- one short line. */
  hint: string;
  /** Money at stake, real exposure rather than a queue. Renders red. */
  urgent?: boolean;
};

/** What kind of work a queue group is. Named rather than inferred from the
 *  group's title, because adminHome.ts orders these groups by the viewer's
 *  scope -- and an ordering keyed on display text breaks silently the day
 *  somebody rewords a heading. */
export type AdminQueueDomain =
  | "approvals"
  | "risk"
  | "scheduling"
  | "clinical"
  | "money"
  | "growth"
  | "health";

export type InboxGroup = {
  title: string;
  icon: string;
  domain: AdminQueueDomain;
  items: InboxItem[];
};
