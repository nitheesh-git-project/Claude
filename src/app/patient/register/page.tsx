import { Suspense } from "react";
import type { Metadata } from "next";
import InviteRegisterCard from "@/components/auth/InviteRegisterCard";
import { createPublicClient } from "@/lib/supabase/public";
import { readInviteDelivery } from "@/lib/inviteDeliveryServer";

export const metadata: Metadata = {
  title: "Complete Your Registration | MoveRestore",
};

// Re-read every five minutes like the other public pages, so the invite
// promise below follows the Google / Meet settings rather than the build.
export const revalidate = 300;

export default async function PatientRegisterPage() {
  // Whether the confirmation may promise a calendar invite (Google
  // configured and Meet links on); otherwise it points at the dashboard.
  const inviteDelivery = await readInviteDelivery(createPublicClient());
  return (
    <Suspense fallback={null}>
      <InviteRegisterCard inviteDelivery={inviteDelivery} />
    </Suspense>
  );
}
