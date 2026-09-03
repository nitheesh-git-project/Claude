"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SurfaceCard from "@/components/dashboard/SurfaceCard";
import {
  describeInviteOffer,
  formatInviteCode,
  isWellFormedInviteCode,
  normalizeInviteCode,
  type InviteSettings,
} from "@/lib/inviteRewards";

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

/**
 * A patient's own invite code, and the box for entering somebody else's.
 *
 * Both halves are stated in full rather than teased, because the reward
 * depends on something the patient cannot see happening: their friend has to
 * actually have a session and pay for it. A card that said "invite friends,
 * get rewards" and then paid nothing for a signup would be a promise the
 * clinic did not keep.
 *
 * The entry field disappears once a code has been used, and never appears
 * for a patient who has already paid for a session -- you are new exactly
 * once, and offering a field that can only refuse is worse than not
 * offering it.
 */
export default function InviteCard({
  code,
  settings,
  invited,
  qualified,
  rewardWaitingPaise,
  claimedSomeoneElses,
  canClaim,
}: {
  code: string;
  settings: InviteSettings;
  invited: number;
  qualified: number;
  rewardWaitingPaise: number;
  claimedSomeoneElses: boolean;
  /** False once this patient has paid for a session. */
  canClaim: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [entry, setEntry] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  // Synchronous, because a `disabled` attribute lands a render too late to
  // stop a double tap -- the same guard the suggestion controls use.
  const inFlight = useRef(false);

  const offer = describeInviteOffer(settings);

  async function claim() {
    if (inFlight.current) return;
    const normalized = normalizeInviteCode(entry);
    if (!isWellFormedInviteCode(normalized)) {
      setMessage("That invite code isn't recognised.");
      return;
    }
    inFlight.current = true;
    setClaiming(true);
    setMessage(null);
    try {
      const res = await fetch("/api/patient/invite/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalized }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "That code couldn't be applied.");
        return;
      }
      if (!data.claimed) {
        setMessage(data.message ?? "That code couldn't be applied.");
        return;
      }
      setMessage(
        data.welcomePaise > 0
          ? `Done — ${formatInr(data.welcomePaise)} comes off your first session.`
          : "Done."
      );
      setEntry("");
      router.refresh();
    } catch {
      setMessage("Could not reach the server. Please try again.");
    } finally {
      inFlight.current = false;
      setClaiming(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <SurfaceCard
      title="Invite a friend"
      icon="fa-user-plus"
      subtitle={offer ?? "Share your code with someone who could use a physiotherapist."}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 font-mono text-base font-bold tracking-wider text-slate-900">
          {formatInviteCode(code)}
        </span>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
        >
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>

      {invited > 0 && (
        <p className="mt-3 text-xs text-slate-600">
          {invited} {invited === 1 ? "person has" : "people have"} used your code
          {qualified > 0 ? `, and ${qualified} of them ${qualified === 1 ? "has" : "have"} had a session` : ""}.
          {rewardWaitingPaise > 0 && (
            <span className="font-semibold text-teal-800">
              {" "}
              {formatInr(rewardWaitingPaise)} comes off your next session.
            </span>
          )}
        </p>
      )}

      {canClaim && !claimedSomeoneElses && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <label htmlFor="invite-entry" className="block text-[11px] font-semibold text-slate-700">
            Got a code from a friend?
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="invite-entry"
              value={entry}
              onChange={(e) => {
                setEntry(e.target.value);
                setMessage(null);
              }}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="ABCD-2345"
              className="flex-1 rounded-xl border border-slate-300 p-2.5 text-xs uppercase"
            />
            <button
              type="button"
              onClick={claim}
              disabled={claiming}
              className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {claiming ? "Checking…" : "Use it"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            A code can only be used before your first session.
          </p>
        </div>
      )}

      {message && <p className="mt-3 text-xs font-semibold text-slate-700">{message}</p>}
    </SurfaceCard>
  );
}
