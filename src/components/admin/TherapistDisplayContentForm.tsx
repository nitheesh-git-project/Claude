"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Admin-curated public marketing copy for the /team popup (Feature 38) --
// same Edit/Save shape as TherapistNotesForm, but this one is public-facing
// (shown to any visitor who opens this therapist's popup) rather than
// private, so the copy and placeholder are written for the admin with that
// distinction front and center.
export default function TherapistDisplayContentForm({
  therapistId,
  currentDisplayNote,
}: {
  therapistId: string;
  currentDisplayNote: string;
}) {
  const [displayNote, setDisplayNote] = useState(currentDisplayNote);
  // Prop-derived base: reverts to the real prop on failure (no refresh
  // happens), matches the new prop on success once router.refresh() lands.
  const [savedNote, setSavedNote] = useOptimistic(currentDisplayNote);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSave() {
    setError(null);
    const newNote = displayNote;
    startTransition(async () => {
      setSavedNote(newNote);
      const res = await fetch("/api/admin/update-therapist-display-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ therapistId, displayNote: newNote }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="text-xs space-y-2">
      {error && <p className="text-red-600">{error}</p>}
      <textarea
        value={displayNote}
        onChange={(e) => setDisplayNote(e.target.value)}
        rows={4}
        placeholder="Optional extra blurb shown publicly in this therapist's /team popup, alongside their own bio (e.g. a highlight, focus area, or welcome note)."
        className="w-full p-2.5 rounded-lg border border-slate-300"
      />
      <button
        onClick={handleSave}
        disabled={isPending || displayNote === savedNote}
        className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold px-3 py-1.5 rounded-lg transition"
      >
        {isPending ? "Saving..." : "Save Display Content"}
      </button>
      {savedNote ? (
        <p className="p-2.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 whitespace-pre-wrap">
          {savedNote}
        </p>
      ) : (
        <p className="text-slate-400">Nothing set — the popup shows their own bio only.</p>
      )}
    </div>
  );
}
