import { Reveal, MotionButton } from "@/components/motion/primitives";

/**
 * The last band of every public page: one sentence and one action.
 *
 * Every page ends the same way on purpose. Wherever a visitor stops reading,
 * the next step is in the same place and says the same thing — the old pages
 * ended on four different kinds of block, so "what do I do now" had a
 * different answer depending on where you happened to be.
 */
export default function ClosingCta({
  id = "get-started",
  title,
  body,
  primary,
  secondary,
}: {
  id?: string;
  title: string;
  body: string;
  primary: { href: string; label: string; icon?: string };
  secondary?: { href: string; label: string; icon?: string };
}) {
  return (
    <section
      id={id}
      className="relative scroll-mt-24 overflow-hidden bg-slate-900 py-20 sm:py-24"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-br from-teal-800 via-teal-900 to-emerald-900"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-20 h-96 w-96 rounded-full bg-teal-400/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-10 h-80 w-80 rounded-full bg-emerald-300/10 blur-3xl"
      />

      <Reveal className="relative mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="font-display text-[1.9rem] font-extrabold leading-tight tracking-[-0.02em] text-white sm:text-4xl">
          {title}
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-teal-100/90">
          {body}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <MotionButton href={primary.href} variant="secondary">
            {primary.icon && (
              <i className={`fa-solid ${primary.icon} text-teal-700`} />
            )}
            {primary.label}
          </MotionButton>
          {secondary && (
            <MotionButton href={secondary.href} variant="ghost">
              {secondary.label}
              <i className="fa-solid fa-arrow-right text-xs" />
            </MotionButton>
          )}
        </div>
      </Reveal>
    </section>
  );
}
