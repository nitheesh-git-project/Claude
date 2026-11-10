import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { isProfileKind, validateWidgetChoice } from "@/lib/profileWidgets";

// Settings -> Health Profile layout: whether one section of the Health
// Profile is shown for every patient of a condition kind
// (profile_widget_kind_settings; the rules are in src/lib/profileWidgets.ts).
//
// "settings" scope, like the other clinic-wide clinical rules on Settings
// (the licensed-scale switch, the six-minute walk formula): this changes what
// every patient of a kind sees. The section is checked against the registry
// -- a key this kind has not got is a 400, and so is hiding a locked one (the
// table's CHECK refuses it too, for any caller). `visible: null` resets the
// section to the code's default by deleting the row. A
// `profile_widgets.set_kind` audit row carries the section, from and to.
//
// Request:  { profileKind, widgetKey, visible: boolean | null }
// Response: 200 { success: true, unchanged: boolean }
//           400 validation ({ code: "unknown_widget" | "locked_widget" |
//               "bad_value" | "bad_kind" }), 403 scope,
//           503 a check that could not be run or a database without the table.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;
  if (!isProfileKind(body.profileKind)) {
    return NextResponse.json({ error: "Choose a condition type.", code: "bad_kind" }, { status: 400 });
  }
  const kind = body.profileKind;
  const checked = validateWidgetChoice(body, kind);
  if (!checked.ok) return NextResponse.json({ error: checked.error, code: checked.code }, { status: 400 });

  const admin = createAdminClient();
  const { data: current, error: readError } = await admin
    .from("profile_widget_kind_settings")
    .select("visible")
    .eq("profile_kind", kind)
    .eq("widget_key", checked.widget.key)
    .maybeSingle();
  if (readError) return unavailable(readError);
  const from = current ? current.visible === true : null;
  if (from === checked.visible) return NextResponse.json({ success: true, unchanged: true });

  const { error } =
    checked.visible === null
      ? await admin.from("profile_widget_kind_settings").delete().eq("profile_kind", kind).eq("widget_key", checked.widget.key)
      : await admin
          .from("profile_widget_kind_settings")
          .upsert({ profile_kind: kind, widget_key: checked.widget.key, visible: checked.visible, set_by: adminUser.id }, { onConflict: "profile_kind,widget_key" });
  if (error) {
    if (error.code === "23514") return NextResponse.json({ error: `${checked.widget.label} is always shown.`, code: "locked_widget" }, { status: 400 });
    if (error.code === "42P01" || error.code === "PGRST205") return unavailable(error);
    return serverError("admin/profile-widgets/kind", error);
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "profile_widgets.set_kind",
    targetLabel: `${checked.widget.label} (${kind})`,
    details: { profileKind: kind, widgetKey: checked.widget.key, from, to: checked.visible },
  });
  return NextResponse.json({ success: true, unchanged: false });
}

function unavailable(error: { code?: string }) {
  const notMigrated = error.code === "42P01" || error.code === "PGRST205";
  return NextResponse.json(
    {
      error: notMigrated
        ? "The Health Profile layout isn't available yet - the clinic's database is being updated."
        : "We couldn't check the current setting just now. Nothing was changed - please try again.",
    },
    { status: 503 }
  );
}
