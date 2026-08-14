import type { ShellNavItem } from "@/components/dashboard/DashboardShell";

// Shared between the dashboard page and the Edit Profile page (both wrapped
// in the same DashboardShell) so their sidebar nav lists can never drift
// apart -- the packages items are conditional on what this patient actually
// has, so both pages need the exact same "hasX" booleans passed in.
export function buildPatientNavItems({
  hasOwnedPackages,
  hasAvailablePackages,
}: {
  hasOwnedPackages: boolean;
  hasAvailablePackages: boolean;
}): ShellNavItem[] {
  return [
    { id: "sessions", label: "Your Sessions", icon: "fa-calendar-check" },
    { id: "calendar", label: "Calendar", icon: "fa-calendar" },
    ...(hasOwnedPackages
      ? [{ id: "your-packages", label: "Your Packages", icon: "fa-box-open" }]
      : []),
    ...(hasAvailablePackages
      ? [{ id: "session-packages", label: "Session Packages", icon: "fa-layer-group" }]
      : []),
    { id: "receipts", label: "Receipts", icon: "fa-receipt" },
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
        { id: "account-security", label: "Account Security", icon: "fa-lock" },
      ],
    },
  ];
}

// Home Visits is conditional on the therapist actually having any, for the
// same reason the patient's package items are: a nav entry that scrolls to
// an empty section is worse than no entry. Built as a function rather than
// a const so both pages sharing this shell pass the same boolean and cannot
// drift -- same shape as buildPatientNavItems above.
export function buildTherapistNavItems({
  hasHomeVisits,
}: {
  hasHomeVisits: boolean;
}): ShellNavItem[] {
  return [
    { id: "availability", label: "Availability", icon: "fa-calendar-days" },
    { id: "sessions", label: "Assigned Sessions", icon: "fa-clipboard-list" },
    ...(hasHomeVisits
      ? [{ id: "home-visits", label: "Home Visits", icon: "fa-house-medical" }]
      : []),
    ...THERAPIST_NAV_ITEMS.slice(2),
  ];
}

export const THERAPIST_NAV_ITEMS: ShellNavItem[] = [
  { id: "availability", label: "Availability", icon: "fa-calendar-days" },
  { id: "sessions", label: "Assigned Sessions", icon: "fa-clipboard-list" },
  { id: "programmes", label: "Programme Patients", icon: "fa-layer-group" },
  { id: "calendar", label: "Calendar", icon: "fa-calendar" },
  { id: "earnings", label: "Earnings", icon: "fa-chart-line" },
  { id: "receipts", label: "Payout Receipts", icon: "fa-sack-dollar" },
  {
    id: "health-profiles",
    label: "Health Profiles",
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
