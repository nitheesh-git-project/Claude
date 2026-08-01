// The exact routes that render their own full-height dark app shell
// (DashboardShell / AdminTabs) instead of sitting below the public
// marketing Navbar/Footer. Exact matches only -- sub-pages like
// /patient/dashboard/profile are separate simple pages, not part of a
// shell, and still need the public nav for navigation.
export const DASHBOARD_SHELL_ROUTES = new Set([
  "/admin/dashboard",
  "/patient/dashboard",
  "/therapist/dashboard",
  "/hospital/dashboard",
]);

export function isDashboardShellRoute(pathname: string | null): boolean {
  return pathname !== null && DASHBOARD_SHELL_ROUTES.has(pathname);
}
