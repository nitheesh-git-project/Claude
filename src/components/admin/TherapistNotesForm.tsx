"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function TherapistNotesForm({
  therapistId,
  currentNote,
}: {
  therapistId: string;
  currentNote: string;
}) {
  const [note, setNote] = useState(currentNote);
  // Prop-derived base: reverts to the real prop on failure (no refresh
  // happens), matches the new prop on success once router.refresh() lands.
  const [savedNote, setSavedNote] = useOptimistic(currentNote);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSave() {
    setError(null);
    const newNote = note;
    startTransition(async () => {
      setSavedNote(newNote);
      const res = await fetch("/api/admin/update-therapist-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ therapistId, note: newNote }),
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
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        placeholder="Private notes about this therapist — never shown to them."
        className="w-full p-2.5 rounded-lg border border-slate-300"
      />
      <button
        onClick={handleSave}
        disabled={isPending}
        className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white font-semibold px-3 py-1.5 rounded-lg transition"
      >
        {isPending ? "Saving..." : "Save Notes"}
      </button>
      {savedNote ? (
        <p className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 whitespace-pre-wrap">
          {savedNote}
        </p>
      ) : (
        <p className="text-slate-400">No notes saved yet.</p>
      )}
    </div>
  );
}
