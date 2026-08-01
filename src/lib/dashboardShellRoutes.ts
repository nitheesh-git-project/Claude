// The exact routes that render their own full-height dark app shell
// (DashboardShell / AdminTabs) instead of sitting below the public
// marketing Navbar/Footer. Exact matches only -- other sub-pages (e.g. the
// admin therapist/patient detail pages) are separate simple pages, not part
// of a shell, and still need the public nav for navigation.
export const DASHBOARD_SHELL_ROUTES = new Set([
  "/admin/dashboard",
  "/patient/dashboard",
  "/patient/dashboard/profile",
  "/therapist/dashboard",
  "/therapist/dashboard/profile",
  "/hospital/dashboard",
]);

export function isDashboardShellRoute(pathname: string | null): boolean {
  return pathname !== null && DASHBOARD_SHELL_ROUTES.has(pathname);
}
