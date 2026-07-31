import {
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";

// Historical phone numbers were saved as bare digits with no country code at
// all (there was no country selector before this), so a value with no "+"
// prefix is assumed to be an Indian number — where the business is based —
// rather than guessing from the current viewer's browser locale.
export const LEGACY_DEFAULT_COUNTRY: CountryCode = "IN";

export function flagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export function detectBrowserCountry(): CountryCode {
  if (typeof navigator === "undefined") return LEGACY_DEFAULT_COUNTRY;
  try {
    const locale = navigator.languages?.[0] ?? navigator.language;
    const region = new Intl.Locale(locale).maximize().region;
    if (region && (getCountries() as string[]).includes(region)) {
      return region as CountryCode;
    }
  } catch {
    // Intl.Locale unsupported, or no resolvable region — fall through to
    // the default below.
  }
  return LEGACY_DEFAULT_COUNTRY;
}

export type CountryOption = { code: CountryCode; name: string; dialCode: string };

export const COUNTRY_OPTIONS: CountryOption[] = getCountries()
  .map((code) => {
    let name: string = code;
    try {
      name = new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
    } catch {
      // Intl.DisplayNames unsupported — fall back to the bare ISO code.
    }
    return { code, name, dialCode: getCountryCallingCode(code) };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

/** Splits a stored phone value (E.164 or legacy bare digits) into a country + national number for pre-filling the picker. */
export function splitStoredPhone(value: string): { country: CountryCode; national: string } {
  const trimmed = value.trim();
  if (!trimmed) return { country: detectBrowserCountry(), national: "" };
  const parsed = parsePhoneNumberFromString(
    trimmed,
    trimmed.startsWith("+") ? undefined : LEGACY_DEFAULT_COUNTRY
  );
  if (parsed) {
    return {
      country: (parsed.country as CountryCode) ?? LEGACY_DEFAULT_COUNTRY,
      national: parsed.nationalNumber,
    };
  }
  return { country: LEGACY_DEFAULT_COUNTRY, national: trimmed.replace(/\D/g, "") };
}

export function composePhone(country: CountryCode, national: string): string {
  const digits = national.replace(/\D/g, "");
  return digits ? `+${getCountryCallingCode(country)}${digits}` : "";
}

/** Validates a stored phone value (E.164 or legacy bare digits) the same way the picker does. */
export function isValidStoredPhone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return isValidPhoneNumber(trimmed, trimmed.startsWith("+") ? undefined : LEGACY_DEFAULT_COUNTRY);
}

export { isValidPhoneNumber };
export type { CountryCode };
