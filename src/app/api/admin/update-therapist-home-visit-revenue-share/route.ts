import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";

// The rate a therapist is paid at for a **home visit**, which is a different
// number from the one they are paid for a video session and has been read by
// the payout maths since it shipped -- `therapistPayouts.ts` resolves
// `isHomeVisit ? homeVisitSharePercent ?? sharePercent : sharePercent`, and
// `settle-therapist-payout` transfers on exactly that. Until now nothing in
// the app could write it: the column was settable by hand in SQL or by the QA
// seed, so a clinic that agreed a different home-visit rate with somebody had
// no way to record it and the payout quietly used the online rate.
//
// A sibling of update-therapist-revenue-share rather than a field on it,
// because the two differ in the one way that matters: **this one may be
// cleared.** Null is a real, meaningful value here -- "no separate home-visit
// rate, use the ordinary share" -- where an empty ordinary share is a missing
// answer and is refused. Folding them into one route would mean one handler
// with two opposite rules about the empty string, which is how the wrong one
// gets applied.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("money");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    therapistId?: string;
    // `number | string` deliberately: the admin form posts what is in the box,
    // and a blank box arrives as "". Typing it as `number` would claim a
    // guarantee the request does not carry.
    homeVisitSharePercent?: number | string | null;
  }>(request);
  if (parseError) return parseError;
  const { therapistId, homeVisitSharePercent } = body;
  if (!therapistId) {
    return NextResponse.json({ error: "Missing therapistId" }, { status: 400 });
  }

  // Blank means "clear it", and that is the whole reason this route exists
  // separately. `undefined` is treated the same as "" -- a caller that omits
  // the field is asking for no separate rate.
  const raw =
    homeVisitSharePercent === undefined || homeVisitSharePercent === null
      ? ""
      : String(homeVisitSharePercent).trim();

  let sharePercent: number | null = null;
  if (raw !== "") {
    const parsed = Number(raw);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
      return NextResponse.json(
        { error: "Home-visit share must be a number between 0 and 100, or left blank." },
        { status: 400 }
      );
    }
    sharePercent = parsed;
  }

  const admin = createAdminClient();
  // Read the outgoing value first, for the reason the ordinary share does:
  // "changed the rate" is only useful in the log if it says what from.
  const { data: before } = await admin
    .from("profiles")
    .select("full_name, home_visit_revenue_share_percent")
    .eq("id", therapistId)
    .eq("role", "therapist")
    .maybeSingle();

  if (!before) {
    return NextResponse.json({ error: "No such therapist." }, { status: 404 });
  }

  const { error } = await admin
    .from("profiles")
    .update({ home_visit_revenue_share_percent: sharePercent })
    .eq("id", therapistId)
    .eq("role", "therapist");

  if (error) {
    return serverError("admin/update-therapist-home-visit-revenue-share", error);
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "therapist.set_home_visit_revenue_share",
    targetId: therapistId,
    targetLabel: before.full_name ?? null,
    details: {
      fromPercent: before.home_visit_revenue_share_percent ?? null,
      toPercent: sharePercent,
    },
  });

  return NextResponse.json({ success: true, homeVisitSharePercent: sharePercent });
}
