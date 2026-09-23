"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import {
  parseAdminScreenHref,
  useAdminScreenNavigation,
} from "@/lib/adminScreenNavigation";

// A link to another screen of the admin dashboard.
//
// Inside the shell it switches screens in place, because they are all
// already rendered -- see `adminScreenNavigation.tsx` for why that matters.
// Outside it (the patient/therapist detail routes, which render some of the
// same components) it is an ordinary anchor and navigates for real.
//
// It is an `<a>` rather than a `<Link>` on purpose: what it mostly does is
// *not* navigate, and a Link would prefetch a 1.7MB dashboard payload for
// every one of these on screen. The one case that does navigate is a hard
// load of a page the person is not on, which is exactly what an anchor
// does.

export default function AdminScreenLink({
  href,
  children,
  ...rest
}: {
  href: string;
  children: ReactNode;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const nav = useAdminScreenNavigation();
  const screen = parseAdminScreenHref(href);

  return (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        rest.onClick?.(event);
        if (event.defaultPrevented) return;
        if (!nav || !screen) return;
        // A modified click is the person asking for a second tab or a saved
        // address, and both want the real href.
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        nav.goToScreen(screen.section, screen.tab, screen.view);
      }}
    >
      {children}
    </a>
  );
}
