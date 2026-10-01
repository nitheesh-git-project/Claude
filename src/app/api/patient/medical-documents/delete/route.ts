import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActive, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";

// A patient removes one of their own reports.
//
// Ownership is proved first (the row coming back through the caller's own
// RLS-scoped client), then the FILE goes, then the row. The old order --
// row, then file, with the file's result ignored -- told the patient "done"
// while their scan was still sitting in the bucket. This order never says
// done unless the file is gone:
//
// - file delete fails: 503, nothing changed, the report is still listed and
//   still opens. Try again.
// - row delete fails after the file went: 503, and the retry heals it --
//   removing an object that is already gone is not an error, so the second
//   attempt goes straight through to the row.
export async function POST(request: NextRequest) {
  // Who is asking, before anything the caller sent is looked at. An
  // anonymous request is refused here rather than after body validation,
  // so an unauthenticated caller never drives this route's parsing and is
  // never told what shape the request should have been.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // `approved` / `active` are enforced in two places, and both have to
  // stay: src/proxy.ts for dashboard navigation, and here, because a valid
  // session cookie reaches this route without passing the proxy at all.
  // This route had only the first.
  const activeStanding = await isProfileActive(user.id);
  if (activeStanding === null) return profileCheckUnavailable();
  if (!activeStanding) {
    return NextResponse.json({ error: "Your account is not active." }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{ documentId?: string }>(request);
  if (parseError) return parseError;

  const documentId = typeof body.documentId === "string" ? body.documentId : "";
  if (!documentId) {
    return NextResponse.json({ error: "Missing document" }, { status: 400 });
  }

  // Read through the caller's own client, AND checked against their id. The
  // patient_medical_documents select policies also let a treating therapist
  // and an admin read the row, so "it came back" proves the caller may READ
  // it -- not that they own it. Only the owning patient may delete, and the
  // storage remove below runs with the service role, so this check is the
  // whole authorization for it.
  const { data: owned, error: readError } = await supabase
    .from("patient_medical_documents")
    .select("id, patient_id, storage_path")
    .eq("id", documentId)
    .eq("patient_id", user.id)
    .maybeSingle();
  if (readError) {
    return NextResponse.json({ error: "Could not delete that report. Please try again." }, { status: 503 });
  }
  if (!owned || owned.patient_id !== user.id) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const { error: removeError } = await createAdminClient()
    .storage.from("medical-reports")
    .remove([owned.storage_path]);
  if (removeError) {
    console.error("medical-documents/delete: storage remove failed", documentId, removeError.message);
    return NextResponse.json(
      { error: "Could not delete that report just now. It is still on file -- please try again." },
      { status: 503 }
    );
  }

  const { data: deleted, error } = await supabase
    .from("patient_medical_documents")
    .delete()
    .eq("id", documentId)
    .select("id")
    .maybeSingle();

  if (error || !deleted) {
    console.error("medical-documents/delete: row delete failed after file removal", documentId, error?.message);
    return NextResponse.json(
      { error: "The file was removed but the report is still listed. Please try again to finish." },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true });
}
