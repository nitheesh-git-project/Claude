import Image from "next/image";
import mark from "../../public/brand/moverestore-mark.png";

// The clinic's MR mark, shared by the public Navbar and Footer so the two
// can never show different logos. The PNG is the mark alone on a transparent
// background (the favicon files in src/app/ carry their own tile).
//
// `flat` is the mark on its own -- no tile, ring or shadow -- which is what
// the white header wants. `tile` sets it on a white rounded square, which the
// dark footer needs: the mark's navy strokes disappear against slate-900.
//
// `unoptimized` serves the 256px source as-is. The optimiser would resample it
// down to the nearest srcset width, and at 40px that visibly softens the thin
// spine dots; a 45KB file is cheap enough to ship once and let the browser
// scale it on a high-density screen. Decorative: the site name always sits
// beside it, so an alt text would announce the brand twice.
export default function BrandMark({
  size = 40,
  variant = "tile",
}: {
  size?: number;
  variant?: "flat" | "tile";
}) {
  if (variant === "flat") {
    return (
      <Image
        src={mark}
        alt=""
        width={size}
        height={size}
        unoptimized
        priority
        // .brand-logo: in dark mode (dark-theme.css) the mark sits on a soft
        // light tile, because its dark-teal strokes vanish on a dark header.
        className="brand-logo shrink-0"
      />
    );
  }
  const inner = Math.round(size * 0.8);
  return (
    // The tile is white in literal CSS, not `bg-white`: in dark mode
    // `bg-white` becomes a dark card, and the mark needs the white behind it.
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, backgroundColor: "#ffffff" }}
    >
      <Image src={mark} alt="" width={inner} height={inner} unoptimized priority />
    </span>
  );
}
