// The country a signed-in patient is priced for, from their own account.
//
// Prices outside India used to follow the request alone: the visitor's pick,
// else the host's location header. A patient in India on a VPN, travelling,
// or -- as the staging test found -- testing from a cloud browser in the US
// was charged the US price with its +100% markup, and the therapist's share
// was worked out on it. A signed-in patient's account says where they are
// from more reliably than an IP address does, and the one place an account
// records a country is the phone number's calling code.
//
// Dependency-free apart from the phone parser, so it is unit-tested.

import { parsePhoneNumberFromString } from "libphonenumber-js";

/** "IN" for "+919876543210", "US" for "+12025550123"; a legacy bare number
 *  (no "+") was always entered as Indian. Null when nothing can be read. */
export function countryFromStoredPhone(phone: string | null | undefined): string | null {
  const value = (phone ?? "").trim();
  if (!value) return null;
  const parsed = parsePhoneNumberFromString(value, value.startsWith("+") ? undefined : "IN");
  return parsed?.country ?? null;
}
