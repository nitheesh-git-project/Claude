import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Public, unauthenticated lookup so the signup form can tell a patient
// immediately whether a referral code they typed is real, instead of
// silently dropping it if it's wrong (the old behavior — the signup
// trigger just leaves referred_by_hospital_id null on no match).
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim();
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

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
