import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

// Short-lived signed URL for one report, for whoever may read it: the
// patient, a therapist who treats them, or an admin. There is no role
// branch here on purpose -- the patient_medical_documents select policies
// already encode exactly who may see a given row, so the row coming back
// from the caller's own RLS-scoped client *is* the authorization check
// (same reasoning as /api/packages/purchase-detail). Only the signing
// itself needs the service role, because the storage bucket is private and
// its own policies cover the owning patient alone.
const SIGNED_URL_TTL_SECONDS = 120;

export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{ documentId?: string }>(request);
  if (parseError) return parseError;

  const documentId = typeof body.documentId === "string" ? body.documentId : "";
  if (!documentId) {
    return NextResponse.json({ error: "Missing document" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: document } = await supabase
    .from("patient_medical_documents")
    .select("storage_path, title, mime_type")
    .eq("id", documentId)
    .maybeSingle();
  if (!document) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const { data: signed, error } = await createAdminClient()
    .storage.from("medical-reports")
    .createSignedUrl(document.storage_path, SIGNED_URL_TTL_SECONDS);
  if (error || !signed) {
    return NextResponse.json({ error: "Could not open that report." }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
