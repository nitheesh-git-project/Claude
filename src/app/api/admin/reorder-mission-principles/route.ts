import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { isMissionPrincipleKind } from "@/lib/mission";

/**
 * Saves the order of one band, as the whole band.
 *
 * Never a pairwise swap: two rows holding the same `display_order` swap to the
 * same two numbers, so the write succeeds, the optimistic list shows the move,
 * the next render puts it back and the public pages never change. That bug is
 * why `set_treatment_category_order` exists and this is the same rule for the
 * same reason.
 *
 * A list that does not cover every row of that band is refused here with a
 * sentence, and refused again inside the function -- renumbering a subset from
 * 1 collides with the rows it never saw, and the function is reachable by the
 * service-role key and by hand in the SQL editor where no route check runs.
 */
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { kind, ids } = await request.json();
  if (!isMissionPrincipleKind(kind)) {
    return NextResponse.json({ error: "Unknown kind." }, { status: 400 });
  }
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || id.length === 0)) {
    return NextResponse.json({ error: "ids must be an array of row ids" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing, error: readError } = await admin
    .from("mission_principles")
    .select("id")
    .eq("kind", kind);
  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }

  const given = new Set(ids as string[]);
  if (given.size !== ids.length || given.size !== (existing ?? []).length) {
    return NextResponse.json(
      {
        error:
          "The order has to cover every one of these, and each one once. Reload the screen and try again.",
      },
      { status: 409 }
    );
  }

  const { error } = await admin.rpc("set_mission_principle_order", {
    target_kind: kind,
    ordered_ids: ids,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "mission_principle.reorder",
    targetLabel: kind === "promise" ? "Promises" : "Limits",
    details: { kind, count: ids.length },
  });

  revalidatePath("/");
  revalidatePath("/mission");

  return NextResponse.json({ success: true });
}
