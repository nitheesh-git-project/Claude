"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AnnouncementAudience, DashboardAnnouncement } from "@/lib/announcements";

/**
 * What every screen of one dashboard is handed by its layout: this person's
 * live announcements, and whether they have a notebook to open.
 *
 * A context rather than props because `DashboardShell` is rendered by each
 * page for itself -- twenty-odd call sites -- and the banner and the
 * notebook are not any one page's business. The layout reads once
 * (DashboardExtrasGate), the shell draws.
 */
export type DashboardExtras = {
  role: AnnouncementAudience;
  announcements: DashboardAnnouncement[];
  notebook: {
    /** False while an admin is signed in as this person: a notebook is
     *  private to its owner, so it is not offered at all. */
    enabled: boolean;
    /** First name for the cover ("Asha's notebook"), or null. */
    ownerFirstName: string | null;
  };
};

const DashboardExtrasContext = createContext<DashboardExtras | null>(null);

export default function DashboardExtrasProvider({
  value,
  children,
}: {
  value: DashboardExtras;
  children: ReactNode;
}) {
  return <DashboardExtrasContext.Provider value={value}>{children}</DashboardExtrasContext.Provider>;
}

/** Null outside a dashboard layout (a shell rendered in a test, or a page
 *  that has no gate): the banner and the notebook then simply are not there. */
export function useDashboardExtras(): DashboardExtras | null {
  return useContext(DashboardExtrasContext);
}
