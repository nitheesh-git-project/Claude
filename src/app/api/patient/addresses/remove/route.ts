import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActive } from "@/lib/supabase/requireActiveProfile";

// Soft delete only. A past visit's visit_address_id points at this row, and
// hard-deleting it would break that link -- the appointment keeps its own
// address snapshot either way, but the reference is what lets "book again
// at the same place" work. Setting active = false takes it out of every
// picker while leaving history intact, which is what a patient means by
// "remove this address".
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{ id?: string }>(request);
  if (parseError) return parseError;

  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

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

  const admin = createAdminClient();

  // is_default is cleared alongside: the partial unique index only counts
  // active rows, but leaving a retired address flagged as the default would
  // mean the next booking preselects nothing at all.
  const { error } = await admin
    .from("patient_addresses")
    .update({ active: false, is_default: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("patient_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
