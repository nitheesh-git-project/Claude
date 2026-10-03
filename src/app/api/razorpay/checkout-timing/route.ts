import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import {
  CHECKOUT_FLOWS,
  CHECKOUT_OUTCOMES,
  MAX_CHECKOUT_TIMING_MS,
  type CheckoutFlow,
  type CheckoutOutcome,
} from "@/lib/checkoutTiming";

// One measurement of a Pay tap: how long from the tap to the Razorpay sheet
// opening, and where the time went. Sent best-effort by the booking wizards
// (src/lib/checkoutTiming.ts) and read back by System Health's Checkout speed
// check.
//
// Signed-in only: the sheet only ever opens for an account, and an anonymous
// door into a table is a door anybody can fill. Nothing about the caller is
// stored -- the row says how fast the product was, not who was using it --
// and every figure is re-checked here rather than trusted, because it came
// from a browser. A refused or failed write answers 204 all the same: the
// caller has already moved on, and there is nothing it could do differently.

function durationOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 0 && rounded <= MAX_CHECKOUT_TIMING_MS ? rounded : null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const limited = await enforceRateLimit(request, "checkoutTiming", {
    identifier: user?.id ?? null,
  });
  if (limited) return limited;

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    flow?: unknown;
    newAccount?: unknown;
    outcome?: unknown;
    totalMs?: unknown;
    stagesMs?: Record<string, unknown> | null;
  }>(request);
  if (parseError) return parseError;

  const flow = CHECKOUT_FLOWS.find((f) => f === body.flow) as CheckoutFlow | undefined;
  const outcome = CHECKOUT_OUTCOMES.find((o) => o === body.outcome) as
    | CheckoutOutcome
    | undefined;
  const totalMs = durationOrNull(body.totalMs);
  if (!flow || !outcome || totalMs === null) {
    return NextResponse.json({ error: "That measurement isn't valid." }, { status: 400 });
  }
  const stages = body.stagesMs && typeof body.stagesMs === "object" ? body.stagesMs : {};

  const admin = createAdminClient();
  const { error } = await admin.from("checkout_timings").insert({
    flow,
    new_account: body.newAccount === true,
    outcome,
    total_ms: totalMs,
    signup_ms: durationOrNull(stages.signup),
    create_ms: durationOrNull(stages.create),
    order_ms: durationOrNull(stages.order),
  });
  if (error) {
    // A measurement lost is a measurement lost; logged so a missing table
    // (schema not applied yet) is findable, and nothing else.
    console.error("checkout_timings insert failed", error.message);
  }
  return new NextResponse(null, { status: 204 });
}
