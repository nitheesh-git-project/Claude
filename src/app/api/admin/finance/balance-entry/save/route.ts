import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import {
  parseDateInput,
  parseId,
  parseLabel,
  parseOptionalText,
  parsePaise,
} from "@/lib/financeInputs";

// One line of what the clinic owns or owes, as of a date.
//
// A dated snapshot rather than a running balance, because that is what a
// balance sheet is: every row sharing an `as_of` date is one snapshot, and
// working capital reads the most recent one at or before the dates in view.
// Entering today's bank balance therefore does not overwrite last month's --
// it starts a new snapshot, and last month's stays readable.
//
// Amounts are always positive and the side says which way they point. A
// negative liability would be an asset with a minus sign on it, which is how a
// working-capital figure quietly becomes a net-worth figure.
export async function POST(request: NextRequest) {
  const context = await requireAdminScope("money");
  if (!context) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    id?: string | null;
    asOf?: string;
    side?: string;
    label?: string;
    amountPaise?: number;
    notes?: string;
  }>(request);
  if (parseError) return parseError;

  if (body.side !== "asset" && body.side !== "liability") {
    return NextResponse.json(
      { error: "Say whether this is something you own or something you owe." },
      { status: 400 }
    );
  }

  const asOf = parseDateInput(body.asOf, "the date this was true");
  if (!asOf.ok) return NextResponse.json({ error: asOf.error }, { status: 400 });

  const label = parseLabel(body.label, "this a name - “Bank balance”, “GST due”");
  if (!label.ok) return NextResponse.json({ error: label.error }, { status: 400 });

  // Zero is allowed and is a real answer: "the overdraft is cleared" is worth
  // recording, and forcing somebody to delete the row instead loses the fact
  // that they checked.
  const amount = parsePaise(body.amountPaise, "the amount", { allowZero: true });
  if (!amount.ok) return NextResponse.json({ error: amount.error }, { status: 400 });

  const admin = createAdminClient();
  const row = {
    as_of: asOf.value,
    side: body.side,
    label: label.value,
    amount_paise: amount.value,
    notes: parseOptionalText(body.notes),
  };

  if (body.id) {
    const id = parseId(body.id);
    if (!id.ok) return NextResponse.json({ error: id.error }, { status: 400 });

    const { data: updated, error } = await admin
      .from("balance_sheet_entries")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", id.value)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated) {
      return NextResponse.json(
        { error: "That entry is no longer there - somebody may have removed it." },
        { status: 409 }
      );
    }
    await recordAdminActivity(admin, context.id, {
      action: "finance.balance_save",
      targetId: id.value,
      targetLabel: label.value,
      amountPaise: amount.value,
      details: { asOf: asOf.value, side: body.side },
    });
    return NextResponse.json({ success: true, id: id.value });
  }

  const { data: created, error } = await admin
    .from("balance_sheet_entries")
    .insert({ ...row, created_by: context.id })
    .select("id")
    .single();
  if (error || !created) {
    return NextResponse.json(
      { error: error?.message ?? "Could not save this entry." },
      { status: 500 }
    );
  }

  await recordAdminActivity(admin, context.id, {
    action: "finance.balance_save",
    targetId: created.id,
    targetLabel: label.value,
    amountPaise: amount.value,
    details: { asOf: asOf.value, side: body.side },
  });

  return NextResponse.json({ success: true, id: created.id });
}
