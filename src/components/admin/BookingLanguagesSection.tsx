"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Feature Control → Booking Languages. Whatever is saved here becomes the
// language chips on /book Step 1 -- nothing in the booking UI carries its
// own list. Edits are staged locally and committed with Save (rather than
// firing a write per keystroke/removal), so a mistaken removal can be
// abandoned by navigating away.
export default function BookingLanguagesSection({
  languages,
  onSave,
}: {
  languages: string[];
  onSave: (languages: string[]) => Promise<void>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<string[]>(languages);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    draft.length !== languages.length || draft.some((l, i) => l !== languages[i]);

  function addLanguage() {
    const trimmed = input.trim();
    setSaved(false);
    if (!trimmed) return;
    if (draft.some((l) => l.toLowerCase() === trimmed.toLowerCase())) {
      setError(`"${trimmed}" is already in the list.`);
      return;
    }
    setError(null);
    setDraft((prev) => [...prev, trimmed]);
    setInput("");
  }

  function removeLanguage(language: string) {
    setSaved(false);
    setError(null);
    setDraft((prev) => prev.filter((l) => l !== language));
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    // Mirrors the server's own guard -- caught here too so admin gets the
    // message without a round trip.
    if (draft.length === 0) {
      setError("Keep at least one language — booking needs something to offer.");
      return;
    }
    startTransition(async () => {
      try {
        await onSave(draft);
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h3 className="font-bold text-sm text-slate-800">Booking Languages</h3>
      <p className="text-xs text-slate-500 mt-1 max-w-md">
        The preferred-language options patients choose from in Step 1 of booking.
        Added languages appear there immediately — the booking page keeps no list
        of its own.
      </p>

      <div className="flex flex-wrap gap-2 mt-4">
        {draft.length === 0 ? (
          <p className="text-xs text-slate-400">
            No languages yet — add at least one before saving.
          </p>
        ) : (
          draft.map((language) => (
            <span
              key={language}
              className="inline-flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg pl-3 pr-1.5 py-1.5 text-xs font-semibold text-slate-800"
            >
              {language}
              <button
                type="button"
                onClick={() => removeLanguage(language)}
                aria-label={`Remove ${language}`}
                className="w-6 h-6 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                <i className="fa-solid fa-xmark text-[11px]" aria-hidden="true"></i>
              </button>
            </span>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <input
          type="text"
          value={input}
          maxLength={40}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            // Enter adds rather than submitting anything -- this section
            // isn't inside a form, and typing a language then hitting Enter
            // is the obvious expectation.
            if (e.key === "Enter") {
              e.preventDefault();
              addLanguage();
            }
          }}
          placeholder="e.g. Hindi"
          aria-label="Add a booking language"
          className="w-44 text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
        />
        <button
          type="button"
          onClick={addLanguage}
          disabled={!input.trim()}
          className="bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-800 text-xs font-semibold px-4 py-2 rounded-lg transition"
        >
          Add
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !dirty}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        {saved && !dirty && (
          <span className="text-[11px] text-teal-700 font-semibold">Saved.</span>
        )}
      </div>

      {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
    </div>
  );
}
