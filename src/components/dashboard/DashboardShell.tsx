"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import { useIdleTimeout } from "@/lib/useIdleTimeout";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import SessionTimeoutDialog from "@/components/SessionTimeoutDialog";
import { LOGIN_HREF_BY_BASE_PATH } from "@/lib/dashboardNavItems";

// `href` marks a real page navigation (e.g. "Edit Profile") rather than a
// same-page anchor -- it always renders as a plain link to that page. An
// anchor item (no `href`) resolves to `${basePath}#id`: a smooth in-page
// scroll when already on basePath, or a real navigation there (landing on
// that section) from any other page rendered by this same shell -- this is
// what lets "Edit Profile" and the dashboard's own sections share one nav
// no matter which of the two pages you're currently on.
export type ShellNavItem = {
  id: string;
  label: string;
  icon: string;
  href?: string;
  // Sub-tabs shown nested under this item once its own page (`href`) is
  // active -- e.g. Edit Profile's Personal Details / Contact / Security
  // sections. Always anchor items scoped to the parent's `href` page (never
  // another `href` of their own), since a sub-tab only ever exists on the
  // page its parent links to.
  children?: { id: string; label: string; icon: string }[];
};

// Shared with the Admin Dashboard's own AdminTabs shell only in spirit, not
// in code -- AdminTabs switches between real client-side tabs (11 separate
// pieces of content, only one mounted-visible at a time), while this shell
// is for the patient/therapist/hospital dashboards, which are each a single
// continuous scroll of a few sections. Its "nav" is same-page anchor links
// with scroll-spy highlighting, not tab state, so forcing both patterns into
// one component would just hide that real difference behind a prop.
export default function DashboardShell({
  brandLabel,
  brandIcon,
  basePath,
  navItems,
  userName,
  userEmail,
  userAvatarUrl,
  userCode,
  offsetTop,
  headerTitle,
  headerSubtitle,
  headerActions,
  sessionTimeoutMinutes = 0,
  realtimeTables,
  children,
}: {
  brandLabel: string;
  brandIcon: string;
  // The dashboard page's own URL (e.g. "/patient/dashboard") -- every
  // anchor nav item is really a link to `${basePath}#id`. Other pages this
  // same shell wraps (Edit Profile) pass this so their anchor items still
  // point back at the real sections instead of trying (and failing) to
  // scroll to an id that doesn't exist on the current page.
  basePath: string;
  navItems: ShellNavItem[];
  userName: string;
  userEmail: string;
  userAvatarUrl: string | null;
  // This person's own PT0001/TH0001/BB0001-style display ID (see
  // supabase/schema.sql's "Unique display IDs" section) -- null until the
  // migration backfilling it has run, or while this page's own isolated
  // fetch for it hasn't resolved. Shown in the profile card so it's always
  // visible, not tucked away on a settings page.
  userCode?: string | null;
  offsetTop: boolean;
  headerTitle: string;
  headerSubtitle?: ReactNode;
  headerActions?: ReactNode;
  // Admin-configured Session Timeout of Inactivity, in minutes (0/undefined
  // = disabled) -- see src/lib/useIdleTimeout.ts and Feature 16.
  sessionTimeoutMinutes?: number;
  // Tables whose changes should trigger a live router.refresh() while this
  // page is open (e.g. an admin reassigns this therapist's session while
  // they're looking at their own dashboard) -- see RealtimeRefresh. Omit
  // for pages with nothing that changes from outside the viewer's own
  // actions.
  realtimeTables?: string[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const onBasePage = pathname === basePath;
  // The nav item (if any) whose own page we're currently on and which has
  // sub-tabs -- e.g. Edit Profile's Personal Details / Contact / Security.
  // Its children are the sections to scroll-spy/anchor on this page instead
  // of the main dashboard's own sections.
  const activeParent = navItems.find((item) => item.children && item.href === pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (pathname === basePath) return navItems.find((item) => !item.href)?.id ?? null;
    const parent = navItems.find((item) => item.children && item.href === pathname);
    return parent?.children?.[0]?.id ?? null;
  });

  useEffect(() => {
    // Highlights whichever section is currently nearest the top of the
    // viewport -- real scroll-spy over the page's actual sections, not a
    // fake "current tab" since there's no tab state here to read from.
    const anchorItems = onBasePage
      ? navItems.filter((item) => !item.href)
      : activeParent?.children ?? [];
    if (anchorItems.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b
        );
        setActiveId(topMost.target.id);
      },
      { rootMargin: "-112px 0px -70% 0px", threshold: 0 }
    );
    const els = anchorItems
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [navItems, onBasePage, activeParent]);

  useEffect(() => {
    // Landing here via a real navigation from another page (e.g. clicking
    // "Your Sessions" while on Edit Profile, or a sub-tab like "Contact
    // Details" from the main dashboard) arrives as ...#id -- the browser's
    // own anchor-jump already gets close, but re-running our own scroll
    // keeps the offset identical to a same-page click. No-ops harmlessly if
    // this page doesn't have that id.
    const hash = window.location.hash.slice(1);
    if (hash) scrollToSection(hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // A hard navigation so the browser sends a fresh request guaranteed to
    // carry the now-cleared auth cookies -- see SignOutButton for the same
    // reasoning, duplicated here since this sign-out control needs the
    // sidebar's dark styling rather than that component's light one.
    window.location.href = "/?farewell=1";
  }

  // Signing out on idle takes the same steps as the sidebar's own Log Out,
  // minus the navigation: the session is cleared immediately (that's the
  // point of the timeout), but the user is shown SessionTimeoutDialog
  // explaining what happened and choosing where to go, rather than being
  // silently dropped on the homepage. Passing 0 once it has fired stops the
  // timer re-arming behind the dialog -- there's no session left to end.
  async function handleIdleTimeout() {
    const supabase = createClient();
    // scope: "local" -- this ends the idle session on this device only. The
    // default global scope revokes every refresh token the user has, which
    // for an inactivity timeout would also sign them out of their phone and
    // any other tab they're actively using.
    await supabase.auth.signOut({ scope: "local" });
    setTimedOut(true);
  }

  useIdleTimeout(timedOut ? 0 : sessionTimeoutMinutes, handleIdleTimeout);

  function scrollToSection(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - (offsetTop ? 96 : 88);
    window.scrollTo({ top: y, behavior: "smooth" });
    // A same-page click is intercepted (preventDefault) for the custom
    // offset above, which skips the browser's own hash update too -- set it
    // by hand so the URL still reflects the section (refresh, share, back
    // button all keep working).
    history.replaceState(null, "", `#${id}`);
  }

  // A plain render function, not a nested component -- called directly
  // rather than as <NavItem ... />, so React never treats it as its own
  // component type and there's nothing to remount every render.
  function renderNavItem(item: ShellNavItem, mini: boolean, onNavigate?: () => void) {
    const active = item.href ? pathname === item.href : onBasePage && activeId === item.id;
    const className = `group relative w-full flex items-center gap-3 rounded-xl transition ${
      mini ? "justify-center px-0 py-3" : "px-3.5 py-2.5"
    } ${active ? "bg-teal-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`;
    const content = (
      <>
        <i className={`fa-solid ${item.icon} ${mini ? "text-base" : "w-4 text-center text-sm"}`}></i>
        {!mini && <span className="flex-1 text-left text-sm font-semibold">{item.label}</span>}
        {mini && (
          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 scale-95 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:scale-100 group-hover:opacity-100">
            {item.label}
          </span>
        )}
      </>
    );

    // Anchor items resolve to a real URL (`${basePath}#id`) so they work
    // from any page this shell wraps -- clicking one while already on
    // basePath intercepts the click for a smooth in-page scroll instead of
    // a jarring reload; clicking it from elsewhere (Edit Profile) lets the
    // browser actually navigate there, and the hash-scroll effect above
    // takes over once it lands. A plain anchor throughout (not next/link)
    // -- client-side transitions into a differently-chromed route were
    // silently not completing in this environment, and a hard nav sidesteps
    // it the same way this codebase's own login handlers already do for
    // cookie-sensitive navigations.
    const targetHref = item.href ?? `${basePath}#${item.id}`;
    return (
      <a
        key={item.id}
        // Only the expanded (non-mini) render gets this id -- it's a
        // guided-tour target (OnboardingTour), and the collapsed icon-only
        // rail and the off-canvas mobile drawer can otherwise coexist with
        // it in the DOM at once, which would mean duplicate ids.
        id={!mini ? `nav-${item.id}` : undefined}
        href={targetHref}
        onClick={(e) => {
          if (!item.href && onBasePage) {
            e.preventDefault();
            scrollToSection(item.id);
          }
          onNavigate?.();
        }}
        title={mini ? item.label : undefined}
        className={className}
      >
        {content}
      </a>
    );
  }

  // Sub-tabs (Edit Profile's Personal Details / Contact / Security) --
  // rendered only once we've actually landed on the parent's page, so the
  // click can always intercept for a smooth scroll rather than needing to
  // know whether it's a same-page or cross-page navigation. Skipped in the
  // collapsed mini sidebar to keep that view to single-icon rows.
  function renderChildItem(
    parentHref: string,
    child: { id: string; label: string; icon: string },
    onNavigate?: () => void
  ) {
    const active = pathname === parentHref && activeId === child.id;
    return (
      <a
        key={child.id}
        href={`${parentHref}#${child.id}`}
        onClick={(e) => {
          e.preventDefault();
          scrollToSection(child.id);
          onNavigate?.();
        }}
        className={`flex items-center gap-2.5 rounded-lg py-2 pl-9 pr-3 text-xs font-semibold transition ${
          active ? "text-teal-400" : "text-slate-500 hover:text-white"
        }`}
      >
        <i className={`fa-solid ${child.icon} w-3.5 text-center text-[11px]`}></i>
        <span>{child.label}</span>
      </a>
    );
  }

  function renderNavEntry(item: ShellNavItem, mini: boolean, onNavigate?: () => void) {
    const showChildren = !mini && item.href && item.children && pathname === item.href;
    return (
      <div key={item.id}>
        {renderNavItem(item, mini, onNavigate)}
        {showChildren && (
          <div className="mt-0.5 space-y-0.5">
            {item.children!.map((child) => renderChildItem(item.href!, child, onNavigate))}
          </div>
        )}
      </div>
    );
  }

  function renderBrand(mini: boolean) {
    return (
      <div className={`flex items-center gap-2.5 px-1 py-2 ${mini ? "justify-center" : ""}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white">
          <i className={`fa-solid ${brandIcon} text-sm`}></i>
        </div>
        {!mini && <span className="text-sm font-bold leading-tight text-white">{brandLabel}</span>}
      </div>
    );
  }

  // Sits directly under the brand, above the nav, on every page this shell
  // wraps. The four dashboards are all in NAV_HIDDEN_ROUTES (the public
  // Navbar is deliberately kept off them), which left a signed-in user with
  // no way back to the marketing site at all short of editing the URL --
  // signing out was the only exit, and it took their session with it.
  function renderHomeLink(mini: boolean, onNavigate?: () => void) {
    return (
      // A plain anchor, not next/link, for the same reason every nav entry
      // below is one: this leaves the dashboard chrome for the public site's
      // Navbar/Footer layout, and those client-side transitions were
      // silently not completing in this environment.
      // The hard navigation is the point here, not an oversight -- see the
      // comment above this function.
      // eslint-disable-next-line @next/next/no-html-link-for-pages
      <a
        href="/"
        onClick={onNavigate}
        title={mini ? "Back to Home" : undefined}
        className={`mt-2 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-white ${
          mini ? "justify-center px-0" : ""
        }`}
      >
        <i aria-hidden="true" className="fa-solid fa-house text-sm"></i>
        {!mini && <span>Back to Home</span>}
      </a>
    );
  }

  function renderFooter(mini: boolean) {
    return (
      <div className="mt-auto space-y-1 border-t border-slate-800 pt-3">
        <div
          className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${mini ? "justify-center" : ""}`}
          title={mini && userCode ? `${userName} · ${userCode}` : undefined}
        >
          <AvatarThumbnail url={userAvatarUrl} name={userName} size={32} />
          {!mini && (
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">{userName}</p>
              <p className="truncate text-[11px] text-slate-400">{userEmail}</p>
              {userCode && (
                <p className="truncate text-[10px] font-mono font-semibold text-slate-500">{userCode}</p>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          title={mini ? "Log Out" : undefined}
          className={`group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-white ${
            mini ? "justify-center px-0" : ""
          }`}
        >
          <i className="fa-solid fa-arrow-right-from-bracket text-sm"></i>
          {!mini && <span>Log Out</span>}
          {mini && (
            <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 scale-95 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:scale-100 group-hover:opacity-100">
              Log Out
            </span>
          )}
        </button>
      </div>
    );
  }

  const contentPadClass = collapsed ? "lg:pl-[76px]" : "lg:pl-64";

  return (
    // Its own full-height dark app shell (fixed sidebar + a light content
    // pane), not a card sitting inside the site's normal centered page
    // column -- Navbar/Footer are hidden on this exact route (see their own
    // pathname checks) so this component owns the entire viewport, matching
    // the Admin Dashboard's own shell.
    <div className="min-h-screen bg-slate-50">
      <SessionTimeoutDialog
        open={timedOut}
        loginHref={LOGIN_HREF_BY_BASE_PATH[basePath] ?? "/patient/login"}
      />
      {realtimeTables && realtimeTables.length > 0 && (
        <RealtimeRefresh tables={realtimeTables} />
      )}
      <div className="flex items-center justify-between bg-slate-900 px-4 py-3 lg:hidden">
        {renderBrand(false)}
        {navItems.length > 0 && (
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            <i className="fa-solid fa-bars"></i>
          </button>
        )}
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)}></div>
          <nav className="absolute bottom-0 left-0 top-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-slate-900 p-3">
            <div className="mb-2 flex items-center justify-between">
              {renderBrand(false)}
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="mt-1 flex-1 space-y-1">
              {navItems.map((item) => renderNavEntry(item, false, () => setMobileOpen(false)))}
            </div>
            {/* Same place as the desktop rail's, at the foot of the nav --
                the drawer has no Collapse button, so it lands directly above
                the profile/Log Out footer. */}
            {renderHomeLink(false, () => setMobileOpen(false))}
            {renderFooter(false)}
          </nav>
        </div>
      )}

      <nav
        className={`fixed left-0 z-30 hidden flex-col bg-slate-900 p-3 transition-[width] duration-200 lg:flex ${
          collapsed ? "w-[76px]" : "w-64"
        } ${offsetTop ? "top-[41px] h-[calc(100vh-41px)]" : "top-0 h-screen"}`}
      >
        {renderBrand(collapsed)}
        <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
          {navItems.map((item) => renderNavEntry(item, collapsed))}
        </div>
        {/* Below the nav rather than above it, and directly above Collapse:
            leaving the dashboard is not one of this person's screens, so it
            belongs with the other two controls that act on the sidebar
            itself rather than at the head of the list of places to go. */}
        {renderHomeLink(collapsed)}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={`mt-2 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-white ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <i className={`fa-solid ${collapsed ? "fa-angles-right" : "fa-angles-left"} text-sm`}></i>
          {!collapsed && <span>Collapse</span>}
        </button>
        {renderFooter(collapsed)}
      </nav>

      <div className={`transition-[padding] duration-200 ${contentPadClass}`}>
        <div className="px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{headerTitle}</h1>
              {headerSubtitle && <div className="text-xs text-slate-500 mt-1">{headerSubtitle}</div>}
            </div>
            {headerActions && <div className="flex items-center gap-4">{headerActions}</div>}
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
