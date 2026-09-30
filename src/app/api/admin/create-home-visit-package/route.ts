import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { writeCatalogFocal } from "@/lib/catalogImageServer";
import { writeCatalogFeatured } from "@/lib/catalogFeaturedServer";
import { parseJsonBody } from "@/lib/parseJsonBody";
import {
  validateHomeVisitPackagePayload,
  type HomeVisitPackagePayload,
} from "@/lib/validateHomeVisitPackagePayload";
import { serverError } from "@/lib/apiError";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } =
    await parseJsonBody<HomeVisitPackagePayload>(request);
  if (parseError) return parseError;

  const validated = validateHomeVisitPackagePayload(body, { requireTitleAndPricing: true });
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const admin = createAdminClient();

  // category_id is optional here (unlike the online packages, which are
  // defined per category) -- but if one was given it has to be real, or the
  // insert fails on a foreign key with an unreadable message.
  if (validated.columns.category_id) {
    const { data: category } = await admin
      .from("treatment_categories")
      .select("id")
      .eq("id", validated.columns.category_id)
      .single();
    if (!category) {
      return NextResponse.json({ error: "That category doesn't exist" }, { status: 400 });
    }
  }

  const { data, error } = await admin
    .from("home_visit_packages")
    .insert(validated.columns)
    .select("id, package_code")
    .single();

  if (error) {
    return serverError("admin/create-home-visit-package", error);
  }

  // Its own call, per the migration-dependent-column rule: a database
  // without these columns loses the cover position, never the whole save.
  // Its own isolated write, so a database one migration behind loses the
  // position rather than refusing the whole edit -- and reported rather than
  // swallowed, because an admin who drags a focal point and is told the save
  // worked will not look again.
  const focalSaved = await writeCatalogFocal(admin, "home_visit_packages", data.id, body.imageFocalX, body.imageFocalY);
  await writeCatalogFeatured(admin, "home_visit_packages", data.id, body.featured);

  // /home-visit is ISR-cached, so without this a newly published package
  // would take up to five minutes to appear -- and it has to run *after* the
  // isolated writes above, or the page is rebuilt from the row as it was
  // before them and the cover position and curation are the things that
  // wait five minutes instead.
  revalidatePath("/home-visit");

  // Catalog rows decide what is sold and at what price, so every
  // create/update/delete belongs in the same log every other admin
  // action is read from.

  await recordAdminActivity(admin, adminUser.id, {
    action: "catalog.create",
    targetId: data.id,
    targetLabel: "Home-visit package",
  });

  return NextResponse.json({
    success: true, id: data.id, packageCode: data.package_code,
    ...(focalSaved
      ? {}
      : {
          warning:
            "Saved, but the cover's position could not be written - it is still centred.",
        }),
  });
}
