import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const {
    title,
    description,
    imageUrl,
    points,
    priceInr,
    durationMinutes,
    ctaLabel,
    specialty,
    displayOrder,
  } = await request.json();

  if (!title || priceInr === undefined || durationMinutes === undefined) {
    return NextResponse.json(
      { error: "Missing title, priceInr, or durationMinutes" },
      { status: 400 }
    );
  }

  const price = Number(priceInr);
  const duration = Number(durationMinutes);
  const order = displayOrder === undefined ? 0 : Number(displayOrder);

  if (Number.isNaN(price) || price <= 0) {
    return NextResponse.json(
      { error: "Price must be a positive number" },
      { status: 400 }
    );
  }
  if (Number.isNaN(duration) || duration <= 0) {
    return NextResponse.json(
      { error: "Session length must be a positive number of minutes" },
      { status: 400 }
    );
  }
  if (Number.isNaN(order)) {
    return NextResponse.json({ error: "Order must be a number" }, { status: 400 });
  }

  const pointsList = Array.isArray(points)
    ? points.filter((p: unknown) => typeof p === "string" && p.trim())
    : [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("treatment_categories")
    .insert({
      title,
      description: description || null,
      image_url: typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim() : null,
      points: pointsList,
      price_paise: Math.round(price * 100),
      duration_minutes: Math.round(duration),
      cta_label: ctaLabel || "Book Assessment",
      display_order: Math.round(order),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeSpecialty(admin, data.id, specialty);

  // Catalog rows decide what is sold and at what price, so every
  // create/update/delete belongs in the same log every other admin
  // action is read from.
  await recordAdminActivity(admin, adminUser.id, {
    action: "catalog.create",
    targetId: data.id,
    targetLabel: "Treatment category",
  });

  return NextResponse.json({ success: true, id: data.id });
}

/**
 * The condition type, written on its own.
 *
 * `treatment_categories.specialty` is migration-dependent, and folding it
 * into the row above would mean a database one apply behind refusing every
 * edit to a category rather than losing one optional tag. Same isolation
 * rule the reads follow.
 */
async function writeSpecialty(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  specialty: unknown
): Promise<void> {
  const value =
    specialty === "ortho" || specialty === "neuro" || specialty === "pediatrics"
      ? specialty
      : null;
  try {
    const { error } = await admin
      .from("treatment_categories")
      .update({ specialty: value })
      .eq("id", id);
    if (error) {
      console.error("Could not save a treatment category's condition type", id, error);
    }
  } catch (e) {
    console.error("Could not save a treatment category's condition type", id, e);
  }
}
