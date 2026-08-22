// Every route inside a dashboard. These render their own full-height app
// shell (DashboardShell / AdminShell) instead of sitting below the public
// marketing Navbar/Footer, so both are hidden there.
//
// Matched by shape rather than by a list of literal paths, because Navbar
// and Footer are client components: a list would ship every role's dashboard
// path -- the back office's included -- in the JavaScript bundle of every
// public page. Nothing in this pattern names a role that isn't already
// public.
//
// Matched by **prefix**, not only the shell roots. This was an exact list,
// written when each dashboard was a single page with tabs. Splitting them
// into real routes (/patient/dashboard/health-profile,
// /therapist/dashboard/earnings, ...) left every new screen off it, so the
// public "Home / Conditions Treated / How It Works" nav reappeared on top
// of a signed-in patient's own dashboard. A prefix cannot go stale the next
// time a screen is added.
//
// The admin detail pages (/admin/dashboard/patients/[id] and friends) are
// plain pages rather than shells, and are covered deliberately: they carry
// their own "Back to Dashboard" link, and the marketing nav is not what an
// admin mid-task needs.
const DASHBOARD_ROUTE = /^\/[a-z-]+\/dashboard(\/|$)/;

export function isDashboardShellRoute(pathname: string | null): boolean {
  return pathname !== null && DASHBOARD_ROUTE.test(pathname);
}

// Routes where the top Navbar specifically should stay hidden, beyond the
// dashboards above -- the booking wizard involves a real payment mid-flow,
// and the nav's Sign In / Get Started / Go to Dashboard links are an easy
// way to accidentally navigate away and lose progress. The Footer isn't
// part of this (it's not a stray-navigation risk), so this is intentionally
// separate from isDashboardShellRoute rather than folded in.
const NAV_HIDDEN_EXTRA = new Set(["/book", "/book-home-visit"]);

export function isNavHiddenRoute(pathname: string | null): boolean {
  return (
    pathname !== null && (isDashboardShellRoute(pathname) || NAV_HIDDEN_EXTRA.has(pathname))
  );
}

// Routes where the nav keeps its links but drops its auth call-to-action
// (Sign In / Get Started / Go to Dashboard) entirely.
//
// These are the pages where the user is mid-authentication, and the nav's
// idea of "logged in" is briefly true while the page hasn't caught up yet:
// signInWithPassword() writes the session and fires onAuthStateChange the
// instant it resolves, so the nav flipped to "Go to Dashboard" for the
// whole duration of the auth card's own hard navigation -- a flash of a
// button that shouldn't exist yet, on every login card. There's nothing
// useful for the nav to offer on these pages anyway (a Sign In link on the
// sign-in page, a Get Started button on the registration page), so the
// cluster is dropped rather than raced.
//
// /patient/register is included for a second reason: the invite flow signs
// the patient in and then keeps them on the page for payment, so the button
// would otherwise sit there inviting them to abandon a half-paid booking.
const AUTH_CTA_HIDDEN_ROUTES = new Set([
  "/patient/login",
  "/therapist/login",
  "/admin/login",
  "/hospital/login",
  "/patient/register",
  "/reset-password",
  "/pending-approval",
  "/account-suspended",
]);

export function isAuthCtaHiddenRoute(pathname: string | null): boolean {
  return pathname !== null && AUTH_CTA_HIDDEN_ROUTES.has(pathname);
}

// The public marketing site -- home plus the top-level content sections
// reachable from the public Navbar's own link list. Deliberately an
// allowlist by top-level segment (matches "/x" and "/x/*") rather than the
// inverse (excluding dashboards/auth/booking one by one) -- new account or
// system routes default to *not* being a front page instead of silently
// picking up front-page-only chrome like the scroll hint.
const FRONT_PAGE_PREFIXES = [
  "/conditions",
  "/faq",
  "/get-started",
  "/home-visit",
  "/hospitals",
  "/how-it-works",
  "/team",
];

export function isFrontPageRoute(pathname: string | null): boolean {
  if (pathname === null) return false;
  if (pathname === "/") return true;
  return FRONT_PAGE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
