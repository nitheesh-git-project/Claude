"use client";

import { useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/lib/useConfirm";

export default function PhoneLoginSwitch({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const { show } = useToast();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !enabled;
    if (next) {
      const ok = await confirm(
        "Switch on phone sign-in? Only do this once an SMS provider is set up on the Supabase project, or people will ask for codes that never arrive. Each code is a text the clinic pays for.",
        { confirmLabel: "Switch on", cancelLabel: "Not yet" }
      );
      if (!ok) return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/phone-login/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(res.status === 403 ? "Your access does not include this change." : (data?.error ?? "That didn't save. Please try again."));
        return;
      }
      show(next ? "Phone sign-in switched on." : "Phone sign-in switched off.");
      router.refresh();
    } catch {
      setError("That didn't save - check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {dialog}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Offer sign-in with a phone code</p>
          <p className="text-xs text-slate-600">{enabled ? "On. The sign-in pages and profiles offer it." : "Off. Nobody is offered it; email and password as usual."}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Offer sign-in with a phone code"
          disabled={busy}
          onClick={() => void toggle()}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-60"
        >
          <span className={`relative inline-block h-6 w-11 rounded-full transition ${enabled ? "bg-teal-700" : "bg-slate-300"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${enabled ? "left-[22px]" : "left-0.5"}`} />
          </span>
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
