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

// IANA timezone -> ISO country code, for the timezones real visitors are
// actually likely to be in. Timezone is a far more reliable "where is this
// person" signal than navigator.language/languages: a huge share of
// browsers/OSes are left on an English (often en-US) language setting
// regardless of the user's real location, but very few people run their
// system clock on the wrong timezone. Not exhaustive (IANA has ~400 zones)
// — covers the markets this app is realistically used from; anything not
// listed here falls through to the language-based guess below.
const TIMEZONE_COUNTRY: Record<string, CountryCode> = {
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Dubai": "AE",
  "Asia/Karachi": "PK",
  "Asia/Dhaka": "BD",
  "Asia/Kathmandu": "NP",
  "Asia/Colombo": "LK",
  "Asia/Kabul": "AF",
  "Asia/Singapore": "SG",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Bangkok": "TH",
  "Asia/Jakarta": "ID",
  "Asia/Manila": "PH",
  "Asia/Ho_Chi_Minh": "VN",
  "Asia/Hong_Kong": "HK",
  "Asia/Shanghai": "CN",
  "Asia/Taipei": "TW",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Riyadh": "SA",
  "Asia/Qatar": "QA",
  "Asia/Kuwait": "KW",
  "Asia/Bahrain": "BH",
  "Asia/Muscat": "OM",
  "Asia/Tel_Aviv": "IL",
  "Asia/Jerusalem": "IL",
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Madrid": "ES",
  "Europe/Rome": "IT",
  "Europe/Amsterdam": "NL",
  "Europe/Brussels": "BE",
  "Europe/Zurich": "CH",
  "Europe/Lisbon": "PT",
  "Europe/Moscow": "RU",
  "Africa/Cairo": "EG",
  "Africa/Lagos": "NG",
  "Africa/Nairobi": "KE",
  "Africa/Johannesburg": "ZA",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Anchorage": "US",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Mexico_City": "MX",
  "America/Sao_Paulo": "BR",
  "America/Bogota": "CO",
  "America/Argentina/Buenos_Aires": "AR",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Perth": "AU",
  "Pacific/Auckland": "NZ",
};

function detectTimezoneCountry(): CountryCode | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TIMEZONE_COUNTRY[zone] ?? null;
  } catch {
    return null;
  }
}

export function detectBrowserCountry(): CountryCode {
  if (typeof navigator === "undefined") return LEGACY_DEFAULT_COUNTRY;

  const timezoneCountry = detectTimezoneCountry();
  if (timezoneCountry) return timezoneCountry;

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
