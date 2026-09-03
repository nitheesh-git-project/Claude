"use client";

import { useEffect, useMemo, useRef, useTransition } from "react";
import { useRouter as useNextRouter } from "next/navigation";
import { usePendingWork } from "@/lib/pendingWork";

/**
 * `next/navigation`'s router, with the waiting made visible.
 *
 * `router.refresh()` and `router.push()` return immediately and do their work
 * afterwards, off screen. Every call site in this app followed one of two
 * shapes and both left the person staring at a page that had stopped
 * responding to them:
 *
 *   setLoading(false); router.refresh();   // button looks done, page is not
 *   router.push(href);                     // nothing happens for a second
 *
 * On the admin dashboard that gap is the whole Server Component re-running --
 * around fifty queries and every screen's markup, not just the visible one.
 *
 * Every call runs inside a React transition, which is the only thing that
 * knows when a navigation has actually landed: `isPending` stays true from
 * the tap until the new HTML is applied. A timer could not do this honestly
 * -- it would either lie early on a slow refresh or leave a bar up after a
 * fast one -- and a bar that disagrees with the page is worse than none.
 *
 * It is a drop-in: same object shape, same method names, so a file adopts it
 * by changing which module `useRouter` comes from and nothing else. Prefer it
 * over `next/navigation`'s in any client component that mutates and
 * refreshes.
 */
export function useRouter() {
  const router = useNextRouter();
  const { begin } = usePendingWork();
  const [isPending, startTransition] = useTransition();
  const releaseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (isPending && !releaseRef.current) {
      releaseRef.current = begin();
    } else if (!isPending && releaseRef.current) {
      releaseRef.current();
      releaseRef.current = null;
    }
  }, [isPending, begin]);

  // A component unmounted mid-navigation (the commonest case: the row whose
  // button was tapped is gone from the refreshed list) must not leave the
  // count -- and so the bar -- stuck on.
  useEffect(() => {
    return () => {
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, []);

  return useMemo(() => {
    return {
      ...router,
      refresh: () => startTransition(() => router.refresh()),
      push: ((href: string, options?: Parameters<typeof router.push>[1]) =>
        startTransition(() => router.push(href, options))) as typeof router.push,
      replace: ((href: string, options?: Parameters<typeof router.replace>[1]) =>
        startTransition(() => router.replace(href, options))) as typeof router.replace,
      back: () => startTransition(() => router.back()),
      forward: () => startTransition(() => router.forward()),
    };
  }, [router, startTransition]);
}
