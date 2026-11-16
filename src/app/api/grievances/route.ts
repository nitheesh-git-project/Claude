import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { IMPERSONATION_COOKIE } from "@/lib/impersonation";
import { makeReference, validateGrievance } from "@/lib/dataRequests";

// The complaint form on /grievances. Public: a complaint must never need an
// account. The table has no insert policy and no insert grant, so this route
// is the only way in -- which is what lets it validate, rate limit and catch
// a filled honeypot. A signed-in filer is linked by the server.
//
// POST { name, email, phone?, category, bookingReference?, message, website? }
// -> 200 { reference }; 400 with words the person can act on; 429.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;

  const checked = validateGrievance(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const limited = await enforceRateLimit(request, "grievance");
  if (limited) return limited;

  // Answered exactly like a success and writes nothing, so a script learns
  // nothing about what to change.
  if (checked.value.spam) return NextResponse.json({ reference: makeReference("GRV") });

  let userId: string | null = null;
  if (!request.cookies.get(IMPERSONATION_COOKIE)) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
    } catch {
      userId = null;
    }
  }

  const admin = createAdminClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const reference = makeReference("GRV");
    const { error } = await admin.from("grievances").insert({
      reference,
      user_id: userId,
      name: checked.value.name,
      email: checked.value.email,
      phone: checked.value.phone,
      category: checked.value.category,
      booking_reference: checked.value.bookingReference,
      message: checked.value.message,
    });
    if (!error) return NextResponse.json({ reference });
    if (error.code !== "23505") {
      console.error("Could not record a grievance", error.message);
      return NextResponse.json({ error: "We couldn't send your complaint just now. Please try again, or write to us." }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "We couldn't send your complaint just now. Please try again, or write to us." }, { status: 500 });
}
