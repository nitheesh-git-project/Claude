import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { IMPERSONATION_COOKIE } from "@/lib/impersonation";
import { currentTermsVersion } from "@/lib/policyAcceptance";

// The dashboards' "We've updated our Terms" screen (TermsGate) posts here.
//
// POST { version } -> 200 { success: true }
//   401 not signed in; 403 a staff member viewing as this person (they cannot
//   agree on somebody else's behalf); 409 the screen showed an older version
//   than the one now in force, so the person is shown the new one;
//   500 the record could not be written (the screen says so and stays).
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{ version?: unknown }>(request);
  if (parseError) return parseError;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user ?? null;
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  if (request.cookies.get(IMPERSONATION_COOKIE)) {
    return NextResponse.json(
      { error: "Only the account holder can agree to the Terms." },
      { status: 403 }
    );
  }

  const current = currentTermsVersion();
  if (body.version !== current) {
    return NextResponse.json(
      { error: "The Terms have just been updated. Please read the latest version." },
      { status: 409 }
    );
  }

  const { error } = await createAdminClient().from("policy_acceptances").insert({
    user_id: user.id,
    document: "terms_privacy",
    version: current,
    context: "reaccept",
  });
  if (error) {
    console.error("Could not record terms acceptance", user.id, error.message);
    return NextResponse.json(
      { error: "We couldn't save that just now. Please try again." },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true });
}
