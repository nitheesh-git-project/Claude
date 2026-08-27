"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  MAX_SPLASH_HOLD_SECONDS,
  MAX_SPLASH_PHRASE_LENGTH,
  MAX_SPLASH_REVISIT_MINUTES,
  MIN_SPLASH_HOLD_SECONDS,
} from "@/lib/splashScreen";

/**
 * Settings → Public Site → "Opening Splash": the brand sheet the site
 * paints over itself for a beat on a cold open.
 *
 * Three fields and a switch, saved one column at a time through
 * /api/admin/update-setting like every other setting on this screen. The
 * bounds below mirror what that route and the columns' own check
 * constraints enforce — stated here too so a bad value is caught before a
 * round trip, with the route remaining the authority.
 *
 * The fade length is deliberately not here: it is written in both
 * globals.css and SPLASH_FADE_MS, and the timer that removes the sheet from
 * the page is the second of those. An admin able to change one without the
 * other would either cut the fade short or leave an invisible sheet
 * swallowing clicks.
 */
export default function SplashScreenForm({
  enabled,
  phrase,
  holdSeconds,
  revisitMinutes,
}: {
  enabled: boolean;
  phrase: string;
  holdSeconds: number;
  revisitMinutes: number;
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [phraseInput, setPhraseInput] = useState(phrase);
  const [holdInput, setHoldInput] = useState(String(holdSeconds));
  const [revisitInput, setRevisitInput] = useState(String(revisitMinutes));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function save(key: string, value: string | number | boolean) {
    const res = await fetch("/api/admin/update-setting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Could not save. Please try again.");
  }

  function handleToggle(next: boolean) {
    setSaved(false);
    setError(null);
    // Optimistic, then put back if the write fails: this is a switch, and
    // leaving it in the position the admin did not choose is worse than a
    // moment showing the one they did.
    setOn(next);
    startTransition(async () => {
      try {
        await save("splash_enabled", next);
        setSaved(true);
        router.refresh();
      } catch (e) {
        setOn(!next);
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  function handleSave() {
    setSaved(false);
    const trimmed = phraseInput.trim();
    const hold = Number(holdInput);
    const revisit = Math.floor(Number(revisitInput));

    if (!trimmed) {
      setError("Give the splash a line to say, or switch it off.");
      return;
    }
    if (trimmed.length > MAX_SPLASH_PHRASE_LENGTH) {
      setError(`Keep the line to ${MAX_SPLASH_PHRASE_LENGTH} characters or fewer.`);
      return;
    }
    if (
      !Number.isFinite(hold) ||
      hold < MIN_SPLASH_HOLD_SECONDS ||
      hold > MAX_SPLASH_HOLD_SECONDS
    ) {
      setError(
        `Hold must be between ${MIN_SPLASH_HOLD_SECONDS} and ${MAX_SPLASH_HOLD_SECONDS} seconds.`
      );
      return;
    }
    if (!Number.isFinite(revisit) || revisit < 0 || revisit > MAX_SPLASH_REVISIT_MINUTES) {
      setError(`Use 0 for first load only, or up to ${MAX_SPLASH_REVISIT_MINUTES} minutes.`);
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        // One column per request, same as every other setting here. Saved
        // in sequence rather than in parallel so a failure part-way names
        // the field that refused instead of racing three writes.
        await save("splash_phrase", trimmed);
        await save("splash_hold_seconds", hold);
        await save("splash_revisit_minutes", revisit);
        setPhraseInput(trimmed);
        setHoldInput(String(hold));
        setRevisitInput(String(revisit));
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="font-bold text-lg text-slate-800 mb-1">Opening Splash</h2>
      <p className="text-xs text-slate-500 mb-4">
        A full-screen greeting shown over the site for a moment when someone opens it in a new
        tab, and again when a tab left in the background is returned to. It never shows on an
        internal link, a reload of the same tab, or a quick flick away and back — someone
        approving a payment in their banking app comes straight back to where they were. Visitors
        who ask their device to reduce motion never see it.
      </p>

      <label className="flex items-center gap-3 mb-5">
        <input
          type="checkbox"
          checked={on}
          disabled={isPending}
          onChange={(e) => handleToggle(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
        />
        <span className="text-xs font-semibold text-slate-700">
          {on ? "Showing on cold opens" : "Switched off — the site opens straight to the page"}
        </span>
      </label>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="splash-phrase"
            className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
          >
            The line it says
          </label>
          <input
            id="splash-phrase"
            type="text"
            value={phraseInput}
            maxLength={MAX_SPLASH_PHRASE_LENGTH}
            onChange={(e) => {
              setPhraseInput(e.target.value);
              setSaved(false);
            }}
            className="w-full max-w-sm text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            A few words under the clinic name. It is one line on a phone, so keep it short.
          </p>
        </div>

        <div className="flex flex-wrap gap-6">
          <div>
            <label
              htmlFor="splash-hold"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
            >
              How long it holds
            </label>
            <div className="flex items-center gap-2">
              <input
                id="splash-hold"
                type="number"
                min={MIN_SPLASH_HOLD_SECONDS}
                max={MAX_SPLASH_HOLD_SECONDS}
                step={0.1}
                value={holdInput}
                onChange={(e) => {
                  setHoldInput(e.target.value);
                  setSaved(false);
                }}
                className="w-24 text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <span className="text-xs text-slate-500">seconds</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Before it starts fading away.</p>
          </div>

          <div>
            <label
              htmlFor="splash-revisit"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
            >
              Show again after
            </label>
            <div className="flex items-center gap-2">
              <input
                id="splash-revisit"
                type="number"
                min={0}
                max={MAX_SPLASH_REVISIT_MINUTES}
                step={1}
                value={revisitInput}
                onChange={(e) => {
                  setRevisitInput(e.target.value);
                  setSaved(false);
                }}
                className="w-24 text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <span className="text-xs text-slate-500">minutes away</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              How long a tab must sit in the background before returning to it counts as a fresh
              visit. Set 0 to greet the first load only.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-5">
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
