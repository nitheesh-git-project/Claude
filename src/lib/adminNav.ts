// The admin dashboard's information architecture, in one place.
//
// Seven sections, each one a job an admin actually does, rather than the 16
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
  | "logs"
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
   * The caption this screen sits under in the sidebar.
   *
   * Settings is ten screens, which is where a flat list stops being read and
   * starts being scanned: an owner looking for the refund window read all ten
   * labels because nothing said which four were about how the clinic runs.
   * Screens carrying the same group are drawn under one small caption, so the
   * list is four short lists instead of one long one. Screens sharing a group
   * must be adjacent in this array -- the sidebar draws a caption whenever the
   * group changes, so a group split in two would be captioned twice.
   *
   * Sections whose screen list is already short (Today, People, Catalog) leave
   * it off, and get the flat list they had.
   */
  group?: string;
  /**
   * The screen is nothing but actions, so a scope holding this section at
   * `view` must not see it at all. A screen that merely *contains* actions
   * does not want this -- it takes a manage flag and renders read-only,
   * which is better, because the reading half is the reason the level
   * exists. Reach for it only where hiding every control would leave an
   * empty page.
   */
  requiresManage?: boolean;
  /**
   * Shown to a limited scope only.
   *
   * One screen needs this: Today -> Activity. A Master Admin reads the whole
   * log in the Logs section, and Operations, Finance and Clinical cannot
   * open Logs at all -- so without it their own desk's history is the ten
   * rows that happen to fit in the Today feed. Rendering it for everybody
   * would put a second list of the same rows in front of the one reader who
   * already has the first, which is what the "a session is listed once" rule
   * exists to stop.
   */
  limitedScopesOnly?: boolean;
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
      // Their own desk's history. See limitedScopesOnly above for why a
      // Master Admin does not get this entry.
      {
        key: "activity",
        label: "Activity",
        limitedScopesOnly: true,
        blurb: "Every change your own desk has made, newest first.",
        example: "Check which session a colleague on your desk reassigned this morning.",
      },
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
    // Every screen here says what it is and gives one example, for the same
    // reason the Settings screens do -- more so, in fact. Five money screens
    // whose names are all abstract nouns ("Summary", "Breakdown") leave an
    // owner opening three of them to find the one answering the question
    // they arrived with, and a promo code that lived on Summary while every
    // other surface said Costs was that failure at its worst: the screen the
    // note sent you to genuinely did not have it.
    tabs: [
      {
        key: "summary",
        label: "Summary",
        blurb: "Whether the clinic made money over a stretch of dates, and where each rupee went.",
        example: "See what last month left you after paying therapists and your own costs.",
      },
      // The seven figures a bank, an investor or an accountant asks for.
      // Beside Summary rather than at the end of the list because it is read
      // the same way -- "how is the business doing" -- and differs only in
      // asking it over the standard ratios rather than over this clinic's own
      // revenue split.
      {
        key: "health",
        label: "Business Health",
        blurb:
          "The standard figures a bank, an investor or your accountant asks for - what you get back, what you keep, and how many sessions cover the costs.",
        example: "Work out how many sessions a month you need before the clinic is paying for itself.",
      },
      {
        key: "transactions",
        label: "Transactions",
        blurb: "Every payment and refund, one row each.",
        example: "Find what a patient paid on Tuesday, and whether any of it went back.",
      },
      {
        key: "payouts",
        label: "Payouts",
        blurb: "What you owe each therapist right now, and paying it.",
        example: "Pay a therapist what they have earned, less any cash they are still holding.",
      },
      // The mirror of Payouts: money out, per person, with the control that
      // settles it -- and money in, per patient, with the control that settles
      // that. Its own screen rather than a card on Summary for two reasons.
      // It is the only place these rows are listed, and a count that opens a
      // screen not containing the rows it counted is the failure the `?view=`
      // presets exist to prevent. And it is a balance: true right now, all
      // time, where every Money screen but Payouts moves with the dates in
      // view -- so a `now` figure dropped onto a `range` screen is the scope
      // mixing that ScopeChip exists to paper over.
      {
        key: "owing",
        label: "Owed by Patients",
        blurb:
          "Patients you have allowed to pay after their treatment, what they still owe, and settling it.",
        example:
          "See that Lakshmi has had four sessions and not settled yet, and record the cash she hands over.",
      },
      // What the clinic itself spends. Without it the money screens stop at
      // the clinic's share and no figure anywhere can honestly be called
      // profit.
      {
        key: "costs",
        label: "Costs",
        blurb: "What the clinic spends, and what your discounts give away.",
        example: "Record this month's rent, or set up a promo code for a campaign.",
      },
      {
        key: "breakdown",
        label: "Breakdown",
        blurb: "Which treatments and therapists the money came from.",
        example: "See which condition earned the most over the last three months.",
      },
      // The figures only the owner knows. A screen of its own rather than
      // panels under Business Health, because that screen is read often and
      // typed into rarely -- and because every entry here is a row somebody
      // has to fetch from a bank statement or an ads dashboard, which is a
      // sitting-down job, not a glance.
      {
        key: "inputs",
        label: "Your Numbers",
        // Forms, and nothing else: a scope holding Money at `view` would open
        // an empty page.
        requiresManage: true,
        blurb:
          "The figures only you know: what you have put into the clinic, what you spend on ads, and what you own and owe.",
        example: "Enter last month's Google Ads spend, or today's bank balance.",
      },
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
    key: "logs",
    label: "Logs",
    icon: "fa-clipboard-list",
    blurb: "Every action taken in this dashboard, and who took it.",
    // A section of its own rather than a screen under Settings, where it
    // used to sit. Settings is where the product is configured; a log is not
    // a setting, and burying the record of what everybody did inside the
    // screen list an owner opens least often is how it stops being read.
    //
    // Master Admin only (see SECTION_ACCESS in adminScope.ts). The three
    // limited desks keep their own filtered history on Today -> Activity,
    // which is their desk's work alone -- the whole log names actions on
    // screens they cannot open and colleagues whose desks are not theirs.
    tabs: [
      {
        key: "all",
        label: "All Activity",
        blurb: "Every change an admin has made, newest first \u2014 who, when, and what it changed from.",
        example: "Find who refunded a session last Tuesday, and what reason they gave.",
      },
      {
        key: "retention",
        label: "Archive & Clear",
        // Nothing to read here: the screen is a download and a destructive
        // button. A scope holding this section at `view` would open an
        // empty page.
        requiresManage: true,
        blurb: "Download older entries and remove them, once you have a copy.",
        example: "Take a copy of everything older than a year, then clear it out.",
      },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    icon: "fa-sliders",
    blurb: "How the product behaves.",
    // Every screen here says what it is and gives one example, because a
    // settings list is the part of a back office people open least often and
    // therefore remember least well.
    //
    // "Booking Rules" is three screens for the same reason: it had grown
    // into six unrelated stacks -- when a patient may book, what money comes
    // off, how a programme works, how a home visit works -- with no heading
    // between them, so the one screen an owner opened to change a refund
    // window also held the discount that decides revenue.
    //
    // They are also grouped, because ten flat labels is a list nobody reads
    // top to bottom: an owner hunting for the refund window scanned past the
    // discount that decides what every new patient pays, and the two screens
    // about nothing but their own login sat in the same undifferentiated run
    // as the clinic's booking rules. Four captions -- your website, how the
    // clinic runs, who gets in, and the technical shelf -- say which quarter
    // of the list to read. Screens sharing a caption are adjacent, which the
    // sidebar relies on (see AdminTabDef.group).
    tabs: [
      {
        key: "brand",
        label: "Brand & Contact",
        group: "Your website",
        blurb: "Your clinic's name and the contact details patients see.",
        example: "Change the WhatsApp number shown in the website footer.",
      },
      {
        key: "public",
        label: "Public Site",
        group: "Your website",
        blurb: "What visitors read on your website.",
        example: "Add a patient's story to the home page, or answer a new question on the FAQ page.",
      },
      {
        key: "booking",
        label: "Booking Rules",
        group: "How the clinic runs",
        blurb: "When a patient may book, cancel, and join a video session.",
        example: "Stop patients booking a slot that is less than 12 hours away.",
      },
      {
        key: "offers",
        label: "Offers & Discounts",
        group: "How the clinic runs",
        blurb: "Money off, to bring new patients in.",
        example: "Give every new patient \u20b9200 off their first session.",
      },
      {
        key: "programmes",
        label: "Programmes & Home Visits",
        group: "How the clinic runs",
        blurb:
          "Rules for a course of sessions a therapist recommends, and for visits to a patient's home.",
        example: "Make a therapist's recommendation wait for your approval before the patient sees it.",
      },
      {
        key: "clinical",
        label: "Clinical Questions",
        group: "How the clinic runs",
        blurb: "The questions a patient answers about their condition, and the ones a therapist fills in after an exam.",
        example: "Reword the question that asks how long the pain has lasted.",
      },
      {
        key: "access",
        label: "User Access",
        group: "Who gets in",
        blurb: "Who can sign in to this dashboard, what each of them reaches, and how much of a patient's phone number a therapist is shown.",
        example: "Hire somebody into Operations, or take away the access of somebody who left.",
      },
      // Your own password, and how long anybody else's session stays open.
      // The two sign-out settings used to sit on Booking Rules, whose own
      // header promises "when a patient may book, cancel, and join a video
      // session" -- neither is about booking, and both are about a session
      // ending rather than a session being sold. Moving them here also gives
      // this screen something to be: one button to email yourself a reset was
      // a screen an owner opened once and never found a second reason for.
      {
        key: "security",
        label: "Sign-in & Security",
        group: "Who gets in",
        blurb: "Your own password, and how long a patient, therapist or partner stays signed in.",
        example: "Sign people out automatically after 30 minutes of doing nothing.",
      },
      {
        key: "health",
        label: "System Health",
        group: "Technical",
        blurb: "Warnings when something behind the scenes has failed. Nothing here is set by you \u2014 it is the app reporting on itself.",
        example: "Find a booked session whose Google Meet link was never created, and try again.",
      },
      // The quarantine. One switch today, and the point of the screen is that
      // it is the only place a switch like it may live: a data-migration
      // cutover whose own help text sends you to System Health to decide it
      // has no business sitting between two rules about how a programme is
      // sold. Master Admin only, because the whole Settings section is.
      {
        key: "advanced",
        label: "Advanced",
        group: "Technical",
        requiresManage: true,
        blurb:
          "Technical switches that change how the app works inside, not what the clinic sells. Leave these alone unless you are following instructions.",
        example: "Switch which of two records the app trusts for a patient's remaining sessions.",
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
  manageable: AdminSectionKey[] = allowed,
  // Whether this admin's scope is one of the three limited desks, which is
  // what decides the `limitedScopesOnly` screens. Defaults to false so a
  // caller that has not thought about it hides them rather than showing a
  // Master Admin a duplicate of a screen they already have.
  limitedScope = false
): { section: string; tab: string } {
  const usable = ADMIN_SECTIONS.filter((s) => allowed.includes(s.key)).map((s) => ({
    ...s,
    tabs: visibleTabs(s, manageable.includes(s.key), limitedScope),
  }));
  const fallback = usable[0] ?? ADMIN_SECTIONS[0];
  const section = usable.find((s) => s.key === sectionParam) ?? fallback;
  const tab = section.tabs.find((t) => t.key === tabParam) ?? section.tabs[0];
  return { section: section.key, tab: tab.key };
}

/**
 * The screens of one section this admin actually sees.
 *
 * One filter, read by the sidebar and by `findTab`, so a hand-typed
 * `?tab=` cannot resolve to a screen the shell does not render -- which
 * leaves a heading over nothing.
 */
export function visibleTabs(
  section: AdminSectionDef,
  canManage: boolean,
  limitedScope: boolean
): AdminTabDef[] {
  return section.tabs.filter((tab) => {
    if (tab.requiresManage && !canManage) return false;
    if (tab.limitedScopesOnly && !limitedScope) return false;
    return true;
  });
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
