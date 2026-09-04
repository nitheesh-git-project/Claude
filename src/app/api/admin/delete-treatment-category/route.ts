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

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("treatment_categories").delete().eq("id", id);

  if (error) {
    // Foreign key violation — some appointment already booked under this
    // category, so deleting it would orphan that booking's price history.
    // Deactivating (hiding it from patients) is the safe alternative.
    if (error.code === "23503") {
      return NextResponse.json(
        {
          error:
            "This category has existing bookings and can't be deleted. Turn it off (Active) instead to hide it from patients.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Catalog rows decide what is sold and at what price, so every
  // create/update/delete belongs in the same log every other admin
  // action is read from.
  await recordAdminActivity(admin, adminUser.id, {
    action: "catalog.delete",
    targetId: id,
    targetLabel: "Treatment category",
  });

  // The public pages reading this table are ISR-cached
  // (revalidate = 300), so an admin edit was invisible on the live site for
  // up to five minutes -- long enough to read as a save that did not work,
  // and long enough for someone to make the edit a second time.
  revalidatePath("/");
  revalidatePath("/conditions");
  revalidatePath("/book");

  return NextResponse.json({ success: true });
}
