import { NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverError } from "@/lib/apiError";
import { ratingRowsFrom, type PersonLite, type RatedAppointment } from "@/lib/sessionRatings";

// Read for Sessions -> Ratings & feedback: every rating either
// side has given on a session, with who gave it, about whom, and every id an
// admin might need to find the rest (session code, patient and therapist
// codes, the underlying ids, contact details).
//
// Read-only. Changing a rating (exclude, clear) goes through the existing
// exclude-session-rating / clear-session-rating routes, which carry their own
// guard and audit-log row. The cap is on rated sessions, newest first, and the
// response says when it was hit so the screen can say so rather than imply the
// list is complete.
//
// Response: 200 { rows, truncated } | 403 | 500
const CAP = 2000;
const CHUNK = 150;

export async function GET() {
  const adminUser = await requireAdminScope("sessions");
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { data: appointments, error } = await admin
    .from("appointments")
    .select(
      "id, session_code, patient_id, therapist_id, slot_time, status, visit_mode, duration_minutes, category_id, patient_rating, patient_feedback, patient_feedback_at, patient_rating_excluded, therapist_rating, therapist_feedback, therapist_feedback_at, therapist_rating_excluded"
    )
    .or("patient_rating.not.is.null,therapist_rating.not.is.null")
    .order("slot_time", { ascending: false, nullsFirst: false })
    .limit(CAP + 1);
  if (error) return serverError("admin/session-ratings", error);

  const rated = (appointments ?? []) as RatedAppointment[];
  const truncated = rated.length > CAP;
  const list = truncated ? rated.slice(0, CAP) : rated;

  const personIds = [...new Set(list.flatMap((a) => [a.patient_id, a.therapist_id]).filter((x): x is string => !!x))];
  const categoryIds = [...new Set(list.map((a) => a.category_id).filter((x): x is string => !!x))];

  const people = new Map<string, PersonLite>();
  for (let i = 0; i < personIds.length; i += CHUNK) {
    const slice = personIds.slice(i, i + CHUNK);
    const { data, error: peopleError } = await admin
      .from("profiles")
      .select("id, full_name, email, phone, patient_code, therapist_code")
      .in("id", slice);
    if (peopleError) return serverError("admin/session-ratings.people", peopleError);
    for (const p of (data ?? []) as PersonLite[]) people.set(p.id, p);
  }

  const treatments = new Map<string, string>();
  for (let i = 0; i < categoryIds.length; i += CHUNK) {
    const { data } = await admin.from("treatment_categories").select("id, title").in("id", categoryIds.slice(i, i + CHUNK));
    for (const c of data ?? []) treatments.set(c.id, c.title);
  }

  return NextResponse.json({ rows: ratingRowsFrom(list, people, treatments), truncated });
}
