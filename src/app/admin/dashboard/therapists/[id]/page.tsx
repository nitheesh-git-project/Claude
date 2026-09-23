import type { Metadata } from "next";
import { redirect } from "next/navigation";
import TherapistDetailContent from "@/components/admin/TherapistDetailContent";
import AdminDetailDashboard from "@/components/admin/AdminDetailDashboard";
import { getAdminContext } from "@/lib/supabase/requireAdmin";

export const metadata: Metadata = {
  title: "Therapist Details | Dr. Pooja's Physio",
};

// The real page behind the dashboard's overlay. Interception only covers
// client-side navigation, so a reload, a shared link, a new tab and the
// router.refresh() an action inside the overlay fires all land here -- which
// is why it has to look like the back office rather than like a different,
// plainer site. See AdminDetailDashboard.
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // The proxy already guards this route tree. This is the session that
  // lapsed between the proxy and here: the dashboard answers a missing user
  // with an empty render, which would paint an overlay over nothing, so the
  // login is the honest destination.
  const admin = await getAdminContext();
  if (!admin) redirect("/admin/login");

  return (
    <AdminDetailDashboard section="people" tab="therapists">
      <TherapistDetailContent id={id} />
    </AdminDetailDashboard>
  );
}
