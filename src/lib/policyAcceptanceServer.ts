import type { SupabaseClient } from "@supabase/supabase-js";
import type { PolicyContext, PolicyDocument } from "@/lib/policyAcceptance";

// Writes agreements to policy_acceptances with the service-role client.
//
// Best effort on a booking: the patient ticked the box and the booking is
// real, so a failed record is logged rather than turned into a failed
// booking. The accept-terms route, whose whole job is the record, checks the
// result itself instead of calling this.

export type AcceptanceRow = {
  userId: string;
  document: PolicyDocument;
  version: string;
  context: PolicyContext;
  appointmentId?: string | null;
};

export async function recordPolicyAcceptances(
  admin: SupabaseClient,
  rows: AcceptanceRow[]
): Promise<boolean> {
  if (rows.length === 0) return true;
  try {
    const { error } = await admin.from("policy_acceptances").insert(
      rows.map((r) => ({
        user_id: r.userId,
        document: r.document,
        version: r.version,
        context: r.context,
        appointment_id: r.appointmentId ?? null,
      }))
    );
    if (error) {
      console.error("Could not record a policy acceptance", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Could not record a policy acceptance", e);
    return false;
  }
}
