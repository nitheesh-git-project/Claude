"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { WithDashboardExtras } from "./DashboardExtrasProvider";
import {
  NOTEBOOK_HINT_KEY,
  nextNotebookHintValue,
  placeNotebook,
  shouldShowNotebookHint,
  type Box,
} from "@/lib/notebookPlacement";

// The editor is the heaviest thing on a dashboard and most visits never
// open the notebook, so it is fetched on the first tap rather than shipped
// with every page.
const NotebookDialog = dynamic(() => import("./NotebookDialog"), { ssr: false });

/** How long after landing the hint appears, and how long it stays. */
const HINT_DELAY_MS = 1200;
const HINT_SHOW_MS = 7000;
/** How much of the notebook stays on screen when it steps into the edge:
 *  inside the page's own side margin, so the strip never touches a card --
 *  16px on a phone, 24px from `sm`. */
const TUCK_VISIBLE_PX = { phone: 11, wide: 22 };

/**
 * The notebook's floating button: a small closed notebook in the bottom-right
 * corner of every dashboard screen, above the phone's tab bar.
 *
 * Small on purpose -- it is a side tool, not the screen's main action -- and it
 * gets out of the way by itself: anything else that claims the bottom of the
 * screen carries `data-notebook-avoid` (toasts, the cookie card, the
 * live-updates banner, the booking wizard's pinned Continue / Pay bar, the
 * assessment's action bar), and the button lifts above it, or tucks into the
 * right edge when lifting would cost half the screen (`placeNotebook`).
 *
 * For its first few visits it says what it is for in a small bubble beside it
 * ("Use me for quick notes..."), which fades by itself and never again once
 * the notebook has been opened (`mr-notebook-hint-v1`, a per-browser
 * convenience read in a mount effect so the server render never depends on it).
 *
 * Drawn from boxes rather than an icon, on purpose -- it is the cover of the
 * thing it opens (same colour, same band, same ribbon), so the opening
 * animation reads as that object getting bigger and then being opened.
 * Literal colours throughout: a notebook is teal with cream pages whatever
 * the dashboard's own theme is doing.
 *
 * Not rendered while an admin is signed in as the person (the gate says so):
 * a notebook is private to its owner, so the admin is not offered a button
 * that could only refuse them.
 */
export default function NotebookLauncher() {
  return (
    <WithDashboardExtras
      render={(extras) =>
        extras.notebook.enabled ? <Launcher ownerFirstName={extras.notebook.ownerFirstName} /> : null
      }
    />
  );
}

function readHint(): string | null {
  try {
    return window.localStorage.getItem(NOTEBOOK_HINT_KEY);
  } catch {
    return "opened"; // storage blocked: never nag
  }
}

function writeHint(value: string) {
  try {
    window.localStorage.setItem(NOTEBOOK_HINT_KEY, value);
  } catch {
    /* storage blocked: the hint simply shows again next time */
  }
}

function toBox(r: DOMRect): Box {
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
}

function Launcher({ ownerFirstName }: { ownerFirstName: string | null }) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(false);
  const [hover, setHover] = useState(false);
  const [placement, setPlacement] = useState({ lift: 0, tucked: false, overControl: false, tuckShift: 0 });
  const anchorRef = useRef<HTMLDivElement>(null);

  // The first-visits hint.
  useEffect(() => {
    const stored = readHint();
    if (!shouldShowNotebookHint(stored)) return;
    const show = window.setTimeout(() => {
      setHint(true);
      writeHint(nextNotebookHintValue(stored));
    }, HINT_DELAY_MS);
    const hide = window.setTimeout(() => setHint(false), HINT_DELAY_MS + HINT_SHOW_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, []);

  // The tip is a nudge, never in the way: the moment the person scrolls or
  // taps anywhere else, it goes, so it can't sit over something they are
  // reading or reaching for.
  useEffect(() => {
    if (!hint) return;
    const startY = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - startY) > 24) setHint(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) setHint(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [hint]);

  // Keep out of the way of anything else pinned to the bottom of the screen.
  const measure = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rest = toBox(anchor.getBoundingClientRect());
    const obstacles: Box[] = [];
    document.querySelectorAll<HTMLElement>("[data-notebook-avoid]").forEach((el) => {
      obstacles.push(toBox(el.getBoundingClientRect()));
    });
    // What is under the button where it would sit (lifted, not tucked): the
    // first thing at its centre and at its left edge that is not the
    // notebook itself. A link, a button or a field there means it would
    // cover something the person can tap.
    const lifted = placeNotebook(rest, obstacles, window.innerHeight);
    // A 3 x 3 grid over its whole face, reaching a few px past the box: the
    // notebook is drawn tilted, so its corners poke out of its rectangle,
    // and a control can clip just a corner.
    const xs = [rest.left - 3, (rest.left + rest.right) / 2, rest.right + 3];
    const ys = [rest.top - 3, (rest.top + rest.bottom) / 2, rest.bottom + 3].map((v) => v - lifted.lift);
    const coversControl = xs.flatMap((x) => ys.map((py) => [x, py])).some(([x, py]) => {
      const under = document.elementsFromPoint(x, py).find((el) => !anchorRef.current?.contains(el));
      return !!under?.closest("a[href], button, input, select, textarea, [role='button'], [data-notebook-avoid]");
    });
    const next = {
      ...(coversControl ? placeNotebook(rest, obstacles, window.innerHeight, true) : lifted),
      // Tucked only because of what is under it (not because a pinned bar
      // left no room): the first-visit tip may hold it out for a moment.
      overControl: coversControl && !lifted.tucked,
      // How far to slide right so that exactly TUCK_VISIBLE_PX of it stays on
      // screen, measured from where it rests -- it rests further from the
      // edge on a tablet or laptop than on a phone.
      tuckShift: Math.max(
        0,
        Math.round(window.innerWidth - rest.left - (window.innerWidth < 640 ? TUCK_VISIBLE_PX.phone : TUCK_VISIBLE_PX.wide))
      ),
    };
    setPlacement((prev) =>
      prev.lift === next.lift &&
      prev.tucked === next.tucked &&
      prev.overControl === next.overControl &&
      prev.tuckShift === next.tuckShift
        ? prev
        : next
    );
  }, []);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Toasts, banners and pinned bars come and go without a scroll.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    const settle = window.setInterval(schedule, 1500);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      window.clearInterval(settle);
    };
  }, [measure]);

  function openNotebook() {
    setHint(false);
    writeHint("opened");
    setOpen(true);
  }

  // While the first-visit tip is up it stays out so the tip can be read; the
  // tip itself goes on the first scroll or tap, and then the tuck applies.
  const tucked = placement.tucked && !hover && !(hint && placement.overControl);
  const bubbleVisible = (hint || hover) && !open && !tucked;

  return (
    <>
      {/* The resting place: never transformed, so it is what gets measured. */}
      <div
        ref={anchorRef}
        className="pointer-events-none fixed bottom-[calc(1rem+var(--app-bottom-inset,0px))] right-4 z-30 h-[52px] w-[44px] print:hidden sm:right-6 lg:bottom-6 lg:right-6 lg:h-[60px] lg:w-[50px]"
      >
        <div
          className="pointer-events-auto absolute inset-0 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out"
          style={{ transform: `translate(${tucked ? `${placement.tuckShift}px` : "0"}, ${-placement.lift}px)` }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onFocus={() => setHover(true)}
          onBlur={() => setHover(false)}
        >
          {bubbleVisible && (
            <div
              role="note"
              id="notebook-hint"
              className="mr-notebook-hint absolute bottom-1 right-[calc(100%+10px)] w-max max-w-[min(15rem,calc(100vw-6rem))] rounded-2xl bg-slate-900 px-3.5 py-2.5 text-[13px] font-medium leading-snug text-white shadow-lg"
            >
              Use me for quick notes. A few words, short and to the point.
              {hint && (
                <button
                  type="button"
                  onClick={() => setHint(false)}
                  aria-label="Hide this tip"
                  className="-my-1 -mr-1.5 ml-1.5 inline-grid h-6 w-6 place-items-center rounded-full align-middle text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <i aria-hidden className="fa-solid fa-xmark text-[11px]" />
                </button>
              )}
              <span
                aria-hidden="true"
                className="absolute -right-1.5 bottom-4 h-3 w-3 rotate-45 rounded-[2px] bg-slate-900"
              ></span>
            </div>
          )}
          <button
            type="button"
            onClick={openNotebook}
            aria-label="Open my notebook"
            aria-haspopup="dialog"
            aria-describedby={bubbleVisible ? "notebook-hint" : undefined}
            title="My notebook"
            data-testid="notebook-button"
            className="group absolute inset-0 block -rotate-6 focus-visible:outline-none motion-safe:transition-transform motion-safe:duration-200 hover:-rotate-2 hover:scale-105 active:scale-95"
          >
            {/* page edges */}
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-[10%] right-0 top-[4%] rounded-[3px_8px_8px_3px] border border-[#d6cfbd] bg-[#fbf7ec]"
            ></span>
            {/* cover */}
            <span
              aria-hidden="true"
              className="absolute bottom-[3%] left-0 right-[6%] top-0 rounded-[4px_9px_9px_4px] bg-[#0f766e] shadow-[0_8px_16px_rgba(15,23,42,0.28),0_2px_4px_rgba(15,23,42,0.2)] ring-teal-300 group-focus-visible:ring-4"
            ></span>
            {/* spine */}
            <span
              aria-hidden="true"
              className="absolute bottom-[3%] left-0 top-0 w-[15%] rounded-l-[4px] bg-[#115e59]"
            ></span>
            {/* elastic band */}
            <span aria-hidden="true" className="absolute bottom-[3%] left-[70%] top-0 w-[8%] bg-[#134e4a]"></span>
            {/* label */}
            <span
              aria-hidden="true"
              className="absolute left-[25%] top-[22%] flex h-[22%] w-[37%] flex-col justify-center gap-[2px] rounded-[2px] bg-[#fbf7ec] px-[3px]"
            >
              <span className="h-[2px] rounded-full bg-[#94a3b8]"></span>
              <span className="h-[2px] w-1/2 rounded-full bg-[#94a3b8]"></span>
            </span>
            {/* ribbon */}
            <span aria-hidden="true" className="absolute -bottom-[10%] left-[40%] h-[16%] w-[12%] bg-[#d97706]"></span>
          </button>
        </div>
      </div>
      {open && <NotebookDialog ownerFirstName={ownerFirstName} onClose={() => setOpen(false)} />}
    </>
  );
}
