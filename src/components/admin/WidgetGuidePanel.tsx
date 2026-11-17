"use client";

import type { GuidePreview, WidgetGuide } from "@/lib/profileWidgetGuide";

/**
 * Settings -> Health Profile layout: one option explained -- what it is, why
 * it helps, how its data gets in -- above a small preview with sample data
 * drawn the way the patient's page draws it. Labelled as a sample.
 */
export default function WidgetGuidePanel({ guide }: { guide: WidgetGuide }) {
  return (
    <div className="mt-2 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-[1fr_minmax(0,16rem)]" data-testid="widget-guide">
      <dl className="space-y-1.5">
        <div>
          <dt className="font-semibold text-slate-800">What it is</dt>
          <dd className="text-slate-600">{guide.what}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-800">Why it helps</dt>
          <dd className="text-slate-600">{guide.why}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-800">How it gets filled in</dt>
          <dd className="text-slate-600">{guide.how}</dd>
        </div>
      </dl>
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">What the patient sees · sample</p>
        <div className="rounded-lg border border-slate-200 bg-white p-3" aria-label="Sample preview">
          <Preview p={guide.preview} />
        </div>
      </div>
    </div>
  );
}

function Preview({ p }: { p: GuidePreview }) {
  switch (p.kind) {
    case "tiles":
      return (
        <div className="grid grid-cols-2 gap-1.5">
          {p.items.map((t) => (
            <div key={t.label} className="rounded-md bg-teal-50 px-2 py-1.5">
              <p className="text-[10px] text-slate-500">{t.label}</p>
              <p className="text-sm font-bold text-slate-900">{t.value}</p>
            </div>
          ))}
        </div>
      );
    case "list":
      return (
        <ul className="space-y-1 text-[11px] text-slate-700">
          {p.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      );
    case "bars":
      return (
        <div className="space-y-1.5">
          {p.items.map((b) => (
            <div key={b.label}>
              <p className="flex justify-between text-[11px] text-slate-700">
                <span>{b.label}</span>
                {b.note && <span className="font-semibold">{b.note}</span>}
              </p>
              <div className="mt-0.5 h-1.5 rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-teal-600" style={{ width: `${Math.max(4, Math.min(100, b.value))}%` }} />
              </div>
            </div>
          ))}
        </div>
      );
    case "pill": {
      const tone = { green: "bg-teal-50 text-teal-800", amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-800" }[p.tone];
      return (
        <div>
          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{p.label}</span>
          <p className="mt-1 text-[11px] text-slate-600">{p.note}</p>
        </div>
      );
    }
    case "text":
      return <p className="text-[11px] text-slate-700">{p.text}</p>;
    case "line": {
      const w = 220;
      const h = 70;
      const span = p.max - p.min || 1;
      const xy = p.points.map((v, i) => [8 + (i * (w - 16)) / Math.max(1, p.points.length - 1), h - 8 - ((v - p.min) / span) * (h - 16)]);
      const last = p.points[p.points.length - 1];
      return (
        <div>
          <p className="text-[11px] text-slate-700">
            {p.label}: <span className="font-bold">{last}{p.unit}</span>{" "}
            <span className="text-teal-700">{p.better === "up" ? "↑ going up" : "↓ coming down"}</span>
          </p>
          <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-16 w-full" role="img" aria-label={`Sample ${p.label} line`}>
            <polyline points={xy.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="var(--chart-brand, #0f766e)" strokeWidth="2" />
            {xy.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="3" fill="var(--chart-brand, #0f766e)" />
            ))}
          </svg>
        </div>
      );
    }
  }
}
