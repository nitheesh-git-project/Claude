"use client";

import { createContext, useContext, type ReactNode } from "react";

// Moving between admin screens without asking the server for the dashboard
// again.
//
// Every screen of this dashboard is rendered at once and hidden behind
// `hidden`, and the sidebar switches between them with `setState` plus
// `history.pushState` -- deliberately, because a Next.js navigation would
// re-run all ~49 of the page's queries to move between two screens that are
// already in the DOM. That is why the sidebar has always felt instant.
//
// Everything *else* that points at a screen was an ordinary link to
// `/admin/dashboard?section=…&tab=…`: the Today queues, the stat tiles, the
// Money alerts, the health banner. Same route, different query -- which is
// a real navigation, so tapping "Out-of-area requests" threw away a rendered
// dashboard, waited seconds for the server to build another one, and then
// swapped the screen. To the person it reads as a dead tap followed by a
// jump.
//
// So the shell publishes its own navigate here and those links use it. They
// stay real anchors with real hrefs -- middle-click, right-click, Copy Link
// Address and opening in a new tab all keep working, and a screen is still
// linkable and survives a reload. Only the plain left click is intercepted.

export type AdminScreenNavigation = {
  /** Switch to a screen already on this page. `view` is the one-shot filter
   *  preset the target screen applies on arrival. */
  goToScreen: (section: string, tab: string, view?: string | null) => void;
};

const AdminScreenNavigationContext = createContext<AdminScreenNavigation | null>(null);

export function AdminScreenNavigationProvider({
  value,
  children,
}: {
  value: AdminScreenNavigation;
  children: ReactNode;
}) {
  return (
    <AdminScreenNavigationContext.Provider value={value}>
      {children}
    </AdminScreenNavigationContext.Provider>
  );
}

/**
 * Null outside the dashboard shell, deliberately.
 *
 * The same components render on the admin *detail* routes (a patient's
 * page), where there is no dashboard in the DOM to switch and a link has to
 * be a real navigation. Answering null rather than throwing is what lets one
 * link component serve both, the same posture `useLiveUpdates` and
 * `useToast` take.
 */
export function useAdminScreenNavigation(): AdminScreenNavigation | null {
  return useContext(AdminScreenNavigationContext);
}

/** Reads a dashboard screen out of an `adminScreenHref` URL. Anything else
 *  -- a detail route, an external link -- answers null and is left to
 *  navigate normally. */
export function parseAdminScreenHref(
  href: string
): { section: string; tab: string; view: string | null } | null {
  const [path, query] = href.split("?");
  if (path !== "/admin/dashboard" || !query) return null;
  const params = new URLSearchParams(query);
  const section = params.get("section");
  const tab = params.get("tab");
  if (!section || !tab) return null;
  return { section, tab, view: params.get("view") };
}
