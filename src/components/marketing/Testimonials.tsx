import { Stagger, StaggerItem } from "@/components/motion/primitives";

export type PublicTestimonial = {
  id: string;
  patient_name: string;
  quote: string;
  rating: number | null;
  condition_label: string | null;
  /**
   * Migration-dependent (see the end of schema.sql), so callers read it in an
   * isolated query and merge it in. Undefined means the column is not in this
   * database yet, which falls back to the initial exactly like a row whose
   * photo has simply not been added.
   */
  avatar_url?: string | null;
};

/**
 * Patient quotes, shown the same way on Home and /mission.
 *
 * One component rather than two copies of the markup, because these two
 * bands make the same claim and a visitor may well see both in one session —
 * the pair drifting apart is exactly the kind of thing nobody notices in
 * review and everybody notices on the site.
 *
 * The portrait matters more here than it looks: beside a practice's own
 * promises, an unattributed quote reads as copywriting. It falls back to the
 * patient's initial rather than a silhouette, since a generic avatar is a
 * worse signal than no avatar.
 */
export default function Testimonials({
  testimonials,
  columns = 3,
}: {
  testimonials: PublicTestimonial[];
  columns?: 2 | 3;
}) {
  if (testimonials.length === 0) return null;

  return (
    <Stagger
      className={`grid gap-5 sm:grid-cols-2 ${columns === 3 ? "lg:grid-cols-3" : ""}`}
    >
      {testimonials.map((t) => (
        <StaggerItem key={t.id} className="h-full">
          <figure className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {t.rating && (
              <div
                className="mb-3 text-sm text-amber-500"
                aria-label={`Rated ${t.rating} out of 5`}
              >
                <span aria-hidden="true">
                  {"★".repeat(t.rating)}
                  <span className="text-slate-200">{"★".repeat(5 - t.rating)}</span>
                </span>
              </div>
            )}

            <blockquote className="flex-1 text-[15px] leading-relaxed text-slate-700">
              &ldquo;{t.quote}&rdquo;
            </blockquote>

            <figcaption className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
              {t.avatar_url ? (
                // Admin-supplied URL, so a plain <img> for the same reason the
                // catalog covers use one: optimising it would mean a
                // remotePatterns allowlist per host an admin might paste from.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.avatar_url}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="font-display flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-700">
                  {t.patient_name.trim().charAt(0).toUpperCase()}
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-900">
                  {t.patient_name}
                </span>
                {t.condition_label && (
                  <span className="block text-xs text-teal-700">{t.condition_label}</span>
                )}
              </span>
            </figcaption>
          </figure>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
