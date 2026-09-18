import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rateLimitServer";

// Public, unauthenticated lookup so the signup form can tell a patient
// immediately whether a referral code they typed is real, instead of
// silently dropping it if it's wrong (the old behavior - the signup
// trigger just leaves referred_by_hospital_id null on no match).
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim();
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  // Counted after the request's shape is checked, not before.
  //
  // This is the reverse of where a limiter usually goes, and the reason is
  // that the limiter is the expensive half: it costs a database round trip,
  // where the checks above it are a trim and a regex. Counting first meant
  // every malformed request bought a write, and made the app *less* able to
  // absorb junk than validating first does. It also meant a person
  // correcting a typo spent an allowance meant for abuse, and then met a
  // refusal written for somebody who had already succeeded.
  //
  // Nothing has been read or written at this point, so a refusal here still
  // costs a caller nothing beyond what they sent.
  const limited = await enforceRateLimit(request, "referralCodeLookup");
  if (limited) return limited;

  const admin = createAdminClient();
  const { data: hospital } = await admin
    .from("profiles")
    .select("organization_name")
    .eq("referral_code", code)
    .eq("role", "hospital")
    .single();

  if (!hospital) {
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({
    valid: true,
    hospitalName: hospital.organization_name,
  });
}
