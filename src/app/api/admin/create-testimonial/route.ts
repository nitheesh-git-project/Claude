import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { patientName, quote, rating, conditionLabel, avatarUrl, displayOrder } = await request.json();
  if (!patientName || !quote) {
    return NextResponse.json({ error: "Missing patientName or quote" }, { status: 400 });
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
  const { data, error } = await admin
    .from("testimonials")
    .insert({
      patient_name: patientName,
      quote,
      rating: ratingValue,
      condition_label: conditionLabel || null,
      avatar_url:
        typeof avatarUrl === "string" && avatarUrl.trim() ? avatarUrl.trim() : null,
      display_order: Math.round(order),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Catalog rows decide what is sold and at what price, so every
  // create/update/delete belongs in the same log every other admin
  // action is read from.
  await recordAdminActivity(admin, adminUser.id, {
    action: "catalog.create",
    targetId: null,
    targetLabel: "Testimonial",
  });

  // One component serves the testimonial band on both pages, and both are
  // ISR-cached (revalidate = 300) -- so both have to be invalidated or the
  // two bands disagree until the window expires.
  revalidatePath("/");
  revalidatePath("/mission");

  return NextResponse.json({ success: true, id: data.id });
}
