"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { useEffect, useRef, type ComponentProps } from "react";
import { usePendingWork } from "@/lib/pendingWork";
import AdminScreenLink from "@/components/admin/AdminScreenLink";
import {
  parseAdminScreenHref,
  useAdminScreenNavigation,
} from "@/lib/adminScreenNavigation";

// A <Link> that tells the teal bar it is going somewhere.
//
// `useRouter` (src/lib/useRouter.ts) covers every navigation this app starts
// in code, which is why the admin dashboard has always had the bar: it moves
// between screens with the History API and refreshes through that hook. The
// patient, therapist and hospital dashboards navigate by **real routes**, one
// `<Link>` per sidebar entry -- and a Link click never touches the router
// hook, so nothing told `PendingWorkProvider` anything. Those three sat on
// the old screen with no bar and no acknowledgement until the server render
// landed, which is the exact "reads as a dead click" failure the bar exists
// to remove, on three of the four dashboards.
//
// `useLinkStatus` is Next's own answer and it only works **inside** a Link,
// so the reporter is a child component rendering nothing rather than a hook
// this component could call directly.
//
// Prefetched navigations often resolve inside the bar's 220ms appear delay
// and correctly draw nothing at all. That is the same threshold every other
// caller gets: what this fixes is the slow one, where the page used to sit
// there saying nothing.
function LinkPendingReporter() {
  const { pending } = useLinkStatus();
  const { begin } = usePendingWork();
  const releaseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (pending && !releaseRef.current) {
      releaseRef.current = begin();
    } else if (!pending && releaseRef.current) {
      releaseRef.current();
      releaseRef.current = null;
    }
  }, [pending, begin]);

  // The link that was clicked is very often unmounted by the navigation it
  // started -- a sidebar entry replaced by the new page's own chrome -- so
  // without this the count, and the bar with it, would stick on.
  useEffect(() => {
    return () => {
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, []);

  return null;
}

export default function ProgressLink({
  children,
  ...props
}: ComponentProps<typeof Link>) {
  // Inside the admin dashboard, a link to another of its screens is not a
  // navigation at all -- every screen is already rendered, and the shell
  // switches between them with setState. Going through Next would throw the
  // rendered dashboard away and rebuild it from ~49 queries to show markup
  // that is already in the DOM, which is the multi-second dead tap this
  // component exists to report on. Better not to have it to report.
  const adminNav = useAdminScreenNavigation();
  const href = typeof props.href === "string" ? props.href : null;
  if (adminNav && href && parseAdminScreenHref(href)) {
    // `href` is replaced rather than spread through: Link's own href type is
    // wider than an anchor's, and this branch has already narrowed it to the
    // string case.
    const { href: _linkHref, ...rest } = props;
    void _linkHref;
    return (
      <AdminScreenLink href={href} {...rest}>
        {children}
      </AdminScreenLink>
    );
  }

  return (
    <Link {...props}>
      {children}
      <LinkPendingReporter />
    </Link>
  );
}
