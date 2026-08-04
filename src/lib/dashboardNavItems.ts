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

export const THERAPIST_NAV_ITEMS: ShellNavItem[] = [
  { id: "availability", label: "Availability", icon: "fa-calendar-days" },
  { id: "sessions", label: "Assigned Sessions", icon: "fa-clipboard-list" },
  { id: "calendar", label: "Calendar", icon: "fa-calendar" },
  { id: "earnings", label: "Earnings", icon: "fa-chart-line" },
  { id: "receipts", label: "Payout Receipts", icon: "fa-sack-dollar" },
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
