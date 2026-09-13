"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/lib/useRouter";
import AdminSlotPicker, { earliestSlot, slotToMs } from "@/components/admin/AdminSlotPicker";
import { BOOKING_LEAD_TIME_MS } from "@/lib/bookingSlots";

export default function AssignReferralForm({
  referralId,
  therapists,
}: {
  referralId: string;
  therapists: { id: string; full_name: string }[];
}) {
  const [therapistId, setTherapistId] = useState(therapists[0]?.id ?? "");
  // One instant for the whole form, read once **after mount**: the picker
  // offers dates against it and the check below validates against the same
  // value, so the two cannot disagree about where the lead-time boundary
  // falls.
  //
  // After mount rather than in a `useState` initialiser, which is what this
  // replaces. `earliestSlot` works in local wall-clock time, so the server
  // resolved it in UTC and the browser resolved it again in the viewer's
  // zone -- and the two disagreed. React reported it as
  // "the server rendered text didn't match the client" on the *whole admin
  // dashboard* (the referral card renders inside it) and regenerated that
  // entire tree on the client, which is a re-render of every screen the
  // dashboard mounts at once. Observed live: the server rendered
  // "Sunday, September 13, 2026 - 8 PM - 9 PM" where the client wanted
  // "Monday, September 14, 2026 - 6 AM - 7 AM".
  //
  // `AdminNewBookingTab` already does it this way and says so; this is the
  // same fix applied to the two pickers that never got it.
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [slot, setSlot] = useState<{ dateKey: string; hour: number | null }>({
    dateKey: "",
    hour: null,
  });
  useEffect(() => {
    const now = Date.now();
    // set-state-in-effect is the sanctioned shape for reading a clock the
    // server must not read -- see AdminNewBookingTab for the long version.
    /* eslint-disable react-hooks/set-state-in-effect */
    setNowMs(now);
    setSlot(earliestSlot(now));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const router = useRouter();

  async function handleAssign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const slotMs = slotToMs(slot.dateKey, slot.hour);
    // `nowMs` is null until the clock is read after mount, and the picker is
    // not on screen before then -- so a submit that gets here without it has
    // nothing chosen anyway.
    if (!therapistId || slotMs === null || nowMs === null) {
      setError("Pick a date and time for the session.");
      return;
    }
    // The picker cannot offer a slot inside the lead time, so this only fires
    // when a card has been left open long enough for the boundary to move
    // past the chosen slot -- which is exactly when a silent submit would
    // hand the patient a time the platform would refuse.
    if (slotMs < nowMs + BOOKING_LEAD_TIME_MS) {
      setError("That time is no longer far enough ahead. Pick a later slot.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/assign-referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        referralId,
        therapistId,
        slotDateTime: new Date(slotMs).toISOString(),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not assign. Please try again.");
      return;
    }
    setInviteLink(`${window.location.origin}/patient/register?ref=${data.inviteToken}`);
  }

  if (inviteLink) {
    return (
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-xs space-y-2">
        <p className="font-bold text-teal-900">
          Invite ready — send this link to the patient:
        </p>
        <p className="break-all font-mono bg-white border border-teal-200 rounded-lg p-2">
          {inviteLink}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(inviteLink)}
            className="bg-teal-700 hover:bg-teal-800 text-white font-semibold px-3 py-1.5 rounded-lg transition"
          >
            Copy Link
          </button>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-3 py-1.5 rounded-lg transition"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (therapists.length === 0) {
    return (
      <p className="text-[11px] text-slate-400">
        No approved therapists yet — approve one above first.
      </p>
    );
  }

  return (
    <form onSubmit={handleAssign} className="w-full space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          aria-label="Therapist to assign"
          value={therapistId}
          onChange={(e) => setTherapistId(e.target.value)}
          className="text-xs p-2 rounded-lg border border-slate-300"
        >
          {therapists.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading}
          className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
        >
          {loading ? "Assigning..." : "Assign & Create Registration Link"}
        </button>
        {error && <span className="text-[11px] text-red-600">{error}</span>}
      </div>
      {/* Inline rather than a dialog: the slot is being chosen for the
          referral this form sits inside, and a pop-up would cover the
          medical issue and the patient's number it is chosen against. */}
      {/* Held back until the clock is read in the browser: the server has no
          honest value for `nowMs`, so it renders the resting shape of the
          control rather than a date it would have to guess at. */}
      {nowMs === null ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500">
          Loading the calendar…
        </div>
      ) : (
        <AdminSlotPicker
          dateKey={slot.dateKey}
          hour={slot.hour}
          onChange={setSlot}
          nowMs={nowMs}
          disabled={loading}
        />
      )}
    </form>
  );
}
