import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, patientName, quote, rating, conditionLabel, avatarUrl, displayOrder, active } =
    await request.json();
  if (!id || !patientName || !quote) {
    return NextResponse.json({ error: "Missing id, patientName, or quote" }, { status: 400 });
  }

  let ratingValue: number | null = null;
  if (rating !== undefined && rating !== null && rating !== "") {
    ratingValue = Number(rating);
    if (Number.isNaN(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return NextResponse.json({ error: "Rating must be between 1 and 5" }, { status: 400 });
    }
  }

  const order = displayOrder === undefined || displayOrder === "" ? 0 : Number(displayOrder);
  if (Number.isNaN(order)) {
    return NextResponse.json({ error: "Order must be a number" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("testimonials")
    .update({
      patient_name: patientName,
      quote,
      rating: ratingValue,
      condition_label: conditionLabel || null,
      avatar_url:
        typeof avatarUrl === "string" && avatarUrl.trim() ? avatarUrl.trim() : null,
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
    targetLabel: "Testimonial",
  });

  return NextResponse.json({ success: true });
}
