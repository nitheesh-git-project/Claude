"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useConfirm } from "@/lib/useConfirm";
import { useRouter } from "@/lib/useRouter";
import { useSaveSetting } from "@/lib/useSaveSetting";
import { PUBLIC_SECTION_TOGGLES, type PublicSectionKey } from "@/lib/publicSectionVisibility";

/**
 * Show or hide one public section (What We Promise, What We Will Not Do,
 * Testimonials) without deleting what is in it. Asks in both directions --
 * a stray tap here changes the public site for every visitor -- and only
 * flips once the answer is yes. The dialog is awaited before the transition
 * starts, never inside it (see DevReachoutsTab's switch for why).
 */
export default function PublicSectionVisibilityToggle({
  section,
  visible,
}: {
  section: PublicSectionKey;
  visible: boolean;
}) {
  const toggle = PUBLIC_SECTION_TOGGLES.find((t) => t.key === section)!;
  const saveSetting = useSaveSetting();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [optimistic, setOptimistic] = useOptimistic(visible);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    const next = !optimistic;
    const ok = await confirm(
      next
        ? `Show ${toggle.label} again? It comes back on ${toggle.where} for every visitor.`
        : `Hide ${toggle.label}? It disappears from ${toggle.where}. Nothing is deleted - what you have written stays here, and you can show it again any time.`,
      next
        ? { confirmLabel: "Show it", cancelLabel: "Keep it hidden" }
        : { confirmLabel: "Hide it", cancelLabel: "Keep it shown" }
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      try {
        await saveSetting(toggle.column, next);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
      data-testid={`section-visibility-${section}`}
    >
      <div className="min-w-0 text-xs">
        <p className="font-semibold text-slate-800">Show {toggle.label} on the website</p>
        <p className="mt-0.5 text-slate-500">
          {optimistic ? "Shown on " : "Hidden from "}
          {toggle.where}.
        </p>
        {error && <p className="mt-1 text-red-600">{error}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={optimistic}
        aria-label={`Show ${toggle.label} on the website`}
        onClick={() => void handleToggle()}
        disabled={isPending}
        className={`rounded-lg px-4 py-2 text-xs font-semibold transition disabled:opacity-60 ${
          optimistic ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-800 hover:bg-slate-300"
        }`}
      >
        {isPending ? "Saving…" : optimistic ? "Shown" : "Hidden"}
      </button>
      {dialog}
    </div>
  );
}
