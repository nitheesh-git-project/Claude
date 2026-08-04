"use client";

import { useState } from "react";
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
  const [savedNote, setSavedNote] = useState(currentDisplayNote);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSave() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/update-therapist-display-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ therapistId, displayNote }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save. Please try again.");
      return;
    }
    setSavedNote(displayNote);
    router.refresh();
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
        disabled={loading || displayNote === savedNote}
        className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold px-3 py-1.5 rounded-lg transition"
      >
        {loading ? "Saving..." : "Save Display Content"}
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
