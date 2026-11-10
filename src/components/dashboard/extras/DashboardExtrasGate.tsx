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
import DashboardExtrasProvider, { type DashboardExtras } from "./DashboardExtrasProvider";

/**
 * Mounted in each of the three dashboard layouts: starts the read of who is
 * looking and what is announced to their role right now, and hands the
 * **promise** to every screen below. Nothing here is awaited, so the
 * dashboard renders at once and the banner and the notebook button stream
 * in beside it (WithDashboardExtras).
 *
 * Read with the service role after the role is established, like the other
 * dashboard reads: the page decides what renders. `announcements` also
 * carries the same rule as an RLS policy, so the two cannot disagree about
 * what a role may see. The announcements and this person's receipts are
 * read together -- the receipts by person, not by announcement, so neither
 * waits for the other.
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
export default function DashboardExtrasGate({
  role,
  children,
}: {
  role: AnnouncementAudience;
  children: React.ReactNode;
}) {
  return <DashboardExtrasProvider value={loadExtras(role)}>{children}</DashboardExtrasProvider>;
}

async function loadExtras(role: AnnouncementAudience): Promise<DashboardExtras | null> {
  try {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const admin = createAdminClient();
    // Started before the viewer is known: the announcements depend only on
    // the role this layout is for, so they need not wait for it.
    const rowsRead = admin
      .from("announcements")
      .select(ANNOUNCEMENT_SELECT)
      .not("published_at", "is", null)
      .lte("starts_at", nowIso)
      .gt("ends_at", nowIso)
      .contains("audiences", [role])
      .limit(50)
      .then((r) => r);

    const viewer = await readDashboardViewer();
    const mine = viewer.status === "ok" && viewer.role === role && viewer.active;
    if (viewer.status !== "ok" || !mine) {
      void rowsRead;
      return null;
    }

    const [{ data: rows, error }, { data: receipts, error: receiptError }] = await Promise.all([
      rowsRead,
      admin
        .from("announcement_receipts")
        .select("announcement_id, dismissed_at, popup_seen_at")
        .eq("user_id", viewer.userId)
        .order("announcement_id")
        .limit(1000),
    ]);

    let announcements: DashboardAnnouncement[] = [];
    if (error) {
      console.error("[announcements] dashboard read failed:", error.message);
    } else if (receiptError) {
      // Without the receipts a closed banner would come back and a seen
      // pop-up would open again. Showing nothing this once is the smaller
      // wrong.
      console.error("[announcements] receipt read failed:", receiptError.message);
    } else {
      announcements = announcementsForDashboard(
        (rows ?? []) as AnnouncementRow[],
        (receipts ?? []) as AnnouncementReceipt[],
        role,
        nowMs
      );
    }

    return {
      role,
      announcements,
      notebook: {
        enabled: !viewer.impersonating,
        ownerFirstName: viewer.fullName ? viewer.fullName.split(/\s+/)[0] ?? null : null,
      },
    };
  } catch (error) {
    console.error("[announcements] dashboard extras failed:", error);
    return null;
  }
}
