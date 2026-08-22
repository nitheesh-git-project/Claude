import { SESSION_NOTE_FIELDS, type SessionNoteRow } from "@/lib/sessionNotes";
import { EmptyState, StatusPill } from "@/components/dashboard/SurfaceCard";
import PagedList from "@/components/dashboard/PagedList";

const RESPONSE_TONE: Record<string, string> = {
  Improved: "good",
  "No change": "neutral",
  Worse: "bad",
  Mixed: "warn",
};

/**
 * A patient's session notes, newest first — the prep material a therapist
 * reads before the next visit, and what an admin sees when auditing care.
 *
 * Read-only and clinician-only. This component must never be rendered on
 * a patient-facing surface; the data behind it has no patient select
 * policy (see session_notes in schema.sql), so a patient would see an
 * empty list rather than a leak, but the card's wording assumes a
 * clinician is reading it.
 */
export default function SessionNoteHistory({
  notes,
  therapistNameById,
  emptyBody,
}: {
  notes: SessionNoteRow[];
  therapistNameById?: Map<string, string>;
  emptyBody?: string;
}) {
  if (notes.length === 0) {
    return (
      <EmptyState
        icon="fa-file-lines"
        title="No session notes yet"
        body={emptyBody ?? "A note appears here after each delivered session."}
      />
    );
  }

  const ordered = [...notes].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <PagedList
      ordered
      noun="note"
      storageKey="session-notes"
      defaultPageSize={5}
      className="space-y-3"
      items={ordered.map((note, index) => {
        const response = (note.data?.response ?? "").trim();
        return {
          id: note.id,
          node: (
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-slate-800">
                  {new Date(note.created_at).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
                {index === 0 && <StatusPill tone="brand">Most recent</StatusPill>}
                {response && (
                  <StatusPill tone={RESPONSE_TONE[response] ?? "neutral"}>{response}</StatusPill>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {therapistNameById?.get(note.therapist_id) ?? "Therapist"}
                {note.updated_at ? " · edited" : ""}
              </p>
            </div>

            <dl className="mt-3 space-y-2">
              {SESSION_NOTE_FIELDS.filter((f) => f.key !== "response").map((field) => {
                const value = (note.data?.[field.key] ?? "").trim();
                if (!value) return null;
                return (
                  <div key={field.key}>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {field.shortLabel}
                    </dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{value}</dd>
                  </div>
                );
              })}
              {note.free_text && (
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Notes
                  </dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{note.free_text}</dd>
                </div>
              )}
            </dl>
          </div>
          ),
        };
      })}
    />
  );
}
