import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { normalizePincode, isValidPincodeShape } from "@/lib/homeVisitAreas";
import { isValidStoredPhone } from "@/lib/phoneNumber";

const MAX_NAME_LENGTH = 120;
const MAX_NOTE_LENGTH = 500;

// Public, like the b2b_leads insert on the Hospitals page: this fires the
// moment someone learns we don't reach them, which is before they have any
// reason to have an account. Losing that signal because we asked them to
// register first would throw away the only data that says where to expand.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    name?: string;
    phone?: string;
    email?: string;
    pincode?: string;
    city?: string;
    note?: string;
  }>(request);
  if (parseError) return parseError;

  const pincode = normalizePincode(body.pincode);
  if (!isValidPincodeShape(pincode)) {
    return NextResponse.json({ error: "Enter a valid 6-digit pincode." }, { status: 400 });
  }

  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!phone || !isValidStoredPhone(phone)) {
    return NextResponse.json(
      { error: "Enter a phone number we can reach you on." },
      { status: 400 }
    );
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME_LENGTH) : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE_LENGTH) : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";

  // Service role rather than the anon client: home_visit_waitlist allows a
  // public INSERT but no SELECT, and supabase-js issues an insert with a
  // returning clause by default, which RLS would reject.
  const admin = createAdminClient();
  const { error } = await admin.from("home_visit_waitlist").insert({
    name: name || null,
    phone,
    email: email || null,
    pincode,
    city: city || null,
    note: note || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
