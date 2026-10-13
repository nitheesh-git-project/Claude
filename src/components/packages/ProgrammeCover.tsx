import CatalogImage from "@/components/catalog/CatalogImage";
import { focalPosition } from "@/lib/catalogImage";

/**
 * A programme's photograph, shown whole.
 *
 * The recommendation card and the Your Programmes cards used to crop the
 * condition's photo into a short full-width strip (`h-36 object-cover`), so
 * on a wide card a patient saw a band through the middle of someone's torso
 * and could not tell what the picture was. Here the photo is drawn with
 * `object-contain`, so none of it is lost, over a blurred, enlarged copy of
 * itself that fills the rest of the frame - the frame keeps one height
 * whatever shape the admin's upload is, and the letterbox reads as part of
 * the picture rather than as empty bars.
 *
 * `src` is the condition's admin-supplied URL, so a plain <img> for the same
 * reason CatalogImage gives: next/image would need every host an admin might
 * paste from on an allowlist. The focal point only steers the backdrop; the
 * photo itself is never cropped.
 */
export default function ProgrammeCover({
  src,
  focalX,
  focalY,
  className = "h-48",
  testId,
}: {
  src?: string | null;
  focalX?: number | null;
  focalY?: number | null;
  /** Height utility for the frame. */
  className?: string;
  testId?: string;
}) {
  if (!src) return <CatalogImage className={className} />;
  return (
    <div
      className={`relative w-full overflow-hidden bg-slate-100 ${className}`}
      data-testid={testId}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl"
        style={{ objectPosition: focalPosition({ image_focal_x: focalX, image_focal_y: focalY }) }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        data-cover="photo"
        className="relative h-full w-full object-contain drop-shadow-sm"
      />
    </div>
  );
}
