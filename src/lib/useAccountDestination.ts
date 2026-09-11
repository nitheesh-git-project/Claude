"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Where a signed-in account's own "take me back in" link should go.
 *
 * Two surfaces need this answer -- the public Navbar and the booking
 * wizard's exit link -- and they must not be able to disagree about it. A
 * patient mid-booking who is told "Back to Dashboard" and lands on the
 * pending-approval screen has been sent somewhere the label did not name,
 * which is the failure this whole resolution exists to avoid.
 *
 * Resolved on the client, deliberately: `/book` and `/book-home-visit` are
 * ISR-cached (`revalidate = 300`), and reading the session on the server
 * would force every one of those pages dynamic to answer a question about
 * one link. Same trade the Navbar already makes.
 *
 * `null` means "no signed-in account, or we do not know yet", and it starts
 * there -- fail-closed, so a slow or failed lookup shows the signed-out
 * wording rather than briefly offering a destination to somebody it should
 * not.
 *
 * The href is **direct**, never `/dashboard`: that route resolves the role
 * server-side and is the right answer for a plain "go to my dashboard"
 * button, but it cannot skip the bounce an unapproved account then takes
 * through its own dashboard to /pending-approval. Naming the real
 * destination is what keeps the label honest.
 */
export type AccountDestination = { href: string; label: string } | null;

export type AccountState = {
  /** null until the session has been read. Callers that swap one control for
   *  another need this separately from `destination`, which is also null
   *  while loading -- conflating the two showed Sign In to somebody who was
   *  already signed in. */
  signedIn: boolean | null;
  destination: AccountDestination;
};

export function useAccountDestination(): AccountState {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [destination, setDestination] = useState<AccountDestination>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      setSignedIn(!!session?.user);
      if (!session?.user) {
        setDestination(null);
        return;
      }
      // Its own isolated lookup: only this one link needs it, so a query
      // failure here must not take anything else down with it.
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, approved, active")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!active || !profile?.role) return;

      // Suspended is checked first: an account can be both suspended and
      // unapproved, and the suspension is the one that decides where they
      // land.
      if (profile.active === false) {
        setDestination({ href: "/account-suspended", label: "Account suspended" });
      } else if (profile.approved === false) {
        setDestination({ href: "/pending-approval", label: "Approval pending" });
      } else {
        setDestination({ href: "/dashboard", label: "Go to Dashboard" });
      }
    }

    load();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => load());

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { signedIn, destination };
}
