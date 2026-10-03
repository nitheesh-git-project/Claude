import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    id?: string;
    question?: string;
    answer?: string;
    // The admin form posts an empty string for a blank number box.
    displayOrder?: number | string;
    active?: boolean;
  }>(request);
  if (parseError) return parseError;
  const { id, question, answer, displayOrder, active } = body;
  if (!id || !question || !answer) {
    return NextResponse.json({ error: "Missing id, question, or answer" }, { status: 400 });
  }

  const order = displayOrder === undefined || displayOrder === "" ? 0 : Number(displayOrder);
  if (Number.isNaN(order)) {
    return NextResponse.json({ error: "Order must be a number" }, { status: 400 });
  }

  const admin = createAdminClient();
  // Absence means "leave it alone", never "switch it on" -- see the same
  // correction on update-treatment-category. A default of `true` here meant
  // an admin fixing a typo silently republished an entry they had retired.
  const patch: Record<string, unknown> = {
    question,
    answer,
    display_order: Math.round(order),
  };
  if (active !== undefined) {
    patch.active = Boolean(active);
  }

  const { data: updated, error } = await admin
    .from("faqs")
    .update(patch)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return serverError("admin/update-faq", error);
  }
  // A deleted or wrong id updated nothing: say so, and log nothing.
  if (!updated) {
    return NextResponse.json({ error: "That FAQ no longer exists. Refresh to see the current list." }, { status: 404 });
  }

  // Catalog rows decide what is sold and at what price, so every
  // create/update/delete belongs in the same log every other admin
  // action is read from.
  await recordAdminActivity(admin, adminUser.id, {
    action: "catalog.update",
    targetId: id,
    targetLabel: "FAQ",
  });

  // /faq is ISR-cached (revalidate = 300), so without this the accordion
  // keeps serving the old questions for up to five minutes after a save.
  revalidatePath("/faq");

  return NextResponse.json({ success: true });
}
