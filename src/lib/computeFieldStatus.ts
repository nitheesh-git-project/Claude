import type { FieldStatusMap } from "@/components/profile/GatedProfileFields";

type ChangeRequestRow = {
  id: string;
  status: "pending" | "approved" | "declined";
  admin_notes: string | null;
  changes: Record<string, unknown>;
  created_at: string;
};

/**
 * Reduces a user's full change-request history into "what's the current
 * state of each individual field right now" — pending (locked, awaiting
 * review, carrying the requested new value), declined (editable again, with
 * the reason shown), or untouched (no entry). Requests are expected ordered
 * newest-first; for any field touched by more than one request, only the
 * most recent one matters, so an old decline doesn't linger after a later
 * resubmission was approved. Each field is submitted as its own request row
 * (see GatedProfileFields), so a field's pending/declined state here is
 * scoped to that one field, not entangled with any other field a user
 * happened to also change around the same time.
 */
export function computeFieldStatus(requests: ChangeRequestRow[]): FieldStatusMap {
  const status: FieldStatusMap = {};
  const seen = new Set<string>();

  for (const r of requests) {
    for (const field of Object.keys(r.changes ?? {})) {
      if (seen.has(field)) continue; // a newer request already decided this field's state
      seen.add(field);
      if (r.status === "pending") {
        status[field] = { status: "pending", requestId: r.id, newValue: r.changes[field] };
      } else if (r.status === "declined") {
        status[field] = { status: "declined", notes: r.admin_notes };
      }
      // "approved" leaves no entry — the field is just editable, showing
      // its now-updated current value.
    }
  }

  return status;
}
