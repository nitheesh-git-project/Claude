import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { normalizePincode, isValidPincodeShape } from "@/lib/homeVisitAreas";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    id?: string;
    city?: string;
    areaName?: string | null;
    pincode?: string;
    travelFeeInr?: number | string;
    notes?: string | null;
    active?: boolean;
  }>(request);
  if (parseError) return parseError;

  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const columns: Record<string, string | number | boolean | null> = {};

  if (body.city !== undefined) {
    const city = typeof body.city === "string" ? body.city.trim() : "";
    if (!city) return NextResponse.json({ error: "City is required." }, { status: 400 });
    columns.city = city;
  }

  if (body.areaName !== undefined) {
    columns.area_name = typeof body.areaName === "string" ? body.areaName.trim() || null : null;
  }

  if (body.pincode !== undefined) {
    const pincode = normalizePincode(body.pincode);
    if (!isValidPincodeShape(pincode)) {
      return NextResponse.json({ error: "Enter a valid 6-digit pincode." }, { status: 400 });
    }
    columns.pincode = pincode;
  }

  if (body.travelFeeInr !== undefined) {
    const fee = Number(body.travelFeeInr);
    if (Number.isNaN(fee) || fee < 0) {
      return NextResponse.json(
        { error: "Travel Fee must be zero or a positive number." },
        { status: 400 }
      );
    }
    columns.travel_fee_paise = Math.round(fee * 100);
  }

  if (body.notes !== undefined) {
    columns.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  }

  if (body.active !== undefined) {
    columns.active = Boolean(body.active);
  }

  if (Object.keys(columns).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("home_visit_areas").update(columns).eq("id", id);

  if (error) {
    // pincode carries a unique constraint -- another area already covers it.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Another service area already covers that pincode." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/home-visit");

  return NextResponse.json({ success: true });
}
