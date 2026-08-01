"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";

// `href` marks a real page navigation (e.g. "Edit Profile") rather than a
// same-page anchor -- it renders as a plain anchor instead of a scroll
// button, is never scroll-spied (there's no section on this page to
// observe), and isn't included in the IntersectionObserver targets below.
export type ShellNavItem = { id: string; label: string; icon: string; href?: string };

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
  navItems,
  userName,
  userEmail,
  userAvatarUrl,
  offsetTop,
  headerTitle,
  headerSubtitle,
  headerActions,
  children,
}: {
  brandLabel: string;
  brandIcon: string;
  navItems: ShellNavItem[];
  userName: string;
  userEmail: string;
  userAvatarUrl: string | null;
  offsetTop: boolean;
  headerTitle: string;
  headerSubtitle?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(
    navItems.find((item) => !item.href)?.id ?? null
  );

  useEffect(() => {
    // Highlights whichever section is currently nearest the top of the
    // viewport -- real scroll-spy over the page's actual sections, not a
    // fake "current tab" since there's no tab state here to read from. Link
    // items (Edit Profile) are excluded -- there's no on-page section for
    // them to observe.
    const anchorItems = navItems.filter((item) => !item.href);
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
  }, [navItems]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // A hard navigation so the browser sends a fresh request guaranteed to
    // carry the now-cleared auth cookies -- see SignOutButton for the same
    // reasoning, duplicated here since this sign-out control needs the
    // sidebar's dark styling rather than that component's light one.
    window.location.href = "/?farewell=1";
  }

  function scrollToSection(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - (offsetTop ? 96 : 88);
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  // A plain render function, not a nested component -- called directly
  // rather than as <NavItem ... />, so React never treats it as its own
  // component type and there's nothing to remount every render.
  function renderNavItem(item: ShellNavItem, mini: boolean, onNavigate?: () => void) {
    const active = activeId === item.id;
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

    if (item.href) {
      return (
        // A plain anchor (full page load), not next/link -- this crosses
        // out of the dashboard shell into a differently-chromed page (the
        // public Navbar/Footer come back), and a hard nav sidesteps any
        // client-side-transition edge case the same way this codebase's own
        // login handlers already do for cookie-sensitive navigations.
        <a
          key={item.id}
          href={item.href}
          onClick={() => onNavigate?.()}
          title={mini ? item.label : undefined}
          className={className}
        >
          {content}
        </a>
      );
    }

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          scrollToSection(item.id);
          onNavigate?.();
        }}
        title={mini ? item.label : undefined}
        className={className}
      >
        {content}
      </button>
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

  function renderFooter(mini: boolean) {
    return (
      <div className="mt-auto space-y-1 border-t border-slate-800 pt-3">
        <div className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${mini ? "justify-center" : ""}`}>
          <AvatarThumbnail url={userAvatarUrl} name={userName} size={32} />
          {!mini && (
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">{userName}</p>
              <p className="truncate text-[11px] text-slate-400">{userEmail}</p>
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
            <div className="flex-1 space-y-1">
              {navItems.map((item) => renderNavItem(item, false, () => setMobileOpen(false)))}
            </div>
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
          {navItems.map((item) => renderNavItem(item, collapsed))}
        </div>
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
