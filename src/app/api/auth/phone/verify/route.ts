import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { cleanOtp, roleMayUsePhone, toE164 } from "@/lib/phoneLogin";
import { phoneLoginEnabled } from "@/lib/phoneLoginServer";

// The 6-digit code from /api/auth/phone/send. Checked by Supabase with the
// cookie-bound server client, so a right code leaves the person signed in
// (the session cookies are set on this response). Then, on the server:
// an account that may not use phone sign-in -- an admin above all -- is
// signed straight back out and told the code did not work, the same words
// as a wrong code. The admin guard refuses such a session anyway
// (requireAdmin.ts); this makes sure one is never left lying around.
//
// purpose "reset" (Forgot password -> text me a code): the same sign-in;
// the page then sends the person to /reset-password to choose a new one.
//
// Request:  { phone, code, purpose?: "signin" | "reset" }
// Response: 200 { ok: true, userId, next }  next = "/dashboard" | "/reset-password"
//           400 unreadable, 401 { code: "bad_code" } wrong/expired/not allowed,
//           409 { code: "off" }, 429, 503.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;

  if (!(await phoneLoginEnabled(createAdminClient()))) {
    return NextResponse.json({ error: "Sign-in with a phone code isn't available. Please use your email and password.", code: "off" }, { status: 409 });
  }
  const phone = toE164(typeof body.phone === "string" ? body.phone : null);
  const code = cleanOtp(body.code);
  if (!phone || !code) return NextResponse.json({ error: "Enter the 6-digit code we texted you." }, { status: 400 });

  const limited = await enforceRateLimit(request, "phoneCodeVerify");
  if (limited) return limited;

  const wrong = NextResponse.json(
    { error: "That code didn't work. Check it, or ask for a new one.", code: "bad_code" },
    { status: 401 }
  );
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });
  if (error || !data.user) return wrong;

  const { data: profile, error: profileError } = await createAdminClient()
    .from("profiles")
    .select("role, active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError || !profile || !roleMayUsePhone(profile.role) || profile.active === false) {
    await supabase.auth.signOut();
    if (profileError) return NextResponse.json({ error: "We couldn't sign you in just now. Please try again." }, { status: 503 });
    return wrong;
  }
  const next = body.purpose === "reset" ? "/reset-password" : "/dashboard";
  return NextResponse.json({ ok: true, userId: data.user.id, next });
}
