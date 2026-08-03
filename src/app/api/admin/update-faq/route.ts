import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, question, answer, displayOrder, active } = await request.json();
  if (!id || !question || !answer) {
    return NextResponse.json({ error: "Missing id, question, or answer" }, { status: 400 });
  }

  const order = displayOrder === undefined || displayOrder === "" ? 0 : Number(displayOrder);
  if (Number.isNaN(order)) {
    return NextResponse.json({ error: "Order must be a number" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("faqs")
    .update({
      question,
      answer,
      display_order: Math.round(order),
      active: active === undefined ? true : Boolean(active),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
