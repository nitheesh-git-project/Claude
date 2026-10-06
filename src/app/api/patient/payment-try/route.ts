import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { readPatientCheckoutStanding, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";
import {
  isPaymentTryFlow,
  isPaymentTryOutcome,
  triesUnlockAccess,
  type PaymentTryAnswer,
} from "@/lib/paymentTries";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Records one payment try that did not end in a payment -- the sheet closed,
// the payment failed, or our own route could not start it -- and unlocks a
// new patient's account once they have made `payment_tries_before_access`
// of them (see src/lib/paymentTries.ts). A captured payment unlocks it
// sooner, from the verify routes and the webhook.
//
// The patient is the session's, never the body's, and an appointment named
// must be theirs. What this can be used for is bounded on purpose: calling
// it N times unlocks the caller's own dashboard, which is what the clinic
// used to grant on the first Pay tap.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const limited = await enforceRateLimit(request, "checkout", { identifier: user?.id ?? null });
  if (limited) return limited;
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: body, error: parseError } = await parseJsonBody<{
    flow?: unknown;
    outcome?: unknown;
    appointmentId?: unknown;
  }>(request);
  if (parseError) return parseError;

  if (!isPaymentTryFlow(body.flow) || !isPaymentTryOutcome(body.outcome)) {
    return NextResponse.json({ error: "Unknown flow or outcome" }, { status: 400 });
  }
  const appointmentId =
    typeof body.appointmentId === "string" && UUID_RE.test(body.appointmentId)
      ? body.appointmentId
      : null;

  const standing = await readPatientCheckoutStanding(user.id);
  if (standing === "unavailable") return profileCheckUnavailable();
  if (standing !== "ok") {
    return NextResponse.json({ error: "This account can't book sessions." }, { status: 403 });
  }

  const admin = createAdminClient();

  if (appointmentId) {
    const { data: appointment, error } = await admin
      .from("appointments")
      .select("id")
      .eq("id", appointmentId)
      .eq("patient_id", user.id)
      .maybeSingle();
    if (error) return profileCheckUnavailable();
    if (!appointment) {
      return NextResponse.json({ error: "That booking isn't yours." }, { status: 404 });
    }
  }

  const { error: insertError } = await admin.from("checkout_payment_tries").insert({
    patient_id: user.id,
    flow: body.flow,
    outcome: body.outcome,
    appointment_id: appointmentId,
  });
  if (insertError) {
    console.error("Could not record a payment try", user.id, insertError);
    return NextResponse.json({ error: "We couldn't record that just now." }, { status: 503 });
  }

  const [{ count, error: countError }, { data: profile, error: profileError }, settingsRes] =
    await Promise.all([
      admin
        .from("checkout_payment_tries")
        .select("id", { count: "exact", head: true })
        .eq("patient_id", user.id),
      admin.from("profiles").select("approved").eq("id", user.id).single(),
      admin.from("site_settings").select(SITE_SETTINGS_SELECT).maybeSingle(),
    ]);
  if (countError || profileError || !profile) {
    return NextResponse.json({ error: "We couldn't check your account just now." }, { status: 503 });
  }
  const limit = parseAdminSettings(settingsRes.data).paymentTriesBeforeAccess;
  const tries = count ?? 0;

  let justUnlocked = false;
  if (!profile.approved && triesUnlockAccess(tries, limit)) {
    const { data: unlocked, error: unlockError } = await admin
      .from("profiles")
      .update({ approved: true })
      .eq("id", user.id)
      .eq("approved", false)
      .select("id")
      .maybeSingle();
    if (unlockError) {
      console.error("Could not unlock account after payment tries", user.id, unlockError);
      return NextResponse.json({ error: "We couldn't update your account just now." }, { status: 503 });
    }
    justUnlocked = !!unlocked;
  }

  const answer: PaymentTryAnswer = {
    tries,
    limit,
    unlocked: profile.approved || justUnlocked,
    justUnlocked,
  };
  return NextResponse.json(answer);
}
