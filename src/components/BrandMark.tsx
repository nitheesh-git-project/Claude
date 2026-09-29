import Image from "next/image";
import mark from "../../public/brand/moverestore-mark.png";

// The clinic's MR mark on a white tile, shared by the public Navbar and
// Footer so the two can never show different badges. The PNG is the mark
// alone on a transparent background (the favicon files in src/app/ carry
// their own tile); the white tile is drawn here so it reads the same on the
// white header and the dark footer. Decorative: the site name always sits
// beside it, so an alt text would announce the brand twice.
export default function BrandMark({ size = 40 }: { size?: number }) {
  const inner = Math.round(size * 0.8);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white shadow-md ring-1 ring-slate-200"
      style={{ width: size, height: size }}
    >
      <Image src={mark} alt="" width={inner} height={inner} priority />
    </span>
  );
}
