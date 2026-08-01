import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { AVAILABILITY_HOURS } from "@/lib/therapistAvailability";

type SlotInput = { day_of_week: number; hour: number };

export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{ slots?: unknown }>(request);
  if (parseError) return parseError;

  if (!Array.isArray(body.slots)) {
    return NextResponse.json({ error: "Missing slots array" }, { status: 400 });
  }

  const validHours = new Set(AVAILABILITY_HOURS);
  const slots: SlotInput[] = [];
  const seen = new Set<string>();
  for (const raw of body.slots) {
    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof (raw as Record<string, unknown>).day_of_week !== "number" ||
      typeof (raw as Record<string, unknown>).hour !== "number"
    ) {
      return NextResponse.json({ error: "Malformed slot entry" }, { status: 400 });
    }
    const day_of_week = (raw as Record<string, unknown>).day_of_week as number;
    const hour = (raw as Record<string, unknown>).hour as number;
    if (!Number.isInteger(day_of_week) || day_of_week < 0 || day_of_week > 6) {
      return NextResponse.json({ error: "Invalid day_of_week" }, { status: 400 });
    }
    if (!validHours.has(hour)) {
      return NextResponse.json({ error: "Invalid hour" }, { status: 400 });
    }
    const key = `${day_of_week}-${hour}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push({ day_of_week, hour });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "therapist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Whole-set replace, scoped to this therapist's own id only (never a
  // client-supplied one) -- matches the "presence = enabled" model, no
  // partial-update reconciliation needed.
  const { error: deleteError } = await admin
    .from("therapist_availability_template")
    .delete()
    .eq("therapist_id", user.id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (slots.length > 0) {
    const { error: insertError } = await admin.from("therapist_availability_template").insert(
      slots.map((s) => ({ therapist_id: user.id, day_of_week: s.day_of_week, hour: s.hour }))
    );
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, count: slots.length });
}
