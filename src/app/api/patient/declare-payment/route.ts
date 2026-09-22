import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActive, isPatientProfile } from "@/lib/supabase/requireActiveProfile";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { readPayLaterEnabled } from "@/lib/payLaterSettingsServer";
import { readPatientOwed, hasPendingSettlement } from "@/lib/payLaterSettlementServer";
import {
  decidePayLaterDeclaration,
  declarationRefusalMessage,
  isSettlementMethod,
} from "@/lib/payLaterSettlement";

// A patient saying they have paid, outside the app.
//
// **It settles nothing.** The row lands `pending` and the amount owed does not
// move by a paisa, because a patient who could clear their own balance by
// typing into a box is a patient who can clear their own balance by typing
// into a box. Only an admin confirming it reaches the allocator.
//
// That is also why the row is worth writing at all rather than asking them to
// ring the clinic: it puts the claim, the method, the reference and the date
// in front of whoever checks the bank, and it tells the patient the clinic
// knows. What it must not do is let the two states -- "we are checking this"
// and "this is settled" -- look the same from either side.
//
// One waiting at a time, refused by `decidePayLaterDeclaration` rather than by
// a route check of its own, so the wizard and the route cannot grow two
// answers to "why not".
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: body, error: parseError } = await parseJsonBody<{
    amountPaise?: number | string;
    method?: unknown;
    note?: string;
    reference?: string;
  }>(request);
  if (parseError) return parseError;

  // Counted after the request's shape is checked, never before: the count
  // costs a database round trip where the validation above costs a regex, and
  // a person correcting a typo must not spend an allowance meant for abuse.
  const limited = await enforceRateLimit(request, "settlementDeclaration", {
    identifier: user.id,
  });
  if (limited) return limited;

  if (!(await isProfileActive(user.id))) {
    return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
  }
  if (!(await isPatientProfile(user.id))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const method = body.method;
  if (!isSettlementMethod(method) || method === "online") {
    // `online` is not a declaration: the gateway confirms it, so a row
    // claiming it would be a queue entry nobody could ever check.
    return NextResponse.json(
      { error: "Choose how you paid." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const [featureEnabled, owed, pending] = await Promise.all([
    readPayLaterEnabled(admin),
    readPatientOwed(admin, user.id),
    hasPendingSettlement(admin, user.id),
  ]);

  if (!owed || pending === null) {
    return NextResponse.json(
      { error: "We couldn't check what you owe just now. Please try again." },
      { status: 503 }
    );
  }

  const asked = Number(body.amountPaise);
  const amountPaise = Number.isFinite(asked) && asked > 0 ? Math.floor(asked) : 0;

  const decision = decidePayLaterDeclaration({
    featureEnabled,
    owedPaise: owed.owedPaise,
    amountPaise,
    hasPending: pending,
  });
  if (!decision.allowed) {
    return NextResponse.json(
      { error: declarationRefusalMessage(decision.reason) },
      { status: 409 }
    );
  }

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null;
  const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, 120) : null;

  const { error } = await admin.from("pay_later_payments").insert({
    patient_id: user.id,
    amount_paise: amountPaise,
    method,
    note: note || null,
    reference: reference || null,
    status: "pending",
    declared_by: user.id,
    // Nothing is allocated until somebody confirms the money arrived. This is
    // the column the whole "settles nothing" rule lives in.
    unallocated_paise: 0,
  });

  if (error) {
    console.error("Could not record a declared payment", user.id, error);
    return NextResponse.json(
      { error: "We couldn't record that just now. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
