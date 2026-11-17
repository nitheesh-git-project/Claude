import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { applyKindSwitch, emailKindInfo, parseEmailControls, parseEmailControlsChange } from "@/lib/emailControls";

// Settings -> Emails: one switch at a time (src/lib/emailControls.ts has the
// rules). "settings" scope -- it changes what the whole clinic sends.
//
// Request:  exactly one of
//             { sendingEnabled: boolean }          the master switch
//             { testInbox: string | null }         test mode on (an address) / off (null or "")
//             { kind: "legal", enabled: boolean }  one kind's switch
// Response: 200 { success: true, unchanged: boolean }
//           400 validation, 403 scope,
//           503 the current switches could not be read, or a database
//               without the table (nothing was changed).
// An `email_controls.set` audit row carries the field, from and to.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;
  const parsed = parseEmailControlsChange(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const change = parsed.change;

  const admin = createAdminClient();
  const { data: row, error: readError } = await admin
    .from("email_controls")
    .select("sending_enabled, test_inbox, disabled_kinds")
    .eq("id", 1)
    .maybeSingle();
  if (readError) return unavailable(readError);
  const current = parseEmailControls(row);

  let update: Record<string, unknown>;
  let from: unknown;
  let to: unknown;
  let label: string;
  if (change.field === "sending_enabled") {
    from = current.sendingEnabled;
    to = change.value;
    label = "Send emails";
    update = { sending_enabled: change.value };
  } else if (change.field === "test_inbox") {
    from = current.testInbox;
    to = change.value;
    label = "Test mode inbox";
    update = { test_inbox: change.value };
  } else {
    from = !current.disabledKinds.includes(change.kind);
    to = change.enabled;
    label = emailKindInfo(change.kind).label;
    update = { disabled_kinds: applyKindSwitch(current.disabledKinds, change.kind, change.enabled) };
  }
  if (from === to) return NextResponse.json({ success: true, unchanged: true });

  const { error } = await admin
    .from("email_controls")
    .upsert({ id: 1, ...update, updated_by: adminUser.id, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return unavailable(error);
    if (error.code === "23514") return NextResponse.json({ error: "That address isn't accepted. Enter one plain email address." }, { status: 400 });
    return serverError("admin/email/settings", error);
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "email_controls.set",
    targetLabel: label,
    details: { field: change.field, ...(change.field === "kind" ? { kind: change.kind } : {}), from, to },
  });
  return NextResponse.json({ success: true, unchanged: false });
}

function unavailable(error: { code?: string }) {
  const notMigrated = error.code === "42P01" || error.code === "PGRST205";
  return NextResponse.json(
    {
      error: notMigrated
        ? "The email switches aren't available yet - the clinic's database is being updated."
        : "We couldn't check the current email settings just now. Nothing was changed - please try again.",
    },
    { status: 503 }
  );
}
