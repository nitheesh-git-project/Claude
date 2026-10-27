/**
 * The one sentence a desk that can read a page but not change it is shown,
 * instead of buttons its routes would answer with a 403.
 *
 * Finance holds People at `view` (adminScope.ts): it reads a patient's or a
 * therapist's page to reconcile a payout, and every control that changes the
 * person is `requireAdminScope("people")`. Rendering those controls anyway was
 * the "403 with nothing to explain it" case, so the page mirrors the gate and
 * says why the buttons are absent. Presentation only -- the routes are the rule.
 */
export const READ_ONLY_DESK_SENTENCE =
  "Your desk can read this page. Operations or Clinical make changes.";

export default function ReadOnlyDeskNote({ className = "" }: { className?: string }) {
  return (
    <p
      className={`rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 ${className}`}
      data-testid="read-only-desk-note"
    >
      <i aria-hidden="true" className="fa-solid fa-eye mr-1.5 text-[10px] text-slate-500" />
      {READ_ONLY_DESK_SENTENCE}
    </p>
  );
}
