"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";

/**
 * Settings -> Public Site -> "Appearance": whether the app follows the
 * device's light/dark setting.
 *
 * One switch, saved through /api/admin/update-setting like every other
 * setting on this screen (`follow_device_theme`). Off -- the default -- is
 * the app exactly as it has always looked. On, every page (public site,
 * booking, all four dashboards) is dark on a device set to dark and light on
 * one set to light, and follows the device if it changes while open.
 * Printing, receipts, exports and emails stay light either way.
 *
 * The two tiles under the switch are a picture of the choice rather than a
 * live preview: they are drawn in literal colours so they read the same in
 * whichever mode the admin is looking at them in.
 */
export default function AppearanceForm({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const next = !on;
    setSaved(false);
    setError(null);
    // Optimistic, then put back if the write fails -- the same rule as every
    // switch on this screen.
    setOn(next);
    startTransition(async () => {
      const res = await fetch("/api/admin/update-setting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "follow_device_theme", value: next }),
      }).catch(() => null);
      if (!res?.ok) {
        const data = res ? await res.json().catch(() => ({})) : {};
        setOn(!next);
        setError(data.error ?? "Could not save. Please try again.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h2 className="font-bold text-lg text-slate-800 mb-1">Appearance</h2>
          <p className="text-xs text-slate-500">
            Let the app follow each visitor&apos;s device. When this is on, anyone whose phone or
            computer is set to dark mode sees the whole app in dark - the website, booking and every
            dashboard - and it switches back by itself when their device does. When it is off, everyone
            sees the light design, as now. Printed pages, receipts, exports and emails always stay light.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Follow the device's light/dark setting"
          disabled={isPending}
          onClick={handleToggle}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-60 ${
            on ? "bg-teal-700" : "bg-slate-300"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full shadow transition ${on ? "translate-x-6" : "translate-x-1"}`}
            style={{ backgroundColor: "#ffffff" }}
          />
        </button>
      </div>

      <div className="mt-5 grid max-w-xl grid-cols-2 gap-3" aria-hidden="true">
        <ThemeTile label="Device set to light" dark={false} active />
        <ThemeTile label="Device set to dark" dark={on} active={on} />
      </div>

      <p className="mt-4 text-xs font-semibold text-slate-700" role="status">
        {error ? (
          <span className="text-red-700">{error}</span>
        ) : on ? (
          "Following the device: dark for dark devices, light for light ones."
        ) : (
          "Off - the app is light on every device."
        )}
        {saved && !error && <span className="ml-2 font-normal text-teal-700">Saved.</span>}
      </p>
    </div>
  );
}

/** A small picture of a page: header bar, a card, a teal button. */
function ThemeTile({ label, dark, active }: { label: string; dark: boolean; active: boolean }) {
  const c = dark
    ? { page: "#0b1220", card: "#111a2e", line: "#26334c", text: "#e2e8f0", sub: "#64748b" }
    : { page: "#f8fafc", card: "#ffffff", line: "#e2e8f0", text: "#1e293b", sub: "#cbd5e1" };
  return (
    <div>
      <div
        className="overflow-hidden rounded-xl p-3"
        style={{ backgroundColor: c.page, boxShadow: `inset 0 0 0 1px ${c.line}`, opacity: active ? 1 : 0.55 }}
      >
        <div className="mb-2 h-2 w-16 rounded-full" style={{ backgroundColor: c.text }} />
        <div className="rounded-lg p-2.5" style={{ backgroundColor: c.card, boxShadow: `inset 0 0 0 1px ${c.line}` }}>
          <div className="h-1.5 w-20 rounded-full" style={{ backgroundColor: c.text }} />
          <div className="mt-1.5 h-1.5 w-14 rounded-full" style={{ backgroundColor: c.sub }} />
          <div className="mt-3 h-4 w-12 rounded-md" style={{ backgroundColor: "#0f766e" }} />
        </div>
      </div>
      <p className="mt-1.5 text-[11px] font-semibold text-slate-600">
        {label}
        <span className="font-normal text-slate-500"> - {dark ? "dark" : "light"}</span>
      </p>
    </div>
  );
}
