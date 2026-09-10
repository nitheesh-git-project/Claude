import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import {
  CATEGORY_ALREADY_GONE,
  CATEGORY_DELETE_REFUSED,
  describeCategoryBlockers,
} from "@/lib/categoryDeletion";

// Delete a treatment category, or say exactly why it cannot go.
//
// This route used to answer `{ success: true }` whether or not a row had
// actually gone: supabase-js reports no error when a DELETE matches nothing,
// so a refusal, an already-deleted row and a real deletion were the same
// response. The screen refreshed on that success and painted the category
// still sitting there -- "Delete does nothing, and nothing says why", which
// is the least actionable shape a failure can take.
//
// Three changes fix it, and each answers a different one of those cases:
//
//   1. The blockers are counted *before* the attempt, so the refusal names
//      which rows are holding it rather than guessing "existing bookings".
//      The foreign keys involved (appointments, patient_package_purchases,
//      home_visit_packages, appointment_reassignment_log) carry no ON DELETE
//      behaviour, so Postgres refuses outright -- see describeCategoryBlockers.
//   2. The delete asks for the row back (`.select("id")`), so "removed
//      nothing" is distinguishable from "removed it".
//   3. Nothing removed and nothing blocking is reported as a refusal rather
//      than a success, because at that point the app genuinely does not know
//      what happened and must not claim it worked.

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

  const { data: existing } = await admin
    .from("treatment_categories")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: CATEGORY_ALREADY_GONE }, { status: 404 });
  }

  // Head-only counts: the numbers, none of the rows. Each is isolated and
  // its own failure is treated as zero -- appointment_reassignment_log is a
  // late table, and a database without it must still be able to delete an
  // unused category rather than being told something it cannot see is in the
  // way.
  const [appointments, packagePurchases, homeVisitPackages, reassignOld, reassignNew] =
    await Promise.all([
      admin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("category_id", id),
      admin
        .from("patient_package_purchases")
        .select("id", { count: "exact", head: true })
        .eq("category_id", id),
      admin
        .from("home_visit_packages")
        .select("id", { count: "exact", head: true })
        .eq("category_id", id),
      admin
        .from("appointment_reassignment_log")
        .select("id", { count: "exact", head: true })
        .eq("old_category_id", id),
      admin
        .from("appointment_reassignment_log")
        .select("id", { count: "exact", head: true })
        .eq("new_category_id", id),
    ]);

  const blockers = describeCategoryBlockers({
    appointments: appointments.count ?? 0,
    packagePurchases: packagePurchases.count ?? 0,
    homeVisitPackages: homeVisitPackages.count ?? 0,
    reassignments: (reassignOld.count ?? 0) + (reassignNew.count ?? 0),
  });

  if (blockers) {
    return NextResponse.json({ error: blockers.message }, { status: 409 });
  }

  const { data: deleted, error } = await admin
    .from("treatment_categories")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    // Still handled, even though the counts above should have caught it: a
    // booking created between the count and the delete lands here, and so
    // would a foreign key nobody has added to that list yet.
    if (error.code === "23503") {
      return NextResponse.json(
        {
          error:
            "Something was booked under this condition while you were looking at it, so it can no longer be deleted. Turn it off instead to hide it from patients.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: CATEGORY_DELETE_REFUSED }, { status: 500 });
  }

  // Catalog rows decide what is sold and at what price, so every
  // create/update/delete belongs in the same log every other admin
  // action is read from.
  await recordAdminActivity(admin, adminUser.id, {
    action: "catalog.delete",
    targetId: id,
    // The title rather than "Treatment category": the row is gone by now, so
    // the log is the only place left that can say which one it was.
    targetLabel: existing.title ?? "Treatment category",
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
