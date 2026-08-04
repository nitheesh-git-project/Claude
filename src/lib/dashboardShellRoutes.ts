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

// Routes where the top Navbar specifically should stay hidden, beyond the
// full dashboard shells above -- the booking wizard involves a real payment
// mid-flow, and the nav's Sign In / Get Started / Go to Dashboard links are
// an easy way to accidentally navigate away and lose progress. The Footer
// isn't part of this (it's not a stray-navigation risk), so this is
// intentionally separate from isDashboardShellRoute rather than folded in.
const NAV_HIDDEN_ROUTES = new Set([...DASHBOARD_SHELL_ROUTES, "/book"]);

export function isNavHiddenRoute(pathname: string | null): boolean {
  return pathname !== null && NAV_HIDDEN_ROUTES.has(pathname);
}
