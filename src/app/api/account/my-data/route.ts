import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { IMPERSONATION_COOKIE } from "@/lib/impersonation";
import { getLayoutSettings } from "@/lib/siteSettingsCache";
import { parseAdminSettings } from "@/lib/adminSettings";
import { LEGAL_FACTS } from "@/lib/legal/legalFacts";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import { isDataRequestRole, makeReference } from "@/lib/dataRequests";
import { buildPersonalDataPdf } from "@/lib/personalDataPdf";
import { loadPersonalDataDoc } from "@/lib/personalDataExportServer";

// "Download my data" on a patient's, therapist's or hospital partner's
// profile: a PDF of everything the clinic holds about them
// (src/lib/personalDataExportServer.ts decides what, personalDataPdf.ts lays
// it out). Each download is recorded as a completed `export` data request,
// so the clinic can say when a person last received a copy.
//
// GET -> 200 application/pdf; 401 not signed in; 403 an admin, or staff
// viewing as the person (their data is theirs to download, not the
// viewer's); 429; 503 the profile itself could not be read.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user ?? null;
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (request.cookies.get(IMPERSONATION_COOKIE)) {
    return NextResponse.json({ error: "Only the account holder can download their data." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError) {
    return NextResponse.json({ error: "We couldn't prepare your data just now. Please try again." }, { status: 503 });
  }
  const role = profile?.role;
  if (!isDataRequestRole(role)) {
    return NextResponse.json({ error: "This download is for patients, therapists and partners." }, { status: 403 });
  }

  const limited = await enforceRateLimit(request, "dataExport", { identifier: user.id });
  if (limited) return limited;

  const { brand } = await getLayoutSettings();
  const settings = parseAdminSettings(brand);
  const now = new Date();
  const reference = makeReference("EXP");
  const doc = await loadPersonalDataDoc(admin, user.id, role, {
    siteName: settings.siteName,
    reference,
    generatedAtLabel: formatClinicDateTime(now) || now.toISOString(),
    contactEmail: LEGAL_FACTS.grievanceOfficerEmail.trim() || settings.contactEmail,
    tagline: settings.siteTagline,
    contactPhone: settings.contactPhone,
    clinicEmail: settings.contactEmail,
  });
  if (!doc) {
    return NextResponse.json({ error: "We couldn't prepare your data just now. Please try again." }, { status: 503 });
  }

  const pdf = await buildPersonalDataPdf(doc);

  // Recorded after it was built, best effort: the person has their copy
  // whether or not the record lands.
  const { error: recordError } = await admin.from("data_requests").insert({
    reference,
    user_id: user.id,
    role,
    kind: "export",
    status: "completed",
    resolved_at: now.toISOString(),
  });
  if (recordError) console.error("Could not record a data export", user.id, recordError.message);

  const day = now.toISOString().slice(0, 10);
  return new NextResponse(pdf.slice().buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="moverestore-your-data-${day}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
