import type { AffectedParts } from "@/lib/neuroProfile";

/**
 * A plain front-facing figure with the affected limbs shaded, drawn from the
 * intake's "Which part of the body is affected?". Seen as a person facing you,
 * so the patient's left is on the viewer's right and the figure is labelled R
 * and L to say so. Colour is never the only signal: the shaded parts are also
 * named in words under the figure, and the whole is one labelled image.
 * Drawn only when the answer names a side or a set of limbs (affectedParts):
 * "not sure" is not drawn as "nothing affected".
 */
export default function AffectedSideFigure({
  parts,
  label,
  voice,
}: {
  parts: AffectedParts;
  /** The intake answer as given ("Left side"). */
  label: string;
  voice: "patient" | "clinician";
}) {
  const hit = "var(--chart-brand-soft)";
  const rest = "var(--chart-grid)";
  const edge = "var(--chart-axis)";
  const fill = (on: boolean) => (on ? hit : rest);
  const named: string[] = [];
  if (parts.leftArm) named.push("left arm");
  if (parts.rightArm) named.push("right arm");
  if (parts.leftLeg) named.push("left leg");
  if (parts.rightLeg) named.push("right leg");
  if (parts.trunk) named.push("trunk");
  const words = named.length > 0 ? named.join(", ") : "none named";

  return (
    <figure className="m-0 flex flex-col items-center" data-testid="affected-side">
      <svg viewBox="0 0 120 214" className="h-36 w-auto" role="img" aria-label={`Figure with the affected parts shaded: ${words}. Seen from the front, so the left is on the right.`}>
        <circle cx="60" cy="18" r="15" fill={rest} stroke={edge} strokeWidth="1.5" />
        <rect x="54" y="32" width="12" height="10" fill={rest} stroke={edge} strokeWidth="1.5" />
        <rect x="34" y="42" width="52" height="68" rx="14" fill={fill(parts.trunk)} stroke={edge} strokeWidth="1.5" />
        {/* the patient's right arm and leg are on the viewer's left */}
        <rect x="14" y="44" width="16" height="66" rx="8" fill={fill(parts.rightArm)} stroke={edge} strokeWidth="1.5" />
        <rect x="90" y="44" width="16" height="66" rx="8" fill={fill(parts.leftArm)} stroke={edge} strokeWidth="1.5" />
        <rect x="35" y="114" width="23" height="92" rx="11" fill={fill(parts.rightLeg)} stroke={edge} strokeWidth="1.5" />
        <rect x="62" y="114" width="23" height="92" rx="11" fill={fill(parts.leftLeg)} stroke={edge} strokeWidth="1.5" />
        <text x="6" y="210" fontSize="11" fontWeight="700" fill="var(--chart-ink)">R</text>
        <text x="108" y="210" fontSize="11" fontWeight="700" fill="var(--chart-ink)">L</text>
      </svg>
      <figcaption className="mt-1.5 max-w-[14rem] text-center text-xs text-slate-700">
        <span className="font-semibold text-slate-900">{label}</span>
        <span className="block">
          {voice === "patient" ? "The shaded parts are the ones affected: " : "Shaded: "}
          {words}.
        </span>
      </figcaption>
    </figure>
  );
}
