import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isProfileActiveAndApproved, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";
import { hasStartedSessionWithPatient, isTherapistAssignedToPatient } from "@/lib/conditionAccess";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";

// The gate the measurement and milestone routes share, written once so
// three routes cannot grow three slightly different copies of it. It is the
// neurological exam route's gate (/api/therapist/neuro-assessments/submit),
// step for step: signed in, active and approved, a therapist, and assigned
// to this patient under the clinical-access rule (isTherapistAssignedToPatient
// -- live or delivered care, never a cancelled session or a lapsed
// programme). Each step that could not be run answers 503, never a "no".
//
// The started-session half is separate (requireStartedSession) because the
// RLS policies split the same way: recording a measurement -- or marking a
// milestone reached, which is an observation too -- needs a session that
// has started or been delivered; planning a goal or a milestone needs only
// the assignment (care_goals_insert_assigned_therapist and friends).

type AdminClient = ReturnType<typeof createAdminClient>;

export type TherapistGate =
  | { ok: true; therapistId: string; admin: AdminClient }
  | { ok: false; response: NextResponse };

/** Who is asking. Run before anything the caller sent is looked at. */
export async function requireSignedInUser(): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true, userId: user.id };
}

export async function requireAssignedTherapist(userId: string, patientId: string, notAssignedMessage: string): Promise<TherapistGate> {
  const standing = await isProfileActiveAndApproved(userId);
  if (standing === null) return { ok: false, response: profileCheckUnavailable() };
  if (!standing) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Your account is not active - it is either awaiting admin approval or has been suspended." },
        { status: 403 }
      ),
    };
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (profileError) return { ok: false, response: profileCheckUnavailable() };
  if (profile?.role !== "therapist") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const assigned = await isTherapistAssignedToPatient(admin, userId, patientId);
  if (assigned === null) return { ok: false, response: profileCheckUnavailable() };
  if (!assigned) {
    return { ok: false, response: NextResponse.json({ error: notAssignedMessage, code: "not_assigned" }, { status: 403 }) };
  }
  return { ok: true, therapistId: userId, admin };
}

/**
 * A completed session with this patient, or a confirmed one inside its join
 * window, on the debug bar's clock (`nowMs` is serverNowMs(request), never
 * a Date.now() default). Null on success; the response to return otherwise.
 */
export async function requireStartedSession(
  admin: AdminClient,
  therapistId: string,
  patientId: string,
  nowMs: number,
  refusal: string
): Promise<NextResponse | null> {
  const { data: settingsRow } = await admin.from("site_settings").select(SITE_SETTINGS_SELECT).maybeSingle();
  const started = await hasStartedSessionWithPatient(
    admin,
    therapistId,
    patientId,
    parseAdminSettings(settingsRow).joinWindowMinutes,
    nowMs
  );
  if (started === null) return profileCheckUnavailable();
  if (!started) return NextResponse.json({ error: refusal, code: "session_not_started" }, { status: 409 });
  return null;
}
