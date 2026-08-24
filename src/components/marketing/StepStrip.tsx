import Image from "next/image";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { photo, type PhotoId } from "@/lib/marketingPhotos";

export type Step = {
  photoId: PhotoId;
  alt: string;
  title: string;
  /** One line. The step is the headline; this is the caption. */
  body: string;
};

/**
 * The process, as numbered photographs.
 *
 * Replaces the scroll-driven step scroller on /how-it-works. That component
 * showed one step at a time and animated between them, which meant a visitor
 * asking the page's actual question — "how long does this take and what do I
 * have to do?" — could not see the answer at once. Four photographs in a row
 * answer it in a glance and still read as four rows on a phone.
 */
export default function StepStrip({ steps }: { steps: Step[] }) {
  return (
    <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => (
        <StaggerItem key={step.title} className="h-full">
          <div className="flex h-full flex-col">
            <div className="relative aspect-[3/2] overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-900/5">
              <Image
                src={photo(step.photoId)}
                alt={step.alt}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                className="object-cover"
              />
              <span className="font-display absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-xs font-bold text-white shadow-sm">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            <h3 className="font-display mt-4 text-base font-bold text-slate-900">
              {step.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{step.body}</p>
          </div>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
