import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPatientProfile, isProfileActive, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { serverNowMs } from "@/lib/debugClock";
import { prepWindowOpen } from "@/lib/sessionPrep";

// The patient's "I'm ready" on the get-ready list before a video session
// (guided check, phase 2, P1). It records the moment once, in
// `appointments.patient_ready_at`, so the physiotherapist's start screen can
// say so. It gates nothing.
//
// The patient is the signed-in user, never an id from the body, and the
// session must be their own, still confirmed, by video, and inside the list's
// window (two days before its start until its end, on the debug clock).
// Pressing it again answers with the first time, unchanged.
//
// Request:  { appointmentId: string }
// Response: 200 { readyAt: string, unchanged: boolean }
//           400 bad body, 401 not signed in, 403 not an active patient,
//           404 not this patient's session,
//           409 { code: "not_open" } cancelled, not by video, or outside the window,
//           429 rate limited, 503 a check that could not be run.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const active = await isProfileActive(user.id);
  if (active === null) return profileCheckUnavailable();
  if (!active) return NextResponse.json({ error: "Your account is not active." }, { status: 403 });
  const isPatient = await isPatientProfile(user.id);
  if (isPatient === null) return profileCheckUnavailable();
  if (!isPatient) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;
  const appointmentId = typeof body.appointmentId === "string" ? body.appointmentId.trim() : "";
  if (!appointmentId) return NextResponse.json({ error: "Which session is this for?" }, { status: 400 });

  const limited = await enforceRateLimit(request, "sessionReady", { identifier: user.id });
  if (limited) return limited;

  const admin = createAdminClient();
  const { data: appt, error: readError } = await admin
    .from("appointments")
    .select("id, patient_id, status, visit_mode, slot_time, duration_minutes")
    .eq("id", appointmentId)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: "We couldn't check your session just now. Please try again." }, { status: 503 });
  // Someone else's session reads exactly like no session.
  if (!appt || appt.patient_id !== user.id) return NextResponse.json({ error: "We couldn't find that session." }, { status: 404 });

  const byVideo = (appt.visit_mode ?? "online") === "online";
  if (appt.status !== "confirmed" || !byVideo || !prepWindowOpen(appt.slot_time as string, appt.duration_minutes as number | null, serverNowMs(request))) {
    return NextResponse.json({ error: "This session isn't open for that right now.", code: "not_open" }, { status: 409 });
  }

  // Its own read: the column is migration-dependent.
  const { data: current, error: currentError } = await admin.from("appointments").select("patient_ready_at").eq("id", appointmentId).maybeSingle();
  if (currentError) return NextResponse.json({ error: "This isn't set up yet. Your physiotherapist will check everything on the call." }, { status: 503 });
  if (current?.patient_ready_at) {
    return NextResponse.json({ readyAt: current.patient_ready_at as string, unchanged: true });
  }

  const readyAt = new Date().toISOString();
  const { data: written, error: writeError } = await admin
    .from("appointments")
    .update({ patient_ready_at: readyAt })
    .eq("id", appointmentId)
    .eq("patient_id", user.id)
    .is("patient_ready_at", null)
    .select("patient_ready_at")
    .maybeSingle();
  if (writeError) return NextResponse.json({ error: "That didn't save. Please try again." }, { status: 503 });
  // Two taps raced: the first one's time stands.
  if (!written) {
    const { data: again } = await admin.from("appointments").select("patient_ready_at").eq("id", appointmentId).maybeSingle();
    if (again?.patient_ready_at) return NextResponse.json({ readyAt: again.patient_ready_at as string, unchanged: true });
    return NextResponse.json({ error: "That didn't save. Please try again." }, { status: 503 });
  }
  return NextResponse.json({ readyAt: written.patient_ready_at as string, unchanged: false });
}
