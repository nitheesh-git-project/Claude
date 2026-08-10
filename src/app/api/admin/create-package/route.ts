import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { validatePackagePayload, type PackagePayload } from "@/lib/validatePackagePayload";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<
    PackagePayload & { categoryId?: string }
  >(request);
  if (parseError) return parseError;
  const { categoryId, ...payload } = body;

  if (!categoryId) {
    return NextResponse.json({ error: "Missing categoryId" }, { status: 400 });
  }

  const validated = validatePackagePayload(payload, { requireTitleAndPricing: true });
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: category } = await admin
    .from("treatment_categories")
    .select("id")
    .eq("id", categoryId)
    .single();
  if (!category) {
    return NextResponse.json({ error: "That category doesn't exist" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("treatment_category_packages")
    .insert({
      category_id: categoryId,
      ...validated.columns,
    })
    .select("id, package_code")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data.id, packageCode: data.package_code });
}
