import {
  specialtyChipClass,
  specialtyIcon,
  specialtyLabel,
} from "@/lib/therapistSpecialties";

// One chip for "what this therapist is a specialist in", wherever a
// therapist is shown -- /team, the admin directory, the roster, the
// assignment picker's own line. Colour and icon come from the module rather
// than from the call site, so the same specialty cannot be teal on one
// screen and grey on the next.
//
// It renders **nothing** when nobody has said. A therapist with no
// specialisation recorded is not "Unknown"; a chip on every such profile
// saying so is a label on an absence, and there are enough of those on a
// directory of forty people to bury the ones that carry a fact.
export default function SpecialtyChip({
  specialization,
  size = "sm",
  className = "",
}: {
  specialization: string | null | undefined;
  size?: "xs" | "sm";
  className?: string;
}) {
  const label = specialtyLabel(specialization);
  if (!label) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-semibold ${
        size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[11px]"
      } ${specialtyChipClass(specialization)} ${className}`}
    >
      <i className={`fa-solid ${specialtyIcon(specialization)}`} aria-hidden="true"></i>
      {label}
    </span>
  );
}
