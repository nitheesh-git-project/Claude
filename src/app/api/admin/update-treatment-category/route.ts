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
    id,
    title,
    description,
    imageUrl,
    points,
    priceInr,
    durationMinutes,
    ctaLabel,
    displayOrder,
    active,
  } = await request.json();

  if (!id || !title || priceInr === undefined || durationMinutes === undefined) {
    return NextResponse.json(
      { error: "Missing id, title, priceInr, or durationMinutes" },
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
  const { error } = await admin
    .from("treatment_categories")
    .update({
      title,
      description: description || null,
      image_url: typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim() : null,
      points: pointsList,
      price_paise: Math.round(price * 100),
      duration_minutes: Math.round(duration),
      cta_label: ctaLabel || "Book Assessment",
      display_order: Math.round(order),
      active: active === undefined ? true : Boolean(active),
    })
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
    targetLabel: "Treatment category",
  });

  return NextResponse.json({ success: true });
}
