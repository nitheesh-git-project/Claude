"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import { useIdleTimeout } from "@/lib/useIdleTimeout";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import RefreshButton from "@/components/dashboard/RefreshButton";
import { useLeavingPage } from "@/lib/useLeavingPage";
import SessionTimeoutDialog from "@/components/SessionTimeoutDialog";
import { LOGIN_HREF_BY_BASE_PATH, TABS_BY_BASE_PATH } from "@/lib/dashboardNavItems";
import { isMoreActive, isNavItemActive, splitTabs } from "@/lib/dashboardTabs";

// `href` marks a real page navigation (e.g. "Edit Profile") rather than a
// same-page anchor -- it always renders as a plain link to that page. An
// anchor item (no `href`) resolves to `${basePath}#id`: a smooth in-page
// scroll when already on basePath, or a real navigation there (landing on
// that section) from any other page rendered by this same shell.
export type ShellNavItem = {
  id: string;
  label: string;
  icon: string;
  href?: string;
  /** The one-word name the tab bar and the icon rail have room for
   *  ("Sessions" for "Your Sessions"). Falls back to `label`. The full
   *  label stays the accessible name everywhere, so a link is found by the
   *  same words whichever of the four navs is on screen. */
  short?: string;
  /** A count of things waiting on this person behind the entry. */
  badge?: number;
  // Sub-tabs shown nested under this item once its own page (`href`) is
  // active -- e.g. Edit Profile's Personal Details / Contact / Security
  // sections. Always anchor items scoped to the parent's `href` page.
  children?: { id: string; label: string; icon: string }[];
};

// Shared with the Admin Dashboard's own AdminShell only in spirit, not in
// code -- the admin's nav is grouped sections with sub-tabs, these three
// are a short flat list of screens.
//
// One list of entries, four renders, chosen by width:
//   - below `lg` (phones, small tablets): a bottom tab bar holding the four
//     screens named in `tabIds`, with a More sheet for the rest, the
//     person's profile, Back to Home and Log Out;
//   - `lg` to `2xl` (laptops): an 88px icon rail with a one-word label
//     under each icon, which gives the content the width it needs at
//     1280-1440 without a Collapse button somebody has to find;
//   - `2xl` and up (desktops): the full labelled sidebar.
// Only one is ever displayed, so only one is ever in the accessibility tree.
export default function DashboardShell({
  brandLabel,
  brandIcon,
  basePath,
  navItems,
  tabIds,
  centerTabId,
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
  // The dashboard page's own URL (e.g. "/patient/dashboard").
  basePath: string;
  navItems: ShellNavItem[];
  /** The phone tab bar's entries, in bar order (see splitTabs). Ids whose
   *  entry is absent are skipped. Omitted: TABS_BY_BASE_PATH's. */
  tabIds?: string[];
  /** The raised centre button -- the one action this role comes here to
   *  take (Book, Refer). */
  centerTabId?: string;
  userName: string;
  userEmail: string;
  userAvatarUrl: string | null;
  // This person's own PT0001/TH0001/BB0001-style display ID -- null until
  // the backfill has run or while it is still loading.
  userCode?: string | null;
  offsetTop: boolean;
  headerTitle: string;
  headerSubtitle?: ReactNode;
  headerActions?: ReactNode;
  // Admin-configured Session Timeout of Inactivity, in minutes (0 = off).
  sessionTimeoutMinutes?: number;
  // Tables whose changes trigger a live router.refresh() -- see
  // RealtimeRefresh.
  realtimeTables?: string[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  // Every nav entry below is a hard anchor on purpose (see renderHomeLink),
  // so React never learns the navigation happened. This marks the page as
  // leaving on click, so the teal bar is up for the whole wait.
  const markLeaving = useLeavingPage();
  const onBasePage = pathname === basePath;
  const activeParent = navItems.find((item) => item.children && item.href === pathname);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (pathname === basePath) return navItems.find((item) => !item.href)?.id ?? null;
    const parent = navItems.find((item) => item.children && item.href === pathname);
    return parent?.children?.[0]?.id ?? null;
  });

  const { tabs, centerId, more } = splitTabs(
    navItems,
    tabIds ?? TABS_BY_BASE_PATH[basePath]?.tabIds ?? navItems.slice(0, 4).map((item) => item.id),
    centerTabId ?? TABS_BY_BASE_PATH[basePath]?.centerTabId
  );
  const moreActive = isMoreActive(pathname, basePath, more);

  useEffect(() => {
    // Scroll-spy over the sub-sections of the page being looked at (Edit
    // Profile's Personal Details / Contact / Security).
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
    // Landing here as ...#id from another page: re-run our own scroll so
    // the offset matches a same-page click.
    const hash = window.location.hash.slice(1);
    if (hash) scrollToSection(hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    // The More sheet is a modal: Escape closes it, focus moves into it and
    // back to the button that opened it, and the page under it stays put.
    if (!sheetOpen) return;
    const opener = moreButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSheetOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [sheetOpen]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // A hard navigation so the next request carries the cleared cookies.
    window.location.href = "/?farewell=1";
  }

  // Signing out on idle clears the session immediately but shows
  // SessionTimeoutDialog rather than silently dropping them on the home
  // page. scope "local" ends this device's session only.
  async function handleIdleTimeout() {
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "local" });
    setTimedOut(true);
  }

  useIdleTimeout(timedOut ? 0 : sessionTimeoutMinutes, handleIdleTimeout);

  function scrollToSection(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - (offsetTop ? 96 : 88);
    window.scrollTo({ top: y, behavior: "smooth" });
    // preventDefault skipped the browser's own hash update -- set it so
    // refresh, share and Back keep the section.
    history.replaceState(null, "", `#${id}`);
  }

  function isActive(item: ShellNavItem) {
    return item.href
      ? isNavItemActive(pathname, basePath, item.href)
      : onBasePage && activeId === item.id;
  }

  // Anchor items resolve to a real URL so they work from any page this
  // shell wraps. A plain anchor throughout (not next/link): client-side
  // transitions into a differently-chromed route were silently not
  // completing in this environment.
  function navProps(item: ShellNavItem, onNavigate?: () => void) {
    const targetHref = item.href ?? `${basePath}#${item.id}`;
    const active = isActive(item);
    return {
      href: targetHref,
      "aria-current": active ? ("page" as const) : undefined,
      // The guided tour's target (OnboardingTour). Every render carries it
      // and the tour picks whichever one is on screen, so the tour works at
      // every width instead of only where the full sidebar shows.
      "data-tour": `nav-${item.id}`,
      onClick: (e: MouseEvent) => {
        if (!item.href && onBasePage) {
          e.preventDefault();
          scrollToSection(item.id);
        } else if (targetHref !== pathname) {
          markLeaving();
        }
        onNavigate?.();
      },
    };
  }

  function badge(count: number | undefined, className = "") {
    if (!count) return null;
    return (
      <span
        className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-700 px-1.5 text-[11px] font-bold leading-none text-white ${className}`}
      >
        <span className="sr-only">, </span>
        {count > 99 ? "99+" : count}
        <span className="sr-only"> waiting</span>
      </span>
    );
  }

  // --- the full sidebar (2xl and up) --------------------------------------

  function renderSidebarItem(item: ShellNavItem) {
    const active = isActive(item);
    const showChildren = item.href && item.children && pathname === item.href;
    return (
      <div key={item.id}>
        <a
          {...navProps(item)}
          className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition ${
            active
              ? "bg-teal-50 font-bold text-teal-800"
              : "font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <i aria-hidden="true" className={`fa-solid ${item.icon} w-4 text-center text-sm`}></i>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {badge(item.badge)}
        </a>
        {showChildren && (
          <div className="mb-1 ml-5 mt-1 space-y-0.5 border-l-2 border-slate-100 pl-2">
            {item.children!.map((child) => {
              const childActive = activeId === child.id;
              return (
                <a
                  key={child.id}
                  href={`${item.href}#${child.id}`}
                  aria-current={childActive ? "location" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection(child.id);
                  }}
                  className={`flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    childActive ? "bg-slate-100 text-teal-800" : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  <i aria-hidden="true" className={`fa-solid ${child.icon} w-3.5 text-center text-[11px]`}></i>
                  <span>{child.label}</span>
                </a>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // --- the icon rail (lg to 2xl) ------------------------------------------

  function renderRailItem(item: ShellNavItem) {
    const active = isActive(item);
    const short = item.short ?? item.label;
    return (
      <a
        key={item.id}
        {...navProps(item)}
        aria-label={short !== item.label ? item.label : undefined}
        title={item.label}
        className={`relative mx-1.5 flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-2 text-center text-[11px] leading-tight tracking-tight transition ${
          active
            ? "bg-teal-50 font-bold text-teal-800"
            : "font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        <i aria-hidden="true" className={`fa-solid ${item.icon} text-base`}></i>
        <span className="max-w-full">{short}</span>
        {badge(item.badge, "absolute left-1/2 top-1 ml-2 ring-2 ring-white")}
      </a>
    );
  }

  // --- the phone tab bar (below lg) ---------------------------------------

  function renderTab(item: ShellNavItem) {
    const active = isActive(item);
    const short = item.short ?? item.label;
    if (item.id === centerId) {
      return (
        <a
          key={item.id}
          {...navProps(item)}
          aria-label={short !== item.label ? item.label : undefined}
          className="flex min-w-0 flex-col items-center justify-start gap-0.5 text-[11px] font-bold text-slate-900"
        >
          <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-teal-700 text-white shadow-lg shadow-teal-900/25">
            <i aria-hidden="true" className={`fa-solid ${item.icon} text-lg`}></i>
          </span>
          <span className="max-w-full truncate">{short}</span>
        </a>
      );
    }
    return (
      <a
        key={item.id}
        {...navProps(item)}
        aria-label={short !== item.label ? item.label : undefined}
        className={`relative flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] ${
          active ? "font-bold text-teal-700" : "font-semibold text-slate-500"
        }`}
      >
        <i aria-hidden="true" className={`fa-solid ${item.icon} text-lg`}></i>
        <span className="max-w-full truncate px-0.5">{short}</span>
        {badge(item.badge, "absolute left-1/2 top-1 ml-1.5 ring-2 ring-white")}
      </a>
    );
  }

  // Sits with the other ways out of the dashboard in every render. The four
  // dashboards are all in NAV_HIDDEN_ROUTES (the public Navbar is kept off
  // them), so without this the only exit is Log Out, which also ends the
  // session.
  function renderHomeLink(variant: "sidebar" | "rail" | "sheet", onNavigate?: () => void) {
    const className =
      variant === "rail"
        ? "mx-2 flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-[11px] font-semibold leading-tight text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        : "flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900";
    return (
      // A plain anchor on purpose: this leaves the dashboard chrome for the
      // public site's layout, and client-side transitions there were
      // silently not completing.
      // eslint-disable-next-line @next/next/no-html-link-for-pages
      <a
        href="/"
        onClick={() => {
          markLeaving();
          onNavigate?.();
        }}
        className={className}
      >
        <i aria-hidden="true" className={`fa-solid fa-house ${variant === "rail" ? "text-base" : "w-4 text-center text-sm"}`}></i>
        <span>Back to Home</span>
      </a>
    );
  }

  function renderSignOut(variant: "sidebar" | "rail" | "sheet") {
    if (variant === "rail") {
      return (
        <button
          type="button"
          onClick={handleSignOut}
          aria-label="Log Out"
          title="Log Out"
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <i aria-hidden="true" className="fa-solid fa-arrow-right-from-bracket text-sm"></i>
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={handleSignOut}
        className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
          variant === "sheet" ? "text-red-700 hover:bg-red-50" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        <i aria-hidden="true" className="fa-solid fa-arrow-right-from-bracket w-4 text-center text-sm"></i>
        <span>Log Out</span>
      </button>
    );
  }

  function renderIdentity(size: number) {
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <AvatarThumbnail url={userAvatarUrl} name={userName} size={size} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{userName}</p>
          <p className="truncate text-xs text-slate-500">{userEmail}</p>
          {userCode && <p className="truncate font-mono text-[11px] font-semibold text-slate-500">{userCode}</p>}
        </div>
      </div>
    );
  }

  function renderBrandMark(size = "h-9 w-9") {
    return (
      <span className={`flex ${size} shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white`}>
        <i aria-hidden="true" className={`fa-solid ${brandIcon} text-sm`}></i>
      </span>
    );
  }

  const top = offsetTop ? "top-[41px] h-[calc(100vh-41px)]" : "top-0 h-screen";

  return (
    <div className="min-h-screen bg-slate-50">
      <SessionTimeoutDialog
        open={timedOut}
        loginHref={LOGIN_HREF_BY_BASE_PATH[basePath] ?? "/patient/login"}
      />
      {realtimeTables && realtimeTables.length > 0 && <RealtimeRefresh tables={realtimeTables} />}

      {/* Phone top bar: who this is and the way to everything else. The
          screen's own title is the page's h1, just below it. */}
      <header
        className={`sticky z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 pl-4 pr-2 backdrop-blur lg:hidden ${
          offsetTop ? "top-[41px]" : "top-0"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {renderBrandMark("h-8 w-8")}
          <span className="truncate text-sm font-bold text-slate-900">{brandLabel}</span>
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Open menu"
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          className="flex h-11 w-11 items-center justify-center rounded-full"
        >
          <AvatarThumbnail url={userAvatarUrl} name={userName} size={34} />
        </button>
      </header>

      {/* Laptop icon rail */}
      <nav
        aria-label={`${brandLabel} navigation`}
        className={`fixed left-0 z-30 hidden w-[88px] flex-col border-r border-slate-200 bg-white py-3 lg:flex 2xl:hidden ${top}`}
      >
        <div className="mb-3 flex justify-center">{renderBrandMark("h-10 w-10")}</div>
        <div className="flex-1 space-y-1 overflow-y-auto">{navItems.map(renderRailItem)}</div>
        <div className="space-y-1 border-t border-slate-100 pt-2">
          {renderHomeLink("rail")}
          <div className="flex justify-center pt-1" title={userCode ? `${userName} · ${userCode}` : userName}>
            <AvatarThumbnail url={userAvatarUrl} name={userName} size={36} />
          </div>
          {renderSignOut("rail")}
        </div>
      </nav>

      {/* Desktop sidebar */}
      <nav
        aria-label={`${brandLabel} navigation`}
        className={`fixed left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white p-4 2xl:flex ${top}`}
      >
        <div className="mb-4 flex items-center gap-2.5 px-1">
          {renderBrandMark("h-10 w-10")}
          <span className="text-base font-bold leading-tight text-slate-900">{brandLabel}</span>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto">{navItems.map(renderSidebarItem)}</div>
        <div className="mt-2 space-y-1 border-t border-slate-100 pt-3">
          {renderHomeLink("sidebar")}
          <div className="px-2 py-2">{renderIdentity(36)}</div>
          {renderSignOut("sidebar")}
        </div>
      </nav>

      {/* Phone tab bar. data-tabbar lifts anything else pinned to the
          bottom of the screen (toasts, the live-update banner) above it --
          see --app-bottom-inset in globals.css. */}
      <nav
        aria-label={`${brandLabel} navigation`}
        data-tabbar=""
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-slate-200 bg-white px-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 lg:hidden"
        style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
      >
        {tabs.map(renderTab)}
        <button
          ref={moreButtonRef}
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          aria-current={moreActive ? "page" : undefined}
          className={`relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 text-[11px] ${
            moreActive ? "font-bold text-teal-700" : "font-semibold text-slate-500"
          }`}
        >
          <i aria-hidden="true" className="fa-solid fa-bars text-lg"></i>
          <span>More</span>
          {badge(more.reduce((n, item) => n + (item.badge ?? 0), 0), "absolute left-1/2 top-1 ml-1.5 ring-2 ring-white")}
        </button>
      </nav>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/45" onClick={() => setSheetOpen(false)}></div>
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="More"
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-2 shadow-2xl"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300" aria-hidden="true"></div>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              {renderIdentity(44)}
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close menu"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                <i aria-hidden="true" className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <nav aria-label="More" className="pt-3">
              {more.length > 0 && (
                <div className="grid grid-cols-3 gap-2.5 pb-3">
                  {more.map((item) => {
                    const active = isActive(item);
                    return (
                      <a
                        key={item.id}
                        {...navProps(item, () => setSheetOpen(false))}
                        className={`relative flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-2xl px-1.5 py-3 text-center text-xs font-bold ${
                          active ? "bg-teal-50 text-teal-800 ring-1 ring-teal-200" : "bg-slate-50 text-slate-800"
                        }`}
                      >
                        <i aria-hidden="true" className={`fa-solid ${item.icon} text-lg text-teal-700`}></i>
                        <span className="leading-tight">{item.label}</span>
                        {badge(item.badge, "absolute right-2 top-2")}
                      </a>
                    );
                  })}
                </div>
              )}
              <div className="space-y-0.5 border-t border-slate-100 pt-2">
                {renderHomeLink("sheet", () => setSheetOpen(false))}
                {renderSignOut("sheet")}
              </div>
            </nav>
          </div>
        </div>
      )}

      <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-[88px] 2xl:pl-64">
        <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 sm:mb-8">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-slate-900">{headerTitle}</h1>
              {headerSubtitle && <div className="mt-1 text-xs text-slate-500">{headerSubtitle}</div>}
            </div>
            {/* Always rendered: every dashboard gets the same control in the
                same place. */}
            <div className="flex flex-wrap items-center gap-4">
              {headerActions}
              <RefreshButton />
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
