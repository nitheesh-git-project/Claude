import { createClient } from "@/lib/supabase/server";
import YourDataCard, { type OpenDeletion } from "./YourDataCard";
import type { DataRequestRole } from "@/lib/dataRequests";

const KEPT: Record<DataRequestRole, string> = {
  patient: "By law we keep your clinical record, payments and agreements for the required period, marked as a closed account.",
  therapist: "By law we keep the records of sessions you delivered and payouts made to you, marked as a closed account.",
  hospital: "We keep the record of referrals made and any money owed either way, marked as a closed account.",
};

/** Reads the person's live deletion request (their own row, under RLS) and
 *  draws the card. Its own read, so a failure here touches nothing else. */
export default async function YourDataSection({ userId, role }: { userId: string; role: DataRequestRole }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_requests")
    .select("reference, status, created_at")
    .eq("user_id", userId)
    .eq("kind", "deletion")
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1);
  const open = (data?.[0] ?? null) as OpenDeletion;
  return <YourDataCard openDeletion={open} readFailed={!!error} keptRecords={KEPT[role]} />;
}
