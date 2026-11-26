// The Ratings & feedback screen's rows and rules, free of React and of the
// database so they can be tested: one row per side per session (the patient's
// rating of the session and the therapist's note on the patient are two
// separate submissions), the filters, and the figures over the strip.
//
// A rating is never public on its own: the numbers reach the public site only
// as an average, through public_therapist_ratings, and an excluded rating is
// left out of that average. This screen is where an admin reads each one in
// full, so it shows excluded ratings too, drawn as excluded.

export type RatingSide = "patient" | "therapist";

export type SessionRatingRow = {
  /** appointments.id plus the side, so a session's two ratings are two keys. */
  key: string;
  side: RatingSide;
  appointmentId: string;
  sessionCode: string | null;
  slotTime: string | null;
  status: string | null;
  visitMode: string | null;
  treatment: string | null;
  durationMinutes: number | null;
  rating: number;
  feedback: string | null;
  submittedAt: string | null;
  excluded: boolean;
  patient: { id: string; code: string | null; name: string | null; email: string | null; phone: string | null };
  therapist: { id: string | null; code: string | null; name: string | null; email: string | null; phone: string | null };
};

export type PersonLite = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  patient_code?: string | null;
  therapist_code?: string | null;
};

export type RatedAppointment = {
  id: string;
  session_code: string | null;
  patient_id: string;
  therapist_id: string | null;
  slot_time: string | null;
  status: string | null;
  visit_mode: string | null;
  duration_minutes: number | null;
  category_id: string | null;
  patient_rating: number | null;
  patient_feedback: string | null;
  patient_feedback_at: string | null;
  patient_rating_excluded: boolean | null;
  therapist_rating: number | null;
  therapist_feedback: string | null;
  therapist_feedback_at: string | null;
  therapist_rating_excluded: boolean | null;
};

const asPerson = (p: PersonLite | undefined, code: string | null | undefined) => ({
  name: p?.full_name ?? null,
  email: p?.email ?? null,
  phone: p?.phone ?? null,
  code: code ?? null,
});

/** One row per rating given. A session rated by both sides yields two rows. */
export function ratingRowsFrom(
  appointments: RatedAppointment[],
  people: Map<string, PersonLite>,
  treatments: Map<string, string>
): SessionRatingRow[] {
  const rows: SessionRatingRow[] = [];
  for (const a of appointments) {
    const patient = people.get(a.patient_id);
    const therapist = a.therapist_id ? people.get(a.therapist_id) : undefined;
    const common = {
      appointmentId: a.id,
      sessionCode: a.session_code,
      slotTime: a.slot_time,
      status: a.status,
      visitMode: a.visit_mode,
      treatment: a.category_id ? (treatments.get(a.category_id) ?? null) : null,
      durationMinutes: a.duration_minutes,
      patient: { id: a.patient_id, ...asPerson(patient, patient?.patient_code) },
      therapist: { id: a.therapist_id, ...asPerson(therapist, therapist?.therapist_code) },
    };
    if (a.patient_rating !== null) {
      rows.push({
        ...common,
        key: `${a.id}:patient`,
        side: "patient",
        rating: a.patient_rating,
        feedback: a.patient_feedback,
        submittedAt: a.patient_feedback_at,
        excluded: !!a.patient_rating_excluded,
      });
    }
    if (a.therapist_rating !== null) {
      rows.push({
        ...common,
        key: `${a.id}:therapist`,
        side: "therapist",
        rating: a.therapist_rating,
        feedback: a.therapist_feedback,
        submittedAt: a.therapist_feedback_at,
        excluded: !!a.therapist_rating_excluded,
      });
    }
  }
  // Newest rating first; a rating with no stamp (older rows) sorts by its
  // session's time instead.
  return rows.sort((x, y) => when(y).localeCompare(when(x)));
}

const when = (r: SessionRatingRow) => r.submittedAt ?? r.slotTime ?? "";

export type RatingFilters = {
  side: "all" | RatingSide;
  /** 0 = any; 1-5 = exactly that many stars; -1 = 1-2 stars ("needs a look"). */
  stars: number;
  counting: "all" | "counted" | "excluded";
  withNote: boolean;
  query: string;
};

export const NO_FILTERS: RatingFilters = { side: "all", stars: 0, counting: "all", withNote: false, query: "" };

/** Everything a person might type to find a rating: names, codes (PT0001,
 *  TH0002, SS0003), contact details and the ids themselves. */
function haystack(r: SessionRatingRow): string {
  return [
    r.sessionCode,
    r.appointmentId,
    r.treatment,
    r.feedback,
    r.patient.id,
    r.patient.code,
    r.patient.name,
    r.patient.email,
    r.patient.phone,
    r.therapist.id,
    r.therapist.code,
    r.therapist.name,
    r.therapist.email,
    r.therapist.phone,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterRatings(rows: SessionRatingRow[], f: RatingFilters): SessionRatingRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.side !== "all" && r.side !== f.side) return false;
    if (f.stars === -1 ? r.rating > 2 : f.stars > 0 && r.rating !== f.stars) return false;
    if (f.counting === "counted" && r.excluded) return false;
    if (f.counting === "excluded" && !r.excluded) return false;
    if (f.withNote && !r.feedback?.trim()) return false;
    return q === "" || haystack(r).includes(q);
  });
}

export type RatingSummary = { count: number; average: number | null; lowCount: number; withNote: number; excluded: number };

/** The average counts what the public average counts: excluded ratings are out. */
export function summariseRatings(rows: SessionRatingRow[]): RatingSummary {
  const counted = rows.filter((r) => !r.excluded);
  return {
    count: rows.length,
    average: counted.length ? Math.round((counted.reduce((s, r) => s + r.rating, 0) / counted.length) * 10) / 10 : null,
    lowCount: rows.filter((r) => r.rating <= 2).length,
    withNote: rows.filter((r) => !!r.feedback?.trim()).length,
    excluded: rows.filter((r) => r.excluded).length,
  };
}
