import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";
import { issueSetPasswordLink, unknowablePassword } from "@/lib/accessLink";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    patientId?: string;
  }>(request);
  if (parseError) return parseError;
  const { patientId } = body;
  if (!patientId) {
    return NextResponse.json({ error: "Missing patientId" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: patient } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", patientId)
    .eq("role", "patient")
    .single();

  if (!patient) {
    return NextResponse.json({ error: "That account is not a patient" }, { status: 400 });
  }

  // A password nobody knows: the reset still locks out whoever holds the
  // current one, and the person sets their own through the one-time link
  // below. Nothing is stored or shown -- see src/lib/accessLink.ts.
  const password = unknowablePassword();
  const { error } = await admin.auth.admin.updateUserById(patientId, {
    password,
  });

  if (error) {
    return serverError("admin/reset-patient-password", error);
  }

  // Any plaintext an older version of this route left behind is cleared:
  // it is a credential for the password just replaced.
  await admin.from("patient_admin_notes").update({ temp_password: null }).eq("patient_id", patientId);

  const link = await issueSetPasswordLink(admin, patient.email);
  if (!link.ok) {
    return serverError("admin/reset-patient-password", link.error, {
      message:
        "The old password was cleared, but a sign-in link could not be made. Press the button again to issue one.",
    });
  }

  // The generated password is deliberately NOT in the log -- it is a live
  // credential, and admin_activity_log is read by every admin. That an
  // admin reset it, for whom, and when is the part worth keeping.
  await recordAdminActivity(admin, adminUser.id, {
    action: "account.reset_password",
    targetId: patientId,
    details: { role: "patient" },
  });

  return NextResponse.json({ email: patient.email, linkPath: link.path });
}
