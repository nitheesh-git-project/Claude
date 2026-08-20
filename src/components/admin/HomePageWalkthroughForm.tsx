"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Mirrors the bounds /api/admin/update-setting enforces (and the check
// constraint on the column). Stated here too so a bad value is caught
// before a round trip -- the route stays the authority, since this form is
// only one of the ways the column could be written.
const MIN_SECONDS = 2;
const MAX_SECONDS = 60;

/**
 * Settings → Public Site → "Home Page Walkthrough": how fast the home
 * page's three "Booking to recovery" steps rotate.
 *
 * A number rather than a toggle because the right pace depends on how much
 * copy each step carries, which admins edit elsewhere on this screen. 0 is
 * a real setting, not an error -- it leaves the steps as a plain selector
 * the visitor drives -- so the input accepts it and the copy says what it
 * does.
 */
export default function HomePageWalkthroughForm({ seconds }: { seconds: number }) {
  const router = useRouter();
  const [input, setInput] = useState(String(seconds));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const next = Math.floor(Number(input));
    setSaved(false);
    if (!Number.isFinite(next) || next < 0) {
      setError("Enter a whole number of seconds.");
      return;
    }
    if (next !== 0 && (next < MIN_SECONDS || next > MAX_SECONDS)) {
      setError(
        `Use 0 to switch the rotation off, or a value between ${MIN_SECONDS} and ${MAX_SECONDS} seconds.`
      );
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/update-setting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "journey_step_seconds", value: next }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Could not save. Please try again.");
        setInput(String(next));
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="font-bold text-lg text-slate-800 mb-1">Home Page Walkthrough</h2>
      <p className="text-xs text-slate-500 mb-4">
        The three &quot;Booking to recovery&quot; steps on the Home page advance on their own so a
        visitor sees all three. This is how long each one holds. Set it to 0 to stop the rotation
        and let visitors tap through the steps themselves. It always pauses while someone is
        hovering or keyboard-focused inside it, and never rotates for visitors who ask their
        device to reduce motion.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          max={MAX_SECONDS}
          step={1}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setSaved(false);
          }}
          className="w-24 text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
        />
        <span className="text-xs text-slate-500">seconds per step</span>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        {saved && <span className="text-[11px] text-teal-700 font-semibold">Saved.</span>}
      </div>
      {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
    </div>
  );
}
