import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { loadPatientProfileKind } from "@/lib/outcomeServer";
import { cleanOverrideReason, validateWidgetChoice } from "@/lib/profileWidgets";

// The admin patient record -> "Sections for this patient": whether one
// section of THIS patient's Health Profile is shown, beating the condition
// kind's setting (patient_profile_widget_overrides; src/lib/profileWidgets.ts).
//
// "people" scope, like the other admin writes on a patient's clinical record
// (/api/admin/care-status/set). The patient's profile kind is read on the
// server, never taken from the body, and the section is checked against it:
// a key that kind has not got is a 400, and so is hiding a locked one (the
// table's CHECK refuses it too). `visible: null` is "Reset to condition
// default": the row is deleted. A `profile_widgets.set_patient` audit row
// carries the section, from, to and the reason.
//
// Request:  { patientId, widgetKey, visible: boolean | null, reason?: string }
// Response: 200 { success: true, unchanged: boolean }
//           400 validation ({ code: "unknown_widget" | "locked_widget" |
//               "bad_value" }), 403 scope, 404 no such patient,
//           409 { code: "no_condition_profile" },
//           503 a check that could not be run or a database without the table.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;
  const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
  if (!patientId) return NextResponse.json({ error: "Missing patientId" }, { status: 400 });

  const admin = createAdminClient();
  const { data: patient, error: patientError } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("id", patientId)
    .eq("role", "patient")
    .maybeSingle();
  if (patientError && patientError.code !== "22P02") {
    return NextResponse.json({ error: "We couldn't check this patient just now. Please try again." }, { status: 503 });
  }
  if (!patient) return NextResponse.json({ error: "No such patient." }, { status: 404 });

  const kind = await loadPatientProfileKind(admin, patientId);
  if (kind.status === "unreadable") {
    return NextResponse.json({ error: "We couldn't check this patient's condition type just now. Please try again." }, { status: 503 });
  }
  if (kind.status === "no_profile") {
    return NextResponse.json(
      { error: "This patient has no Health Profile yet, so there are no sections to choose.", code: "no_condition_profile" },
      { status: 409 }
    );
  }

  const checked = validateWidgetChoice(body, kind.profileKind);
  if (!checked.ok) return NextResponse.json({ error: checked.error, code: checked.code }, { status: 400 });
  const reason = cleanOverrideReason(body.reason);
  if (!reason.ok) return NextResponse.json({ error: reason.error, code: "bad_value" }, { status: 400 });

  const { data: current, error: readError } = await admin
    .from("patient_profile_widget_overrides")
    .select("visible, reason")
    .eq("patient_id", patientId)
    .eq("widget_key", checked.widget.key)
    .maybeSingle();
  if (readError) return unavailable(readError);
  const from = current ? current.visible === true : null;
  if (from === checked.visible && (checked.visible === null || (current?.reason ?? null) === reason.reason)) {
    return NextResponse.json({ success: true, unchanged: true });
  }

  const { error } =
    checked.visible === null
      ? await admin.from("patient_profile_widget_overrides").delete().eq("patient_id", patientId).eq("widget_key", checked.widget.key)
      : await admin.from("patient_profile_widget_overrides").upsert(
          { patient_id: patientId, widget_key: checked.widget.key, visible: checked.visible, reason: reason.reason, set_by: adminUser.id },
          { onConflict: "patient_id,widget_key" }
        );
  if (error) {
    if (error.code === "23514") return NextResponse.json({ error: `${checked.widget.label} is always shown.`, code: "locked_widget" }, { status: 400 });
    if (error.code === "42P01" || error.code === "PGRST205") return unavailable(error);
    return serverError("admin/profile-widgets/patient", error);
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "profile_widgets.set_patient",
    targetId: patientId,
    targetLabel: patient.full_name ?? null,
    details: { profileKind: kind.profileKind, widgetKey: checked.widget.key, from, to: checked.visible, reason: reason.reason },
  });
  return NextResponse.json({ success: true, unchanged: false });
}

function unavailable(error: { code?: string }) {
  const notMigrated = error.code === "42P01" || error.code === "PGRST205";
  return NextResponse.json(
    {
      error: notMigrated
        ? "The Health Profile layout isn't available yet - the clinic's database is being updated."
        : "We couldn't check this patient's sections just now. Nothing was changed - please try again.",
    },
    { status: 503 }
  );
}
