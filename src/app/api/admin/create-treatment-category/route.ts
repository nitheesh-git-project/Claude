import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { writeCatalogFocal } from "@/lib/catalogImageServer";
import { writeCatalogFeatured } from "@/lib/catalogFeaturedServer";
import { parseJsonBody } from "@/lib/parseJsonBody";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    title?: string;
    description?: string;
    imageUrl?: string;
    imageFocalX?: number;
    imageFocalY?: number;
    featured?: boolean;
    points?: unknown;
    priceInr?: number;
    durationMinutes?: number;
    ctaLabel?: string;
    specialty?: unknown;
    displayOrder?: number;
  }>(request);
  if (parseError) return parseError;
  const { title, description, imageUrl, imageFocalX, imageFocalY, featured, points, priceInr, durationMinutes, ctaLabel, specialty, displayOrder } = body;

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
  // Not merely "a number": the browser's own number box accepts `1e5` and
  // `-3`, and a display order that is negative or fractional sorts a
  // condition somewhere nobody chose. Re-derived here rather than trusted
  // from the form, like every other figure a browser sends.
  if (!Number.isFinite(order) || order < 0 || !Number.isInteger(order)) {
    return NextResponse.json(
      { error: "Order has to be a whole number, 0 or more" },
      { status: 400 }
    );
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
  await writeCatalogFocal(admin, "treatment_categories", data.id, imageFocalX, imageFocalY);
  await writeCatalogFeatured(admin, "treatment_categories", data.id, featured);

  // Catalog rows decide what is sold and at what price, so every
  // create/update/delete belongs in the same log every other admin
  // action is read from.
  await recordAdminActivity(admin, adminUser.id, {
    action: "catalog.create",
    targetId: data.id,
    targetLabel: "Treatment category",
  });

  // The public pages reading this table are ISR-cached
  // (revalidate = 300), so an admin edit was invisible on the live site for
  // up to five minutes -- long enough to read as a save that did not work,
  // and long enough for someone to make the edit a second time.
  revalidatePath("/");
  revalidatePath("/conditions");
  revalidatePath("/book");

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
