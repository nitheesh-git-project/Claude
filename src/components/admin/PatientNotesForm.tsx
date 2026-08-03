"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PatientNotesForm({
  patientId,
  currentNote,
}: {
  patientId: string;
  currentNote: string;
}) {
  const [note, setNote] = useState(currentNote);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  async function handleSave() {
    setLoading(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/admin/update-patient-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, note }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save. Please try again.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="text-xs space-y-2">
      {error && <p className="text-red-600">{error}</p>}
      {saved && <p className="text-teal-700">Saved.</p>}
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
        rows={4}
        placeholder="Private notes about this patient — never shown to them."
        className="w-full p-2.5 rounded-lg border border-slate-300"
      />
      <button
        onClick={handleSave}
        disabled={loading}
        className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white font-semibold px-3 py-1.5 rounded-lg transition"
      >
        {loading ? "Saving..." : "Save Notes"}
      </button>
    </div>
  );
}
