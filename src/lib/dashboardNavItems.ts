import type { ShellNavItem } from "@/components/dashboard/DashboardShell";

// Shared between the dashboard page and the Edit Profile page (both wrapped
// in the same DashboardShell) so their sidebar nav lists can never drift
// apart -- the packages items are conditional on what this patient actually
// has, so both pages need the exact same "hasX" booleans passed in.
export function buildPatientNavItems({
  hasOwnedPackages,
  hasOnlineSessions,
  hasHomeVisits,
  hasOwnedHomeVisitPackages,
  hasSuggestions,
  suggestionsWaiting = 0,
}: {
  hasOwnedPackages: boolean;
  /** A live recommendation, or a therapist-proposed time. Same rule as the
   *  entries below: a screen that can only ever be empty is not in the
   *  sidebar. Booking stays the deliberate exception. */
  hasSuggestions: boolean;
  /** How many of those are waiting on the patient's answer: a live plan
   *  counts once, plus each proposed time. Shown as the entry's badge, and so
   *  on the phone's More button, where Suggested sits -- the teaser banner
   *  names the suggestion, the badge says there is somewhere to answer it. */
  suggestionsWaiting?: number;
  // Two different rules, deliberately kept apart. Booking is always open --
  // "Book a Session" is unconditional, because a patient who has only ever
  // had video calls must still be able to find home visits. History is
  // filtered: a section only appears once the patient actually has that
  // kind of session, so nobody lands on an empty list of a thing they have
  // never used.
  hasOnlineSessions: boolean;
  hasHomeVisits: boolean;
  hasOwnedHomeVisitPackages: boolean;
}): ShellNavItem[] {
  // Every entry is a real page rather than an anchor on one long scroll.
  // The scroll-spy version auto-selected whichever section happened to be
  // nearest the top, so the sidebar appeared to change its mind while you
  // read -- a nav item should be somewhere you go, not a running commentary
  // on where you are.
  return [
    // Overview is first on every dashboard: the same "what needs me right
    // now" screen for patient, therapist, hospital and admin.
    { id: "overview", label: "Overview", short: "Home", icon: "fa-gauge-high", href: "/patient/dashboard" },
    { id: "book", label: "Book a Session", short: "Book", icon: "fa-plus", href: "/patient/dashboard/book" },
    // One entry for every session -- video or home visit, list or calendar.
    // These were three entries over the same rows, which made "what's
    // next?" a three-screen question. The calendar is a view switch on the
    // Sessions screen now, not a destination of its own.
    // Above Sessions on purpose: something waiting on the patient's answer
    // outranks a list of what is already settled.
    ...(hasSuggestions
      ? [
          {
            id: "suggested",
            label: "Suggested Sessions",
            short: "Suggested",
            badge: suggestionsWaiting > 0 ? suggestionsWaiting : undefined,
            icon: "fa-lightbulb",
            href: "/patient/dashboard/suggested",
          },
        ]
      : []),
    ...(hasOnlineSessions || hasHomeVisits
      ? [
          {
            id: "sessions",
            label: "Your Sessions",
            short: "Sessions",
            icon: "fa-calendar-check",
            href: "/patient/dashboard/sessions",
          },
        ]
      : []),
    // Owned only. There is no longer a catalogue of programmes a patient
    // can browse and buy -- a programme comes from a therapist after a
    // session -- so this entry appears when there is something to show and
    // never as a shop window.
    ...(hasOwnedPackages || hasOwnedHomeVisitPackages
      ? [
          {
            id: "packages",
            label: "Your Programmes",
            short: "Programmes",
            icon: "fa-box-open",
            href: "/patient/dashboard/packages",
          },
        ]
      : []),
    // Payments only exist off a booking or a package purchase, so a patient
    // who has neither would land on a permanently empty screen. Derived
    // from the booleans already passed in rather than a new one -- there is
    // no way to have paid for something without one of these being true.
    ...(hasOnlineSessions || hasHomeVisits || hasOwnedPackages || hasOwnedHomeVisitPackages
      ? [
          {
            id: "payments",
            label: "Payments",
            icon: "fa-receipt",
            href: "/patient/dashboard/payments",
          },
        ]
      : []),
    {
      id: "health-profile",
      label: "Health Profile",
      // "Progress" on the tab bar and rail: what a patient opens it for is
      // whether they are getting better.
      short: "Progress",
      icon: "fa-notes-medical",
      href: "/patient/dashboard/health-profile",
    },
    {
      id: "edit-profile",
      label: "Edit Profile",
      short: "Profile",
      icon: "fa-user-pen",
      href: "/patient/dashboard/profile",
      children: [
        { id: "profile-photo", label: "Photo", icon: "fa-image" },
        { id: "personal-details", label: "Personal Details", icon: "fa-id-card" },
        { id: "contact-details", label: "Contact Details", icon: "fa-address-book" },
        { id: "my-addresses", label: "My Addresses", icon: "fa-map-pin" },
        { id: "account-security", label: "Account Security", icon: "fa-lock" },
      ],
    },
  ];
}

// Kept as a function purely so every page importing it stays call-shaped
// (they all did when the list was conditional on whether this therapist
// had home visits -- it no longer is, since Sessions covers both modes).
export function buildTherapistNavItems(): ShellNavItem[] {
  return THERAPIST_NAV_ITEMS;
}

export const THERAPIST_NAV_ITEMS: ShellNavItem[] = [
  { id: "overview", label: "Overview", short: "Home", icon: "fa-gauge-high", href: "/therapist/dashboard" },
  {
    id: "availability",
    label: "Availability",
    icon: "fa-calendar-days",
    href: "/therapist/dashboard/availability",
  },
  {
    id: "sessions",
    label: "Sessions",
    icon: "fa-clipboard-list",
    href: "/therapist/dashboard/sessions",
  },
  // Earnings and Payout Receipts were two entries answering one question
  // ("what am I owed, and what have I been paid?"); they are one screen.
  { id: "earnings", label: "Earnings", icon: "fa-chart-line", href: "/therapist/dashboard/earnings" },
  // Programmes used to sit beside this as its own entry, but a programme
  // is the same patient seen by package purchase rather than by name --
  // it is a view switch inside My Patients now, not a second list.
  {
    id: "health-profiles",
    label: "My Patients",
    short: "Patients",
    icon: "fa-notes-medical",
    href: "/therapist/dashboard/health-profile",
  },
  {
    id: "edit-profile",
    label: "Edit Profile",
    short: "Profile",
    icon: "fa-user-pen",
    href: "/therapist/dashboard/profile",
    children: [
      { id: "profile-photo", label: "Photo", icon: "fa-image" },
      { id: "public-details", label: "Public Details", icon: "fa-address-card" },
      { id: "credentials", label: "Credentials", icon: "fa-graduation-cap" },
      { id: "account-security", label: "Account Security", icon: "fa-lock" },
    ],
  },
];

export const HOSPITAL_NAV_ITEMS: ShellNavItem[] = [
  { id: "overview", label: "Overview", short: "Home", icon: "fa-gauge-high", href: "/hospital/dashboard" },
  { id: "refer", label: "Refer a Patient", short: "Refer", icon: "fa-user-plus", href: "/hospital/dashboard/refer" },
  {
    id: "referrals",
    label: "Your Referrals",
    short: "Referrals",
    icon: "fa-list-check",
    href: "/hospital/dashboard/referrals",
  },
  // "Earnings", matching the therapist sidebar: both answer "what has the
  // clinic paid me, and what is still owed?". Patients keep "Payments"
  // (money going out) and the admin keeps "Money" (the clinic's own
  // books), so no one word carries two meanings across roles.
  {
    id: "revenue",
    label: "Earnings",
    icon: "fa-chart-line",
    href: "/hospital/dashboard/revenue",
  },
  // Was "Account Security", which named one section of the page rather
  // than the page -- a partner looking to correct their organisation's
  // name had no reason to open something called Account Security.
  {
    id: "profile",
    label: "Edit Profile",
    short: "Profile",
    icon: "fa-user-pen",
    href: "/hospital/dashboard/profile",
    children: [
      { id: "profile-photo", label: "Logo", icon: "fa-image" },
      { id: "organisation-details", label: "Organisation Details", icon: "fa-hospital" },
      { id: "contact-details", label: "Contact Preferences", icon: "fa-address-book" },
      { id: "account-security", label: "Account Security", icon: "fa-lock" },
    ],
  },
];

// The phone tab bar for each dashboard (see DashboardShell and
// src/lib/dashboardTabs.ts): the four screens each role opens most, in bar
// order, and the one action raised in the middle. Everything else is behind
// More. An entry a person does not have yet is skipped, not left as a gap.
// Keyed by basePath, like LOGIN_HREF_BY_BASE_PATH below, so every page that
// renders a DashboardShell gets the same bar without passing it.
export const TABS_BY_BASE_PATH: Record<string, { tabIds: string[]; centerTabId?: string }> = {
  "/patient/dashboard": { tabIds: ["overview", "sessions", "book", "health-profile"], centerTabId: "book" },
  "/therapist/dashboard": { tabIds: ["overview", "sessions", "health-profiles", "earnings"] },
  "/hospital/dashboard": { tabIds: ["overview", "referrals", "refer", "revenue"], centerTabId: "refer" },
};

// Which login page each dashboard's own users belong to, keyed by the
// DashboardShell `basePath` that dashboard already passes. Used by the
// idle-timeout dialog to send someone back to the door they came in
// through rather than a generic sign-in page. Admin isn't here: admins are
// exempt from the inactivity timeout entirely (see AdminTabs).
export const LOGIN_HREF_BY_BASE_PATH: Record<string, string> = {
  "/patient/dashboard": "/patient/login",
  "/therapist/dashboard": "/therapist/login",
  "/hospital/dashboard": "/hospital/login",
};
