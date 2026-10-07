"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  COUNTRY_COOKIE,
  HOME_COUNTRY,
  formatMinor,
  formatPaiseForCountry,
  formatPriceForCountry,
  priceForCountry,
  homeVisitsOfferedIn,
  isPricedLocally,
  resolveCountry,
  type CountryPricing,
} from "@/lib/countryPricing";
import { DEBUG_COUNTRY_COOKIE, GEO_COOKIE } from "@/lib/countryGeo";

export type PricingConfig = {
  internationalEnabled: boolean;
  pickerEnabled: boolean;
  homeVisitOutsideIndia: boolean;
  /** Only the countries that price locally -- what the browser needs. */
  rows: CountryPricing[];
  /** Whether the debug bar (and its country override) is on. */
  debug: boolean;
};

type PricingValue = {
  /** The visitor's country. "IN" until the browser has read its cookies. */
  country: string;
  /** The row prices are made with, or null for rupees. */
  pricing: CountryPricing | null;
  /** Whether the browser has resolved the country yet. */
  ready: boolean;
  homeVisitsOffered: boolean;
  pickerEnabled: boolean;
  /** Whether the visitor's country picker should show at all: the picker is
   *  allowed and local prices are on (with them off it changes nothing a
   *  visitor can see but the home-visit rule). */
  pickerVisible: boolean;
  /** The countries priced locally, for the picker to name their currency. */
  localRows: CountryPricing[];
  /** A list price (a catalog price) in the visitor's currency. */
  formatList: (paise: number) => string;
  /** Any other amount (a discount, a total) in the visitor's currency. */
  formatAmount: (paise: number) => string;
  /** "Save X" between two list prices: the gap between the two figures the
   *  visitor reads, so the three numbers on a card add up. */
  formatSaving: (comparePaise: number, pricePaise: number) => string;
  /** The visitor's own choice, from the country picker. */
  chooseCountry: (code: string) => void;
};

const fallback: PricingValue = {
  country: HOME_COUNTRY,
  pricing: null,
  ready: true,
  homeVisitsOffered: true,
  pickerEnabled: false,
  pickerVisible: false,
  localRows: [],
  formatList: (p) => formatPriceForCountry(p, null),
  formatAmount: (p) => formatPaiseForCountry(p, null),
  formatSaving: (c, p) => savingFor(c, p, null),
  chooseCountry: () => {},
};

function savingFor(comparePaise: number, pricePaise: number, pricing: CountryPricing | null): string {
  const compare = priceForCountry(comparePaise, pricing);
  const price = priceForCountry(pricePaise, pricing);
  return formatMinor(Math.max(0, compare.displayMinor - price.displayMinor), price.currency);
}

const PricingContext = createContext<PricingValue>(fallback);

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Prices in the visitor's currency, on pages the server renders once for
 * everybody.
 *
 * The public pages are statically cached, so the HTML always carries rupees.
 * After mount this reads the country the proxy put in a cookie (or the one
 * the visitor or the debug bar chose) and every `<Price>` re-renders in that
 * currency. A foreign visitor never sees the rupee figure first: the head
 * script in the root layout hides prices until this has run (see
 * src/lib/pricingPendingScript.ts). Display only -- every checkout route prices the
 * request again on the server.
 */
export function PricingProvider({ config, children }: { config: PricingConfig; children: ReactNode }) {
  const [country, setCountry] = useState(HOME_COUNTRY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const forced = config.debug ? readCookie(DEBUG_COUNTRY_COOKIE) : null;
    const resolved = forced
      ? resolveCountry({ chosen: forced, detected: null, pickerAllowed: true })
      : resolveCountry({
          chosen: readCookie(COUNTRY_COOKIE),
          detected: readCookie(GEO_COOKIE),
          pickerAllowed: config.pickerEnabled,
        });
    // Reading cookies is a mount-time sync with the browser, not derived
    // state: there is no document on the server to read them from.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCountry(resolved);
    setReady(true);
    delete document.documentElement.dataset.pricingPending;
  }, [config.debug, config.pickerEnabled]);

  const chooseCountry = useCallback((code: string) => {
    const next = resolveCountry({ chosen: code, detected: null, pickerAllowed: true });
    document.cookie = `${COUNTRY_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setCountry(next);
  }, []);

  const value = useMemo<PricingValue>(() => {
    const row = config.rows.find((r) => r.code === country) ?? null;
    const pricing = config.internationalEnabled && isPricedLocally(row) ? row : null;
    return {
      country,
      pricing,
      ready,
      homeVisitsOffered: homeVisitsOfferedIn(country, config.homeVisitOutsideIndia),
      pickerEnabled: config.pickerEnabled,
      pickerVisible: config.pickerEnabled && config.internationalEnabled,
      localRows: config.internationalEnabled ? config.rows.filter(isPricedLocally) : [],
      formatList: (p) => formatPriceForCountry(p, pricing),
      formatAmount: (p) => formatPaiseForCountry(p, pricing),
      formatSaving: (c, p) => savingFor(c, p, pricing),
      chooseCountry,
    };
  }, [config, country, ready, chooseCountry]);

  return <PricingContext.Provider value={value}>{children}</PricingContext.Provider>;
}

export function usePricing(): PricingValue {
  return useContext(PricingContext);
}
