// The admin dashboard's information architecture, in one place.
//
// Eight sections, each one a job an admin actually does, rather than the 16
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
  | "programmes"
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
   * Settings is eleven screens, which is where a flat list stops being read and
   * starts being scanned: an owner looking for the refund window read all eleven
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
  /**
   * The scope section that decides who may open this screen, when it is not
   * the nav section it sits in. Access is per *capability*, not per menu: the
   * Morning Brief layout moved Programmes under Sessions and the log under
   * Settings, but a desk's right to read or change a programme is still the
   * `programmes` grant, and only a Master Admin still reads the log. Every
   * API route keeps guarding with the same section it always did
   * (requireAdminScope), so the menu can move without anybody's access
   * moving with it. Defaults to the section the tab sits in.
   */
  scope?: AdminSectionKey;
  /**
   * The screens one tab holds, shown as a row of chips under the tab bar.
   *
   * Several old screens answered the same question ("who is waiting on a
   * decision", "what came in and went out") from two places; they now share
   * one tab and the chips pick between them, so nothing was rewritten and
   * nothing was dropped -- each chip is the old screen, whole. A tab with
   * subs is visible when at least one of its subs is.
   */
  subs?: AdminSubDef[];
};

/** One chip inside a tab: an old screen, kept whole. Same access fields as a tab. */
export type AdminSubDef = Pick<
  AdminTabDef,
  "key" | "label" | "blurb" | "example" | "requiresManage" | "limitedScopesOnly" | "scope"
>;

export type AdminSectionDef = {
  key: AdminSectionKey;
  label: string;
  icon: string;
  blurb: string;
  tabs: AdminTabDef[];
};

/**
 * Every scope section -- what a desk is granted, as opposed to where a
 * screen sits in the menu -- with the name an admin knows it by. Two of
 * them (`programmes`, `logs`) have no menu section of their own any more;
 * their screens sit under Sessions and Settings, and keep this scope.
 */
export const SCOPE_SECTIONS: { key: AdminSectionKey; label: string }[] = [
  { key: "today", label: "Home" },
  { key: "sessions", label: "Sessions" },
  { key: "programmes", label: "Programmes" },
  { key: "people", label: "People" },
  { key: "money", label: "Money" },
  { key: "catalog", label: "Prices & areas" },
  { key: "logs", label: "History" },
  { key: "settings", label: "Settings" },
];

// The Morning Brief layout: six sections, each one a question an owner asks,
// in the order they ask it. Today's screens were 49 across eight sections;
// they are all still here, as tabs or as the chips inside one (see `subs`).
// Two scope sections, `programmes` and `logs`, no longer have a menu entry of
// their own -- their screens live under Sessions and Settings and keep their
// own scope through `scope`. LEGACY_SCREENS sends every old link to its new
// home.
export const ADMIN_SECTIONS: AdminSectionDef[] = [
  {
    key: "today",
    label: "Home",
    icon: "fa-house",
    blurb: "What needs you today, in one place.",
    tabs: [
      {
        key: "overview",
        label: "Today",
        blurb: "The day at a glance: what needs you, today's sessions, and the numbers that matter.",
        example: "See that two sessions today have no therapist, and assign them.",
      },
      // Approvals and Health Profile reviews are the same kind of work -- a
      // person waiting on a yes or a no -- so they share one To-do tab.
      {
        key: "todo",
        label: "To-do",
        blurb: "Accounts, profile changes and Health Profile answers waiting for your decision.",
        example: "Approve a new therapist and set their share.",
        subs: [
          {
            key: "approvals",
            label: "Approvals",
            blurb: "Patients, therapists and hospitals waiting to be let in, and profile changes waiting for a yes or no.",
            example: "Approve Dr Rohan's account and set his share at 60%.",
          },
          {
            key: "health-reviews",
            label: "Health Profile reviews",
            blurb:
              "Patient answers waiting to go live on a Health Profile, and therapists asking to edit one.",
            example: "Approve the answers Dr Meera filled in for Asha, or decline them with a reason.",
          },
        ],
      },
      {
        key: "risk",
        label: "Risk & safety",
        blurb: "What the checks noticed: unusual cancellations, payment details in messages, and contact details shown.",
        example: "Check why a patient cancelled three times this week.",
      },
      {
        key: "activity",
        label: "Your desk's activity",
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
    blurb: "What is being delivered, by whom, and how it is going.",
    tabs: [
      {
        key: "schedule",
        label: "Calendar",
        blurb: "Every session, day by day, with its join link.",
        example: "Open Thursday and see who is booked with whom.",
      },
      {
        key: "all",
        label: "All sessions",
        blurb: "Every session ever booked, with search, filters and a download.",
        example: "Find every home visit Dr Arjun gave last month.",
      },
      // What patients and therapists said about each session: the stars, the
      // quick picks and the note, with every ID. Reads the same ratings as the
      // two rating columns on All sessions, in full.
      {
        key: "ratings",
        label: "Ratings & feedback",
        blurb: "Every rating and note a patient or therapist left on a session, with who, about whom, and every ID.",
        example: "Find every 1-2 star rating this month and see which therapist and session it was.",
      },
      // A programme from the therapist's recommendation to its last session,
      // under Sessions because a programme is a run of sessions. Its own
      // scope still decides who sees it, and who may decide on one.
      {
        key: "programmes",
        label: "Programmes",
        scope: "programmes",
        blurb: "Every recommended and bought programme, how far along it is, and the recommendations waiting for you.",
        example: "Find PED_PKG001 and see that 2 of its 6 sessions are done.",
        subs: [
          {
            key: "all",
            label: "All programmes",
            scope: "programmes",
            blurb:
              "Every programme in one list - recommended, paid for, under way and finished - with how many of its sessions are done.",
            example: "Find PED_PKG001, see that 2 of its 6 sessions are done, and who the next one is with.",
          },
          {
            key: "review",
            label: "Recommendations",
            scope: "programmes",
            requiresManage: true,
            blurb: "Approve, change or turn down what a therapist recommended, or write one for them.",
            example: "Approve Dr Meera's six-session recommendation so the patient sees it.",
          },
        ],
      },
      {
        key: "roster",
        label: "Therapist rota",
        blurb: "Who works when, who is on leave, and their weekly hours.",
        example: "Mark Dr Priya on leave next week.",
      },
      // No-show, cancellation and repeat rates, and sessions per therapist:
      // how the clinic runs, not its books.
      {
        key: "delivery",
        label: "How it's going",
        blurb: "No-shows, cancellations, repeat visits and sessions per therapist.",
        example: "See whether no-shows went down this month.",
      },
      {
        key: "new",
        label: "Book a session",
        requiresManage: true,
        blurb: "Book an online session or a home visit on a patient's behalf.",
        example: "Book Asha's next knee session for Wednesday at 4.",
      },
    ],
  },
  {
    key: "people",
    label: "People",
    icon: "fa-users",
    blurb: "Patients, therapists and partner hospitals.",
    tabs: [
      {
        key: "patients",
        label: "Patients",
        blurb: "Everyone who has booked or signed up. Open a patient to see and change everything about them.",
        example: "Open Asha's page and read her payment history.",
      },
      {
        key: "therapists",
        label: "Therapists",
        blurb: "Who treats your patients, and on what terms.",
        example: "Change Dr Arjun's share for home visits.",
      },
      {
        key: "partners",
        label: "Hospitals",
        blurb: "Partner hospitals, their enquiries, and the patients they refer.",
        example: "Assign CityCare's new referral to a therapist.",
      },
      // People who asked for something, or left half-way: data requests with
      // their legal deadlines, abandoned checkouts, and declined sign-ups.
      {
        key: "requests",
        label: "Requests",
        blurb: "Data requests and grievances, sign-ups that stopped at checkout, and everyone who was declined.",
        example: "Answer a deletion request before its deadline.",
        subs: [
          {
            key: "data-requests",
            label: "Data requests",
            blurb: "\"Delete my account\" requests and grievances, each with its legal deadline.",
            example: "Move a deletion request to done once the account is gone.",
          },
          {
            key: "abandoned",
            label: "Abandoned checkouts",
            blurb: "People who signed up while booking and have not paid. Leads worth a call.",
            example: "Call Arun, who stopped at the payment step yesterday.",
          },
          {
            key: "declined",
            label: "Declined",
            blurb: "Every declined sign-up and hospital enquiry, with the reason.",
            example: "See why a therapist was declined last month.",
          },
        ],
      },
    ],
  },
  {
    key: "money",
    label: "Money",
    icon: "fa-sack-dollar",
    blurb: "What came in, what goes out, what it costs, what is still owed.",
    tabs: [
      {
        key: "summary",
        label: "Overview",
        blurb: "Whether the clinic made money over a stretch of dates, and where each rupee went.",
        example: "See what last month left you after paying therapists and your own costs.",
        subs: [
          {
            key: "summary",
            label: "Where it went",
            blurb: "Whether the clinic made money over a stretch of dates, and where each rupee went.",
            example: "See what last month left you after paying therapists and your own costs.",
          },
          {
            key: "breakdown",
            label: "By treatment & therapist",
            blurb: "Which treatments and therapists the money came from.",
            example: "See which condition earned the most over the last three months.",
          },
        ],
      },
      {
        key: "payouts",
        label: "Pay therapists",
        blurb: "What you owe each therapist right now, and paying it.",
        example: "Pay a therapist what they have earned, less any cash they are still holding.",
      },
      {
        key: "owing",
        label: "Patients owe",
        blurb: "Patients you have allowed to pay after their treatment, what they still owe, and settling it.",
        example: "See that Lakshmi has had four sessions and not settled yet, and record the cash she hands over.",
      },
      {
        key: "transactions",
        label: "Payments & refunds",
        blurb: "Every payment and refund, one row each.",
        example: "Find what a patient paid on Tuesday, and whether any of it went back.",
        subs: [
          {
            key: "transactions",
            label: "Payments",
            blurb: "Every payment and refund, one row each.",
            example: "Find what a patient paid on Tuesday, and whether any of it went back.",
          },
          {
            key: "refunds",
            label: "Refunds",
            blurb: "Every refund, including ones made on the Razorpay website: where it is, who it was for, and what still needs you.",
            example: "Check a refund you made on Razorpay reached the patient's session, or see one the bank failed.",
          },
        ],
      },
      {
        key: "costs",
        label: "Costs & offers",
        blurb: "What the clinic spends, and what your discounts give away.",
        example: "Record this month's rent, or set up a promo code for a campaign.",
      },
      {
        key: "health",
        label: "For your accountant",
        blurb:
          "The standard figures a bank, an investor or your accountant asks for, and the numbers only you know.",
        example: "Work out how many sessions a month you need before the clinic is paying for itself.",
        subs: [
          {
            key: "health",
            label: "Business health",
            blurb:
              "The standard figures a bank, an investor or your accountant asks for - what you get back, what you keep, and how many sessions cover the costs.",
            example: "Work out how many sessions a month you need before the clinic is paying for itself.",
          },
          {
            key: "inputs",
            label: "Your numbers",
            requiresManage: true,
            blurb:
              "The figures only you know: what you have put into the clinic, what you spend on ads, and what you own and owe.",
            example: "Enter last month's Google Ads spend, or today's bank balance.",
          },
        ],
      },
    ],
  },
  {
    key: "catalog",
    label: "Prices & areas",
    icon: "fa-tags",
    blurb: "What we sell, at what price, and where.",
    tabs: [
      {
        key: "conditions",
        label: "Conditions & prices",
        blurb: "What we treat, and what one session of each costs - online and at home.",
        example: "Set Knee pain's home visit to its own price, or let it use the clinic-wide one.",
      },
      {
        key: "areas",
        label: "Home-visit areas",
        blurb: "Where therapists visit, the travel fee, and people outside those areas who asked.",
        example: "Add Kakkanad with a ₹150 travel fee.",
      },
      {
        key: "countries",
        label: "Other countries",
        blurb: "What visitors outside India see and pay, in their own currency.",
        example: "Charge visitors in the US 100% more, shown in dollars and rounded up to .99.",
      },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    icon: "fa-sliders",
    blurb: "How the product behaves.",
    // The four captions the old Settings list was grouped under became its
    // tabs, and each old screen is a chip inside one. History (the log) joins
    // as a fifth, with its own `logs` scope, so it stays Master Admin only.
    tabs: [
      {
        key: "website",
        label: "Your website",
        blurb: "What visitors see and read on your website.",
        example: "Change the WhatsApp number shown in the website footer.",
        subs: [
          {
            key: "brand",
            label: "Brand & contact",
            blurb: "Your clinic's name and the contact details patients see.",
            example: "Change the WhatsApp number shown in the website footer.",
          },
          {
            key: "public",
            label: "Public site",
            blurb: "What visitors read on your website.",
            example: "Add a patient's story to the home page, or answer a new question on the FAQ page.",
          },
          {
            key: "cookies",
            label: "Cookie consent",
            blurb: "What visitors chose when the website asked about cookies.",
            example: "See how many visitors accepted analytics in the last 30 days.",
          },
        ],
      },
      {
        key: "clinic",
        label: "How the clinic runs",
        blurb: "Rules for booking, money off, programmes, home visits, clinical questions and announcements.",
        example: "Stop patients booking a slot that is less than 12 hours away.",
        subs: [
          {
            key: "booking",
            label: "Booking rules",
            blurb: "When a patient may book, cancel, and join a video session.",
            example: "Stop patients booking a slot that is less than 12 hours away.",
          },
          {
            key: "offers",
            label: "Offers & discounts",
            blurb: "Money off, to bring new patients in.",
            example: "Give every new patient ₹200 off their first session.",
          },
          {
            key: "programmes",
            label: "Programmes & home visits",
            blurb:
              "Rules for a course of sessions a therapist recommends, and for visits to a patient's home.",
            example: "Make a therapist's recommendation wait for your approval before the patient sees it.",
          },
          {
            key: "clinical",
            label: "Clinical questions",
            blurb:
              "The questions a patient answers about their condition, the ones a therapist fills in after an exam, which paid-for assessment scales your therapists may use, and the six-minute walk's predicted-distance formula.",
            example: "Reword the question that asks how long the pain has lasted, or switch on a scale once the clinic holds its licence.",
          },
          {
            key: "profile-layout",
            label: "Health Profile layout",
            blurb: "Which sections a patient sees on their own Health Profile, for each condition type, and for one patient when theirs needs to differ.",
            example: "Hide the measures table from every orthopaedic patient's page, while their physiotherapist still sees it.",
          },
          {
            key: "announcements",
            label: "Announcements",
            blurb: "Banners on top of the patient, therapist and hospital dashboards, and the pop-up each one opens.",
            example: "Wish everybody a happy Diwali for three days, or tell every therapist the payout day has moved.",
          },
        ],
      },
      {
        key: "access",
        label: "Who gets in",
        blurb: "Back-office accounts, what each can reach, and how sign-in works.",
        example: "Hire somebody into Operations, or take away the access of somebody who left.",
        subs: [
          {
            key: "access",
            label: "User access",
            blurb: "Who can sign in to this dashboard, what each of them reaches, and how much of a patient's phone number a therapist is shown.",
            example: "Hire somebody into Operations, or take away the access of somebody who left.",
          },
          {
            key: "security",
            label: "Sign-in & security",
            blurb: "Your own password, and how long a patient, therapist or partner stays signed in.",
            example: "Sign people out automatically after 30 minutes of doing nothing.",
          },
        ],
      },
      {
        key: "technical",
        label: "Technical",
        blurb: "System health, the emails and WhatsApp messages the clinic sends, and the advanced shelf.",
        example: "Send every email to your own inbox while testing.",
        subs: [
          {
            key: "health",
            label: "System health",
            blurb: "Warnings when something behind the scenes has failed. Nothing here is set by you — it is the app reporting on itself.",
            example: "Find a booked session whose Google Meet link was never created, and try again.",
          },
          {
            key: "emails",
            label: "Emails",
            blurb: "What the clinic emails: switch emails off or send them all to one inbox while testing, and see what was sent.",
            example: "Send every email to your own inbox on staging, then press Send me a test email.",
          },
          {
            key: "whatsapp",
            label: "WhatsApp",
            blurb: "Session messages on WhatsApp for patients who said yes. Off until the clinic's WhatsApp Business account is set up.",
            example: "Once Meta has approved the templates, switch WhatsApp on and send every message to your own number first.",
          },
          {
            key: "advanced",
            label: "Advanced",
            requiresManage: true,
            blurb:
              "Technical switches that change how the app works inside, not what the clinic sells. Leave these alone unless you are following instructions.",
            example: "Switch which of two records the app trusts for a patient's remaining sessions.",
          },
          {
            key: "reachouts",
            label: "Developer messages",
            blurb: "Messages left through the developer credit in the footer, and the switch that shows it.",
            example: "Read a note somebody left on the Say hello page, then mark it contacted.",
          },
        ],
      },
      // The log: Master Admin only through its own `logs` scope, exactly as
      // when it was a section of its own.
      {
        key: "history",
        label: "History",
        scope: "logs",
        blurb: "Every action taken in this dashboard, who took it, and who opened whose dashboard.",
        example: "Find who refunded a session last Tuesday, and what reason they gave.",
        subs: [
          {
            key: "all",
            label: "All activity",
            scope: "logs",
            blurb: "Every change an admin has made, newest first — who, when, and what it changed from.",
            example: "Find who refunded a session last Tuesday, and what reason they gave.",
          },
          {
            key: "signed-in-as",
            label: "Signed in as",
            scope: "logs",
            blurb: "Every time an admin opened somebody's dashboard as them, with the reason they gave and what they changed.",
            example: "See why somebody opened a patient's dashboard last week, and whether they changed anything.",
          },
          {
            key: "retention",
            label: "Archive & clear",
            scope: "logs",
            requiresManage: true,
            blurb: "Download older entries and remove them, once you have a copy.",
            example: "Take a copy of everything older than a year, then clear it out.",
          },
        ],
      },
    ],
  },
];

// Resolves whatever is in the URL to a real screen. A stale bookmark, a
// hand-edited query string, or a section this admin's scope can't open all
// land somewhere valid rather than on a blank page -- the shell never
// renders a section that isn't in `allowed`.
/**
 * Screens that moved, and where an old link should land. A bookmark, an
 * e-mail or a note in somebody's head saying "Sessions -> Recommendations"
 * must open the screen that does that job now, not fall back to the first
 * tab of a section that no longer has it.
 */
export type ScreenAddress = { section: AdminSectionKey; tab: string; sub?: string };

export const LEGACY_SCREENS: Record<string, ScreenAddress> = {
  // Older moves, kept so their bookmarks still land.
  "sessions:recommendations": { section: "sessions", tab: "programmes", sub: "review" },
  "catalog:purchases": { section: "sessions", tab: "programmes", sub: "all" },
  // The Morning Brief layout (every screen that changed address).
  "today:approvals": { section: "today", tab: "todo", sub: "approvals" },
  "today:health-reviews": { section: "today", tab: "todo", sub: "health-reviews" },
  "programmes:all": { section: "sessions", tab: "programmes", sub: "all" },
  "programmes:review": { section: "sessions", tab: "programmes", sub: "review" },
  "people:data-requests": { section: "people", tab: "requests", sub: "data-requests" },
  "people:abandoned": { section: "people", tab: "requests", sub: "abandoned" },
  "people:declined": { section: "people", tab: "requests", sub: "declined" },
  "money:breakdown": { section: "money", tab: "summary", sub: "breakdown" },
  "money:refunds": { section: "money", tab: "transactions", sub: "refunds" },
  "money:inputs": { section: "money", tab: "health", sub: "inputs" },
  "settings:brand": { section: "settings", tab: "website", sub: "brand" },
  "settings:public": { section: "settings", tab: "website", sub: "public" },
  "settings:cookies": { section: "settings", tab: "website", sub: "cookies" },
  "settings:booking": { section: "settings", tab: "clinic", sub: "booking" },
  "settings:offers": { section: "settings", tab: "clinic", sub: "offers" },
  "settings:programmes": { section: "settings", tab: "clinic", sub: "programmes" },
  "settings:clinical": { section: "settings", tab: "clinic", sub: "clinical" },
  "settings:profile-layout": { section: "settings", tab: "clinic", sub: "profile-layout" },
  "settings:announcements": { section: "settings", tab: "clinic", sub: "announcements" },
  "settings:security": { section: "settings", tab: "access", sub: "security" },
  "settings:health": { section: "settings", tab: "technical", sub: "health" },
  "settings:emails": { section: "settings", tab: "technical", sub: "emails" },
  "settings:whatsapp": { section: "settings", tab: "technical", sub: "whatsapp" },
  "settings:advanced": { section: "settings", tab: "technical", sub: "advanced" },
  "settings:reachouts": { section: "settings", tab: "technical", sub: "reachouts" },
  "logs:all": { section: "settings", tab: "history", sub: "all" },
  "logs:signed-in-as": { section: "settings", tab: "history", sub: "signed-in-as" },
  "logs:retention": { section: "settings", tab: "history", sub: "retention" },
};

/**
 * A section, tab or sub-screen's scope: its own `scope`, else the section it
 * sits in. This, not the menu position, is what decides access.
 */
export function screenScope(section: AdminSectionKey, def: { scope?: AdminSectionKey }): AdminSectionKey {
  return def.scope ?? section;
}

/** Whether one tab or sub may be shown, before looking at any subs it has. */
function screenAllowed(
  section: AdminSectionKey,
  def: Pick<AdminTabDef, "scope" | "requiresManage" | "limitedScopesOnly">,
  allowed: AdminSectionKey[],
  manageable: AdminSectionKey[],
  limitedScope: boolean
): boolean {
  const scope = screenScope(section, def);
  if (!allowed.includes(scope)) return false;
  if (def.requiresManage && !manageable.includes(scope)) return false;
  if (def.limitedScopesOnly && !limitedScope) return false;
  return true;
}

/** The chips of one tab this admin may open, in order. */
export function visibleSubs(
  section: AdminSectionKey,
  tab: AdminTabDef,
  allowed: AdminSectionKey[],
  manageable: AdminSectionKey[],
  limitedScope: boolean
): AdminSubDef[] {
  return (tab.subs ?? []).filter((sub) =>
    screenAllowed(section, { ...sub, scope: sub.scope ?? tab.scope }, allowed, manageable, limitedScope)
  );
}

/**
 * The screens of one section this admin actually sees.
 *
 * One filter, read by the sidebar and by `findTab`, so a hand-typed
 * `?tab=` cannot resolve to a screen the shell does not render -- which
 * leaves a heading over nothing. A tab with chips needs at least one chip
 * the admin may open.
 */
export function visibleTabs(
  section: AdminSectionDef,
  allowed: AdminSectionKey[],
  manageable: AdminSectionKey[],
  limitedScope: boolean
): AdminTabDef[] {
  return section.tabs.filter((tab) => {
    if (!screenAllowed(section.key, tab, allowed, manageable, limitedScope)) return false;
    if (tab.subs && visibleSubs(section.key, tab, allowed, manageable, limitedScope).length === 0) return false;
    return true;
  });
}

/** The menu this admin sees: sections with at least one visible tab. */
export function visibleSections(
  allowed: AdminSectionKey[],
  manageable: AdminSectionKey[],
  limitedScope: boolean
): AdminSectionDef[] {
  return ADMIN_SECTIONS.map((s) => ({ ...s, tabs: visibleTabs(s, allowed, manageable, limitedScope) })).filter(
    (s) => s.tabs.length > 0
  );
}

/** Where an old `section:tab` lives now, or the address unchanged. */
export function currentAddress(section: string, tab: string): ScreenAddress | null {
  const exact = LEGACY_SCREENS[`${section}:${tab}`];
  if (exact) return exact;
  // A section that no longer has a menu entry, named with no tab or a tab it
  // never had (?section=logs): before the move that opened the section's
  // first screen, so it still does.
  return RETIRED_SECTIONS[section] ?? null;
}

/**
 * The screen a query string names, as one comparable key: an old address and
 * the new one it is rewritten to give the same key. A drawer remembers the key
 * it opened on and closes when the key changes; comparing the raw text closed
 * it when the shell rewrote an old link (?section=programmes&tab=all) to its
 * new address a moment after the drawer opened, which is a rename, not the
 * admin leaving the screen.
 */
export function adminScreenKey(params: { get(name: string): string | null }): string {
  const section = params.get("section") ?? "";
  const tab = params.get("tab") ?? "";
  const moved = currentAddress(section, tab);
  if (moved) return `${moved.section}|${moved.tab}|${moved.sub ?? ""}`;
  return `${section}|${tab}|${params.get("sub") ?? ""}`;
}

/** Where a retired section's own link lands: its first screen. */
const RETIRED_SECTIONS: Record<string, ScreenAddress> = {
  programmes: { section: "sessions", tab: "programmes", sub: "all" },
  logs: { section: "settings", tab: "history", sub: "all" },
};

// Resolves whatever is in the URL to a real screen. A stale bookmark, a
// hand-edited query string, or a screen this admin's scope can't open all
// land somewhere valid rather than on a blank page.
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
  limitedScope = false,
  subParam: string | null = null
): { section: string; tab: string; sub?: string } {
  const usable = visibleSections(allowed, manageable, limitedScope);
  const fallback = usable[0] ?? ADMIN_SECTIONS[0];
  const moved = currentAddress(sectionParam ?? "", tabParam ?? "");
  const want = moved ?? { section: sectionParam, tab: tabParam, sub: subParam ?? undefined };
  const section = usable.find((s) => s.key === want.section) ?? fallback;
  const sectionHit = usable.some((s) => s.key === want.section);
  const tab = (sectionHit ? section.tabs.find((t) => t.key === want.tab) : undefined) ?? section.tabs[0];
  if (!tab) return { section: section.key, tab: "" };
  const subs = visibleSubs(section.key, tab, allowed, manageable, limitedScope);
  if (subs.length === 0) return { section: section.key, tab: tab.key };
  // A sub-screen the admin cannot open (a view-only desk following a link
  // to Recommendations) lands on the tab's first chip -- the reading half
  // of the same job -- rather than a heading over nothing.
  const sub = subs.find((x) => x.key === want.sub) ?? subs[0];
  return { section: section.key, tab: tab.key, sub: sub.key };
}

/**
 * Every screen key this admin may be sent, and nothing else: "<section>:<tab>"
 * for a plain tab, "<section>:<tab>/<sub>" for each chip of a tab with chips.
 *
 * The shell only *shows* the screens a scope reaches, but whatever the page
 * hands it is serialized into the response whether it is shown or not -- a
 * restricted admin could read a hidden Money or Settings screen's props out
 * of the RSC payload. The page filters its screen map through this before
 * passing it on, so a screen outside the scope never leaves the server.
 */
export function visibleScreenKeys(
  allowed: AdminSectionKey[],
  manageable: AdminSectionKey[],
  limitedScope: boolean
): Set<string> {
  const keys = new Set<string>();
  for (const section of visibleSections(allowed, manageable, limitedScope)) {
    for (const tab of section.tabs) {
      if (!tab.subs) {
        keys.add(`${section.key}:${tab.key}`);
        continue;
      }
      for (const sub of visibleSubs(section.key, tab, allowed, manageable, limitedScope)) {
        keys.add(`${section.key}:${tab.key}/${sub.key}`);
      }
    }
  }
  return keys;
}

/** A screen or badge map with every key outside `keys` removed. */
export function pickScreens<T>(map: Record<string, T>, keys: Set<string>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(map)) {
    if (keys.has(key)) out[key] = value;
  }
  return out;
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
  view?: string,
  // The chip to open on a tab that holds several screens (AdminTabDef.subs).
  sub?: string
): string {
  // An old address (a call site written before a screen moved) is sent to
  // where the screen lives now, so no link in the app goes through a
  // redirect or, worse, a fallback.
  const moved = currentAddress(section, tab);
  const base = moved
    ? `/admin/dashboard?section=${moved.section}&tab=${moved.tab}${moved.sub ? `&sub=${moved.sub}` : ""}`
    : `/admin/dashboard?section=${section}&tab=${tab}${sub ? `&sub=${sub}` : ""}`;
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
  /** The section whose `manage` level it takes to WORK this row, when that is
   *  not the section the row opens. Approvals live on Today (the screen every
   *  desk opens) but approving is `people`, so a Finance desk -- which holds
   *  People at `view` -- would otherwise be told two accounts are waiting on
   *  it that nothing it can click would ever clear. Defaults to `section`. */
  workSection?: AdminSectionKey;
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
