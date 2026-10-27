import type { SupabaseClient } from "@supabase/supabase-js";
import {
  oldestFirst,
  type ReviewAccessRequest,
  type ReviewSubmission,
} from "@/lib/healthProfileReviews";

// The rows behind Today -> Health Profile reviews. Each read is its own call
// and each carries its own verdict: a failed read is "unreadable", which the
// screen says as "couldn't load", never an empty list that reads as "nothing
// is waiting". Names are resolved here (the profiles join is blocked by RLS
// for the service client's relationship hints in this codebase, so ids are
// looked up in one extra call); a name that could not be read becomes a plain
// "A patient" / "A therapist" and is flagged, never a raw id.

export type HealthProfileReviews = {
  submissions: { status: "ok"; rows: ReviewSubmission[] } | { status: "unreadable" };
  access: { status: "ok"; rows: ReviewAccessRequest[] } | { status: "unreadable" };
  /** Some names could not be read and are shown generically. */
  namesFailed: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export async function loadHealthProfileReviews(admin: AnyClient): Promise<HealthProfileReviews> {
  const [requestsRead, grantsRead] = await Promise.all([
    admin
      .from("condition_change_requests")
      .select("id, patient_id, submitted_by, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(500),
    admin
      .from("condition_access_grants")
      .select("id, patient_id, therapist_id, requested_at")
      .eq("status", "requested")
      .order("requested_at", { ascending: true })
      .limit(500),
  ]);

  const requests = requestsRead.error ? null : requestsRead.data ?? [];
  const grants = grantsRead.error ? null : grantsRead.data ?? [];

  const ids = [
    ...new Set([
      ...(requests ?? []).flatMap((r) => [r.patient_id as string, r.submitted_by as string]),
      ...(grants ?? []).flatMap((g) => [g.patient_id as string, g.therapist_id as string]),
    ]),
  ].filter(Boolean);

  let names = new Map<string, string>();
  let namesFailed = false;
  if (ids.length > 0) {
    const { data, error } = await admin.from("profiles").select("id, full_name").in("id", ids);
    if (error) namesFailed = true;
    else names = new Map((data ?? []).map((p) => [p.id as string, (p.full_name as string) ?? ""]));
  }
  const nameOf = (id: string, fallback: string) => names.get(id)?.trim() || fallback;

  return {
    namesFailed,
    submissions: requests
      ? {
          status: "ok",
          rows: oldestFirst(
            requests.map((r) => ({
              id: r.id as string,
              patientId: r.patient_id as string,
              patientName: nameOf(r.patient_id as string, "A patient"),
              submitterName: nameOf(r.submitted_by as string, "Someone"),
              submittedAt: r.created_at as string,
            })),
            (r) => r.submittedAt
          ),
        }
      : { status: "unreadable" },
    access: grants
      ? {
          status: "ok",
          rows: oldestFirst(
            grants.map((g) => ({
              id: g.id as string,
              patientId: g.patient_id as string,
              patientName: nameOf(g.patient_id as string, "A patient"),
              therapistName: nameOf(g.therapist_id as string, "A therapist"),
              requestedAt: g.requested_at as string,
            })),
            (g) => g.requestedAt
          ),
        }
      : { status: "unreadable" },
  };
}
