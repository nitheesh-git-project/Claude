import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const {
    title,
    description,
    points,
    priceInr,
    durationMinutes,
    ctaLabel,
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

  return NextResponse.json({ success: true, id: data.id });
}
