import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";

// Removing a cost entered by mistake. A real delete rather than a soft one:
// this is a hand-kept ledger of a few rows a month, and a mistyped expense
// is a typo, not history worth preserving. What it did to the books is
// preserved anyway -- recordAdminActivity keeps the amount and the label in
// an append-only log, so a deleted cost can still be accounted for.
export async function POST(request: NextRequest) {
  const context = await requireAdminScope("money");
  if (!context) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{ id?: string }>(request);
  if (parseError) return parseError;
  if (!body.id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const admin = createAdminClient();
  // Read before deleting so the audit entry can say what was removed --
  // after the delete there is nothing left to describe.
  const { data: existing } = await admin
    .from("business_expenses")
    .select("id, category, description, amount_paise, incurred_on")
    .eq("id", body.id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "That cost no longer exists." }, { status: 404 });
  }

  // A cost written against a session is not a hand-typed row and is not a
  // typo: it is the other half of a written-off debt. Removing it here would
  // leave the session written off with nothing recording the loss, which
  // overstates profit by exactly the amount forgiven and says so on no
  // screen. The reversal that removes both together is on the screen named
  // below.
  //
  // Read separately because `source_appointment_id` is newer than the table:
  // folded into the select above, a database mid-migration would fail the
  // whole read and no cost could be deleted at all. An unreadable answer
  // allows the delete, matching what this route did before the column
  // existed -- the guard protects a row that only exists once the column
  // does.
  const { data: linked } = await admin
    .from("business_expenses")
    .select("source_appointment_id")
    .eq("id", body.id)
    .maybeSingle();
  if (linked?.source_appointment_id) {
    return NextResponse.json(
      {
        error:
          "This cost is a written-off session, so it cannot be removed on its own. Bring the session back on Money → Owed by Patients and this goes with it.",
      },
      { status: 409 }
    );
  }

  const { error } = await admin.from("business_expenses").delete().eq("id", body.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAdminActivity(admin, context.id, {
    action: "expense.delete",
    targetId: existing.id,
    targetLabel: `${existing.category}${existing.description ? ` - ${existing.description}` : ""}`,
    amountPaise: existing.amount_paise,
    details: { incurredOn: existing.incurred_on },
  });

  return NextResponse.json({ success: true });
}
