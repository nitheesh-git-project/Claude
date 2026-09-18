import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isValidStoredPhone } from "@/lib/phoneNumber";
import { enforceRateLimit } from "@/lib/rateLimitServer";

const SOURCES = ["Ads", "Friends", "Hospitals", "Other"] as const;
const MAX_NAME_LENGTH = 120;
const MAX_DETAILS_LENGTH = 1000;

// Public, like /api/home-visit/join-waitlist: somebody asking about a
// partnership has no account and no reason to make one first.
//
// It is a route rather than the browser insert it replaced, and that is what
// this change is for. `b2b_leads` carried a `for insert with check (true)`
// policy and an insert grant to `anon`, so the table was writable straight
// from any browser with the publishable key -- unbounded, unvalidated beyond
// the form's own JavaScript, and impossible to rate limit, since there was no
// server-side door to put a limit on. Nothing in this deployment sweeps that
// table either. The policy and the grant are dropped at the end of
// schema.sql, the same move `appointments_insert_own` got when the booking
// insert moved server-side.
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, "publicWrite");
  if (limited) return limited;

  const { data: body, error: parseError } = await parseJsonBody<{
    name?: string;
    phone?: string;
    email?: string;
    source?: string;
    orgDetails?: string;
  }>(request);
  if (parseError) return parseError;

  const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME_LENGTH) : "";
  if (!name) {
    return NextResponse.json({ error: "Please tell us your name." }, { status: 400 });
  }

  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!phone || !isValidStoredPhone(phone)) {
    return NextResponse.json({ error: "Please enter a valid phone number." }, { status: 400 });
  }

  // CHECKed on the column, so an unknown value would be a 500 from Postgres
  // rather than a sentence the visitor can act on.
  const source = typeof body.source === "string" ? body.source : "";
  if (!SOURCES.includes(source as (typeof SOURCES)[number])) {
    return NextResponse.json({ error: "Please choose how you heard about us." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const orgDetails =
    typeof body.orgDetails === "string" ? body.orgDetails.trim().slice(0, MAX_DETAILS_LENGTH) : "";

  // Service role because b2b_leads has no select policy and supabase-js
  // issues an insert with a returning clause by default -- the same reason
  // join-waitlist uses it.
  const { error } = await createAdminClient().from("b2b_leads").insert({
    name,
    phone,
    email: email || null,
    source,
    org_details: orgDetails || null,
  });

  if (error) {
    console.error("Could not record a partnership inquiry", error.message);
    return NextResponse.json(
      { error: "Could not submit your inquiry. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
