import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
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

  // Runs both halves of the swap inside a single Postgres transaction (see
  // schema.sql) instead of two independent updates, so a failure partway
  // through can't leave two categories sharing the same display_order.
  const { error } = await admin.rpc("swap_treatment_category_order", {
    id_a: current.id,
    id_b: swapWith.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Catalog rows decide what is sold and at what price, so every
  // create/update/delete belongs in the same log every other admin
  // action is read from.
  await recordAdminActivity(admin, adminUser.id, {
    action: "catalog.update",
    targetId: null,
    targetLabel: "Treatment category order",
  });

  return NextResponse.json({ success: true });
}
