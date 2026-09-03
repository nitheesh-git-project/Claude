"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { describeInviteOffer, type InviteSettings } from "@/lib/inviteRewards";

async function saveSetting(key: string, value: boolean | number) {
  const res = await fetch("/api/admin/update-setting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not save. Please try again.");
}

/**
 * What an introduction is worth, and to whom.
 *
 * Read in its own query by the caller rather than through AdminSettings --
 * these are the newest columns on `site_settings`, and a database one apply
 * behind must lose this control rather than reset every other setting on the
 * page by failing the shared select.
 *
 * Off by default, and the wording states the two things an admin has to know
 * before switching it on: the reward lands when the friend **pays**, not
 * when they sign up, and an amount already promised is honoured even after
 * the feature is switched off again.
 */
export default function InviteRewardsForm({ settings }: { settings: InviteSettings }) {
  const router = useRouter();
  const [optimisticEnabled, setOptimisticEnabled] = useOptimistic(settings.enabled);
  const [isTogglePending, startToggle] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);

  const [reward, setReward] = useState(String(settings.rewardPaise / 100));
  const [welcome, setWelcome] = useState(String(settings.welcomePaise / 100));
  const [cap, setCap] = useState(String(settings.maxRewardsPerPatient));
  const [isSaving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleToggle() {
    const next = !optimisticEnabled;
    setToggleError(null);
    startToggle(async () => {
      setOptimisticEnabled(next);
      try {
        await saveSetting("invite_rewards_enabled", next);
        router.refresh();
      } catch (e) {
        setToggleError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  function handleSave() {
    const rewardPaise = Math.round(Number(reward) * 100);
    const welcomePaise = Math.round(Number(welcome) * 100);
    const maxRewards = Math.round(Number(cap));
    if (![rewardPaise, welcomePaise, maxRewards].every((n) => Number.isFinite(n) && n >= 0)) {
      setSaveError("Enter whole amounts of zero or more.");
      return;
    }
    setSaveError(null);
    setSaved(false);
    startSave(async () => {
      try {
        await saveSetting("invite_reward_paise", rewardPaise);
        await saveSetting("invite_welcome_paise", welcomePaise);
        await saveSetting("invite_max_rewards_per_patient", maxRewards);
        setSaved(true);
        router.refresh();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  // The sentence the patient will actually read on their own dashboard,
  // built from the draft figures. An offer configured without seeing its
  // wording is how "200" ends up meaning two rupees.
  const preview = describeInviteOffer({
    enabled: true,
    rewardPaise: Math.max(0, Math.round(Number(reward) * 100) || 0),
    welcomePaise: Math.max(0, Math.round(Number(welcome) * 100) || 0),
    maxRewardsPerPatient: 1,
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-sm text-slate-800">Patient invites</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            Each patient gets a code to share. Their friend gets something off their first
            session, and the patient gets something off their next one — once that friend has
            actually had and paid for a session, never on a signup.
          </p>
          <p className="text-xs text-slate-400 mt-2 max-w-md">
            An amount already promised is honoured even if you switch this off or change the
            figures later. The switch stops new invites being claimed; it does not take back one
            somebody has already earned.
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={isTogglePending}
          className={`text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-60 ${
            optimisticEnabled
              ? "bg-teal-700 hover:bg-teal-800 text-white"
              : "bg-slate-200 hover:bg-slate-300 text-slate-800"
          }`}
        >
          {optimisticEnabled ? "Running" : "Off"}
        </button>
      </div>
      {toggleError && <p className="text-[11px] text-red-600 mt-2">{toggleError}</p>}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="invite-welcome" className="block text-[11px] font-semibold text-slate-700">
              Their friend gets (₹)
            </label>
            <input
              id="invite-welcome"
              type="number"
              min={0}
              value={welcome}
              onChange={(e) => {
                setWelcome(e.target.value);
                setSaved(false);
              }}
              className="mt-1 w-28 rounded-lg border border-slate-300 p-2 text-xs"
            />
          </div>
          <div>
            <label htmlFor="invite-reward" className="block text-[11px] font-semibold text-slate-700">
              They get (₹)
            </label>
            <input
              id="invite-reward"
              type="number"
              min={0}
              value={reward}
              onChange={(e) => {
                setReward(e.target.value);
                setSaved(false);
              }}
              className="mt-1 w-28 rounded-lg border border-slate-300 p-2 text-xs"
            />
          </div>
          <div>
            <label htmlFor="invite-cap" className="block text-[11px] font-semibold text-slate-700">
              Most one patient may earn
            </label>
            <input
              id="invite-cap"
              type="number"
              min={0}
              value={cap}
              onChange={(e) => {
                setCap(e.target.value);
                setSaved(false);
              }}
              className="mt-1 w-28 rounded-lg border border-slate-300 p-2 text-xs"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
          {saved && <span className="text-[11px] font-semibold text-teal-700">Saved.</span>}
        </div>
        {preview && (
          <p className="mt-3 text-[11px] text-slate-600">
            A patient will read: &ldquo;{preview}&rdquo;
          </p>
        )}
        {saveError && <p className="mt-2 text-[11px] text-red-600">{saveError}</p>}
      </div>
    </div>
  );
}
