"use client";

import { createContext, Suspense, use, useContext, type ReactNode } from "react";
import type { AnnouncementAudience, DashboardAnnouncement } from "@/lib/announcements";

/**
 * What every screen of one dashboard is handed by its layout: this person's
 * live announcements, and whether they have a notebook to open.
 *
 * A context rather than props because `DashboardShell` is rendered by each
 * page for itself -- twenty-odd call sites -- and the banner and the
 * notebook are not any one page's business. The layout starts the read
 * (DashboardExtrasGate) and hands over the **promise**, so no dashboard
 * waits for it: the two pieces that need the answer read it inside their
 * own Suspense boundary (`WithDashboardExtras`) and stream in beside the
 * page.
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

const DashboardExtrasContext = createContext<Promise<DashboardExtras | null> | null>(null);

export default function DashboardExtrasProvider({
  value,
  children,
}: {
  value: Promise<DashboardExtras | null>;
  children: ReactNode;
}) {
  return <DashboardExtrasContext.Provider value={value}>{children}</DashboardExtrasContext.Provider>;
}

function Resolved({
  pending,
  render,
}: {
  pending: Promise<DashboardExtras | null>;
  render: (extras: DashboardExtras) => ReactNode;
}) {
  const extras = use(pending);
  return extras ? <>{render(extras)}</> : null;
}

/**
 * Renders `render(extras)` once the layout's read answers, and nothing
 * until then (or outside a dashboard layout, or when the read failed).
 * Its own Suspense boundary, so waiting for it never holds the page.
 */
export function WithDashboardExtras({ render }: { render: (extras: DashboardExtras) => ReactNode }) {
  const pending = useContext(DashboardExtrasContext);
  if (!pending) return null;
  return (
    <Suspense fallback={null}>
      <Resolved pending={pending} render={render} />
    </Suspense>
  );
}
