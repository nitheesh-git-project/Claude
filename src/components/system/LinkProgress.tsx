"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { usePendingWork } from "@/lib/pendingWork";

// Every link says it heard you, wherever it was written.
//
// The teal bar had three separate ways of being told about a navigation:
// `useRouter` for ones the app starts in code, `ProgressLink` for a `<Link>`
// that opted in, and `useLeavingPage` for a plain anchor a shell opted in
// with. Anything written without one of those -- a bare `next/link`, a plain
// `<a>` inside a card, a stat tile linking to a filtered list -- went
// entirely unannounced: the person tapped, nothing changed for as long as
// the server took, and then the screen swapped. On the admin dashboard that
// is seconds, and it is read as a button that does not work.
//
// Three ways of reporting the same event is also three places to forget, so
// this is the fourth and it covers the rest: one capture-phase click
// listener at the root, which sees every anchor in the app including ones
// written after this file. Four rules:
//
// 1. **It only counts a click the browser will actually act on.** A modified
//    click (new tab, download, a different `target`), a link off-site, a
//    bare `#hash` on the page you are already on: all left alone.
// 2. **A prevented click releases immediately.** A control can call
//    `preventDefault` in its own handler -- the admin dashboard's screen
//    links do exactly that -- and the capture listener runs first, so the
//    outcome is only known once the event has finished dispatching.
// 3. **It is released by the URL changing**, which is the one signal that
//    means "the navigation landed" for a soft navigation. A hard navigation
//    never gets there and does not need to: the document is torn down and
//    the bar with it, the same reasoning `useLeavingPage` documents.
// 4. **It gives up after a while.** A navigation cancelled by something this
//    listener cannot see must not leave a bar running for ever, so the
//    marker expires -- generously, because the case it exists for is a slow
//    render rather than a fast one.

/** Long enough for the slowest real render here (the admin dashboard, ~4s),
 *  short enough that a stuck marker is not a permanent bar. */
const GIVE_UP_AFTER_MS = 20000;

function isPlainLeftClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.defaultPrevented
  );
}

export default function LinkProgress() {
  const { begin } = usePendingWork();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const releaseRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<number | null>(null);

  const release = useCallback(() => {
    releaseRef.current?.();
    releaseRef.current = null;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!isPlainLeftClick(event)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      let destination: URL;
      try {
        destination = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (destination.origin !== window.location.origin) return;
      // Same page, or the same page plus a fragment: nothing is being
      // waited for.
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      ) {
        return;
      }

      release();
      releaseRef.current = begin();
      timerRef.current = window.setTimeout(release, GIVE_UP_AFTER_MS);

      // The anchor's own handlers run after this capture listener, so
      // whether the click was actually cancelled is only knowable once the
      // event has finished dispatching.
      window.setTimeout(() => {
        if (event.defaultPrevented) release();
      }, 0);
    }

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      release();
    };
  }, [begin, release]);

  // The URL changing is what "we got there" looks like from here.
  useEffect(() => {
    release();
  }, [pathname, searchParams, release]);

  return null;
}
