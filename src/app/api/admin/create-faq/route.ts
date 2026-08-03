import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { question, answer, displayOrder } = await request.json();
  if (!question || !answer) {
    return NextResponse.json({ error: "Missing question or answer" }, { status: 400 });
  }

  const order = displayOrder === undefined || displayOrder === "" ? 0 : Number(displayOrder);
  if (Number.isNaN(order)) {
    return NextResponse.json({ error: "Order must be a number" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("faqs")
    .insert({ question, answer, display_order: Math.round(order) })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data.id });
}
