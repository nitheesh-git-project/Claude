import type { ReactNode } from "react";
import AdminDashboardPage from "@/app/admin/dashboard/page";
import DetailOverlayModal from "@/components/admin/DetailOverlayModal";
import { adminScreenHref } from "@/lib/adminNav";
import type { AdminSectionKey } from "@/lib/adminNav";

/**
 * What a patient's, therapist's or condition's own route renders when it is
 * not intercepted.
 *
 * Those three details are normally an overlay: the dashboard intercepts the
 * route (`@modal/(.)therapists/[id]`) and draws the detail on top of the
 * screen you were already on, with the dashboard behind it. Interception
 * covers **client-side** navigation only, so a reload, a new tab, a shared
 * link -- and any refresh that misses the router's own state -- land on the
 * real page underneath.
 *
 * That page used to wear a reduced frame of its own: a plain dark rail, no
 * badges, no search, and a "Back to the dashboard" link. It was honest about
 * being a leaf page and it read as having been thrown out of the back office
 * onto a different, plainer site -- which is exactly how it was reported,
 * from the one flow that refreshes (reassigning a session from a therapist's
 * profile).
 *
 * So the fallback is now the dashboard itself, with the same overlay on top:
 * one design, one sidebar, one header, whichever way the URL was reached.
 * Three things about it are load-bearing:
 *
 * - **It renders the real dashboard**, not a copy of its chrome. A second
 *   implementation of the shell is a second thing to drift -- which is the
 *   reason the frame it replaces was "deliberately reduced" in the first
 *   place, and the reduction is what made it look like another site.
 * - **The cost is paid on the rare path only.** Tapping a name from inside
 *   the dashboard still costs the detail's own queries and nothing more,
 *   because the dashboard behind the overlay is already rendered. A direct
 *   load now pays the dashboard's ~49 queries as well, which is what any
 *   admin screen costs and what this URL would have cost had they opened it
 *   the usual way.
 * - **Closing knows where to go.** A direct load has no history of ours, so
 *   the overlay is given the screen this detail belongs to rather than
 *   `router.back()`, which would leave the site.
 */
export default async function AdminDetailDashboard({
  section,
  tab,
  children,
}: {
  /** The screen this detail was opened from, and the one closing returns to. */
  section: AdminSectionKey;
  tab: string;
  children: ReactNode;
}) {
  return (
    <>
      <AdminDashboardPage searchParams={Promise.resolve({ section, tab })} />
      <DetailOverlayModal closeHref={adminScreenHref(section, tab)}>
        {children}
      </DetailOverlayModal>
    </>
  );
}
