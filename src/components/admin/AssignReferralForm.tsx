"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function minDateTimeLocal() {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function AssignReferralForm({
  referralId,
  therapists,
}: {
  referralId: string;
  therapists: { id: string; full_name: string }[];
}) {
  const [therapistId, setTherapistId] = useState(therapists[0]?.id ?? "");
  const [slotDateTime, setSlotDateTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const router = useRouter();

  async function handleAssign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!therapistId || !slotDateTime) return;
    if (new Date(slotDateTime).getTime() <= Date.now()) {
      setError("Please pick a slot time in the future.");
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
        slotDateTime: new Date(slotDateTime).toISOString(),
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
    <form onSubmit={handleAssign} className="flex items-center gap-2 flex-wrap">
      <select
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
      <input
        type="datetime-local"
        value={slotDateTime}
        min={minDateTimeLocal()}
        onChange={(e) => setSlotDateTime(e.target.value)}
        required
        className="text-xs p-2 rounded-lg border border-slate-300"
      />
      <button
        type="submit"
        disabled={loading}
        className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
      >
        {loading ? "Assigning..." : "Assign & Create Registration Link"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </form>
  );
}
