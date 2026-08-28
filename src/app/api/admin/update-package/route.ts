import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { validatePackagePayload, type PackagePayload } from "@/lib/validatePackagePayload";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<PackagePayload & { id?: string }>(
    request
  );
  if (parseError) return parseError;
  const { id, ...payload } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // category_id is deliberately not accepted here -- purchases denormalize
  // category_id off the package at purchase time, so re-pointing a live
  // package to a different category would orphan that relationship. To
  // move a package to another category, deactivate it and create a new
  // one (see the admin catalog form's disabled Category field on edit).
  const validated = validatePackagePayload(payload, { requireTitleAndPricing: true });
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("treatment_category_packages")
    .update(validated.columns)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Catalog rows decide what is sold and at what price, so every
  // create/update/delete belongs in the same log every other admin
  // action is read from.
  await recordAdminActivity(admin, adminUser.id, {
    action: "catalog.update",
    targetId: id,
    targetLabel: "Session package",
  });

  return NextResponse.json({ success: true });
}
