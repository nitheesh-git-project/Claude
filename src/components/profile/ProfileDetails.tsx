import type { ReactNode } from "react";

/**
 * One closed block on the patient's Health Profile (B2): the measures, the
 * examination, the diary, the answers, reports and past recommendations sit
 * below the status, the exercises and the one graph, each a <details> the
 * patient opens when they want it. The summary is the 48px tap target with
 * an 18px title; it opens with the keyboard as a native control does. Print
 * opens every block first (HealthProfileActions), so a printed page is whole.
 */
export default function ProfileDetails({ title, testId, children }: { title: string; testId?: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid={testId}>
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-3 text-lg font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 [overflow-wrap:anywhere]">{title}</span>
        <i aria-hidden className="fa-solid fa-chevron-down shrink-0 text-sm text-slate-600 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t border-slate-100 p-3 sm:p-5">{children}</div>
    </details>
  );
}
