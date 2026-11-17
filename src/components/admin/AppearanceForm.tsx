"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import type { ThemeMode } from "@/lib/deviceTheme";

/**
 * Settings -> Public Site -> "Appearance": light, dark, or each visitor's
 * own device (site_settings.site_theme; see src/lib/deviceTheme.ts).
 *
 * Three cards, each a small picture of a page in that mode above its name:
 * Light and Dark are one page each; Device is the same page split down the
 * middle, light and dark, with a phone and a laptop to say whose setting
 * decides. Drawn in literal colours so each reads the same in whichever
 * mode the admin is looking at them in. Picking one saves it at once and
 * applies to every page -- public site, booking and all four dashboards.
 * Printing, receipts, exports and emails stay light either way.
 */
const OPTIONS: { mode: ThemeMode; title: string; line: string }[] = [
  { mode: "light", title: "Light", line: "Always the light design, on every device." },
  { mode: "dark", title: "Dark", line: "Always the dark design, on every device." },
  {
    mode: "device",
    title: "Based on the visitor's device",
    line: "Dark on a phone or computer set to dark, light on one set to light - and it switches when theirs does.",
  },
];

export default function AppearanceForm({ mode }: { mode: ThemeMode }) {
  const router = useRouter();
  const [current, setCurrent] = useState<ThemeMode>(mode);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function choose(next: ThemeMode) {
    if (next === current || isPending) return;
    const previous = current;
    setSaved(false);
    setError(null);
    // Optimistic, then put back if the write fails -- the same rule as every
    // switch on this screen.
    setCurrent(next);
    startTransition(async () => {
      const res = await fetch("/api/admin/update-setting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "site_theme", value: next }),
      }).catch(() => null);
      if (!res?.ok) {
        const data = res ? await res.json().catch(() => ({})) : {};
        setCurrent(previous);
        setError(data.error ?? "Could not save. Please try again.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6" data-testid="appearance">
      <h2 className="font-bold text-lg text-slate-800 mb-1">Appearance</h2>
      <p className="max-w-2xl text-xs text-slate-500">
        How the whole app looks to every visitor - the website, booking and every dashboard. Printed pages,
        receipts, exports and emails always stay light.
      </p>

      <div role="radiogroup" aria-label="Appearance" className="mt-5 grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((o) => {
          const on = current === o.mode;
          return (
            <button
              key={o.mode}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={isPending}
              onClick={() => choose(o.mode)}
              className={`rounded-2xl border p-3 text-left transition disabled:cursor-wait ${
                on ? "border-teal-700 ring-2 ring-teal-700/30" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <Preview mode={o.mode} />
              <span className="mt-3 flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    on ? "border-teal-700" : "border-slate-300"
                  }`}
                >
                  {on && <span className="h-2 w-2 rounded-full bg-teal-700" />}
                </span>
                <span className="text-sm font-semibold text-slate-800">{o.title}</span>
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">{o.line}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-xs font-semibold text-slate-700" role="status">
        {error ? <span className="text-red-700">{error}</span> : OPTIONS.find((o) => o.mode === current)?.line}
        {saved && !error && <span className="ml-2 font-normal text-teal-700">Saved.</span>}
      </p>
    </div>
  );
}

const LIGHT = { page: "#f8fafc", card: "#ffffff", line: "#e2e8f0", text: "#1e293b", sub: "#94a3b8", nav: "#ffffff" };
const DARK = { page: "#0b1220", card: "#111a2e", line: "#26334c", text: "#e2e8f0", sub: "#64748b", nav: "#0f172a" };

/** A small page: top bar with a dot and two links, a heading, a card with
 *  two lines and the teal button. Device draws it twice, clipped to halves. */
function Preview({ mode }: { mode: ThemeMode }) {
  if (mode !== "device") return <MiniPage c={mode === "dark" ? DARK : LIGHT} />;
  return (
    <div className="relative" aria-hidden="true">
      <MiniPage c={LIGHT} />
      <div className="absolute inset-0" style={{ clipPath: "polygon(55% 0, 100% 0, 100% 100%, 45% 100%)" }}>
        <MiniPage c={DARK} />
      </div>
      <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-slate-700 shadow-sm">
        <i className="fa-solid fa-mobile-screen" aria-hidden="true" />
        <i className="fa-solid fa-laptop" aria-hidden="true" />
        decides
      </span>
    </div>
  );
}

function MiniPage({ c }: { c: typeof LIGHT }) {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-xl"
      style={{ backgroundColor: c.page, boxShadow: `inset 0 0 0 1px ${c.line}` }}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5" style={{ backgroundColor: c.nav, borderBottom: `1px solid ${c.line}` }}>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#0f766e" }} />
        <span className="h-1 w-8 rounded-full" style={{ backgroundColor: c.text }} />
        <span className="ml-auto h-1 w-4 rounded-full" style={{ backgroundColor: c.sub }} />
        <span className="h-1 w-4 rounded-full" style={{ backgroundColor: c.sub }} />
      </div>
      <div className="p-2.5">
        <div className="h-1.5 w-16 rounded-full" style={{ backgroundColor: c.text }} />
        <div className="mt-2 rounded-lg p-2" style={{ backgroundColor: c.card, boxShadow: `inset 0 0 0 1px ${c.line}` }}>
          <div className="h-1 w-20 rounded-full" style={{ backgroundColor: c.text }} />
          <div className="mt-1 h-1 w-14 rounded-full" style={{ backgroundColor: c.sub }} />
          <div className="mt-2 h-3 w-10 rounded-md" style={{ backgroundColor: "#0f766e" }} />
        </div>
      </div>
    </div>
  );
}
