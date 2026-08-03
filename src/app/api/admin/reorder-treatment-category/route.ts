import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, direction } = await request.json();
  if (!id || (direction !== "up" && direction !== "down")) {
    return NextResponse.json(
      { error: "Missing id or invalid direction" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: ordered } = await admin
    .from("treatment_categories")
    .select("id, display_order")
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  if (!ordered) {
    return NextResponse.json({ error: "Could not load categories" }, { status: 500 });
  }

  const index = ordered.findIndex((c) => c.id === id);
  if (index === -1) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= ordered.length) {
    // Already at the top/bottom — nothing to do, not an error.
    return NextResponse.json({ success: true });
  }

  const current = ordered[index];
  const swapWith = ordered[swapIndex];

  const [{ error: error1 }, { error: error2 }] = await Promise.all([
    admin
      .from("treatment_categories")
      .update({ display_order: swapWith.display_order })
      .eq("id", current.id),
    admin
      .from("treatment_categories")
      .update({ display_order: current.display_order })
      .eq("id", swapWith.id),
  ]);

  if (error1 || error2) {
    return NextResponse.json(
      { error: error1?.message ?? error2?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
