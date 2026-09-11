import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ConditionDetailContent from "@/components/admin/ConditionDetailContent";
import AdminDetailFrame from "@/components/admin/AdminDetailFrame";
import { getAdminContext } from "@/lib/supabase/requireAdmin";

export const metadata: Metadata = {
  title: "Patient Condition | Dr. Pooja's Physio",
};

// The real page behind the dashboard's overlay. Interception only covers
// client-side navigation, so a reload, a shared link, a new tab and the
// router.refresh() an action inside the overlay fires all land here -- which
// is why it has to look like the back office rather than like a different,
// plainer site. See AdminDetailFrame.
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // The proxy already guards this route tree; this is for the scope, which
  // decides which sections the frame offers. A session that has lapsed
  // between the two goes to the login rather than rendering a frame with no
  // navigation in it.
  const admin = await getAdminContext();
  if (!admin) redirect("/admin/login");

  return (
    <AdminDetailFrame scope={admin.scope} title="Patient condition">
      <ConditionDetailContent id={id} />
    </AdminDetailFrame>
  );
}
