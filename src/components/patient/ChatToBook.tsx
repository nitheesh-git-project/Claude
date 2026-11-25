"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import ProgressLink from "@/components/system/ProgressLink";
import Price from "@/components/pricing/Price";
import { chatBookingHref, type ChatCareOption, type ChatMode } from "@/lib/chatToBook";

/** How long the "typing" dots show before the next question. */
const THINK_MS = 550;

type Answers = {
  careId: string | null;
  mode: ChatMode | null;
  /** null = not asked (or not applicable); true/false = their answer. */
  sameTherapist: boolean | null;
};

const EMPTY: Answers = { careId: null, mode: null, sameTherapist: null };

/**
 * Chat to book: the booking questions asked one at a time, as a short chat,
 * answered by tapping -- there is nothing to type. It is the simplest way in,
 * not a second booking system: once it knows what the patient needs and how
 * they want to be seen, **Pick a time** opens the existing booking wizard for
 * that mode with the service (and, if they asked for them, their last
 * physiotherapist) already chosen. Slots, lead time, prices, consent, the
 * pincode check and payment all stay where they are, decided once.
 */
export default function ChatToBook({
  firstName,
  care,
  lastTherapist,
}: {
  firstName: string | null;
  care: ChatCareOption[];
  /** The physiotherapist from "Same again?", offered when the patient picks
   *  that same care. Null when there is nobody to offer. */
  lastTherapist: { id: string; name: string; categoryId: string } | null;
}) {
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  // Keep the newest message in view, like any chat.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [answers, thinking]);

  function answer(patch: Partial<Answers>) {
    setAnswers((a) => ({ ...a, ...patch }));
    setThinking(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setThinking(false), THINK_MS);
  }

  const chosen = care.find((c) => c.id === answers.careId) ?? null;
  const homeOffered = !!chosen?.homeVisit;
  // Video is the only way in when this care has no home-visit price.
  const mode: ChatMode | null = chosen && !homeOffered ? "video" : answers.mode;
  const askTherapist = !!chosen && !!lastTherapist && lastTherapist.categoryId === chosen.id && mode === "video";
  const ready = !!chosen && !!mode && (!askTherapist || answers.sameTherapist !== null);

  type Line = { key: string; who: "bot" | "me"; text: string; img?: string | null };
  const lines: Line[] = [
    { key: "hi", who: "bot", text: `Hi${firstName ? ` ${firstName}` : ""}. What do you need help with?` },
  ];
  let ask: "care" | "mode" | "therapist" | null = null;
  if (!chosen) ask = "care";
  else {
    lines.push({ key: "care", who: "me", text: chosen.title, img: chosen.imageUrl });
    if (homeOffered) {
      lines.push({ key: "q-mode", who: "bot", text: "Video consultation, or a visit at home?" });
      if (!answers.mode) ask = "mode";
      else lines.push({ key: "mode", who: "me", text: answers.mode === "video" ? "Video consultation" : "Home visit" });
    } else {
      lines.push({ key: "q-mode", who: "bot", text: "This one is a video consultation." });
    }
    if (!ask && askTherapist) {
      lines.push({ key: "q-th", who: "bot", text: `Would you like ${lastTherapist!.name} again?` });
      if (answers.sameTherapist === null) ask = "therapist";
      else lines.push({ key: "th", who: "me", text: answers.sameTherapist ? `Yes, ${lastTherapist!.name}` : "Anyone who is free" });
    }
  }

  const visibleAsk = thinking ? null : ask;
  const showReady = ready && !thinking;

  if (care.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-base text-slate-700">
        Nothing can be booked online right now. Please check back soon.
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-700 text-white">
          <i aria-hidden className="fa-solid fa-comment-medical" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-slate-900">Chat to book</p>
          <p className="text-sm text-slate-500">Tap an answer. There is nothing to type.</p>
        </div>
        {(answers.careId || answers.mode) && (
          <button
            type="button"
            onClick={() => setAnswers(EMPTY)}
            className="min-h-11 rounded-lg px-3 text-sm font-semibold text-teal-700 hover:bg-teal-50"
          >
            Start over
          </button>
        )}
      </div>

      <ol aria-live="polite" aria-label="Booking chat" className="flex flex-col gap-2.5 py-1">
        {lines.map((l) => (
          <li
            key={l.key}
            className={`mr-rise flex max-w-[85%] items-center gap-2 rounded-2xl px-4 py-2.5 text-base leading-snug ${
              l.who === "bot"
                ? "self-start rounded-bl-md border border-slate-200 bg-white text-slate-800"
                : "self-end rounded-br-md bg-teal-700 text-white"
            }`}
          >
            {l.img && (
              // A 28px thumbnail of a catalog cover the admin uploaded; next/image would
              // only add a resize round trip for it.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.img} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
            )}
            <span>
              <span className="sr-only">{l.who === "bot" ? "Clinic: " : "You: "}</span>
              {l.text}
            </span>
          </li>
        ))}
        {thinking && (
          <li className="flex gap-1 self-start rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3.5" aria-label="Typing">
            {[0, 150, 300].map((d) => (
              <span
                key={d}
                aria-hidden
                className="mr-dot block h-2 w-2 rounded-full bg-teal-600"
                style={{ animationDelay: `${d}ms` }}
              />
            ))}
          </li>
        )}
      </ol>

      {visibleAsk === "care" && (
        <div role="group" aria-label="What do you need help with?" className="mr-rise flex flex-wrap justify-end gap-2">
          {care.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => answer({ careId: c.id, mode: null, sameTherapist: null })}
              style={{ "--d": `${i * 30}ms` } as CSSProperties}
              className="mr-rise inline-flex min-h-12 items-center gap-2 rounded-full border border-slate-300 bg-white py-1.5 pl-1.5 pr-4 text-base font-semibold text-slate-800 transition hover:border-teal-600 hover:text-teal-800 active:scale-95"
            >
              {c.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.imageUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded-full bg-teal-50 text-teal-700">
                  <i aria-hidden className="fa-solid fa-notes-medical text-sm" />
                </span>
              )}
              {c.title}
            </button>
          ))}
        </div>
      )}

      {visibleAsk === "mode" && chosen && (
        <div role="group" aria-label="Video consultation or home visit?" className="mr-rise grid gap-2.5 sm:grid-cols-2">
          <ModeButton
            icon="fa-video"
            title="Video consultation"
            hint="Google Meet, from home"
            pricePaise={chosen.videoPricePaise}
            onClick={() => answer({ mode: "video" })}
          />
          <ModeButton
            icon="fa-house-medical"
            title="Home visit"
            hint="We check your pincode first"
            pricePaise={chosen.homeVisit!.pricePaise}
            onClick={() => answer({ mode: "home" })}
            amber
          />
        </div>
      )}

      {visibleAsk === "therapist" && lastTherapist && (
        <div role="group" aria-label={`Would you like ${lastTherapist.name} again?`} className="mr-rise flex flex-wrap justify-end gap-2">
          <ChipButton onClick={() => answer({ sameTherapist: true })}>Yes, {lastTherapist.name}</ChipButton>
          <ChipButton onClick={() => answer({ sameTherapist: false })}>Anyone who is free</ChipButton>
        </div>
      )}

      {showReady && chosen && mode && (
        <section aria-label="Your booking so far" className="mr-rise rounded-2xl border-2 border-teal-600 bg-white p-5">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-teal-700">Nearly there</p>
          <ul className="mt-2 space-y-2 text-base text-slate-800">
            <li className="flex items-center gap-3">
              <i aria-hidden className="fa-solid fa-notes-medical w-5 text-center text-teal-700" />
              {chosen.title}
            </li>
            <li className="flex items-center gap-3">
              <i aria-hidden className={`fa-solid ${mode === "video" ? "fa-video text-teal-700" : "fa-house-medical text-amber-600"} w-5 text-center`} />
              <span>
                {mode === "video" ? "Video consultation" : "Home visit"} ·{" "}
                <Price paise={mode === "video" ? chosen.videoPricePaise : chosen.homeVisit!.pricePaise} />
              </span>
            </li>
            {askTherapist && answers.sameTherapist && (
              <li className="flex items-center gap-3">
                <i aria-hidden className="fa-solid fa-user-doctor w-5 text-center text-teal-700" />
                {lastTherapist!.name}, if free
              </li>
            )}
          </ul>
          <ProgressLink
            href={chatBookingHref({
              categoryId: chosen.id,
              mode,
              therapistId: askTherapist && answers.sameTherapist ? lastTherapist!.id : null,
            })}
            className="mr-breathe mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-lg font-bold text-white transition hover:bg-teal-800"
          >
            <i aria-hidden className="fa-solid fa-calendar-days" />
            Pick a time
          </ProgressLink>
          <p className="mt-2 text-center text-sm text-slate-500">
            {mode === "video"
              ? "Next you choose a time, then check and pay."
              : "Next you enter your address, choose a time, then check and pay."}
          </p>
        </section>
      )}
      <div ref={endRef} />
    </div>
  );
}

function ModeButton({
  icon,
  title,
  hint,
  pricePaise,
  onClick,
  amber,
}: {
  icon: string;
  title: string;
  hint: string;
  pricePaise: number;
  onClick: () => void;
  amber?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 items-center gap-3 rounded-2xl border border-slate-300 bg-white p-3.5 text-left transition hover:border-teal-600 active:scale-[0.98]"
    >
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${amber ? "bg-amber-50 text-amber-700" : "bg-teal-50 text-teal-700"}`}>
        <i aria-hidden className={`fa-solid ${icon}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-slate-900">{title}</span>
        <span className="block text-sm text-slate-500">{hint}</span>
      </span>
      <span className="font-display text-base font-extrabold text-slate-900">
        <Price paise={pricePaise} />
      </span>
    </button>
  );
}

function ChipButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-12 items-center rounded-full border border-slate-300 bg-white px-4 text-base font-semibold text-slate-800 transition hover:border-teal-600 hover:text-teal-800 active:scale-95"
    >
      {children}
    </button>
  );
}
