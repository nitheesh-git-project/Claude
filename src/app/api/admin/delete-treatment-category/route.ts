import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
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

  return NextResponse.json({ success: true });
}
