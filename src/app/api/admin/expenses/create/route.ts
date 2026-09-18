import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { EXPENSE_CATEGORIES } from "@/lib/operatingCosts";
import { DEFAULT_COST_CLASS, isCostClass } from "@/lib/financeMetrics";

// Recording a running cost -- the other half of what the Money screens need
// before they can show a profit rather than stopping at the clinic's share.
//
// Guarded by scope rather than plain admin: an expense changes what the
// business reports as profit, so it belongs to whoever holds Money, the same
// as settling a payout.
export async function POST(request: NextRequest) {
  const context = await requireAdminScope("money");
  if (!context) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    incurredOn?: string;
    category?: string;
    description?: string;
    amountPaise?: number;
    costClass?: string;
  }>(request);
  if (parseError) return parseError;

  const { incurredOn, category, description, amountPaise } = body;

  // Every field re-validated here rather than trusted from the form: this
  // route is reachable directly with a session cookie, and a bad amount
  // silently misstates profit rather than failing loudly.
  if (!incurredOn || !/^\d{4}-\d{2}-\d{2}$/.test(incurredOn)) {
    return NextResponse.json(
      { error: "Pick the date this cost was incurred." },
      { status: 400 }
    );
  }
  if (Number.isNaN(new Date(`${incurredOn}T00:00:00+05:30`).getTime())) {
    return NextResponse.json({ error: "That date isn't a real date." }, { status: 400 });
  }
  if (!category || !(EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
    return NextResponse.json({ error: "Pick a category." }, { status: 400 });
  }
  if (
    typeof amountPaise !== "number" ||
    !Number.isFinite(amountPaise) ||
    !Number.isInteger(amountPaise) ||
    amountPaise <= 0
  ) {
    return NextResponse.json(
      { error: "Enter an amount greater than zero." },
      { status: 400 }
    );
  }
  // A rupee cap, not a paise one -- ₹1 crore in a single line is far more
  // likely to be a misplaced decimal than a real cost, and a typo here moves
  // the profit figure the whole business reads.
  if (amountPaise > 1_000_000_000) {
    return NextResponse.json(
      { error: "That's over ₹1 crore - check the amount, or split it across entries." },
      { status: 400 }
    );
  }

  const trimmedDescription = (description ?? "").trim().slice(0, 500) || null;

  // What kind of cost this is -- which decides whether it sits above or below
  // the gross-profit line, whether break-even has to cover it, and whether
  // EBITDA adds it back. An unrecognised value falls back to a running cost
  // rather than being refused: that is what every row recorded before this
  // column existed already reads as, so the fallback is the status quo rather
  // than a guess.
  const costClass = isCostClass(body.costClass) ? body.costClass : DEFAULT_COST_CLASS;

  const admin = createAdminClient();
  const base = {
    incurred_on: incurredOn,
    category,
    description: trimmedDescription,
    amount_paise: amountPaise,
    created_by: context.id,
  };

  let { data: created, error } = await admin
    .from("business_expenses")
    .insert({ ...base, cost_class: costClass })
    .select("id")
    .single();

  // `cost_class` is newer than the table, so a database that has not had the
  // migration applied refuses the whole insert over one column. Recording the
  // cost matters more than classifying it -- an owner typing in this month's
  // rent must not be told the clinic cannot record costs -- so the second
  // attempt drops the column and the row lands as a running cost, which is
  // exactly what every row predating the column already reads as. Retried
  // only on an unknown-column error: anything else is a real failure and is
  // reported as one.
  if (error && /cost_class/i.test(error.message ?? "")) {
    ({ data: created, error } = await admin
      .from("business_expenses")
      .insert(base)
      .select("id")
      .single());
  }

  if (error || !created) {
    return NextResponse.json(
      { error: error?.message ?? "Could not save this cost." },
      { status: 500 }
    );
  }

  await recordAdminActivity(admin, context.id, {
    action: "expense.create",
    targetId: created.id,
    targetLabel: `${category}${trimmedDescription ? ` - ${trimmedDescription}` : ""}`,
    amountPaise,
    details: { incurredOn, costClass },
  });

  return NextResponse.json({ success: true, id: created.id });
}
