"use client";

import { useRef, useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { useUnloadWarning } from "@/lib/useUnloadWarning";
import { useTherapistUnavailable } from "@/components/admin/TherapistUnavailableDialog";
import Spinner from "@/components/system/Spinner";
import { programmePickWarning, type ProgrammePick } from "@/lib/sessionAssignQueue";

/**
 * The one-tap assign for a programme session, above the drawer's ordinary
 * picker.
 *
 * Every programme session reaches the admin unassigned with the programme's
 * therapist pre-picked (docs/rules/programmes.md). When the roster says they
 * can still take that time this is a single primary button, "Assign
 * <name>", calling the same /api/admin/assign-appointment every other assign
 * calls -- which confirms a paid session and makes its Meet link or calendar
 * invite. When they can't (nothing is held for them while the session
 * waits), the button is replaced by the reason, so the admin is never handed
 * a one-tap control that is about to come back "Unable to assign"; the
 * picker below is how they choose someone else, or the reschedule form how
 * they move it.
 */
export default function ProgrammeTherapistAssign({
  appointmentId,
  pick,
  confirms,
}: {
  appointmentId: string;
  pick: ProgrammePick;
  /** Whether the assign also confirms it -- a paid session does; a cash
   *  home visit nobody has paid for yet stays `requested` (the assign
   *  route's own rule, unchanged). */
  confirms: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const router = useRouter();
  const { showIfUnavailable, dialog: unavailableDialog } = useTherapistUnavailable();
  useUnloadWarning(loading);
  const warning = programmePickWarning(pick);

  async function handleAssign() {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/assign-appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, therapistId: pick.therapistId }),
        keepalive: true,
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!showIfUnavailable(data, pick.therapistId)) {
        setError(data.error ?? "Could not assign. Please try again.");
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  if (warning) {
    return (
      <div
        className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900"
        data-testid="programme-pick-warning"
      >
        <p className="font-semibold">{warning}</p>
        {pick.blocks.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-amber-800">
            {pick.blocks.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-lg border border-teal-200 bg-teal-50 p-3" data-testid="programme-pick">
      <p className="text-[11px] font-semibold text-teal-800">
        Programme therapist: {pick.therapistName}
      </p>
      <button
        type="button"
        onClick={handleAssign}
        disabled={loading}
        className="mt-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
      >
        {loading ? (
          <span className="inline-flex items-center gap-1.5">
            <Spinner /> Assigning…
          </span>
        ) : (
          `Assign ${pick.therapistName}`
        )}
      </button>
      <p className="mt-1 text-[11px] text-teal-800">
        {confirms
          ? "Confirms the session at the time it was booked for. Someone else? Pick them below."
          : "Assigns them at the time it was booked for - an unpaid cash visit is not confirmed by assigning. Someone else? Pick them below."}
      </p>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      {unavailableDialog}
    </div>
  );
}
