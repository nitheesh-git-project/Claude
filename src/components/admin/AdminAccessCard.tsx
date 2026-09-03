import SurfaceCard from "@/components/dashboard/SurfaceCard";
import type { AdminAccessNote } from "@/lib/adminHome";

/**
 * What this admin's access covers, on their own Today screen.
 *
 * A scoped admin's sidebar is simply shorter than a colleague's, with
 * nothing anywhere saying why -- and a missing section reads as a fault
 * long before it reads as a policy. This is the same reasoning as the
 * "a control an admin's scope cannot call must not render, or they get a
 * 403 with nothing to explain it" rule, one step earlier: the sections are
 * already hidden correctly, and this names the reason they are.
 *
 * It is deliberately a statement, not a request form. There is no "ask for
 * more access" button, because scope is changed by a `full` admin on
 * Settings -> Team & Access after a conversation, and a button that raises
 * an unanswerable request is worse than a sentence naming who to ask.
 *
 * Rendered only for a limited scope -- `full` gets no card, since
 * buildAdminHome returns no note for it and there is nothing to account
 * for.
 */
export default function AdminAccessCard({ note }: { note: AdminAccessNote }) {
  return (
    <SurfaceCard
      title="Your access"
      icon="fa-id-badge"
      subtitle={note.blurb}
    >
      <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
        <i aria-hidden className="fa-solid fa-shield-halved text-[9px]" />
        {note.scopeLabel}
      </p>

      <dl className="space-y-2 text-[11px]">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 font-semibold uppercase tracking-wide text-slate-400">
            You open
          </dt>
          <dd className="text-slate-700">{note.sections.join(" · ")}</dd>
        </div>
        {note.withheld.length > 0 && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 font-semibold uppercase tracking-wide text-slate-400">
              You don&apos;t
            </dt>
            <dd className="text-slate-500">{note.withheld.join(" · ")}</dd>
          </div>
        )}
      </dl>

      <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">
        A full-access admin can change this on Settings → Team &amp; Access.
      </p>
    </SurfaceCard>
  );
}
