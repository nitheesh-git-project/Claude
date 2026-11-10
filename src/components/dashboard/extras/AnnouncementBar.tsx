"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/lib/toast";
import { stillLive, type DashboardAnnouncement } from "@/lib/announcements";
import { WithDashboardExtras } from "./DashboardExtrasProvider";
import AnnouncementDialog from "./AnnouncementDialog";

/**
 * The announcements on top of a dashboard.
 *
 * Two shapes, chosen by the shell from the page it is on:
 *
 * - **`full`**, on the dashboard's home: the banner at 6:1, one slot however
 *   many are live, sliding by itself and by swipe.
 * - **`slim`**, on every other screen: one line. The person is in the
 *   middle of booking or reading a record there, and a banner the height of
 *   a hero would push the task down the page on every step of it.
 *
 * The slot is a native scroll-snap row rather than a transform carousel, so
 * a swipe is the browser's own gesture -- momentum, rubber-banding and all --
 * and there is no pointer maths to get subtly wrong on one phone.
 *
 * **It moves by itself only until somebody touches it.** Sliding stops for
 * good on the first swipe, arrow or dot, pauses while the pointer or focus
 * is inside, never starts under "reduce motion", and has its own Pause
 * button -- content that moves for more than a few seconds needs a way to
 * stop it that a keyboard can reach.
 *
 * Nothing here decides what is live: the layout's gate did, on the server.
 * This only drops one whose end passes while the tab stays open, and one
 * the person closes.
 */

const SLIDE_MS = 6500;
const EMPTY: DashboardAnnouncement[] = [];

async function postReceipt(id: string, action: "dismiss" | "seen"): Promise<boolean> {
  try {
    const res = await fetch("/api/announcements/receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
      // Every dashboard link is a full page load, and a person closes a
      // banner and taps on in the same breath: the request must outlive the
      // page that sent it.
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Closed in this tab. The receipt is what makes a close permanent, but it
// is written a moment after the tap, and the very next page can be rendered
// before it lands -- the banner would come back once, which reads as "the X
// did nothing". This bridges that moment; it is never the record.
const CLOSED_KEY = "dpp.announcements.closed";

function readClosedHere(): string[] {
  try {
    const raw = window.sessionStorage.getItem(CLOSED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string").slice(-50) : [];
  } catch {
    return [];
  }
}

function writeClosedHere(ids: string[]) {
  try {
    window.sessionStorage.setItem(CLOSED_KEY, JSON.stringify(ids.slice(-50)));
  } catch {
    // Private mode or a full store: the receipt still does the real work.
  }
}

function TextBanner({ title }: { title: string }) {
  return (
    <span className="flex aspect-[6/1] w-full items-center gap-3 bg-teal-700 px-4 text-left text-white sm:gap-5 sm:px-8">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 sm:h-12 sm:w-12"
      >
        <i className="fa-solid fa-bullhorn text-sm sm:text-lg"></i>
      </span>
      <span className="line-clamp-2 min-w-0 flex-1 font-display text-[clamp(0.95rem,2.3vw,1.7rem)] font-bold leading-tight">
        {title}
      </span>
      <span className="hidden shrink-0 items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold md:flex">
        Read more
        <i aria-hidden="true" className="fa-solid fa-arrow-right text-xs"></i>
      </span>
    </span>
  );
}

export default function AnnouncementBar({ variant }: { variant: "full" | "slim" }) {
  return (
    <WithDashboardExtras
      render={(extras) =>
        extras.announcements.length > 0 ? <Bar variant={variant} source={extras.announcements} /> : null
      }
    />
  );
}

function Bar({ variant, source = EMPTY }: { variant: "full" | "slim"; source?: DashboardAnnouncement[] }) {
  const { show } = useToast();

  // Closed by this person on this page; the receipt makes it stick.
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  // Null on the first render so it matches the server's; set by the tick.
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [stopped, setStopped] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const autoOpened = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    // After hydration, never during it: storage is something the server's
    // render could not have read.
    const start = window.setTimeout(() => {
      const here = readClosedHere();
      if (here.length) setClosed((prev) => new Set([...prev, ...here]));
    }, 0);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(start);
    };
  }, []);

  const list = useMemo(
    () =>
      (nowMs === null ? source : stillLive(source, nowMs)).filter((a) => !(a.dismissible && closed.has(a.id))),
    [source, nowMs, closed]
  );
  const count = list.length;
  const current = Math.min(index, Math.max(0, count - 1));
  const open = openId ? list.find((a) => a.id === openId) ?? null : null;

  const goTo = useCallback(
    (next: number, byPerson: boolean) => {
      if (count === 0) return;
      const target = ((next % count) + count) % count;
      if (byPerson) setStopped(true);
      setIndex(target);
      const el = scroller.current;
      if (el) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollTo({ left: target * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
      }
    },
    [count]
  );

  // Slides by itself: only with more than one, only until touched, never
  // behind the pop-up, in a hidden tab, or under "reduce motion".
  useEffect(() => {
    if (count < 2 || stopped || hovered || openId) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") goTo(current + 1, false);
    }, SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [count, stopped, hovered, openId, current, goTo]);

  // The pop-up an admin asked to open once by itself. Not over another
  // dialog (the first-visit tutorial, a session-timeout warning): whatever
  // is already up was asked for more urgently than a greeting.
  useEffect(() => {
    if (autoOpened.current) return;
    const first = source.find((a) => a.autoOpen);
    if (!first) return;
    const timer = window.setTimeout(() => {
      if (autoOpened.current) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      autoOpened.current = true;
      setStopped(true);
      setOpenId(first.id);
      void postReceipt(first.id, "seen");
    }, 900);
    return () => window.clearTimeout(timer);
  }, [source]);

  function onScroll() {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    const at = Math.round(el.scrollLeft / el.clientWidth);
    if (at !== current && at >= 0 && at < count) setIndex(at);
  }

  async function close(a: DashboardAnnouncement) {
    setClosed((prev) => new Set(prev).add(a.id));
    writeClosedHere([...readClosedHere().filter((id) => id !== a.id), a.id]);
    const ok = await postReceipt(a.id, "dismiss");
    if (!ok) {
      writeClosedHere(readClosedHere().filter((id) => id !== a.id));
      // Put it back rather than pretend: it would return on the next page
      // anyway, and a banner that keeps coming back reads as a bug.
      setClosed((prev) => {
        const next = new Set(prev);
        next.delete(a.id);
        return next;
      });
      show("That banner couldn't be closed just now. Please try again.", "error");
    }
  }

  if (count === 0) return null;
  const shown = list[current];

  const dialog = open ? <AnnouncementDialog announcement={open} onClose={() => setOpenId(null)} /> : null;

  if (variant === "slim") {
    return (
      <section aria-label="Announcements" data-testid="announcement-strip" className="mb-4 print:hidden">
        <div className="flex min-h-12 items-center gap-2 rounded-xl bg-teal-700 pl-3 pr-1 text-white">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15"
          >
            <i className="fa-solid fa-bullhorn text-xs"></i>
          </span>
          <button
            type="button"
            onClick={() => setOpenId(shown.id)}
            aria-haspopup="dialog"
            className="min-h-11 min-w-0 flex-1 truncate text-left text-sm font-semibold underline-offset-2 hover:underline"
          >
            {shown.title}
          </button>
          {count > 1 && (
            <button
              type="button"
              onClick={() => goTo(current + 1, true)}
              aria-label={`Next announcement (${current + 1} of ${count})`}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-white/90 hover:bg-white/10"
            >
              <span aria-hidden="true">
                {current + 1} of {count}
              </span>
              <i aria-hidden="true" className="fa-solid fa-chevron-right text-[10px]"></i>
            </button>
          )}
          {shown.dismissible && (
            <button
              type="button"
              onClick={() => close(shown)}
              aria-label={`Close: ${shown.title}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-white/10"
            >
              <i aria-hidden="true" className="fa-solid fa-xmark text-sm"></i>
            </button>
          )}
        </div>
        {dialog}
      </section>
    );
  }

  return (
    <section
      aria-label="Announcements"
      aria-roledescription="carousel"
      data-testid="announcement-bar"
      className="mb-5 print:hidden sm:mb-6"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={() => setHovered(false)}
    >
      <div className="group/banner relative overflow-hidden rounded-2xl bg-slate-100 shadow-sm ring-1 ring-slate-900/5">
        <div
          ref={scroller}
          onScroll={onScroll}
          onTouchStart={() => setStopped(true)}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {list.map((a, i) => (
            <div
              key={a.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              inert={i !== current}
              className="relative w-full shrink-0 snap-center"
            >
              <button
                type="button"
                onClick={() => {
                  setStopped(true);
                  setOpenId(a.id);
                }}
                aria-haspopup="dialog"
                aria-label={`${a.title}. Read more`}
                data-testid="announcement-banner"
                className="block w-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-teal-400"
              >
                {a.bannerImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.bannerImageUrl} alt="" className="block aspect-[6/1] w-full object-cover" />
                ) : (
                  <TextBanner title={a.title} />
                )}
              </button>
              {a.dismissible && (
                <button
                  type="button"
                  onClick={() => close(a)}
                  aria-label={`Close: ${a.title}`}
                  data-testid="announcement-close"
                  className="absolute right-0 top-0 flex h-11 w-11 items-start justify-end"
                >
                  <span className="mr-1.5 mt-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/70 text-white transition hover:bg-slate-900 sm:mr-2.5 sm:mt-2.5 sm:h-7 sm:w-7">
                    <i aria-hidden="true" className="fa-solid fa-xmark text-[11px] sm:text-xs"></i>
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo(current - 1, true)}
              aria-label="Previous announcement"
              className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900/60 text-white opacity-0 transition hover:bg-slate-900/80 focus-visible:opacity-100 group-hover/banner:opacity-100 lg:flex"
            >
              <i aria-hidden="true" className="fa-solid fa-chevron-left text-sm"></i>
            </button>
            <button
              type="button"
              onClick={() => goTo(current + 1, true)}
              aria-label="Next announcement"
              className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900/60 text-white opacity-0 transition hover:bg-slate-900/80 focus-visible:opacity-100 group-hover/banner:opacity-100 lg:flex"
            >
              <i aria-hidden="true" className="fa-solid fa-chevron-right text-sm"></i>
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="mt-1 flex items-center justify-center gap-1">
          {list.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => goTo(i, true)}
              aria-label={`Show announcement ${i + 1} of ${count}`}
              aria-current={i === current ? "true" : undefined}
              className="flex h-8 w-6 items-center justify-center"
            >
              <span
                className={`h-1.5 rounded-full transition-all ${
                  i === current ? "w-5 bg-teal-700" : "w-1.5 bg-slate-400"
                }`}
              ></span>
            </button>
          ))}
          <span className="ml-1 text-[13px] font-semibold text-slate-600" aria-hidden="true">
            {current + 1} of {count}
          </span>
          <button
            type="button"
            onClick={() => setStopped((s) => !s)}
            aria-label={stopped ? "Slide announcements automatically" : "Stop sliding announcements"}
            aria-pressed={stopped}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800"
          >
            <i aria-hidden="true" className={`fa-solid ${stopped ? "fa-play" : "fa-pause"} text-[11px]`}></i>
          </button>
        </div>
      )}
      {dialog}
    </section>
  );
}
