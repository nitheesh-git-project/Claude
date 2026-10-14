import type { ProgrammePick } from "@/lib/sessionAssignQueue";

/**
 * The "Tap to assign" chip on an unassigned session's row (All Sessions and
 * the calendar's day panel). The row already opens the drawer where the
 * assignment is made; this says so. A programme session names its
 * pre-picked therapist -- "Tap to assign · Dr Ananya" -- so the admin can see
 * from the list that it is one tap, and says when that therapist is no
 * longer free at the time, which is the row worth opening first.
 */
export default function TapToAssignChip({ pick }: { pick?: ProgrammePick | null }) {
  if (pick && pick.blocks.length > 0) {
    return (
      <span
        className="ml-1.5 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700"
        title={pick.blocks.join(" ")}
      >
        Tap to assign · {pick.therapistName} not free
      </span>
    );
  }
  return (
    <span className="ml-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
      {pick ? `Tap to assign · ${pick.therapistName}` : "Tap to assign"}
    </span>
  );
}
