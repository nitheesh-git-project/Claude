import type { ChartMarker } from "@/lib/pedsChartGeometry";

const INK = "var(--chart-ink)";
const BRAND = "var(--chart-brand)";

/**
 * One marker of the milestone chart, drawn the same in the chart and in the
 * legend. The encodings never rely on colour alone: a dot is a skill that
 * has come (solid: seen by the physiotherapist, hollow: told by parents,
 * dashed ring: the date is approximate); a diamond is a skill that has not,
 * placed at the child's age today (half-filled: starting to come, hollow:
 * not yet).
 */
export default function MilestoneMarker({
  marker,
  size = 16,
}: {
  marker: Pick<ChartMarker, "shape" | "fill" | "dashed">;
  size?: number;
}) {
  if (marker.shape === "dot") {
    return (
      <span
        aria-hidden
        className="inline-block shrink-0 rounded-full bg-white"
        style={{
          width: size,
          height: size,
          boxSizing: "border-box",
          border: `3px ${marker.dashed ? "dashed" : "solid"} ${BRAND}`,
          background: marker.fill === "solid" ? BRAND : undefined,
        }}
      />
    );
  }
  const d = Math.round(size * 0.8);
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 bg-white"
      style={{
        width: d,
        height: d,
        boxSizing: "border-box",
        transform: "rotate(45deg)",
        border: `2px solid ${INK}`,
        background:
          marker.fill === "half"
            ? `linear-gradient(135deg, ${INK} 50%, transparent 50%)`
            : undefined,
      }}
    />
  );
}
