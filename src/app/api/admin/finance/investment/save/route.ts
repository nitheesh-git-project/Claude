import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import {
  parseDateInput,
  parseId,
  parseLabel,
  parseOptionalPaise,
  parseOptionalText,
  parsePaise,
  parseUsefulLifeMonths,
} from "@/lib/financeInputs";

// What the owner put into the business, and what it is worth now.
//
// Guarded by scope rather than plain admin, the same as recording a cost: this
// row is the denominator of the return on investment an owner quotes at a
// bank, and its useful life charges a depreciation figure against every month
// it is owned. It belongs to whoever holds Money.
//
// One route for creating and for editing, because a valuation is meant to be
// revisited -- "what is it worth now" with no way to update it is a figure
// that is wrong within a year.
export async function POST(request: NextRequest) {
  const context = await requireAdminScope("money");
  if (!context) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    id?: string | null;
    label?: string;
    investedOn?: string;
    amountPaise?: number;
    presentValuePaise?: number | null;
    presentValueAsOf?: string | null;
    usefulLifeMonths?: number | null;
    writeOffAs?: string;
    notes?: string;
  }>(request);
  if (parseError) return parseError;

  const label = parseLabel(body.label, "this a name, so you can recognise it later");
  if (!label.ok) return NextResponse.json({ error: label.error }, { status: 400 });

  const investedOn = parseDateInput(body.investedOn, "the date you bought it");
  if (!investedOn.ok) return NextResponse.json({ error: investedOn.error }, { status: 400 });

  const amount = parsePaise(body.amountPaise, "what it cost");
  if (!amount.ok) return NextResponse.json({ error: amount.error }, { status: 400 });

  const presentValue = parseOptionalPaise(body.presentValuePaise, "what it is worth now");
  if (!presentValue.ok) return NextResponse.json({ error: presentValue.error }, { status: 400 });

  const life = parseUsefulLifeMonths(body.usefulLifeMonths);
  if (!life.ok) return NextResponse.json({ error: life.error }, { status: 400 });

  // A valuation with no date is half a fact -- read a year later, nobody can
  // tell whether it is current. The database says the same thing with a CHECK;
  // this is the sentence rather than the 500.
  let presentValueAsOf: string | null = null;
  if (presentValue.value !== null) {
    const parsed = parseDateInput(
      body.presentValueAsOf,
      "the date you valued it - a valuation with no date cannot be read later"
    );
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    presentValueAsOf = parsed.value;
  }

  const writeOffAs = body.writeOffAs === "amortization" ? "amortization" : "depreciation";
  const notes = parseOptionalText(body.notes);

  const admin = createAdminClient();
  const row = {
    label: label.value,
    invested_on: investedOn.value,
    amount_paise: amount.value,
    present_value_paise: presentValue.value,
    present_value_as_of: presentValueAsOf,
    useful_life_months: life.value,
    write_off_as: writeOffAs,
    notes,
  };

  if (body.id) {
    const id = parseId(body.id);
    if (!id.ok) return NextResponse.json({ error: id.error }, { status: 400 });

    // .select() on the update, so "changed nothing because the row is gone"
    // is distinguishable from "changed it" -- supabase-js reports no error for
    // an update that matched no rows, and a screen told it worked refreshes
    // into the state it started in.
    const { data: updated, error } = await admin
      .from("capital_investments")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", id.value)
      .select("id")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json(
        { error: "That investment is no longer there - somebody may have removed it." },
        { status: 409 }
      );
    }
    await recordAdminActivity(admin, context.id, {
      action: "finance.investment_save",
      targetId: id.value,
      targetLabel: label.value,
      amountPaise: amount.value,
      details: {
        investedOn: investedOn.value,
        presentValuePaise: presentValue.value,
        usefulLifeMonths: life.value,
        writeOffAs,
      },
    });
    return NextResponse.json({ success: true, id: id.value });
  }

  const { data: created, error } = await admin
    .from("capital_investments")
    .insert({ ...row, created_by: context.id })
    .select("id")
    .single();
  if (error || !created) {
    return NextResponse.json(
      { error: error?.message ?? "Could not save this investment." },
      { status: 500 }
    );
  }

  await recordAdminActivity(admin, context.id, {
    action: "finance.investment_save",
    targetId: created.id,
    targetLabel: label.value,
    amountPaise: amount.value,
    details: {
      investedOn: investedOn.value,
      presentValuePaise: presentValue.value,
      usefulLifeMonths: life.value,
      writeOffAs,
    },
  });

  return NextResponse.json({ success: true, id: created.id });
}
