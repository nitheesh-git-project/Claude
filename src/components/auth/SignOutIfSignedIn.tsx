"use client";

import SignOutButton from "@/components/auth/SignOutButton";
import { useAccountDestination } from "@/lib/useAccountDestination";

/**
 * Sign Out, only for somebody who is signed in. /account-suspended is a
 * public address: the proxy sends a suspended account there, but anyone can
 * open it, and a Sign Out button for a visitor with no session is a control
 * that does nothing. Until the session check answers it renders nothing, so
 * it never flashes for the signed-out case.
 */
export default function SignOutIfSignedIn() {
  const { signedIn } = useAccountDestination();
  if (signedIn !== true) return null;
  return (
    <div className="mt-4">
      <SignOutButton />
    </div>
  );
}
