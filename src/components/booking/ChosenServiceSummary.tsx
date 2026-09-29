import CatalogImage from "@/components/catalog/CatalogImage";
import { rupees } from "@/components/catalog/CatalogVisuals";
import type { ServiceOption } from "@/lib/serviceOptions";

/**
 * What the patient has chosen, stated: photograph, what it is, what it costs
 * and how long it takes.
 *
 * One component because it renders in two places that must agree -- inside
 * the picker on Step 1, as the answered state of the control, and again on
 * the step where the booking is actually filled in, as a read-only statement
 * with a way back. Written twice it went wrong immediately: the second copy
 * sized its own thumbnail with `h-10 w-auto`, `CatalogImage`'s own `w-full`
 * won, and the picture stretched the full width of the row and pushed the
 * text out of the card.
 *
 * So the thumbnail is sized by its **wrapper**, and `CatalogImage` keeps the
 * `w-full` it applies to every cover in the app. A caller that needs a
 * different size changes the wrapper, never the image's own width.
 *
 * `actions` is a slot rather than props, because the two callers offer
 * different things: the picker offers Change and View details, and a later
 * step offers only a way back to Step 1.
 */
export default function ChosenServiceSummary({
  option,
  actions,
  compact = false,
}: {
  option: ServiceOption;
  actions?: React.ReactNode;
  /** The later steps are a statement rather than a control, so they sit in
   *  the quieter teal panel the rest of those forms use and take a smaller
   *  thumbnail. Step 1 keeps the emphasised card: there, this *is* the
   *  answer to the screen's first question. */
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "flex items-stretch gap-3 rounded-xl border border-teal-100 bg-teal-50 p-2.5"
          : "flex items-stretch gap-3 rounded-2xl border-2 border-teal-500 bg-white p-2.5 ring-[3px] ring-teal-50"
      }
    >
      <span
        className={`block shrink-0 overflow-hidden rounded-xl ${compact ? "w-16" : "w-24"}`}
      >
        <CatalogImage
          src={option.imageUrl}
          focalX={option.focalX}
          focalY={option.focalY}
          icon={option.icon}
          className="aspect-square h-auto"
        />
      </span>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-700">
          {option.eyebrow}
        </span>
        <h3
          className={`font-display font-bold leading-snug text-slate-900 ${
            compact ? "text-sm" : "text-base"
          }`}
        >
          {option.title}
        </h3>
        <p className="text-xs text-slate-600">
          {rupees(option.pricePaise)} &middot; {option.durationMinutes} min
        </p>
      </div>

      {actions && (
        <div className="flex shrink-0 flex-col justify-center gap-1.5">{actions}</div>
      )}
    </div>
  );
}
