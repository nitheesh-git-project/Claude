import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { IMPERSONATION_COOKIE } from "@/lib/impersonation";
import { isDataRequestRole, makeReference, validateDeletionReason } from "@/lib/dataRequests";

// "Delete my account" on a profile page. It opens a case for the People desk
// rather than deleting anything: clinical, payment and audit records must be
// kept, so a deletion is the existing admin delete (login and contact
// details removed, records kept) done by a person within 30 days.
//
// POST { reason?: string }      -> 200 { reference }   opens the request
// POST { withdraw: true }       -> 200 { withdrawn }   takes it back while open
//   400 bad body; 401; 403 admin, or staff viewing as the person;
//   409 already has an open request (opening) / none to withdraw; 429.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{ reason?: unknown; withdraw?: unknown }>(request);
  if (parseError) return parseError;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user ?? null;
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (request.cookies.get(IMPERSONATION_COOKIE)) {
    return NextResponse.json({ error: "Only the account holder can ask for their account to be deleted." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError) {
    return NextResponse.json({ error: "We couldn't reach your account just now. Please try again." }, { status: 503 });
  }
  if (!isDataRequestRole(profile?.role)) {
    return NextResponse.json({ error: "Staff accounts are removed by a Master Admin." }, { status: 403 });
  }

  const limited = await enforceRateLimit(request, "deletionRequest", { identifier: user.id });
  if (limited) return limited;

  if (body.withdraw === true) {
    const { data, error } = await admin
      .from("data_requests")
      .update({ status: "withdrawn", resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("kind", "deletion")
      .eq("status", "open")
      .select("reference");
    if (error) {
      return NextResponse.json({ error: "We couldn't update your request just now. Please try again." }, { status: 503 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "There is no request to take back, or our team has already started on it. Write to us if you have changed your mind." },
        { status: 409 }
      );
    }
    return NextResponse.json({ withdrawn: data[0].reference });
  }

  const reason = validateDeletionReason(body.reason);
  if (!reason.ok) return NextResponse.json({ error: reason.error }, { status: 400 });

  // A reference collision is astronomically unlikely, but a unique index
  // refusal is a retry, not a failure the person sees.
  for (let attempt = 0; attempt < 3; attempt++) {
    const reference = makeReference("DEL");
    const { error } = await admin.from("data_requests").insert({
      reference,
      user_id: user.id,
      role: profile!.role,
      kind: "deletion",
      status: "open",
      reason: reason.value,
    });
    if (!error) return NextResponse.json({ reference });
    if (error.code === "23505" && /one_open_deletion/.test(error.message)) {
      return NextResponse.json({ error: "You already have a deletion request open." }, { status: 409 });
    }
    if (error.code !== "23505") {
      console.error("Could not open a deletion request", user.id, error.message);
      return NextResponse.json({ error: "We couldn't send your request just now. Please try again." }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "We couldn't send your request just now. Please try again." }, { status: 500 });
}
