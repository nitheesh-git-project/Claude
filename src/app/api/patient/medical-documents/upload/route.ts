import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isProfileActive } from "@/lib/supabase/requireActiveProfile";
import {
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS_PER_PATIENT,
  cleanDocumentTitle,
  documentExtension,
  isAllowedDocumentMimeType,
  isMedicalDocumentType,
} from "@/lib/medicalDocuments";

// A patient uploads a test report or scan to their own health profile.
// The file goes to the private medical-reports bucket and only its
// metadata is written to Postgres -- see the patient_medical_documents
// section in schema.sql for why the bytes never touch the database.
//
// Multipart rather than a direct browser upload to storage: the count and
// size caps have to be enforced somewhere the client cannot skip, and
// doing the upload and the metadata insert in one request is what keeps a
// stored object from ending up with no row describing it.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // isProfileActive, not isProfileActiveAndApproved: a patient who paid
  // and is waiting on approval still has a session next week and a report
  // to bring to it.
  if (!(await isProfileActive(user.id))) {
    return NextResponse.json({ error: "Your account is not active." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json(
      { error: `That file is too large. The limit is ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))}MB.` },
      { status: 400 }
    );
  }
  const mimeType = (file.type || "").toLowerCase();
  if (!isAllowedDocumentMimeType(mimeType)) {
    return NextResponse.json(
      { error: "Upload a PDF or a photo (JPG, PNG, WEBP or HEIC)." },
      { status: 400 }
    );
  }

  const documentType = String(form.get("documentType") ?? "other");
  if (!isMedicalDocumentType(documentType)) {
    return NextResponse.json({ error: "Pick what kind of report this is." }, { status: 400 });
  }

  const takenOnRaw = String(form.get("takenOn") ?? "").trim();
  if (takenOnRaw && !/^\d{4}-\d{2}-\d{2}$/.test(takenOnRaw)) {
    return NextResponse.json({ error: "That date isn't valid." }, { status: 400 });
  }
  // A test cannot have been taken in the future, and a typo'd year is the
  // most common way this list ends up sorted wrongly forever.
  if (takenOnRaw && new Date(`${takenOnRaw}T00:00:00+05:30`).getTime() > Date.now()) {
    return NextResponse.json({ error: "That date is in the future." }, { status: 400 });
  }

  const title = cleanDocumentTitle(String(form.get("title") ?? "") || file.name);

  const admin = createAdminClient();

  // The count cap is checked here rather than in a policy because RLS has
  // no good way to say "at most N rows" without a trigger, and this is the
  // only writer.
  const { count, error: countError } = await admin
    .from("patient_medical_documents")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", user.id);
  if (countError) {
    return NextResponse.json({ error: "Could not upload right now. Please try again." }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_DOCUMENTS_PER_PATIENT) {
    return NextResponse.json(
      {
        error: `You can keep ${MAX_DOCUMENTS_PER_PATIENT} reports on file. Delete one you no longer need to add another.`,
      },
      { status: 400 }
    );
  }

  const storagePath = `${user.id}/${crypto.randomUUID()}.${documentExtension(mimeType)}`;
  const { error: uploadError } = await admin.storage
    .from("medical-reports")
    .upload(storagePath, await file.arrayBuffer(), { contentType: mimeType, upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: "Could not upload that file. Please try again." }, { status: 500 });
  }

  const { data: row, error: insertError } = await admin
    .from("patient_medical_documents")
    .insert({
      patient_id: user.id,
      storage_path: storagePath,
      title,
      document_type: documentType,
      taken_on: takenOnRaw || null,
      mime_type: mimeType,
      size_bytes: file.size,
    })
    .select("id, title, document_type, taken_on, mime_type, size_bytes, created_at")
    .single();

  if (insertError || !row) {
    // Don't leave a file nothing points at -- that is exactly the storage
    // growth this feature is supposed to avoid.
    await admin.storage.from("medical-reports").remove([storagePath]);
    return NextResponse.json({ error: "Could not save that report. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ document: row });
}
