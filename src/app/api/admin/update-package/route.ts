import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    id?: string;
    title?: string;
    sessionCount?: number | string;
    priceInr?: number | string;
    displayOrder?: number | string;
    active?: boolean;
  }>(request);
  if (parseError) return parseError;
  const { id, title, sessionCount, priceInr, displayOrder, active } = body;

  if (!id || !title || sessionCount === undefined || priceInr === undefined) {
    return NextResponse.json(
      { error: "Missing id, title, sessionCount, or priceInr" },
      { status: 400 }
    );
  }

  const count = Number(sessionCount);
  const price = Number(priceInr);
  const order = displayOrder === undefined ? 0 : Number(displayOrder);

  if (!Number.isInteger(count) || count < 2) {
    return NextResponse.json(
      { error: "Session count must be a whole number of 2 or more" },
      { status: 400 }
    );
  }
  if (Number.isNaN(price) || price <= 0) {
    return NextResponse.json({ error: "Price must be a positive number" }, { status: 400 });
  }
  if (Number.isNaN(order)) {
    return NextResponse.json({ error: "Order must be a number" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("treatment_category_packages")
    .update({
      title,
      session_count: Math.round(count),
      price_paise: Math.round(price * 100),
      display_order: Math.round(order),
      active: active === undefined ? true : Boolean(active),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
