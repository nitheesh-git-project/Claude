import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { specialtyDef } from "@/lib/therapistSpecialties";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A Master Admin sets a therapist's specialisation directly from People ->
 * Therapists -> the profile. A therapist's own change still waits for
 * approval (profile_change_requests); this is the reviewer making it, so
 * there is nothing to wait for. People scope, and full on top: who a
 * therapist is matched with is a Master Admin's call (owner's rule).
 * Only one of the clinic's own specialisations can be set here
 * (therapistSpecialties.ts); a free-text value already on file is left as
 * its author wrote it until somebody picks one.
 */
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser || adminUser.scope !== "full") {
    return NextResponse.json({ error: "Only a Master Admin can change a therapist's specialisation." }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{ therapistId?: unknown; specialty?: unknown }>(request);
  if (parseError) return parseError;
  const { therapistId } = body;
  if (typeof therapistId !== "string" || !UUID_RE.test(therapistId)) {
    return NextResponse.json({ error: "Missing or invalid therapistId" }, { status: 400 });
  }
  const def = typeof body.specialty === "string" ? specialtyDef(body.specialty) : null;
  if (!def) return NextResponse.json({ error: "Choose one of the clinic's specialisations." }, { status: 400 });

  const admin = createAdminClient();
  const { data: before, error: readError } = await admin
    .from("profiles")
    .select("id, full_name, role, specialization")
    .eq("id", therapistId)
    .maybeSingle();
  if (readError) return serverError("admin/set-therapist-specialty (read)", readError);
  if (!before || before.role !== "therapist") {
    return NextResponse.json({ error: "That therapist no longer exists." }, { status: 404 });
  }
  if (before.specialization === def.label) return NextResponse.json({ success: true, unchanged: true });

  const { error } = await admin.from("profiles").update({ specialization: def.label }).eq("id", therapistId);
  if (error) return serverError("admin/set-therapist-specialty", error);

  await recordAdminActivity(admin, adminUser.id, {
    action: "therapist.set_specialty",
    targetId: therapistId,
    targetLabel: before.full_name ?? "Therapist",
    details: { from: before.specialization ?? null, to: def.label },
  });
  revalidatePath("/team");
  return NextResponse.json({ success: true });
}
