import { createAdminClient } from "@/lib/supabase/admin";
import { readDashboardViewer } from "@/lib/dashboardViewer";
import {
  ANNOUNCEMENT_SELECT,
  announcementsForDashboard,
  type AnnouncementAudience,
  type AnnouncementReceipt,
  type AnnouncementRow,
  type DashboardAnnouncement,
} from "@/lib/announcements";
import DashboardExtrasProvider from "./DashboardExtrasProvider";

/**
 * Mounted in each of the three dashboard layouts: works out who is looking,
 * reads the announcements that are live for their role right now, and hands
 * them -- with whether a notebook is on offer -- to every screen below.
 *
 * Read with the service role after the role is established here, like the
 * other dashboard reads: the page decides what renders. `announcements`
 * also carries the same rule as an RLS policy, so the two cannot disagree
 * about what a role may see.
 *
 * **A read that fails shows no banner.** "We couldn't read the
 * announcements" is not something to put in front of a patient opening
 * their dashboard, and a missing banner costs nobody anything -- the failure
 * is logged here instead. The notebook is still offered: it does its own
 * reads when it is opened, and says so itself if they fail.
 *
 * A wrong-role visit (the proxy redirects those before a page renders, but
 * a layout must not rely on it) gets no announcements and no notebook.
 */
export default async function DashboardExtrasGate({
  role,
  children,
}: {
  role: AnnouncementAudience;
  children: React.ReactNode;
}) {
  const viewer = await readDashboardViewer();
  const mine = viewer.status === "ok" && viewer.role === role && viewer.active;

  let announcements: DashboardAnnouncement[] = [];
  if (mine && viewer.status === "ok") {
    const admin = createAdminClient();
    const nowIso = new Date(nowTimestamp()).toISOString();
    const { data: rows, error } = await admin
      .from("announcements")
      .select(ANNOUNCEMENT_SELECT)
      .not("published_at", "is", null)
      .lte("starts_at", nowIso)
      .gt("ends_at", nowIso)
      .contains("audiences", [role])
      .limit(50);
    if (error) {
      console.error("[announcements] dashboard read failed:", error.message);
    } else if (rows && rows.length > 0) {
      const { data: receipts, error: receiptError } = await admin
        .from("announcement_receipts")
        .select("announcement_id, dismissed_at, popup_seen_at")
        .eq("user_id", viewer.userId)
        .in(
          "announcement_id",
          rows.map((r) => r.id)
        );
      if (receiptError) {
        // Without the receipts a closed banner would come back and a seen
        // pop-up would open again. Showing nothing this once is the smaller
        // wrong.
        console.error("[announcements] receipt read failed:", receiptError.message);
      } else {
        announcements = announcementsForDashboard(
          rows as AnnouncementRow[],
          (receipts ?? []) as AnnouncementReceipt[],
          role,
          nowTimestamp()
        );
      }
    }
  }

  const firstName =
    viewer.status === "ok" && viewer.fullName ? viewer.fullName.split(/\s+/)[0] ?? null : null;

  return (
    <DashboardExtrasProvider
      value={{
        role,
        announcements,
        notebook: {
          enabled: mine && viewer.status === "ok" && !viewer.impersonating,
          ownerFirstName: firstName,
        },
      }}
    >
      {children}
    </DashboardExtrasProvider>
  );
}

// Render stays pure: the clock is read through a helper, the same shape
// ImpersonationGate and TutorialGate use.
function nowTimestamp() {
  return Date.now();
}
