// Prices for visitors outside India: the country list, the maths, and how
// an amount is printed in another currency. Kept free of React and of the
// database so every number on the admin screen and at checkout can be
// tested on its own.
//
// The model, decided with the owner:
//
//   * Money is still INR everywhere it is stored. Razorpay is charged INR,
//     refunds and payouts are INR, every report is INR.
//   * A country the clinic has switched on gets its own **list price**:
//     the Indian price raised by that country's percentage, converted at the
//     stored rate, then rounded **up** to end in .99 (or 9 for a currency
//     without cents). That rounded figure is what the visitor sees.
//   * What Razorpay is asked for is the INR equal of that rounded figure,
//     rounded up to the paisa -- so the amount seen and the amount paid are
//     the same money, and the rounding never works against the clinic.
//   * Anything derived from a list price (a discount, a total) is converted
//     to the nearest minor unit for display; the charge itself is always the
//     INR the server worked out.
//
// India is never in this table's hands: an Indian visitor sees the Indian
// price in rupees, unchanged.

import { formatInr } from "@/lib/formatMoney";

export const HOME_COUNTRY = "IN";
export const HOME_CURRENCY = "INR";

export type CountryInfo = {
  code: string;
  name: string;
  currency: string;
};

/**
 * The countries the admin screen lists, most-requested first by region.
 * The ISO 4217 currency is what Intl formats with; its symbol and decimal
 * places come from Intl, so nothing here can disagree with the browser.
 */
export const COUNTRIES: CountryInfo[] = [
  { code: "US", name: "United States", currency: "USD" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  { code: "CA", name: "Canada", currency: "CAD" },
  { code: "AU", name: "Australia", currency: "AUD" },
  { code: "NZ", name: "New Zealand", currency: "NZD" },
  { code: "AE", name: "United Arab Emirates", currency: "AED" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR" },
  { code: "QA", name: "Qatar", currency: "QAR" },
  { code: "KW", name: "Kuwait", currency: "KWD" },
  { code: "OM", name: "Oman", currency: "OMR" },
  { code: "BH", name: "Bahrain", currency: "BHD" },
  { code: "SG", name: "Singapore", currency: "SGD" },
  { code: "MY", name: "Malaysia", currency: "MYR" },
  { code: "HK", name: "Hong Kong", currency: "HKD" },
  { code: "JP", name: "Japan", currency: "JPY" },
  { code: "KR", name: "South Korea", currency: "KRW" },
  { code: "CN", name: "China", currency: "CNY" },
  { code: "TH", name: "Thailand", currency: "THB" },
  { code: "ID", name: "Indonesia", currency: "IDR" },
  { code: "PH", name: "Philippines", currency: "PHP" },
  { code: "LK", name: "Sri Lanka", currency: "LKR" },
  { code: "NP", name: "Nepal", currency: "NPR" },
  { code: "BD", name: "Bangladesh", currency: "BDT" },
  { code: "DE", name: "Germany", currency: "EUR" },
  { code: "FR", name: "France", currency: "EUR" },
  { code: "NL", name: "Netherlands", currency: "EUR" },
  { code: "IE", name: "Ireland", currency: "EUR" },
  { code: "IT", name: "Italy", currency: "EUR" },
  { code: "ES", name: "Spain", currency: "EUR" },
  { code: "CH", name: "Switzerland", currency: "CHF" },
  { code: "SE", name: "Sweden", currency: "SEK" },
  { code: "NO", name: "Norway", currency: "NOK" },
  { code: "DK", name: "Denmark", currency: "DKK" },
  { code: "ZA", name: "South Africa", currency: "ZAR" },
  { code: "KE", name: "Kenya", currency: "KES" },
  { code: "NG", name: "Nigeria", currency: "NGN" },
  { code: "BR", name: "Brazil", currency: "BRL" },
  { code: "MX", name: "Mexico", currency: "MXN" },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function countryInfo(code: string | null | undefined): CountryInfo | null {
  if (!code) return null;
  if (code.toUpperCase() === HOME_COUNTRY) return { code: HOME_COUNTRY, name: "India", currency: HOME_CURRENCY };
  return BY_CODE.get(code.toUpperCase()) ?? null;
}

/** A two-letter code shaped like ISO 3166-1, upper-cased, or null. */
export function normaliseCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/** How many minor units a currency has (2 for USD, 0 for JPY, 3 for KWD). */
export function currencyDecimals(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** One country's pricing as the admin set it. */
export type CountryPricing = {
  code: string;
  currency: string;
  /** Whether visitors from this country see their own currency. */
  enabled: boolean;
  /** 0-500: how much above the Indian price this country pays. */
  markupPercent: number;
  /** How many units of the local currency one rupee buys (USD ~0.012).
   *  Null until a rate has been fetched -- such a country cannot be
   *  switched on, and shows the Indian price if it somehow is. */
  unitsPerInr: number | null;
};

export const MAX_MARKUP_PERCENT = 500;

export function isValidMarkup(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_MARKUP_PERCENT;
}

/** Whether a configured country actually prices in its own currency. */
export function isPricedLocally(cfg: CountryPricing | null | undefined): cfg is CountryPricing & { unitsPerInr: number } {
  return !!cfg && cfg.enabled && cfg.code !== HOME_COUNTRY && typeof cfg.unitsPerInr === "number" && cfg.unitsPerInr > 0;
}

/**
 * Rounds a minor-unit amount up so it ends in .99 -- 10.35 -> 10.99, 10.99
 * stays, 11.00 -> 11.99. A currency without cents ends in 9 instead
 * (1,532 -> 1,539); one with three places ends in .990. Never rounds down.
 */
export function roundUpToNinetyNine(minor: number, decimals: number): number {
  const amount = Math.max(0, Math.ceil(minor));
  if (decimals === 0) {
    const tens = Math.floor(amount / 10);
    const candidate = tens * 10 + 9;
    return candidate >= amount ? candidate : candidate + 10;
  }
  const unit = 10 ** decimals;
  const ninetyNine = decimals === 2 ? 99 : Math.round(0.99 * unit);
  const whole = Math.floor(amount / unit);
  const candidate = whole * unit + ninetyNine;
  return candidate >= amount ? candidate : candidate + unit;
}

export type CountryPrice = {
  /** The Indian price raised by the country's percentage, in paise. */
  raisedPaise: number;
  /** `raisedPaise` converted, before rounding, in the local minor unit. */
  convertedMinor: number;
  /** What the visitor sees, in the local minor unit (ends in .99). */
  displayMinor: number;
  /** What Razorpay is asked for: the INR equal of `displayMinor`, rounded
   *  up to the paisa so the rounding never shortchanges the clinic. */
  chargePaise: number;
  currency: string;
  decimals: number;
};

/**
 * A list price for a country. `null` config, India, a switched-off country
 * or one without a rate all mean "the Indian price, in rupees".
 */
export function priceForCountry(basePaise: number, cfg: CountryPricing | null | undefined): CountryPrice {
  const base = Math.max(0, Math.round(basePaise));
  if (!isPricedLocally(cfg)) {
    return { raisedPaise: base, convertedMinor: base, displayMinor: base, chargePaise: base, currency: HOME_CURRENCY, decimals: 2 };
  }
  const decimals = currencyDecimals(cfg.currency);
  const raisedPaise = Math.round((base * (100 + cfg.markupPercent)) / 100);
  if (raisedPaise === 0) {
    return { raisedPaise: 0, convertedMinor: 0, displayMinor: 0, chargePaise: 0, currency: cfg.currency, decimals };
  }
  const convertedMinor = paiseToMinor(raisedPaise, cfg.unitsPerInr, decimals);
  const displayMinor = roundUpToNinetyNine(convertedMinor, decimals);
  const chargePaise = minorToPaiseUp(displayMinor, cfg.unitsPerInr, decimals);
  return { raisedPaise, convertedMinor, displayMinor, chargePaise, currency: cfg.currency, decimals };
}

/** Paise to the local minor unit, unrounded. */
function paiseToMinor(paise: number, unitsPerInr: number, decimals: number): number {
  return (paise / 100) * unitsPerInr * 10 ** decimals;
}

/** A local amount back to paise, rounded up. */
function minorToPaiseUp(minor: number, unitsPerInr: number, decimals: number): number {
  // A hair of tolerance so a float that is a rounding error above a whole
  // paisa does not cost the patient an extra paisa.
  return Math.ceil((minor / 10 ** decimals / unitsPerInr) * 100 - 1e-6);
}

/**
 * Any INR amount (a discount, a total built from a quoted list price) in
 * the local minor unit, to the nearest unit. Used for display only -- the
 * charge is always the INR the server resolved.
 */
export function convertPaiseForDisplay(paise: number, cfg: CountryPricing | null | undefined): { minor: number; currency: string; decimals: number } {
  if (!isPricedLocally(cfg)) return { minor: Math.round(paise), currency: HOME_CURRENCY, decimals: 2 };
  const decimals = currencyDecimals(cfg.currency);
  return { minor: Math.round(paiseToMinor(paise, cfg.unitsPerInr, decimals)), currency: cfg.currency, decimals };
}

/**
 * A minor-unit amount as the visitor's currency: "US$10.99", "£8.99",
 * "¥1,539", "₹499". Whole rupees print without decimals, as formatRupees
 * does, so an Indian visitor sees exactly what they always have.
 */
export function formatMinor(minor: number, currency: string): string {
  const decimals = currency === HOME_CURRENCY ? 2 : currencyDecimals(currency);
  const value = minor / 10 ** decimals;
  if (currency === HOME_CURRENCY) return formatInr(minor);
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(decimals)}`;
  }
}

/** The local symbol alone ("$", "£", "₹"), for labels. */
export function currencySymbol(currency: string): string {
  if (currency === HOME_CURRENCY) return "₹";
  try {
    const part = new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

/** A list price, formatted for the visitor's country. */
export function formatPriceForCountry(basePaise: number, cfg: CountryPricing | null | undefined): string {
  const p = priceForCountry(basePaise, cfg);
  return formatMinor(p.displayMinor, p.currency);
}

/** A derived INR amount, formatted for the visitor's country. */
export function formatPaiseForCountry(paise: number, cfg: CountryPricing | null | undefined): string {
  const c = convertPaiseForDisplay(paise, cfg);
  return formatMinor(c.minor, c.currency);
}

/**
 * Which country a request is priced for. The visitor's own choice wins when
 * the picker is allowed; otherwise the hosting platform's location header;
 * otherwise India. An unknown or unlisted code reads as India, so a country
 * nobody has configured is never priced by accident.
 */
export function resolveCountry(args: {
  chosen: string | null | undefined;
  detected: string | null | undefined;
  pickerAllowed: boolean;
}): string {
  const chosen = normaliseCountryCode(args.chosen);
  if (args.pickerAllowed && chosen && countryInfo(chosen)) return chosen;
  const detected = normaliseCountryCode(args.detected);
  if (detected && countryInfo(detected)) return detected;
  return HOME_COUNTRY;
}

/** The cookie the visitor's choice (and the debug bar's) is kept in. */
export const COUNTRY_COOKIE = "mr_country";

/** Whether home visits are offered to a visitor from `country`. */
export function homeVisitsOfferedIn(country: string, outsideIndiaAllowed: boolean): boolean {
  return country === HOME_COUNTRY || outsideIndiaAllowed;
}

/** What a home-visit route answers a visitor outside India. */
export const HOME_VISIT_OUTSIDE_INDIA_ERROR =
  "Home visits are only available in India. You can book a video consultation instead.";

/** How old a rate may get before the admin screen calls it stale. */
export const RATE_STALE_AFTER_HOURS = 24 * 7;

/** "just now", "3 hours ago", "2 days ago" -- how old the stored rates are. */
export function rateAgeLabel(fetchedAt: string | null | undefined, nowMs: number): string {
  if (!fetchedAt) return "never";
  const t = Date.parse(fetchedAt);
  if (Number.isNaN(t)) return "never";
  const minutes = Math.max(0, Math.floor((nowMs - t) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Whether stored rates are old enough to warn about (or missing). */
export function ratesAreStale(fetchedAt: string | null | undefined, nowMs: number): boolean {
  if (!fetchedAt) return true;
  const t = Date.parse(fetchedAt);
  return Number.isNaN(t) || nowMs - t > RATE_STALE_AFTER_HOURS * 3600_000;
}
