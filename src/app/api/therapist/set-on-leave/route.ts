import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{ onLeave?: unknown }>(request);
  if (parseError) return parseError;

  if (typeof body.onLeave !== "boolean") {
    return NextResponse.json({ error: "Missing onLeave" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "therapist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (profile.active === false) {
    return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
  }

  const { error } = await admin
    .from("profiles")
    .update({ on_leave: body.onLeave })
    .eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, onLeave: body.onLeave });
}
