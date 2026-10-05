"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useSaveSetting } from "@/lib/useSaveSetting";

// Settings -> Booking Rules: what a new patient who signs up inside a
// booking wizard can reach before they have paid. Both wizards (online and
// home visit) read these two values; see src/lib/paymentTries.ts and
// purge_abandoned_booking_accounts() in schema.sql.
export default function CheckoutAccessSection({
  paymentTriesBeforeAccess,
  abandonedBookingAccountDays,
}: {
  paymentTriesBeforeAccess: number;
  abandonedBookingAccountDays: number;
}) {
  return (
    <>
      <div className="pt-2">
        <h2 className="font-bold text-lg text-slate-900">New patients at checkout</h2>
        <p className="text-xs text-slate-500 mt-1">
          Someone who signs up while booking gets an account straight away, but it stays locked -
          no dashboard - until they pay. These apply to online sessions and home visits alike.
        </p>
      </div>
      <NumberSetting
        settingKey="payment_tries_before_access"
        title="Payment tries before the dashboard opens"
        help="If paying keeps not going through - the payment window closed, a card declined, or our own error - the account opens after this many tries, and the dashboard asks them to pay there. A successful payment opens it at once."
        unit="tries"
        label="Payment tries before the dashboard opens"
        min={1}
        max={10}
        initial={paymentTriesBeforeAccess}
      />
      <NumberSetting
        settingKey="abandoned_booking_account_days"
        title="Delete unpaid booking accounts after"
        help="A locked account that never paid and never used up its tries is deleted after this many days, along with its unpaid booking. Until then it is listed under People - Abandoned checkouts. Accounts made at Register are never touched."
        unit="days"
        label="Days before an unpaid booking account is deleted"
        min={1}
        max={90}
        initial={abandonedBookingAccountDays}
      />
    </>
  );
}

function NumberSetting({
  settingKey,
  title,
  help,
  unit,
  label,
  min,
  max,
  initial,
}: {
  settingKey: "payment_tries_before_access" | "abandoned_booking_account_days";
  title: string;
  help: string;
  unit: string;
  label: string;
  min: number;
  max: number;
  initial: number;
}) {
  const saveSetting = useSaveSetting();
  const router = useRouter();
  const helpId = useId();
  const [input, setInput] = useState(String(initial));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    const value = Math.floor(Number(input));
    setSaved(false);
    if (!Number.isFinite(value) || value < min || value > max) {
      setError(`Choose a whole number from ${min} to ${max}.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await saveSetting(settingKey, value);
        setInput(String(value));
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <h3 className="font-bold text-sm text-slate-800">{title}</h3>
      <p id={helpId} className="text-xs text-slate-500 mt-1 max-w-md">
        {help}
      </p>
      <div className="flex items-center gap-2 mt-3">
        <input
          type="number"
          min={min}
          max={max}
          step={1}
          aria-label={label}
          aria-describedby={helpId}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setSaved(false);
          }}
          className="w-24 text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
        />
        <span className="text-xs text-slate-500">{unit}</span>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        {saved && <span className="text-[11px] text-teal-700 font-semibold">Saved.</span>}
      </div>
      {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
    </div>
  );
}
