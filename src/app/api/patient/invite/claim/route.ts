import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActive, isPatientProfile } from "@/lib/supabase/requireActiveProfile";
import { claimInvite } from "@/lib/inviteRewardsServer";
import { isWellFormedInviteCode } from "@/lib/inviteRewards";

// A patient entering a friend's invite code.
//
// Everything that decides the answer is inside `claim_invite()` -- whether
// invites are running, whose code it is, whether this patient is new,
// whether the inviter has hit their ceiling -- because each of those rules
// gives money away and a session cookie can call this route directly. The
// route's own job is to establish who is asking and to hand back the
// sentence the function's reason maps to.
//
// A refusal is a 200 with `claimed: false`, not a 4xx. This is a field a
// patient types into on their own dashboard, and a mistyped code is an
// ordinary outcome rather than a failed request -- the same reasoning the
// promo preview follows.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!(await isProfileActive(user.id))) {
    return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
  }
  if (!(await isPatientProfile(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{ code?: string }>(request);
  if (parseError) return parseError;

  const code = (body.code ?? "").trim();
  if (!isWellFormedInviteCode(code)) {
    return NextResponse.json({
      claimed: false,
      message: "That invite code isn't recognised.",
    });
  }

  const result = await claimInvite(createAdminClient(), code, user.id);
  if (!result.ok) {
    return NextResponse.json({ claimed: false, message: result.message });
  }
  return NextResponse.json({
    claimed: true,
    welcomePaise: result.welcomePaise,
  });
}
