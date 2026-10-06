// ProgressLink rather than next/link: this card renders on three dashboards
// and two ISR-cached public pages, and a Link click never touches useRouter
// -- so without it the booking hub would tap through to the wizard with no
// teal bar and no acknowledgement, which is the regression swapping the
// hub's own ProgressLink out would have caused.
import Link from "@/components/system/ProgressLink";
import CatalogImage from "@/components/catalog/CatalogImage";
import type { CareIllustrationId } from "@/components/visuals/CareIllustration";
import { rupees } from "@/components/catalog/CatalogVisuals";
import Price, { PriceSaving } from "@/components/pricing/Price";

/**
 * The one card for everything this clinic sells.
 *
 * Three surfaces drew their own before this: the programme cards on `/` and
 * `/conditions`, the home-visit package cards on `/home-visit`, and a
 * text-only list on the patient's own booking screen. Same rows, three
 * layouts, three answers to "what does an offering look like" -- and the
 * dashboard one had no photograph at all, so a patient who had already signed
 * up saw the plainest version of the catalogue.
 *
 * The shape is deliberate rather than decorative, and it is the same set of
 * facts the old cards carried:
 *
 *  - **The cover is 4:3 and inset**, not a 104px full-bleed strip. A strip
 *    that shallow cannot hold a photograph of a person, which is why the
 *    covers looked mis-cropped however they were shot.
 *  - **Meta chips are a promotion, not an addition.** Duration, visit count,
 *    travel and therapist lock already existed on the row; they were only
 *    readable by opening the detail dialog.
 *  - **The price sits on a fixed baseline** (`mt-auto`), so cards in a row
 *    line up however long their titles run.
 *  - **The two actions differ by weight.** Booking is the filled button;
 *    reading more is a quiet link. They used to be two similar links.
 *
 * A field a row does not have simply does not render, which is what lets one
 * component serve a treatment category, a multi-visit home package and a
 * dashboard tile without any of them growing a variant.
 */
export type CatalogCardData = {
  id: string;
  title: string;
  /** One line under the title. */
  summary: string | null;
  imageUrl: string | null;
  focalX?: number | null;
  focalY?: number | null;
  /** Small pill over the cover - a condition type, or an admin's badge. */
  badge?: string | null;
  /** Draws the teal ring. Admin-set, and only ever on one or two rows. */
  highlight?: boolean;
  /** Facts, already worded. Rendered in order, dropped when empty. */
  meta?: string[];
  /** The tick list. Capped at four by the card, not by the caller. */
  points?: string[];
  pricePaise: number;
  compareAtPaise?: number | null;
  /** "/ 45 min session", "/ visit", "/ 4 visits". */
  priceUnit: string;
  /** Shown beside a struck-through compare-at price. */
  savingsPaise?: number | null;
  /** Keep the price in rupees whatever the visitor's country -- a home
   *  visit is delivered (and charged) in India. Everything else follows the
   *  visitor's currency. */
  rupeesOnly?: boolean;
  /** Where booking this goes. Required in link mode; a card in select mode
   *  does not navigate at all, so it has none - see the props union below. */
  bookHref?: string;
  bookLabel?: string;
  /** Vector fallback when there is no photograph. */
  art?: CareIllustrationId;
  icon?: string;
};

/**
 * The card has two modes, and they are a union rather than a pile of
 * optional props so that a card with neither a destination nor a handler
 * cannot be written at all.
 *
 * **Link mode** is what every existing caller uses: the primary action is a
 * `ProgressLink` to `bookHref`, and the card is a shop window.
 *
 * **Select mode** is the booking wizards' picker: the primary action is a
 * button that reports the choice back, because the patient is already inside
 * the wizard and navigating anywhere would throw away the date, hour and
 * language they have entered. It was added here rather than by writing a
 * second card, per the rule at the top of this file - two cards is how two
 * screens grow two ideas of what an offering looks like.
 */
type LinkMode = {
  data: CatalogCardData & { bookHref: string; bookLabel: string };
  onSelect?: never;
  selected?: never;
  selectLabel?: never;
};

type SelectMode = {
  data: CatalogCardData;
  /** Reports the choice. Its presence is what puts the card in select mode. */
  onSelect: () => void;
  /** Draws the ring and the check chip, and sets `aria-pressed`. */
  selected?: boolean;
  /** "Choose this session", "Choose this visit" - the caller words it,
   *  because only the caller knows which of the two catalogues this is. */
  selectLabel: string;
};

export default function CatalogCard({
  data,
  onOpenDetails,
  onSelect,
  selected = false,
  selectLabel,
}: (LinkMode | SelectMode) & {
  /**
   * Opens the detail dialog. Optional: the patient's booking screen has the
   * wizard one tap away and no dialog of its own, and a "View full details"
   * link that opened nothing would be worse than its absence.
   */
  onOpenDetails?: () => void;
}) {
  const points = (data.points ?? []).filter(Boolean).slice(0, 4);
  const meta = (data.meta ?? []).filter(Boolean);

  const cover = (
    <div className="relative overflow-hidden rounded-xl">
      <CatalogImage
        src={data.imageUrl}
        focalX={data.focalX}
        focalY={data.focalY}
        art={data.art}
        icon={data.icon}
        className="aspect-[4/3] h-auto"
      />
      {data.badge && (
        <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-1 text-[10.5px] font-semibold text-teal-800 shadow-sm">
          {data.badge}
        </span>
      )}
      {/* The chip is on the cover rather than beside the title because a
          grid of these is scanned by picture, and "which one did I pick"
          has to be answerable without reading anything. */}
      {selected && (
        <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-2.5 py-1 text-[10.5px] font-bold text-white shadow-sm">
          <i aria-hidden className="fa-solid fa-check text-[9px]" />
          Chosen
        </span>
      )}
    </div>
  );

  return (
    <article
      className={`flex h-full flex-col rounded-2xl border bg-white p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
        selected || data.highlight
          ? "border-teal-500 ring-[3px] ring-teal-50"
          : "border-slate-200 hover:border-teal-400"
      }`}
    >
      {/* The cover opens the dialog where there is one. It is a button rather
          than a wrapper around the whole card because the card also holds a
          real link, and a link inside a button is invalid markup that behaves
          differently per browser -- the same rule the old cards followed. */}
      {onOpenDetails ? (
        <button
          type="button"
          onClick={onOpenDetails}
          aria-haspopup="dialog"
          aria-label={`View full details for ${data.title}`}
          className="block cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          {cover}
        </button>
      ) : (
        cover
      )}

      <div className="flex flex-1 flex-col px-2 pt-3.5">
        {/* The title opens the dialog as surely as the cover does. The old
            card was one large button, so a tap anywhere on it worked; making
            only the photograph tappable left the most obvious target on the
            card -- the name of the thing -- doing nothing. The heading stays a
            real <h3> with the button inside it, so the document outline is
            unchanged and screen readers still announce a heading. */}
        {onOpenDetails ? (
          <h3 className="font-display text-base font-bold leading-snug text-slate-900">
            <button
              type="button"
              onClick={onOpenDetails}
              aria-haspopup="dialog"
              className="cursor-pointer rounded text-left transition hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              {data.title}
            </button>
          </h3>
        ) : (
          <h3 className="font-display text-base font-bold leading-snug text-slate-900">
            {data.title}
          </h3>
        )}
        {data.summary && (
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{data.summary}</p>
        )}

        {meta.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {meta.map((m) => (
              <span
                key={m}
                className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-600"
              >
                {m}
              </span>
            ))}
          </div>
        )}

        {points.length > 0 && (
          <ul className="mt-3 grid grid-cols-2 gap-x-2.5 gap-y-1.5 border-t border-slate-100 pt-3">
            {points.map((pt) => (
              <li key={pt} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-slate-600">
                <i aria-hidden className="fa-solid fa-check mt-0.5 shrink-0 text-[10px] text-teal-600" />
                {pt}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex flex-wrap items-baseline gap-x-1.5 gap-y-1 pt-3.5">
          <span className="font-display text-lg font-bold text-slate-900">
            {data.rupeesOnly ? rupees(data.pricePaise) : <Price paise={data.pricePaise} />}
          </span>
          {data.compareAtPaise != null && data.compareAtPaise > data.pricePaise && (
            <span className="text-xs text-slate-500 line-through">
              {data.rupeesOnly ? rupees(data.compareAtPaise) : <Price paise={data.compareAtPaise} />}
            </span>
          )}
          {data.savingsPaise != null && data.savingsPaise > 0 && (
            <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-teal-800">
              Save{" "}
              {data.rupeesOnly || data.compareAtPaise == null ? (
                rupees(data.savingsPaise)
              ) : (
                <PriceSaving comparePaise={data.compareAtPaise} pricePaise={data.pricePaise} />
              )}
            </span>
          )}
          <span className="text-[11.5px] text-slate-500">{data.priceUnit}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 px-2 pb-1.5 pt-3">
        {/* Select mode is a button, link mode is a link, and the difference
            is not styling: inside the wizard there is nowhere to navigate to
            -- the patient's date, hour and language are in React state on
            the screen they are standing on. `aria-pressed` rather than
            `role="radio"` because this card also carries a second action,
            and a radio that contains another control is not a radio. */}
        {onSelect ? (
          <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 ${
              selected ? "bg-slate-900 hover:bg-slate-800" : "bg-teal-700 hover:bg-teal-800"
            }`}
          >
            <i aria-hidden className={`fa-solid text-xs ${selected ? "fa-check" : "fa-hand-pointer"}`} />
            {selected ? "Chosen" : selectLabel}
          </button>
        ) : (
          <Link
            href={data.bookHref as string}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
          >
            <i aria-hidden className="fa-solid fa-calendar-check text-xs" />
            {data.bookLabel}
          </Link>
        )}
        {onOpenDetails && (
          <button
            type="button"
            onClick={onOpenDetails}
            aria-haspopup="dialog"
            className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            View full details →
          </button>
        )}
      </div>
    </article>
  );
}
