import { NextRequest, NextResponse } from "next/server";
import { getAdminContextResult } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import {
  ACCOUNT_ALREADY_GONE,
  ACCOUNT_DELETE_REFUSED,
  CANNOT_DELETE_LAST_ADMIN,
  CANNOT_DELETE_SELF,
  NO_ACCOUNT_REFERENCES,
  countAccountReferences,
  describeAccountBlockers,
  type AccountReferences,
} from "@/lib/accountDeletion";

// Deleting an account outright, when there is nothing behind it.
//
// This is deliberately the narrow half of "delete a user". Thirty-five
// tables carry a foreign key to `profiles(id)` with no ON DELETE behaviour,
// so an account that has ever booked, paid, been paid, been treated or acted
// in the back office cannot be removed without removing that history too --
// and the money screens and the audit trail are built on it. What is left is
// still the case that comes up: an account created with the wrong email, a
// duplicate, one made against the wrong person. Those go. Everything else is
// refused with the count named and suspension offered, which is what the
// admin wanted anyway.
//
// Full scope only, checked directly rather than through
// requireAdminScope("people"). Every desk that manages People can already
// suspend; this one is irreversible and takes a login away permanently, so
// it belongs with the other two rules of its kind -- and it carries their
// guards: never yourself, never the last Master Admin who can still sign in.

/** Where an account's history lives, grouped as a person would describe it.
 *  Not one entry per foreign key: fifty columns is a true list and an
 *  unreadable one. The database is still the authority -- if something not
 *  counted here points at the row, the delete fails and says so. */
const PROBES: { table: string; column: string; group: keyof AccountReferences }[] = [
  { table: "appointments", column: "patient_id", group: "sessions" },
  { table: "appointments", column: "therapist_id", group: "sessions" },
  { table: "appointments", column: "cancelled_by", group: "sessions" },
  { table: "appointments", column: "preferred_therapist_id", group: "sessions" },
  { table: "appointments", column: "cash_collected_by", group: "sessions" },
  { table: "payments", column: "patient_id", group: "money" },
  { table: "therapist_payout_batches", column: "therapist_id", group: "money" },
  { table: "therapist_payout_batches", column: "settled_by", group: "money" },
  { table: "business_expenses", column: "created_by", group: "money" },
  { table: "patient_package_purchases", column: "patient_id", group: "programmes" },
  { table: "patient_package_purchases", column: "locked_therapist_id", group: "programmes" },
  { table: "home_visit_package_purchases", column: "patient_id", group: "programmes" },
  { table: "home_visit_package_purchases", column: "locked_therapist_id", group: "programmes" },
  { table: "care_plan_versions", column: "authored_by", group: "clinical" },
  { table: "pain_assessments", column: "submitted_by", group: "clinical" },
  { table: "session_notes", column: "therapist_id", group: "clinical" },
  { table: "condition_change_requests", column: "submitted_by", group: "clinical" },
  { table: "admin_activity_log", column: "actor_id", group: "backOffice" },
  { table: "admin_impersonation_sessions", column: "target_id", group: "backOffice" },
  { table: "patient_referrals", column: "converted_patient_id", group: "referrals" },
  { table: "patient_referrals", column: "assigned_therapist_id", group: "referrals" },
];

type Body = { userId?: string };

export async function POST(request: NextRequest) {
  const guard = await getAdminContextResult();
  if (!guard.ok) {
    if (guard.reason === "unauthenticated") {
      return NextResponse.json(
        { error: "Your session has expired. Sign in again and retry.", retryable: true },
        { status: 401 }
      );
    }
    if (guard.reason === "unavailable") {
      return NextResponse.json(
        { error: "Could not check your access just now. Please try again.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const context = guard.context;
  if (context.scope !== "full") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await parseJsonBody<Body>(request);
  if (parsed.error) return parsed.error;

  const userId = parsed.data.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }
  if (userId === context.id) {
    return NextResponse.json({ error: CANNOT_DELETE_SELF }, { status: 409 });
  }

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id, full_name, email, role, admin_scope")
    .eq("id", userId)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: ACCOUNT_ALREADY_GONE }, { status: 404 });
  }

  // The same guard suspension carries, for the same reason: with the last
  // Master Admin gone there is nobody left who could widen anyone's access
  // again, and this one has no undo at all.
  if (target.role === "admin" && (target.admin_scope ?? "full") === "full") {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("admin_scope", "full")
      .neq("active", false);
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: CANNOT_DELETE_LAST_ADMIN }, { status: 409 });
    }
  }

  // One round of head-counts rather than twenty-one awaits. A probe against
  // a table this deployment has not migrated yet answers null, which counts
  // as zero -- and the delete itself is what actually decides, so an
  // undercount costs a clearer message rather than a wrong outcome.
  const refs: AccountReferences = { ...NO_ACCOUNT_REFERENCES };
  const counts = await Promise.all(
    PROBES.map(async (probe) => {
      const { count } = await admin
        .from(probe.table)
        .select("id", { count: "exact", head: true })
        .eq(probe.column, userId);
      return { group: probe.group, count: count ?? 0 };
    })
  );
  for (const { group, count } of counts) refs[group] += count;

  const blockers = describeAccountBlockers(refs, target.full_name ?? "This account");
  if (blockers) {
    return NextResponse.json(
      { error: blockers.message, blocked: true, total: blockers.total },
      { status: 409 }
    );
  }

  // Recorded *before* the delete, unlike every other action in this app.
  // The audit row names the actor, and `actor_id` references `profiles(id)`
  // -- so an admin deleting their own colleague's empty account is fine, but
  // the row has to exist while the target's row still does for the label to
  // be resolvable, and more to the point: after a successful delete there is
  // nothing left to name. A delete that then fails leaves an entry saying it
  // was attempted, which is the safe direction for the one action with no
  // undo.
  await recordAdminActivity(admin, context.id, {
    action: "account.delete",
    targetId: userId,
    targetLabel: `${target.full_name ?? "Unnamed"} (${target.role})`,
    details: {
      role: target.role,
      email: target.email,
      historyRowsFound: countAccountReferences(refs),
    },
  });

  // Deleting the auth user is what removes the account: `profiles.id`
  // references it with ON DELETE CASCADE, and the four *_admin_notes tables
  // cascade off profiles in turn. Deleting the profile row alone would leave
  // a login with no profile behind it, which every guard in this app reads
  // as "not approved" rather than "gone".
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    // Almost always a foreign key this route did not probe. Say that rather
    // than passing a Postgres message to a clinic owner.
    return NextResponse.json({ error: ACCOUNT_DELETE_REFUSED, blocked: true }, { status: 409 });
  }

  // "Removed nothing" and "removed it" must be distinguishable, the rule the
  // category delete was rewritten for. GoTrue reporting success is not the
  // same as the row being gone.
  const { data: stillThere } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (stillThere) {
    return NextResponse.json({ error: ACCOUNT_DELETE_REFUSED, blocked: true }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
