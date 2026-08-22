import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

// A patient removes one of their own reports. The row goes first and the
// object second: if the object delete fails, the file is orphaned but
// unreachable (nothing points at it), whereas the other order could leave
// a row whose file is already gone -- a broken download for the therapist
// reading the chart.
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

  // Ownership is the RLS delete policy's job, and a row coming back from
  // the caller's own client is what proves it -- same posture as
  // /api/packages/purchase-detail. The admin client is used only for the
  // storage remove, which RLS cannot express.
  const { data: deleted, error } = await supabase
    .from("patient_medical_documents")
    .delete()
    .eq("id", documentId)
    .select("storage_path")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Could not delete that report." }, { status: 500 });
  }
  if (!deleted) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  await createAdminClient().storage.from("medical-reports").remove([deleted.storage_path]);

  return NextResponse.json({ ok: true });
}
