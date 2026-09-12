import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import {
  CATALOG_IMAGE_MAX_BYTES,
  CATALOG_IMAGE_TOO_LARGE,
  CATALOG_IMAGE_WRONG_TYPE,
  catalogImagePath,
  isCatalogImageKind,
  isCatalogImageType,
  type CatalogImageType,
} from "@/lib/catalogImage";

// The one writer of the `catalog-images` bucket.
//
// It is a route rather than a browser-side upload on purpose, and the reason
// is not ceremony. `avatars` is written straight from the owner's browser
// because the owner is the only person allowed to write there and a storage
// policy can say exactly that. A catalog cover has no such owner: the rule is
// "an admin who can manage the catalogue", which is a scope this app enforces
// in routes and not in RLS. Going through a route is what lets the upload be
// scope-guarded, size- and type-checked against one shared definition, and
// recorded in admin_activity_log -- a browser-side upload would skip all
// three, and the bucket accordingly carries no insert policy at all.
//
// It writes the file and nothing else. The URL it returns is held in form
// state and stored on the row by that form's own save, so an upload somebody
// abandons never edits a live catalogue row -- the picture on the public site
// changes when the admin presses Save, which is where they expect it to.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }

  const kind = form.get("kind");
  const rowId = form.get("rowId");
  const file = form.get("file");

  if (!isCatalogImageKind(kind)) {
    return NextResponse.json({ error: "Unknown catalog kind." }, { status: 400 });
  }
  // A path segment, so it has to be one: anything with a slash or a dot in it
  // could climb out of the folder this row is supposed to own.
  if (typeof rowId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(rowId)) {
    return NextResponse.json({ error: "Missing or invalid row id." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  }

  // Type before size: "that is a PDF" is more useful than "that is too big"
  // when it is both.
  if (!isCatalogImageType(file.type)) {
    return NextResponse.json({ error: CATALOG_IMAGE_WRONG_TYPE }, { status: 400 });
  }
  if (file.size > CATALOG_IMAGE_MAX_BYTES) {
    return NextResponse.json({ error: CATALOG_IMAGE_TOO_LARGE }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }

  const contentType = file.type as CatalogImageType;
  const admin = createAdminClient();
  const path = catalogImagePath(kind, rowId, contentType);

  // Clear whatever this row had first, across all three extensions. Upsert
  // alone would overwrite a JPG with a JPG but leave the old PNG sitting
  // beside it -- and then the row would own two covers, with the public page
  // pointing at one of them and nothing ever removing the other. There is no
  // sweeper in this deployment to tidy that up later, so it is done here.
  // `remove` does not mind paths that are not there.
  await admin.storage
    .from("catalog-images")
    .remove([
      catalogImagePath(kind, rowId, "image/jpeg"),
      catalogImagePath(kind, rowId, "image/png"),
      catalogImagePath(kind, rowId, "image/webp"),
    ]);

  const { error: uploadError } = await admin.storage
    .from("catalog-images")
    .upload(path, file, { upsert: true, contentType, cacheControl: "3600" });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("catalog-images").getPublicUrl(path);

  // Cache-busted, for the same reason the avatar upload is: the path is
  // stable so a replacement lands at a URL the browser already has cached,
  // and without this an admin would replace a photograph and watch the old
  // one stay on screen.
  const url = `${publicUrl}?v=${Date.now()}`;

  await recordAdminActivity(admin, adminUser.id, {
    action: "catalog.update",
    targetId: rowId,
    targetLabel: "Catalog cover image",
    details: { kind, contentType, bytes: file.size },
  });

  return NextResponse.json({ success: true, url });
}
