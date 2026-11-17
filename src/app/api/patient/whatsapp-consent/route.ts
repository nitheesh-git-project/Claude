import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { loadWhatsAppConsent } from "@/lib/whatsappServer";
import { toWhatsAppNumber } from "@/lib/whatsappRules";

// Profile -> WhatsApp messages: the patient's own yes or no. A new row in
// the append-only `whatsapp_consents` each time it changes (the latest
// wins), so what they agreed to and when is never rewritten. The patient is
// the signed-in user -- never an id from the body. Saying yes needs a mobile
// number we can message; saying no never needs anything.
//
// Request:  { granted: boolean }
// Response: 200 { success: true, granted, unchanged }
//           400 bad body, 401 not signed in, 403 not a patient,
//           409 { code: "no_number" } yes without a usable number,
//           503 a check that could not be run.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;
  if (typeof body.granted !== "boolean") return NextResponse.json({ error: "Say yes or no." }, { status: 400 });
  const granted = body.granted;

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin.from("profiles").select("role, phone").eq("id", user.id).maybeSingle();
  if (profileError) return NextResponse.json({ error: "We couldn't check your account just now. Please try again." }, { status: 503 });
  if (profile?.role !== "patient") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (granted && !toWhatsAppNumber(profile.phone as string | null)) {
    return NextResponse.json(
      { error: "Add your mobile number to your profile first, so we know where to send messages.", code: "no_number" },
      { status: 409 }
    );
  }

  const current = await loadWhatsAppConsent(admin, user.id);
  if (current === granted) return NextResponse.json({ success: true, granted, unchanged: true });
  const { error } = await admin.from("whatsapp_consents").insert({ patient_id: user.id, choice: granted ? "granted" : "withdrawn", source: "profile" });
  if (error) {
    return NextResponse.json({ error: "That didn't save. Nothing changed - please try again." }, { status: 503 });
  }
  return NextResponse.json({ success: true, granted, unchanged: false });
}
