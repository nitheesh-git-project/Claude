import { createAdminClient } from "@/lib/supabase/admin";
import { ANNOUNCEMENT_SELECT, type AnnouncementRow } from "@/lib/announcements";
import AdminAnnouncementsManager from "@/components/admin/AdminAnnouncementsManager";

// Settings -> Announcements. Self-fetching like ProfileWidgetSettings, so
// the dashboard's big Promise.all does not grow for one screen; rendered
// only on the Settings section, which no scope but a Master Admin's is
// sent, and every route behind it is requireAdminScope("settings").
//
// An unreadable table says so rather than drawing an empty list: "you have
// no announcements" would be a lie an admin acts on by posting one twice.
export default async function AnnouncementSettings() {
  const { data, error } = await createAdminClient()
    .from("announcements")
    .select(ANNOUNCEMENT_SELECT)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-semibold">We couldn&apos;t load the announcements just now.</p>
        <p className="mt-1">
          Nothing has been changed. Refresh the page to try again. If this is a new database, the announcements
          tables may not have been created yet.
        </p>
      </div>
    );
  }

  return <AdminAnnouncementsManager rows={(data ?? []) as AnnouncementRow[]} serverNow={nowTimestamp()} />;
}

function nowTimestamp() {
  return Date.now();
}
