"use client";

import { useEffect, useState } from "react";
import { companionShortLink, shareScreenScript } from "@/lib/companionScreen";
import { useToast } from "@/lib/toast";

/**
 * Step 0 of the guided assessment, on the Start panel (E12): get the
 * patient's screen open before anything else - the short link, the words to
 * read aloud, a copy button. Whether it actually opened is shown in the
 * cockpit once the run starts ("Open on <name>'s side"), from the screen's
 * own heartbeat, never assumed.
 */
export default function ShareScreenStep({ firstName }: { firstName: string }) {
  const { show } = useToast();
  // The origin is the browser's: read after mount, never during render.
  const [link, setLink] = useState<{ display: string; href: string } | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the page's own origin, read once in the browser
    setLink(companionShortLink(window.location.origin));
  }, []);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.href);
      show("Link to the patient screen copied");
    } catch {
      show(link.href);
    }
  }

  return (
    <section aria-labelledby="share-heading" data-testid="share-screen-step" className="space-y-2 rounded-xl border border-slate-200 p-3.5">
      <p className="text-[13px] font-bold uppercase tracking-wider text-teal-800">Step 0</p>
      <h2 id="share-heading" className="font-display text-lg font-bold text-slate-900">
        Share the patient screen
      </h2>
      <div className="rounded-xl bg-teal-50 px-3.5 py-2.5">
        <p className="text-xs font-bold uppercase tracking-wider text-teal-800">Say to {firstName}</p>
        <p data-testid="share-script" className="mt-1 text-base font-medium leading-relaxed text-slate-900">
          {shareScreenScript(link?.display ?? "the link I send you")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-900 [overflow-wrap:anywhere]">{link?.display ?? "…"}</span>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!link}
          className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-60"
        >
          Copy the link
        </button>
      </div>
      <p className="text-[13px] text-slate-700">Once you start, the cockpit says whether it is open on {firstName}{"'"}s side.</p>
    </section>
  );
}
