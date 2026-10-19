"use client";

import Modal from "@/components/Modal";
import { consentTerms } from "@/lib/consentTerms";

/**
 * The terms the Step 2 consent checkbox asks a patient to agree to, readable
 * before they tick it. The wording lives in src/lib/consentTerms.ts (draft,
 * owner/legal to review); this only lays it out, in the shared Modal so the
 * dialog contract (focus in and back, Escape, Tab trap, scroll lock) is the
 * one every other dialog has.
 */
export default function ConsentTermsDialog({
  open,
  onClose,
  serviceTitle,
}: {
  open: boolean;
  onClose: () => void;
  serviceTitle: string | null;
}) {
  const terms = consentTerms(serviceTitle);
  return (
    <Modal open={open} onClose={onClose} labelledBy="consent-terms-title" closeLabel="Close the consent terms">
      <div className="px-6 py-6 sm:px-8">
        <h2 id="consent-terms-title" className="pr-10 font-display text-lg font-bold text-slate-900">
          {terms.title}
        </h2>
        <p className="mt-1.5 text-sm text-slate-600">{terms.intro}</p>
        <div className="mt-5 space-y-4">
          {terms.sections.map((s) => (
            <section key={s.heading}>
              <h3 className="text-sm font-semibold text-slate-900">{s.heading}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.body}</p>
            </section>
          ))}
        </div>
        <div className="mt-6 border-t border-slate-100 pt-4 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
