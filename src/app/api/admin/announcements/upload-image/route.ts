import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverError } from "@/lib/apiError";
import {
  ANNOUNCEMENT_IMAGE_MAX_BYTES,
  ANNOUNCEMENT_IMAGE_TOO_LARGE,
  ANNOUNCEMENT_IMAGE_WRONG_TYPE,
  announcementImagePath,
  isAnnouncementImageSlot,
  isAnnouncementImageType,
  type AnnouncementImageType,
} from "@/lib/announcements";

// The one writer of an announcement's two pictures.
//
// Same shape, and the same reasons, as upload-catalog-image: a route rather
// than a browser upload so the write is scope-guarded and size- and
// type-checked against one definition; it writes the file and nothing else,
// and the URL it returns is stored by the form's own Save, so a picture
// somebody uploads and abandons never changes a live banner. The files sit
// in the public `catalog-images` bucket under `announcements/` -- a banner
// is shown to every signed-in person of a role, so there is nothing private
// about it, and the bucket's "no insert policy at all" is exactly the
// posture wanted here.
//
// The banner arrives already cropped to 6:1 by the form (a canvas, in the
// browser), which is how "it always fits the dashboard" is kept without an
// image library on the server.
//
// Request:  multipart: draftKey, slot ("banner" | "popup"), file
// Response: 200 { success: true, url }, 400, 403.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }

  const draftKey = form.get("draftKey");
  const slot = form.get("slot");
  const file = form.get("file");

  // A path segment, so it has to be one.
  if (typeof draftKey !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(draftKey)) {
    return NextResponse.json({ error: "That upload could not be placed. Please try again." }, { status: 400 });
  }
  if (!isAnnouncementImageSlot(slot)) {
    return NextResponse.json({ error: "Unknown picture slot." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  }
  if (!isAnnouncementImageType(file.type)) {
    return NextResponse.json({ error: ANNOUNCEMENT_IMAGE_WRONG_TYPE }, { status: 400 });
  }
  if (file.size > ANNOUNCEMENT_IMAGE_MAX_BYTES) {
    return NextResponse.json({ error: ANNOUNCEMENT_IMAGE_TOO_LARGE }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }

  const contentType = file.type as AnnouncementImageType;
  const admin = createAdminClient();
  const path = announcementImagePath(draftKey, slot, contentType);

  // Clear this slot across all three extensions first, so replacing a JPG
  // with a PNG does not leave the JPG beside it.
  await admin.storage
    .from("catalog-images")
    .remove([
      announcementImagePath(draftKey, slot, "image/jpeg"),
      announcementImagePath(draftKey, slot, "image/png"),
      announcementImagePath(draftKey, slot, "image/webp"),
    ]);

  const { error: uploadError } = await admin.storage
    .from("catalog-images")
    .upload(path, file, { upsert: true, contentType, cacheControl: "3600" });
  if (uploadError) {
    return serverError("admin/announcements/upload-image", uploadError);
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("catalog-images").getPublicUrl(path);

  // Cache-busted: the path is stable, so a replacement would otherwise show
  // the picture the browser already holds.
  return NextResponse.json({ success: true, url: `${publicUrl}?v=${Date.now()}` });
}
