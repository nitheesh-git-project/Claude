import { Stagger, StaggerItem } from "@/components/motion/primitives";

export type TrustPoint = { icon: string; label: string };

/**
 * The four reassurances, on a rule under the hero.
 *
 * Same four on every page: a visitor who lands deep (search, a shared link)
 * gets the same footing as one who came through the home page.
 */
export default function TrustBar({ points }: { points: TrustPoint[] }) {
  return (
    <div className="border-b border-slate-100 bg-white">
      <Stagger className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-5 sm:gap-x-12 sm:px-6 lg:px-8">
        {points.map((point) => (
          <StaggerItem key={point.label}>
            <span className="flex items-center gap-2 text-xs font-medium text-slate-500 sm:text-[13px]">
              <i
                className={`fa-solid ${point.icon} text-teal-600`}
                aria-hidden="true"
              />
              {point.label}
            </span>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
