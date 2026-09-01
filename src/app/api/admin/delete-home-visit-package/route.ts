import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{ id?: string }>(request);
  if (parseError) return parseError;
  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("home_visit_packages").delete().eq("id", id);

  if (error) {
    // Someone already bought this package -- deleting it would orphan their
    // purchase's package_id reference. Deactivate instead, same as the
    // online catalogue.
    if (error.code === "23503") {
      return NextResponse.json(
        {
          error:
            "This package has existing purchases and can't be deleted. Turn it off (Active) instead to hide it from patients.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/home-visit");

  // Catalog rows decide what is sold and at what price, so every
  // create/update/delete belongs in the same log every other admin
  // action is read from.
  await recordAdminActivity(admin, adminUser.id, {
    action: "catalog.delete",
    targetId: id,
    targetLabel: "Home-visit package",
  });

  return NextResponse.json({ success: true });
}
