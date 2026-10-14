import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";

// Deleting a campaign that never went anywhere.
//
// **A claimed code is never deleted, only paused.** The claim is recorded on
// the booking (`appointments.promo_code_id`) or the programme purchase
// (`*_package_purchases.promo_code_id`), so removing the row would
// leave paid sessions pointing at a campaign nobody can name -- and the one
// question a discount has to be able to answer afterwards is which rule gave
// it away. An admin who wants a code to stop working switches `active` off,
// which is what pausing is for.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("money");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{ id?: string }>(request);
  if (parseError) return parseError;

  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: promo } = await admin
    .from("promo_codes")
    .select("id, code")
    .eq("id", id)
    .maybeSingle();
  if (!promo) {
    return NextResponse.json({ error: "That code no longer exists." }, { status: 404 });
  }

  // A claim lives on a booking or, since codes can apply to a recommended
  // programme, on that programme's purchase -- so all three are asked.
  const counts = await Promise.all(
    (["appointments", "patient_package_purchases", "home_visit_package_purchases"] as const).map(
      (table) =>
        admin.from(table).select("id", { count: "exact", head: true }).eq("promo_code_id", id)
    )
  );
  // An unreadable count refuses the delete. The safe direction for "I
  // don't know whether anyone used this" is to keep the record. The one
  // exception is a purchase table without the claim column yet (42703): no
  // programme can have claimed the code there.
  const countError = counts.find(
    (r, i) => r.error && !(i > 0 && r.error.code === "42703")
  )?.error;
  const count = counts.reduce((sum, r) => sum + (r.error ? 0 : r.count ?? 0), 0);
  if (countError) {
    return NextResponse.json(
      { error: "Could not check whether this code has been used. Please try again." },
      { status: 500 }
    );
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "This code has been used, so it can't be deleted - switch it off instead and the bookings keep their record.",
      },
      { status: 409 }
    );
  }

  const { error } = await admin.from("promo_codes").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Could not delete that code." }, { status: 400 });
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "promo.delete",
    targetId: id,
    targetLabel: promo.code,
  });
  return NextResponse.json({ success: true });
}
