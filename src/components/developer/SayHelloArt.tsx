// A waving hand in line art, with a few strokes to show the wave. Decorative:
// the heading beside it says everything this says, so it is hidden from
// assistive tech rather than described.
//
// Drawn in the site's own teal and slate rather than imported, so it follows
// the palette and adds no request. `currentColor` is the slate; the teal is
// spelled out so a restyle of the surrounding text cannot recolour the wave.
export default function SayHelloArt({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 240"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* A soft disc behind the hand, so the line art has something to sit on. */}
      <circle cx="120" cy="124" r="92" className="fill-teal-50" stroke="none" />

      {/* The hand: four fingers, thumb, palm. */}
      <g className="stroke-slate-700" style={{ transformOrigin: "140px 200px", transform: "rotate(-8deg)" }}>
        <path d="M104 118V62a11 11 0 0 1 22 0v50" className="fill-white" />
        <path d="M126 112V48a11 11 0 0 1 22 0v64" className="fill-white" />
        <path d="M148 112V58a11 11 0 0 1 22 0v60" className="fill-white" />
        <path d="M170 118V82a10 10 0 0 1 20 0v66" className="fill-white" />
        <path d="M104 150 82 120a10 10 0 0 1 17-11l5 8" className="fill-white" />
        <path d="M104 118v42c0 28 22 48 48 48s38-20 38-48" className="fill-white" />
        {/* A crease or two, so it reads as a palm rather than a mitten. */}
        <path d="M126 150c8 6 18 6 26 0" strokeWidth="3" />
      </g>

      {/* The wave: strokes either side of the hand, in the accent colour. */}
      <g className="stroke-teal-600">
        <path d="M198 54c13 8 19 20 18 34" />
        <path d="M208 36c20 12 30 32 28 56" />
        <path d="M44 92c-10 10-12 24-6 38" />
        <path d="M30 80c-16 16-18 38-8 60" />
      </g>
    </svg>
  );
}
