import { NextRequest, NextResponse } from "next/server";
import { getAdminContextResult } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import {
  ACCOUNT_ALREADY_GONE,
  ACCOUNT_DELETE_REFUSED,
  ACCOUNT_DELETE_UNCHECKED,
  CANNOT_DELETE_LAST_ADMIN,
  CANNOT_DELETE_SELF,
  NO_ACCOUNT_REFERENCES,
  countAccountReferences,
  describeAccountBlockers,
  describeRefusedDelete,
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

/** Which of the six words a blocking table is described by.
 *
 *  Wording only. What *counts* comes from `account_blocking_references()`,
 *  which asks Postgres which foreign keys refuse a delete -- so this map
 *  cannot make an account look deletable when it is not. A table missing
 *  from it is still counted and still refuses; it simply reads as "other
 *  records" until somebody gives it a word.
 *
 *  This replaced a hand-written list of columns to probe, which is the bug
 *  this route was rewritten for: 35 foreign keys into `profiles` carry no
 *  ON DELETE behaviour and the list named 13 of them. For the other 22 the
 *  screen said "deletable", the delete failed, and the admin met a sentence
 *  apologising for the list being out of date. */
const GROUP_BY_TABLE: Record<string, keyof AccountReferences> = {
  appointments: "sessions",
  appointment_reassignment_log: "sessions",

  payments: "money",
  pay_later_payments: "money",
  payment_failure_log: "money",
  therapist_payout_batches: "money",
  therapist_payout_requests: "money",
  business_expenses: "money",
  // The record of a refund this admin asked the gateway for. It is
  // append-only and its foreign keys are `restrict`, so it genuinely blocks
  // -- and "1 money record" sends somebody to the right screen where "1
  // other record" sends them to none.
  refund_attempts: "money",

  patient_package_purchases: "programmes",
  home_visit_package_purchases: "programmes",
  package_purchase_events: "programmes",
  home_visit_purchase_events: "programmes",

  care_plans: "clinical",
  care_plan_versions: "clinical",
  care_plan_reviews: "clinical",
  pain_assessments: "clinical",
  pain_map_question_templates: "clinical",
  session_notes: "clinical",
  session_note_revisions: "clinical",
  condition_change_requests: "clinical",
  condition_access_grants: "clinical",
  patient_condition_profiles: "clinical",
  intake_question_templates: "clinical",

  admin_activity_log: "backOffice",
  admin_impersonation_sessions: "backOffice",
  admin_account_notes: "backOffice",
  patient_admin_notes: "backOffice",
  therapist_admin_notes: "backOffice",
  hospital_admin_notes: "backOffice",
  profile_change_requests: "backOffice",
  therapist_availability: "backOffice",
  therapist_availability_override: "backOffice",
  therapist_schedule_state: "backOffice",
  risk_reviews: "backOffice",

  patient_referrals: "referrals",

  // Not a public table, and the commonest blocker there is: `storage.objects`
  // references `auth.users(id)`, which is the row the delete actually removes.
  // Every account that ever uploaded an avatar has rows here, which is exactly
  // why this refusal was met on real accounts and never by the e2e fixtures.
  "storage.objects": "files",
  patient_medical_documents: "files",
};

/** The two columns on `profiles` itself, which point at different things and
 *  so cannot share one word: a hospital that referred somebody is a referral,
 *  and the admin who extended credit is a money record. */
const GROUP_BY_COLUMN: Record<string, keyof AccountReferences> = {
  "profiles.referred_by_hospital_id": "referrals",
  "profiles.pay_later_granted_by": "money",
};

type BlockingReference = {
  source_table: string;
  source_column: string;
  row_count: number;
};

function groupFor(row: BlockingReference): keyof AccountReferences {
  // `account_blocking_references` returns the table schema-qualified now, so a
  // name from another schema cannot collide with a public one and be described
  // by the wrong word. `public.` is still stripped, because the map is written
  // in the bare names the rest of this codebase uses.
  const qualified = row.source_table;
  const table = qualified.replace(/^public\./, "");
  return (
    GROUP_BY_COLUMN[`${table}.${row.source_column}`] ??
    GROUP_BY_TABLE[qualified] ??
    GROUP_BY_TABLE[table] ??
    "other"
  );
}

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

  // One question to the database rather than a list of head-counts this
  // route maintains. `account_blocking_references` reads pg_constraint for
  // the foreign keys that actually refuse a delete and counts each one's
  // rows, so the answer cannot go stale when a table is added.
  //
  // A database that has not run the migration answers with an error, and
  // that is the one case worth failing on rather than guessing: reporting
  // "nothing is in the way" because the counter is missing would offer a
  // delete this route is about to be refused for, on the one action with no
  // undo. The account can still be suspended, which is what the admin
  // wanted.
  const { data: blocking, error: blockingError } = await admin.rpc(
    "account_blocking_references",
    { p_user_id: userId }
  );
  if (blockingError) {
    console.error("account_blocking_references failed", blockingError);
    return NextResponse.json({ error: ACCOUNT_DELETE_UNCHECKED, retryable: true }, { status: 503 });
  }

  const refs: AccountReferences = { ...NO_ACCOUNT_REFERENCES };
  for (const row of (blocking ?? []) as BlockingReference[]) {
    refs[groupFor(row)] += Number(row.row_count) || 0;
  }

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
  // Done through `admin_delete_account()` rather than `auth.admin.deleteUser`,
  // which answers HTTP 500 with an **empty body** when Postgres refuses inside
  // its cascade -- so the route had nothing to report and said "the database
  // did not say why". That sentence is honest and useless: an admin cannot act
  // on it. The function issues the same `delete from auth.users` as its owner
  // and catches the violation, so whatever refused is named.
  const { data: outcome, error: rpcError } = await admin.rpc("admin_delete_account", {
    p_user_id: userId,
  });
  if (rpcError) {
    console.error("admin_delete_account failed", userId, rpcError);
    // A database the schema has not reached yet. Named rather than reported as
    // a refusal, the precedent `saveWeeklySchedule` sets: "the database said
    // no" and "this deployment has not run schema.sql" send somebody to two
    // completely different places.
    if (rpcError.code === "PGRST202" || rpcError.code === "42883") {
      return NextResponse.json(
        {
          error:
            "This database has not been updated yet, so deleting is switched off. Re-apply supabase/schema.sql, then try again. Suspend the account in the meantime.",
          blocked: true,
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: ACCOUNT_DELETE_REFUSED, blocked: true }, { status: 409 });
  }

  const result = (outcome ?? {}) as {
    status?: string;
    table?: string;
    constraint?: string;
    detail?: string;
    message?: string;
    sqlstate?: string;
  };

  if (result.status === "not_found") {
    // Somebody else removed it between the read above and here. Not a failure.
    return NextResponse.json({ error: ACCOUNT_ALREADY_GONE }, { status: 404 });
  }

  if (result.status === "blocked") {
    console.error("admin_delete_account blocked", userId, result);
    return NextResponse.json(
      { error: describeRefusedDelete(result.table), blocked: true },
      { status: 409 }
    );
  }

  if (result.status !== "deleted") {
    // A guard that raises its own sentence rather than violating a constraint
    // -- the Master Admin check is one -- lands here. Its message is written
    // for a person, so it is worth passing on.
    console.error("admin_delete_account error", userId, result);
    return NextResponse.json(
      { error: result.message?.trim() || ACCOUNT_DELETE_REFUSED, blocked: true },
      { status: 409 }
    );
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
    // The one path that used to be silent. "Removed nothing" and "removed it"
    // must stay distinguishable, and this one has no diagnosis behind it at
    // all -- which is worth a log line of its own.
    console.error("admin_delete_account reported success but the profile is still there", userId);
    return NextResponse.json({ error: ACCOUNT_DELETE_REFUSED, blocked: true }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
