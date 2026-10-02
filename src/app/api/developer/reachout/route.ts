import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { validateDevReachout } from "@/lib/devReachout";
import { getDevContact } from "@/lib/siteSettingsCache";

// Public, like /api/hospitals/inquiry: somebody saying hello has no account
// and no reason to make one first. The table has no insert policy and no
// insert grant, so this route is the only door in -- which is also what makes
// it possible to validate, honeypot, rate limit and switch it off.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    name?: string;
    email?: string;
    phone?: string;
    message?: string;
    website?: string;
  }>(request);
  if (parseError) return parseError;

  const checked = validateDevReachout(body);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }

  // Counted after the shape is checked, not before, for the reason spelled
  // out in /api/hospitals/inquiry: a person correcting a typo should not
  // spend an allowance meant for abuse.
  const limited = await enforceRateLimit(request, "devReachout");
  if (limited) return limited;

  // The master switch. A read that could not be made answers with the default
  // (on) rather than refusing -- "we could not check" is not "switched off".
  const { enabled } = await getDevContact();
  if (!enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // A filled honeypot is answered exactly like a success and writes nothing,
  // so a script learns nothing about what to change.
  if (checked.spam) {
    return NextResponse.json({ success: true });
  }

  // Service role: the table has no select policy for the caller and
  // supabase-js asks for a returning clause by default.
  const { error } = await createAdminClient().from("dev_reachouts").insert({
    name: checked.value.name,
    email: checked.value.email,
    phone: checked.value.phone,
    message: checked.value.message,
  });

  if (error) {
    console.error("Could not record a developer reachout", error.message);
    return NextResponse.json(
      { error: "Could not send your message. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
