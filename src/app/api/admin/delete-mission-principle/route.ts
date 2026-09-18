import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";

/**
 * Removes one promise or limit.
 *
 * Nothing references these rows, so unlike a treatment category there is
 * nothing to count and no blocker to name -- but the other half of that rule
 * still applies: supabase-js reports no error for a DELETE that matched
 * nothing, so the row is asked for back and "removed nothing" is answered as
 * a 404 rather than as a success the screen then refreshes into unchanged.
 *
 * Deleting the last row of a band is allowed and the pages then fall back to
 * the wording in `src/lib/mission.ts`. That is stated on the screen, because a
 * delete whose visible effect is the original text reappearing reads as a
 * failed delete otherwise.
 */
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    id?: string;
  }>(request);
  if (parseError) return parseError;
  const { id } = body;
  if (typeof id !== "string" || id.length === 0) {
    return NextResponse.json({ error: "Which one?" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Read before the delete: afterwards there is no row left to name, and an
  // audit entry saying a promise was deleted without saying which is no
  // record at all.
  const { data: before } = await admin
    .from("mission_principles")
    .select("kind, title, body, icon")
    .eq("id", id)
    .maybeSingle();
  if (!before) {
    return NextResponse.json({ error: "That one no longer exists." }, { status: 404 });
  }

  const { data: removed, error } = await admin
    .from("mission_principles")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!removed || removed.length === 0) {
    return NextResponse.json({ error: "That one no longer exists." }, { status: 404 });
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "mission_principle.delete",
    targetId: id,
    targetLabel: before.title,
    details: { kind: before.kind, title: before.title, body: before.body },
  });

  revalidatePath("/");
  revalidatePath("/mission");

  return NextResponse.json({ success: true });
}
