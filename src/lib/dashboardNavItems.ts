import type { ShellNavItem } from "@/components/dashboard/DashboardShell";

// Shared between the dashboard page and the Edit Profile page (both wrapped
// in the same DashboardShell) so their sidebar nav lists can never drift
// apart -- the packages items are conditional on what this patient actually
// has, so both pages need the exact same "hasX" booleans passed in.
export function buildPatientNavItems({
  hasOwnedPackages,
  hasAvailablePackages,
  hasOnlineSessions,
  hasHomeVisits,
  hasOwnedHomeVisitPackages,
}: {
  hasOwnedPackages: boolean;
  hasAvailablePackages: boolean;
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
    { id: "overview", label: "Overview", icon: "fa-gauge-high", href: "/patient/dashboard" },
    { id: "book", label: "Book a Session", icon: "fa-plus", href: "/patient/dashboard/book" },
    // One entry for every session, video or home visit -- they were two,
    // over the same rows, which made "what's next?" a two-screen question.
    ...(hasOnlineSessions || hasHomeVisits
      ? [
          {
            id: "sessions",
            label: "Your Sessions",
            icon: "fa-calendar-check",
            href: "/patient/dashboard/sessions",
          },
        ]
      : []),
    { id: "calendar", label: "Calendar", icon: "fa-calendar", href: "/patient/dashboard/calendar" },
    ...(hasOwnedPackages || hasOwnedHomeVisitPackages || hasAvailablePackages
      ? [
          {
            id: "packages",
            label: hasOwnedPackages || hasOwnedHomeVisitPackages ? "Your Packages" : "Session Packages",
            icon: "fa-box-open",
            href: "/patient/dashboard/packages",
          },
        ]
      : []),
    { id: "payments", label: "Payments", icon: "fa-receipt", href: "/patient/dashboard/payments" },
    {
      id: "health-profile",
      label: "Health Profile",
      icon: "fa-notes-medical",
      href: "/patient/dashboard/health-profile",
    },
    {
      id: "edit-profile",
      label: "Edit Profile",
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
  { id: "overview", label: "Overview", icon: "fa-gauge-high", href: "/therapist/dashboard" },
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
  // Programmes is the delivery arc of a package purchase; My Patients
  // below is the clinical chart. Different jobs, so they stay apart --
  // but "Programme Patients" read like a second patient list, hence the
  // shorter name.
  {
    id: "programmes",
    label: "Programmes",
    icon: "fa-layer-group",
    href: "/therapist/dashboard/programmes",
  },
  { id: "calendar", label: "Calendar", icon: "fa-calendar", href: "/therapist/dashboard/calendar" },
  // Earnings and Payout Receipts were two entries answering one question
  // ("what am I owed, and what have I been paid?"); they are one screen.
  { id: "earnings", label: "Earnings", icon: "fa-chart-line", href: "/therapist/dashboard/earnings" },
  {
    id: "health-profiles",
    label: "My Patients",
    icon: "fa-notes-medical",
    href: "/therapist/dashboard/health-profile",
  },
  {
    id: "edit-profile",
    label: "Edit Profile",
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
