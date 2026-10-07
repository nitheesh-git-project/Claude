"use client";

import { usePricing } from "@/components/pricing/PricingProvider";

/**
 * A price, in the visitor's currency.
 *
 * `list` is a catalogue price -- raised, converted and rounded up to .99 for
 * a country priced locally. `amount` is anything worked out from one (a
 * discount, a total the server quoted), converted to the nearest unit. For
 * an Indian visitor both print exactly what formatInr always has.
 */
export default function Price({
  paise,
  kind = "list",
  className,
}: {
  paise: number;
  kind?: "list" | "amount";
  className?: string;
}) {
  const { formatList, formatAmount } = usePricing();
  return (
    <span data-price="" className={className} suppressHydrationWarning>
      {kind === "list" ? formatList(paise) : formatAmount(paise)}
    </span>
  );
}

/** "Save X" between a compare-at price and the price, in the visitor's
 *  currency -- worked out from the two figures they read. */
export function PriceSaving({
  comparePaise,
  pricePaise,
  className,
}: {
  comparePaise: number;
  pricePaise: number;
  className?: string;
}) {
  const { formatSaving } = usePricing();
  return (
    <span data-price="" className={className} suppressHydrationWarning>
      {formatSaving(comparePaise, pricePaise)}
    </span>
  );
}
