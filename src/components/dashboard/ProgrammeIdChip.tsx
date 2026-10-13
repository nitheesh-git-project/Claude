import { programmeProgress, type ProgrammeTag } from "@/lib/programmeId";

/**
 * A programme's ID with its progress: PED_PKG001-2/6, and a bar.
 *
 * One component for every surface that names a programme -- the admin's
 * All Programmes list and session rows, the patient's Your Programmes and
 * session cards, the therapist's sessions -- so the ID reads the same way
 * wherever somebody quotes it from. The "-2/6" is completed sessions over
 * sessions bought, and the label a screen reader hears says so in words.
 */
export default function ProgrammeIdChip({
  tag,
  size = "sm",
  showBar = true,
  className = "",
}: {
  tag: Pick<ProgrammeTag, "code" | "done" | "total">;
  size?: "xs" | "sm" | "md";
  showBar?: boolean;
  className?: string;
}) {
  const p = programmeProgress(tag.done, tag.total);
  const text = size === "md" ? "text-xs" : size === "sm" ? "text-[11px]" : "text-[10px]";
  return (
    <span
      title={`Programme ${tag.code} - ${p.done} of ${p.total} sessions done`}
      aria-label={`Programme ${tag.code}, ${p.done} of ${p.total} sessions done`}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md bg-indigo-50 px-1.5 py-0.5 font-mono font-bold text-indigo-800 ring-1 ring-indigo-200 [overflow-wrap:anywhere] ${text} ${className}`}
    >
      <i aria-hidden="true" className="fa-solid fa-layer-group text-[0.85em] text-indigo-500" />
      <span aria-hidden="true">
        {tag.code}
        <span className="text-indigo-600">
          -{p.done}/{p.total}
        </span>
      </span>
      {showBar && p.total > 0 && (
        <span aria-hidden="true" className="relative h-1 w-8 shrink-0 overflow-hidden rounded-full bg-indigo-100">
          <span className="absolute inset-y-0 left-0 rounded-full bg-indigo-600" style={{ width: `${p.percent}%` }} />
        </span>
      )}
    </span>
  );
}
