import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";

/**
 * Saves the whole condition order in one write.
 *
 * The previous route moved one row one place per request, through a pairwise
 * display_order swap. Two rows holding the same order swapped to the same two
 * numbers, so the move was a no-op that the optimistic UI still showed --
 * every condition the admin form created sits at 0 unless somebody typed an
 * Order, which made this the normal case rather than the edge one. The list
 * reverted on the next render and the public pages never changed at all.
 *
 * The browser now sends the order it is looking at and the database assigns
 * 1..n by position, which cannot tie. It sends ids only -- the positions come
 * from the array, never from a number the client computed.
 */
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ids } = await request.json();

  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== "string" || !id)) {
    return NextResponse.json({ error: "Missing or invalid ids" }, { status: 400 });
  }
  if (new Set(ids as string[]).size !== ids.length) {
    return NextResponse.json({ error: "Duplicate ids" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing, error: readError } = await admin
    .from("treatment_categories")
    .select("id");

  if (readError || !existing) {
    return NextResponse.json({ error: "Could not load categories" }, { status: 500 });
  }

  // The list has to cover every row. set_treatment_category_order renumbers
  // only the ids it is given, so a partial list -- a browser that loaded
  // before somebody else added a condition, or one that never saw an
  // inactive row -- would renumber a subset into a collision with the rows it
  // omitted. Refusing is the roster's stale-save rule applied here: the admin
  // is told the list moved and re-drags on the current one, rather than
  // having a half-order written under them.
  const submitted = new Set(ids as string[]);
  const current = new Set(existing.map((c) => c.id));
  const sameSet =
    submitted.size === current.size && [...current].every((id) => submitted.has(id));

  if (!sameSet) {
    return NextResponse.json(
      {
        error:
          "The condition list changed while you were reordering it. Refresh and try again.",
      },
      { status: 409 }
    );
  }

  const { error } = await admin.rpc("set_treatment_category_order", {
    ordered_ids: ids as string[],
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
    targetLabel: "Condition order",
  });

  // The three public surfaces reading this table are ISR-cached
  // (revalidate = 300), so without this the admin saves a new order and
  // watches the old one stay up for another five minutes -- which reads as
  // the save having failed, and was half of the original bug report.
  revalidatePath("/");
  revalidatePath("/conditions");
  revalidatePath("/book");

  return NextResponse.json({ success: true });
}
