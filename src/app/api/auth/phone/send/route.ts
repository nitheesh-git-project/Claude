import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { NEUTRAL_SENT, decideSend, toE164 } from "@/lib/phoneLogin";
import { phoneLoginEnabled } from "@/lib/phoneLoginServer";

// "Text me a code" on the patient, therapist and hospital sign-in pages, and
// on Forgot password. Rules: src/lib/phoneLogin.ts.
//
// Asks Supabase to text a 6-digit code ONLY when the number is verified on
// an account that may use phone sign-in (patient, therapist, hospital;
// active). Never for an admin, never for a number with no account, and
// never to create one (shouldCreateUser: false). Every one of those answers
// 200 with the same NEUTRAL_SENT sentence, so the reply says nothing about
// who is registered or which numbers are the clinic's own.
//
// Request:  { phone: string }
// Response: 200 { sent: true, message }  (whatever happened)
//           400 not a number we can read, 409 { code: "off" } switched off,
//           429 too many, 503 a check that could not be run.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;

  const admin = createAdminClient();
  if (!(await phoneLoginEnabled(admin))) {
    return NextResponse.json({ error: "Sign-in with a phone code isn't available. Please use your email and password.", code: "off" }, { status: 409 });
  }
  const phone = toE164(typeof body.phone === "string" ? body.phone : null);
  if (!phone) return NextResponse.json({ error: "Enter your mobile number with its country code, like +91 98765 43210." }, { status: 400 });

  const limitedCaller = await enforceRateLimit(request, "phoneCodeSend");
  if (limitedCaller) return limitedCaller;
  const limitedNumber = await enforceRateLimit(request, "phoneCodeSendNumber", { identifier: phone });
  if (limitedNumber) return limitedNumber;

  const { data, error } = await admin.rpc("phone_login_account", { p_phone: phone });
  if (error) return NextResponse.json({ error: "We couldn't send a code just now. Please try again, or use your email and password." }, { status: 503 });
  const row = Array.isArray(data) ? data[0] : null;
  const decision = decideSend(row ? { role: row.role ?? null, active: row.active ?? null } : null);

  if (decision.send) {
    const { error: otpError } = await createPublicClient().auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
    // A provider failure is logged for the clinic, and the person still gets
    // the neutral answer -- a different reply here would say the number has
    // an account.
    if (otpError) console.error("phone sign-in: code not sent", otpError.message);
  }
  return NextResponse.json({ sent: true, message: NEUTRAL_SENT });
}
