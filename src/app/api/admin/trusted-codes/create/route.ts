import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { readPayLaterEnabled } from "@/lib/payLaterSettingsServer";
import { makeTrustedCode, validateTrustedCodeInput } from "@/lib/trustedPatientCode";

/**
 * Create a one-time trusted-patient code (Money -> Costs). Money scope, like
 * granting pay later by hand -- it is the same extension of credit, made
 * ahead of time. Refused while pay later is off for the clinic.
 */
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("money");
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;
  const verdict = validateTrustedCodeInput(body);
  if (!verdict.ok) return NextResponse.json({ error: verdict.error }, { status: 400 });

  const admin = createAdminClient();
  if (!(await readPayLaterEnabled(admin))) {
    return NextResponse.json(
      { error: "Pay later is switched off for the whole clinic. Turn it on under Money - Owed by Patients first." },
      { status: 409 }
    );
  }

  const v = verdict.value;
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = makeTrustedCode((n) => Array.from({ length: n }, () => randomInt(0, 1_000_000)));
    const { data, error } = await admin
      .from("trusted_patient_codes")
      .insert({
        code,
        patient_name: v.patientName,
        reason: v.reason,
        note: v.note,
        match_email: v.email,
        match_phone: v.phone,
        created_by: adminUser.id,
      })
      .select("id, code")
      .single();
    if (error?.code === "23505") continue; // the code collided; draw again
    if (error) return serverError("admin/trusted-codes/create", error);
    await recordAdminActivity(admin, adminUser.id, {
      action: "trusted_code.create",
      targetId: data.id,
      targetLabel: `${data.code} for ${v.patientName}`,
      details: { reason: v.reason, lockedToEmail: !!v.email, lockedToPhone: !!v.phone },
    });
    return NextResponse.json({ success: true, id: data.id, code: data.code });
  }
  return NextResponse.json({ error: "Could not make a unique code just now. Please try again." }, { status: 503 });
}
