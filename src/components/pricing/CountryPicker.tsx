"use client";

import { COUNTRIES, HOME_COUNTRY, HOME_CURRENCY, currencySymbol } from "@/lib/countryPricing";
import { usePricing } from "@/components/pricing/PricingProvider";

/**
 * "Where are you?" in the footer: the visitor's own choice of country,
 * which sets the currency every price is shown in.
 *
 * Shown only when an admin allows visitors to choose (Catalog -> Countries &
 * currency) and local prices are on. India first, then every country priced
 * locally (with its currency), then the rest -- a country nobody has priced
 * shows rupees, and choosing it still matters for home visits.
 */
export default function CountryPicker() {
  const { pickerVisible, ready, country, pricing, localRows, chooseCountry } = usePricing();
  if (!pickerVisible || !ready) return null;

  const priced = new Set(localRows.map((r) => r.code));
  const pricedCountries = COUNTRIES.filter((c) => priced.has(c.code));
  const otherCountries = COUNTRIES.filter((c) => !priced.has(c.code));
  const currency = pricing?.currency ?? HOME_CURRENCY;

  return (
    <label className="mt-2 inline-flex items-center gap-2 text-[11px] text-slate-400">
      <i aria-hidden="true" className="fa-solid fa-globe text-slate-500" />
      <span className="sr-only">Your country</span>
      <select
        data-testid="country-picker"
        value={country}
        // Every price re-renders at once; the checkout reads the same
        // cookie on its next request.
        onChange={(e) => chooseCountry(e.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-[11px] font-semibold text-slate-200 focus:border-teal-500 focus:outline-none"
      >
        <option value={HOME_COUNTRY}>India · ₹ INR</option>
        {pricedCountries.length > 0 && (
          <optgroup label="Local prices">
            {pricedCountries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} · {currencySymbol(c.currency)} {c.currency}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Other countries (prices in ₹)">
          {otherCountries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </optgroup>
      </select>
      <span aria-hidden="true">Prices in {currency}</span>
    </label>
  );
}
