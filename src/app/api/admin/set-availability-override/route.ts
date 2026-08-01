import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { AVAILABILITY_HOURS } from "@/lib/therapistAvailability";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    therapistId?: string;
    date?: string;
    hour?: number;
    action?: "set" | "clear";
    available?: boolean;
    note?: string;
  }>(request);
  if (parseError) return parseError;

  const { therapistId, date, hour, action, available, note } = body;
  if (!therapistId || !date || typeof hour !== "number" || !action) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (!AVAILABILITY_HOURS.includes(hour)) {
    return NextResponse.json({ error: "Invalid hour" }, { status: 400 });
  }
  if (action !== "set" && action !== "clear") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (action === "set" && typeof available !== "boolean") {
    return NextResponse.json({ error: "Missing available flag" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (action === "clear") {
    const { error } = await admin
      .from("therapist_availability_override")
      .delete()
      .eq("therapist_id", therapistId)
      .eq("date", date)
      .eq("hour", hour);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  const { error } = await admin.from("therapist_availability_override").upsert(
    {
      therapist_id: therapistId,
      date,
      hour,
      available,
      note: note?.trim() || null,
      created_by: adminUser.id,
    },
    { onConflict: "therapist_id,date,hour" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
