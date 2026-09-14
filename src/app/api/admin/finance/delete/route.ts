import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity, type AdminActivityAction } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { parseId } from "@/lib/financeInputs";

// Removing one of the three things an owner types into Business Health.
//
// One route with a three-entry whitelist rather than three routes, because
// the work is identical -- read the row so the audit entry can describe it,
// delete it, record what went. The `kind` decides the table and the audit
// action, and anything not in the map is refused before a query is built, so
// this can never be pointed at a table it was not written for.
//
// A real delete rather than a soft one, the same judgement `expenses/delete`
// makes: these are hand-kept rows of a few a month and a mistyped one is a
// typo, not history. What it did to the figures survives anyway, because the
// audit log keeps the label and the amount and cannot be rewritten.
const DELETABLE: Record<
  string,
  {
    table: string;
    action: AdminActivityAction;
    labelColumn: string;
    /** Named per table rather than assumed: a campaign's amount is its
     *  `spend_paise`, and selecting a column that is not there would fail the
     *  read and report a live row as already deleted. */
    amountColumn: string;
    missing: string;
  }
> = {
  investment: {
    table: "capital_investments",
    action: "finance.investment_delete",
    labelColumn: "label",
    amountColumn: "amount_paise",
    missing: "That investment no longer exists.",
  },
  campaign: {
    table: "marketing_campaigns",
    action: "finance.campaign_delete",
    labelColumn: "name",
    amountColumn: "spend_paise",
    missing: "That campaign no longer exists.",
  },
  balance: {
    table: "balance_sheet_entries",
    action: "finance.balance_delete",
    labelColumn: "label",
    amountColumn: "amount_paise",
    missing: "That entry no longer exists.",
  },
};

export async function POST(request: NextRequest) {
  const context = await requireAdminScope("money");
  if (!context) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    kind?: string;
    id?: string;
  }>(request);
  if (parseError) return parseError;

  const target = typeof body.kind === "string" ? DELETABLE[body.kind] : undefined;
  if (!target) {
    return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  }

  const id = parseId(body.id);
  if (!id.ok) return NextResponse.json({ error: id.error }, { status: 400 });

  const admin = createAdminClient();
  // Read before deleting, so the audit entry can say what was removed --
  // afterwards there is nothing left to describe.
  const { data: existing } = await admin
    .from(target.table)
    .select(`id, ${target.labelColumn}, ${target.amountColumn}`)
    .eq("id", id.value)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: target.missing }, { status: 404 });
  }

  const row = existing as unknown as Record<string, unknown>;
  const label = row[target.labelColumn] ?? "(no name)";
  const amountPaise =
    typeof row[target.amountColumn] === "number" ? (row[target.amountColumn] as number) : null;

  // Ask for the row back: supabase-js reports no error for a delete that
  // matched nothing, so without this a refusal and a success read identically
  // and the screen refreshes into the state it started in.
  const { data: removed, error } = await admin
    .from(target.table)
    .delete()
    .eq("id", id.value)
    .select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!removed || removed.length === 0) {
    return NextResponse.json({ error: target.missing }, { status: 404 });
  }

  await recordAdminActivity(admin, context.id, {
    action: target.action,
    targetId: id.value,
    targetLabel: String(label),
    amountPaise: amountPaise ?? undefined,
    details: { kind: body.kind },
  });

  return NextResponse.json({ success: true });
}
