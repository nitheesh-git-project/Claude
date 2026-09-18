"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useSaveSetting } from "@/lib/useSaveSetting";
import {
  MAX_MISSION_LENGTH,
  MAX_VISION_LENGTH,
  MISSION,
  VISION,
} from "@/lib/mission";

/**
 * Settings → Public Site → "Mission & Vision": the two sentences the site
 * leads with.
 *
 * These were constants in the code, which meant the copy most likely to be
 * argued over was the copy only a developer could change. Two text boxes,
 * saved one column at a time through /api/admin/update-setting like every
 * other setting on this screen.
 *
 * Blank is a real value and the placeholders are what makes that legible:
 * each box shows the line the site ships with, so an admin can see what
 * clearing the box actually renders rather than having to trust a sentence
 * saying so. Same rule the splash's brand line follows.
 *
 * The word counter is advice, not a limit. The house budget is fifteen words
 * -- a mission nobody can hold in their head is a mission nobody repeats --
 * but an owner who wants a sixteenth is not wrong in a way a form should
 * refuse, so the count turns amber and the Save still works. The character
 * cap is the real limit, because that one is about the card these lines
 * render in.
 */
function countWords(value: string): number {
  const trimmed = value.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

const WORD_BUDGET = 15;

export default function MissionStatementForm({
  mission,
  vision,
}: {
  /** As stored -- blank means the site is showing the code default. */
  mission: string;
  vision: string;
}) {
  const router = useRouter();
  const saveSetting = useSaveSetting();
  const [missionInput, setMissionInput] = useState(mission);
  const [visionInput, setVisionInput] = useState(vision);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // A synchronous guard as well as the disabled attribute: the attribute
  // lands a render too late to stop a double click.
  const submitting = useRef(false);

  function handleSave() {
    if (submitting.current) return;
    const nextMission = missionInput.trim();
    const nextVision = visionInput.trim();

    if (nextMission.length > MAX_MISSION_LENGTH) {
      setError(`Keep the mission to ${MAX_MISSION_LENGTH} characters or fewer.`);
      return;
    }
    if (nextVision.length > MAX_VISION_LENGTH) {
      setError(`Keep the vision to ${MAX_VISION_LENGTH} characters or fewer.`);
      return;
    }

    setError(null);
    submitting.current = true;
    startTransition(async () => {
      try {
        // One column per request, in sequence rather than in parallel, so a
        // failure part-way names the field that refused.
        await saveSetting("mission_statement", nextMission);
        await saveSetting("vision_statement", nextVision);
        setMissionInput(nextMission);
        setVisionInput(nextVision);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
        return;
      } finally {
        submitting.current = false;
      }
      // After the request, not inside it: the button is busy for its own
      // write and the progress bar carries the re-render that follows.
      router.refresh();
    });
  }

  const fields = [
    {
      id: "mission-statement",
      label: "Mission",
      help: "Why the practice exists. One line a patient could repeat to someone else.",
      value: missionInput,
      setValue: setMissionInput,
      max: MAX_MISSION_LENGTH,
      fallback: MISSION,
    },
    {
      id: "vision-statement",
      label: "Vision",
      help: "What it looks like if the practice succeeds.",
      value: visionInput,
      setValue: setVisionInput,
      max: MAX_VISION_LENGTH,
      fallback: VISION,
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h2 className="font-display font-bold text-lg text-slate-800 mb-1">Mission &amp; Vision</h2>
      <p className="text-xs text-slate-500 mb-4">
        The two lines the website leads with. They show side by side on the Home page and again at
        the top of the Our Mission page. Keep each one a claim a patient could check - a promise
        about what actually happens in a session persuades, where a sentence about journeys and
        wellness does not.
      </p>

      <div className="space-y-4">
        {fields.map((field) => {
          const words = countWords(field.value);
          const over = words > WORD_BUDGET;
          return (
            <div key={field.id}>
              <label
                htmlFor={field.id}
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
              >
                {field.label}
              </label>
              <textarea
                id={field.id}
                rows={2}
                value={field.value}
                placeholder={field.fallback}
                maxLength={field.max}
                onChange={(e) => field.setValue(e.target.value)}
                className="w-full max-w-2xl text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                {field.help} Leave it blank to go back to the line the site shipped with (
                {field.fallback})
                {words > 0 && (
                  <>
                    {" "}
                    <span className={over ? "text-amber-600 font-semibold" : undefined}>
                      {words} words{over ? ` - ${WORD_BUDGET} or fewer reads better` : ""}
                    </span>
                  </>
                )}
              </p>
            </div>
          );
        })}
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
      </div>
      {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
    </div>
  );
}
