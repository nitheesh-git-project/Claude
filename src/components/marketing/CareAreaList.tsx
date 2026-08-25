import Link from "next/link";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { CARE_AREAS } from "@/lib/careAreas";

/**
 * What we treat — as a quiet, scannable list rather than a wall of cards.
 *
 * This band used to be six photo tiles, and it read as the busiest thing on
 * the page while telling a visitor the least. The reason is worth keeping:
 * a photograph of a patient exercising at home cannot distinguish back pain
 * from knee pain, so all six pictures said the same sentence, took most of
 * each card, and left the actual answer — the six words in the heading — as
 * the small print. That fails the rule the rest of the site is built on: a
 * photograph has to be load-bearing, and here it could not be.
 *
 * So the photography stays where it does work (the hero, the two delivery
 * modes, the four steps) and this band drops it. What is left is what the
 * band is for: a visitor scanning for their own complaint. Icon, name, one
 * line — no cards, no shadows, and no per-item "See the programme" link
 * repeated six times, since the whole row is already the link.
 *
 * It also gives the page a beat of quiet between two image-heavy bands.
 */
export default function CareAreaList({
  href,
  ctaHref,
  ctaLabel,
}: {
  /** Where an area itself goes — the programme, or straight to booking. */
  href: string;
  /**
   * The one way out of the band, kept separate from `href` on purpose: the
   * home page sends an area to /conditions but its escape hatch to /book, and
   * a single prop made the link say "Book" while navigating to a reading page.
   */
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <>
      {/* Held to max-w-5xl rather than the band's full width: at 1280px+ a
          three-column list of one-line entries stretches until each row is
          mostly empty space, which reads as unfinished rather than airy. */}
      <Stagger className="mx-auto grid max-w-5xl gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARE_AREAS.map((area) => (
          <StaggerItem key={area.key}>
            <Link
              href={href}
              className="group -mx-3 flex items-start gap-4 rounded-2xl px-3 py-4 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 transition-colors group-hover:bg-teal-100">
                <i className={`fa-solid ${area.icon} text-[15px]`} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="font-display block text-[15px] font-bold text-slate-900 transition-colors group-hover:text-teal-800">
                  {area.title}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-slate-500">
                  {area.blurb}
                </span>
              </span>
            </Link>
          </StaggerItem>
        ))}
      </Stagger>

      {/* One way out of the band, rather than six. */}
      <div className="mt-10 text-center">
        <Link
          href={ctaHref}
          className="group inline-flex items-center gap-2 text-sm font-semibold text-teal-700 transition-colors hover:text-teal-900"
        >
          {ctaLabel}
          <i
            className="fa-solid fa-arrow-right text-[11px] transition-transform group-hover:translate-x-1"
            aria-hidden="true"
          />
        </Link>
      </div>
    </>
  );
}
