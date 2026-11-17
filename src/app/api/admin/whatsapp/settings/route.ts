import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { WHATSAPP_KINDS, applyWhatsAppKindSwitch, parseWhatsAppControls, parseWhatsAppControlsChange } from "@/lib/whatsappRules";

// Settings -> WhatsApp: one switch at a time (src/lib/whatsappRules.ts).
// "settings" scope -- it changes what the whole clinic sends.
//
// Request:  exactly one of
//             { sendingEnabled: boolean }               the master switch (starts off)
//             { testNumber: string | null }             test mode on (a number) / off
//             { kind: "booking" | ..., enabled: boolean }
// Response: 200 { success: true, unchanged }, 400 validation, 403 scope,
//           503 unreadable or a database without the table (nothing changed).
// A `whatsapp_controls.set` audit row carries the field, from and to.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;
  const parsed = parseWhatsAppControlsChange(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const change = parsed.change;

  const admin = createAdminClient();
  const { data: row, error: readError } = await admin
    .from("whatsapp_controls")
    .select("sending_enabled, test_number, disabled_kinds")
    .eq("id", 1)
    .maybeSingle();
  if (readError) return unavailable(readError);
  const current = parseWhatsAppControls(row);

  let update: Record<string, unknown>;
  let from: unknown;
  let to: unknown;
  let label: string;
  if (change.field === "sending_enabled") {
    [from, to, label, update] = [current.sendingEnabled, change.value, "Send WhatsApp messages", { sending_enabled: change.value }];
  } else if (change.field === "test_number") {
    [from, to, label, update] = [current.testNumber, change.value, "WhatsApp test number", { test_number: change.value }];
  } else {
    from = !current.disabledKinds.includes(change.kind);
    to = change.enabled;
    label = `WhatsApp: ${WHATSAPP_KINDS.find((k) => k.key === change.kind)?.label ?? change.kind}`;
    update = { disabled_kinds: applyWhatsAppKindSwitch(current.disabledKinds, change.kind, change.enabled) };
  }
  if (from === to) return NextResponse.json({ success: true, unchanged: true });

  const { error } = await admin
    .from("whatsapp_controls")
    .upsert({ id: 1, ...update, updated_by: adminUser.id, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return unavailable(error);
    if (error.code === "23514") return NextResponse.json({ error: "That number isn't accepted. Enter one mobile number with its country code." }, { status: 400 });
    return serverError("admin/whatsapp/settings", error);
  }

  // The test number is a person's phone: the log keeps its last three digits.
  const shown = (v: unknown) => (change.field === "test_number" && typeof v === "string" ? `***${v.slice(-3)}` : v);
  await recordAdminActivity(admin, adminUser.id, {
    action: "whatsapp_controls.set",
    targetLabel: label,
    details: { field: change.field, ...(change.field === "kind" ? { kind: change.kind } : {}), from: shown(from), to: shown(to) },
  });
  return NextResponse.json({ success: true, unchanged: false });
}

function unavailable(error: { code?: string }) {
  const notMigrated = error.code === "42P01" || error.code === "PGRST205";
  return NextResponse.json(
    {
      error: notMigrated
        ? "The WhatsApp switches aren't available yet - the clinic's database is being updated."
        : "We couldn't check the current WhatsApp settings just now. Nothing was changed - please try again.",
    },
    { status: 503 }
  );
}
