import { Reveal } from "@/components/motion/primitives";

/**
 * One band of a public page.
 *
 * The redesign's core rule is one idea per band, so this component only
 * accepts one idea's worth of framing: an eyebrow, a heading of a few words
 * and at most one sentence under it. There is deliberately no slot for a
 * second paragraph — the feedback that started this rewrite was that
 * visitors could not tell what the site was, and the cause was every section
 * arriving with three paragraphs of preamble before the thing itself.
 *
 * `tone` is the only visual choice a page makes. Bands alternate
 * plain/tinted down a page so the eye can count them; `panel` lifts the
 * content onto a floating white card for the two or three places that carry
 * the page's main answer.
 */
export type SectionTone = "plain" | "tint" | "panel" | "dark";

const TONE_WRAPPER: Record<SectionTone, string> = {
  plain: "bg-white",
  tint: "bg-slate-50",
  panel: "bg-slate-50",
  dark: "bg-slate-900",
};

const TONE_INNER: Record<SectionTone, string> = {
  plain: "",
  tint: "",
  // The reference layout's signature: content on a white card floating over
  // the tinted page rather than a full-bleed stripe.
  panel:
    "rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-32px_rgba(15,23,42,0.25)] sm:p-10 lg:p-14",
  dark: "",
};

export default function Section({
  id,
  tone = "plain",
  eyebrow,
  title,
  lede,
  align = "center",
  children,
  className = "",
}: {
  id?: string;
  tone?: SectionTone;
  eyebrow?: string;
  title?: React.ReactNode;
  /** One sentence. If it needs two, the band is doing two jobs. */
  lede?: string;
  align?: "center" | "left";
  children: React.ReactNode;
  className?: string;
}) {
  const dark = tone === "dark";
  const hasHeading = Boolean(eyebrow || title || lede);

  return (
    <section
      id={id}
      // scroll-mt clears the sticky navbar so a rail jump or a #hash deep
      // link lands on the heading rather than under it.
      className={`scroll-mt-24 py-16 sm:py-20 lg:py-24 ${TONE_WRAPPER[tone]} ${className}`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className={TONE_INNER[tone]}>
          {hasHeading && (
            <Reveal
              className={`mb-10 max-w-2xl sm:mb-14 ${align === "center" ? "mx-auto text-center" : ""}`}
            >
              {eyebrow && (
                <p
                  className={`text-[11px] font-bold uppercase tracking-[0.2em] ${
                    dark ? "text-teal-300" : "text-teal-700"
                  }`}
                >
                  {eyebrow}
                </p>
              )}
              {title && (
                <h2
                  className={`mt-3 text-[1.75rem] font-bold leading-[1.15] tracking-[-0.02em] sm:text-[2.25rem] ${
                    dark ? "text-white" : "text-slate-900"
                  }`}
                >
                  {title}
                </h2>
              )}
              {lede && (
                <p
                  className={`mt-4 text-[15px] leading-relaxed sm:text-base ${
                    dark ? "text-slate-300" : "text-slate-500"
                  }`}
                >
                  {lede}
                </p>
              )}
            </Reveal>
          )}
          {children}
        </div>
      </div>
    </section>
  );
}
