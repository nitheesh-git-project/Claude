import Image from "next/image";
import { Reveal, MotionButton } from "@/components/motion/primitives";
import { photo, type PhotoId } from "@/lib/marketingPhotos";

/**
 * The last band of every public page: one sentence, one action, one picture.
 *
 * Every page ends the same way on purpose. Wherever a visitor stops reading,
 * the next step is in the same place and says the same thing — the old pages
 * ended on four different kinds of block, so "what do I do now" had a
 * different answer depending on where you happened to be.
 *
 * **It carries a photograph for the same reason every other band does.** This
 * is the one band whose job is a purchase, and it was the only one made of
 * nothing but text on a dark panel: a wall of words at the moment somebody is
 * deciding whether to spend money. What a visitor is being asked to do is two
 * minutes on a screen, and showing that is more persuasive than another
 * sentence saying it.
 *
 * **Each page names its own photograph, and it is never one already on that
 * page.** The band's shape is identical everywhere — same layout, same chip,
 * same assurances — so the invitation is still one invitation; only the face
 * changes. Repeating a single image across seven pages made the band read as
 * a template stamped on the end of each of them, which is exactly what a
 * visitor is being asked *not* to feel at a payment decision. The picture
 * also gets to answer that page's own question: the team page shows the
 * clinician on the screen, the home-visit page shows a visit, the mission
 * page shows who this is for.
 *
 * The default below is the fallback for a page that names nothing, not the
 * house style — a page added later should pick its own.
 *
 * The confirmation chip over the photo is the same argument once more: it
 * shows what the next screen gives back — a slot, a name, a time — rather
 * than asking anyone to imagine it. It is illustrative and says so in its own
 * label, never a real booking.
 *
 * `assurances` repeat three of the home page's trust points, because this is
 * where they answer a question rather than merely state one: somebody at a
 * payment decision is asking what they are buying and whether their money is
 * safe. They are deliberately the **non-numeric** ones. A session's length is
 * per-category and the cancellation window is an admin setting, so printing
 * either as a fixed number here would be the hardcoding rule broken in the
 * one band that reads as a promise.
 */

type CtaLink = { href: string; label: string; icon?: string };

/** Kept short on purpose — these sit under a button, not in a paragraph. */
const DEFAULT_ASSURANCES = [
  { icon: "fa-user-check", label: "One-to-one, never a group" },
  { icon: "fa-file-medical", label: "Reports read before your session" },
  { icon: "fa-lock", label: "Secure UPI payment" },
];

export default function ClosingCta({
  id = "get-started",
  title,
  body,
  primary,
  secondary,
  photoId = "step-book",
  photoAlt = "A patient at home, smiling as she books her session on her phone",
  assurances = DEFAULT_ASSURANCES,
}: {
  id?: string;
  title: string;
  body: string;
  primary: CtaLink;
  secondary?: CtaLink;
  /**
   * Pass one per page, chosen so it is not a photograph that page already
   * shows above — the same image twice on one page reads as a mistake. The
   * default only covers a page that names nothing.
   */
  photoId?: PhotoId;
  photoAlt?: string;
  assurances?: { icon: string; label: string }[];
}) {
  const img = photo(photoId);

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

      <Reveal className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:px-8">
        {/* Copy first in the DOM as well as on screen: on a phone the photo
            sits under the buttons, so nobody scrolls past a picture to reach
            the thing they came to tap. */}
        <div className="text-center lg:text-left">
          <h2 className="font-display text-[1.9rem] font-extrabold leading-tight tracking-[-0.02em] text-white sm:text-4xl">
            {title}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-teal-100/90 lg:mx-0">
            {body}
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
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

          {assurances.length > 0 && (
            <ul className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 lg:justify-start">
              {assurances.map((a) => (
                <li
                  key={a.label}
                  className="flex items-center gap-2 text-[13px] font-medium text-teal-100/80"
                >
                  <i className={`fa-solid ${a.icon} text-xs text-teal-300`} aria-hidden="true" />
                  {a.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          {/* A soft plate behind the photo so the white confirmation chip has
              something to sit against at every crop, rather than landing on
              whatever the photograph happens to be dark or light in. */}
          <div
            aria-hidden="true"
            className="absolute -inset-3 rounded-[2rem] bg-white/10 blur-xl"
          />
          {/* A fixed aspect rather than the photograph's own: the copy beside
              it is three or four lines and a row of buttons, and a portrait
              crop would leave the band mostly empty teal under the text. */}
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-white/20 shadow-2xl shadow-teal-950/40 lg:aspect-[5/4]">
            <Image
              src={img}
              alt={photoAlt}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              placeholder="blur"
            />
            {/* Bottom-up scrim: the chip below is white on white without it. */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-slate-950/70 to-transparent"
            />

            <div className="absolute bottom-4 left-4 right-4 rounded-2xl bg-white/95 p-3.5 shadow-lg backdrop-blur sm:left-5 sm:right-auto sm:w-[19rem]">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-teal-700">
                <i className="fa-solid fa-circle-check" aria-hidden="true" />
                Session confirmed
              </p>
              <p className="mt-1.5 font-display text-sm font-bold text-slate-900">
                Tuesday, 6:00 PM
              </p>
              {/* True of both delivery modes: a home visit gets a calendar
                  event too, and that invite is the only message this platform
                  sends. Nothing here names a video link, which a home visit
                  would not have. */}
              <p className="mt-0.5 text-[12px] text-slate-500">
                Calendar invite on its way.
              </p>
              {/* Says it is an example, in the component rather than in a
                  page's copy, so no page can render this chip as though it
                  were a real booking. */}
              <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">
                Example of what you get
              </p>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
