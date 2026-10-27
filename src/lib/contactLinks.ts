// The clinic's WhatsApp number and phone as links the public pages can offer.
//
// `site_settings` ships both numbers as the literal "+91 XXXXX XXXXX" -- a
// placeholder for an admin to replace. The footer already refused to print it
// (a row of X's on the one page a hesitant patient looks for proof there is a
// real practice); the same reading now drives every other place a number can
// be tapped -- the menu chip, the sticky bar's secondary action, the hero and
// closing "Not sure which to book? WhatsApp us" lines. Unset means *absent*,
// never a dead link. Dependency-free so the rule is unit-tested.

/** An Indian mobile with its country code is twelve digits; the shipped
 *  placeholder has two. Seven is comfortably below any real number and far
 *  above any placeholder. */
const MIN_REAL_PHONE_DIGITS = 7;

export function hasRealPhone(value: string | null | undefined): boolean {
  return (value ?? "").replace(/[^0-9]/g, "").length >= MIN_REAL_PHONE_DIGITS;
}

export function hasRealEmail(value: string | null | undefined): boolean {
  return /.+@.+\..+/.test(value ?? "");
}

/** wa.me takes digits with the country code and no punctuation. */
export function digitsOnly(value: string | null | undefined, keepPlus = false): string {
  const digits = (value ?? "").replace(/[^0-9]/g, "");
  return keepPlus && value?.trim().startsWith("+") ? `+${digits}` : digits;
}

export const WHATSAPP_GREETING = "Hello, I'm not sure which to book.";

/** `https://wa.me/...`, or null while the number is unset. */
export function whatsappHref(number: string | null | undefined, text?: string): string | null {
  if (!hasRealPhone(number)) return null;
  const base = `https://wa.me/${digitsOnly(number)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** `tel:+91...`, or null while the number is unset. */
export function telHref(number: string | null | undefined): string | null {
  return hasRealPhone(number) ? `tel:${digitsOnly(number, true)}` : null;
}

/** What the public chrome is handed: only links that lead somewhere. */
export type PublicContactLinks = {
  whatsapp: string | null;
  call: string | null;
};

export function publicContactLinks(input: {
  whatsappNumber?: string | null;
  contactPhone?: string | null;
}): PublicContactLinks {
  return {
    whatsapp: whatsappHref(input.whatsappNumber, WHATSAPP_GREETING),
    call: telHref(input.contactPhone),
  };
}
