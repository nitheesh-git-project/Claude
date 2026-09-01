import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { MIN_REVIEW_NOTE_LENGTH } from "@/lib/riskSignals";

// An admin's conclusion about one signal.
//
// This route decides nothing except what the queue says. It cannot suspend
// an account, hold a payout or change a therapist's visibility, and no
// route in this app is reachable from it -- acting on a finding means going
// and doing the thing through its own screen, deliberately, with its own
// audit row. That separation is the whole reason a detector is safe to run
// at all: a signal that could penalise someone by itself would need to be
// right, and a heuristic over clinical data never is.
//
// `full` scope only. A finding names a colleague, and deciding what it
// means is not an errand to delegate to whoever happens to hold the
// operations login.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("today");
  if (!adminUser || adminUser.scope !== "full") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    signalId?: string;
    outcome?: string;
    note?: string;
  }>(request);
  if (parseError) return parseError;

  const signalId = body.signalId?.trim();
  const outcome = body.outcome;
  const note = (body.note ?? "").trim();

  if (!signalId) {
    return NextResponse.json({ error: "Missing signal." }, { status: 400 });
  }
  if (outcome !== "reviewing" && outcome !== "dismissed" && outcome !== "actioned") {
    return NextResponse.json({ error: "Unknown outcome." }, { status: 400 });
  }
  if (note.length < MIN_REVIEW_NOTE_LENGTH) {
    return NextResponse.json(
      {
        error: `Say what you concluded — at least ${MIN_REVIEW_NOTE_LENGTH} characters. "Dismissed" with no reason reads the same as "not read".`,
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: signal } = await admin
    .from("risk_signals")
    .select("id, status, rule_key")
    .eq("id", signalId)
    .maybeSingle();
  if (!signal) {
    return NextResponse.json({ error: "That signal no longer exists." }, { status: 404 });
  }
  if (signal.status === "dismissed" || signal.status === "actioned") {
    return NextResponse.json(
      { error: "That signal has already been closed." },
      { status: 409 }
    );
  }

  // CAS on the status being replaced, so two admins reaching different
  // conclusions at the same moment cannot both believe theirs is the
  // recorded one. The review row is written after the claim, for the same
  // reason every money route in this app orders it that way.
  const { data: claimed, error } = await admin
    .from("risk_signals")
    .update({ status: outcome })
    .eq("id", signalId)
    .eq("status", signal.status)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "Someone else reviewed this. Refresh to see what they said." },
      { status: 409 }
    );
  }

  // Append-only by trigger, so a signal's history reads as a sequence: a
  // dismissal that was later reopened and actioned is exactly the run of
  // events worth keeping.
  const { error: reviewError } = await admin.from("risk_reviews").insert({
    signal_id: signalId,
    reviewer_id: adminUser.id,
    outcome,
    note,
  });
  if (reviewError) {
    console.error("Risk signal status moved but the note failed", signalId, reviewError);
  }

  return NextResponse.json({ success: true, status: outcome });
}
