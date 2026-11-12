import { encodeQr, qrSvgPath } from "@/lib/qrCode";

/**
 * A QR code for a link, drawn as one SVG path from src/lib/qrCode.ts (no
 * library, no network). Dark on a white square with the standard's quiet zone,
 * so it scans in dark mode too. Renders nothing when the text will not fit.
 */
export default function QrCode({ text, label, size = 112 }: { text: string; label: string; size?: number }) {
  const matrix = encodeQr(text, "M");
  if (!matrix) return null;
  const quiet = 4;
  const box = matrix.size + quiet * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${box} ${box}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="shrink-0 rounded-lg bg-white"
    >
      <path d={qrSvgPath(matrix, quiet)} fill="#0f172a" />
    </svg>
  );
}
