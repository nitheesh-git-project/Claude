// How long the Pay tap takes to reach the Razorpay sheet, measured where the
// patient feels it.
//
// The booking wizards were rebuilt for speed (preloaded checkout.js, the
// quote and the order riding back on the create response, signup started a
// step early) -- and none of that is worth anything unless somebody can see
// the figure it moved. The browser times the tap, marks each stage as it
// finishes, and reports once, best-effort, to
// `/api/razorpay/checkout-timing`; System Health's **Checkout speed** check
// reads the rows back.
//
// The arithmetic is here, dependency-free, so what gets reported is
// unit-tested rather than trusted.

export type CheckoutFlow = "online" | "home_visit";
export type CheckoutStage = "signup" | "create" | "order";
/** How the tap ended. Only `opened` counts toward the speed figure: the
 *  other three never show a sheet, so timing them against it is meaningless. */
export type CheckoutOutcome = "opened" | "error" | "free" | "pay_later";

export const CHECKOUT_OUTCOMES: readonly CheckoutOutcome[] = ["opened", "error", "free", "pay_later"];
export const CHECKOUT_FLOWS: readonly CheckoutFlow[] = ["online", "home_visit"];
export const CHECKOUT_STAGES: readonly CheckoutStage[] = ["signup", "create", "order"];

/** Anything longer is a tab left in the background, not a measurement. */
export const MAX_CHECKOUT_TIMING_MS = 120_000;

export type CheckoutTimingReport = {
  flow: CheckoutFlow;
  newAccount: boolean;
  outcome: CheckoutOutcome;
  totalMs: number;
  /** Time spent in each stage that ran, in order. */
  stagesMs: Partial<Record<CheckoutStage, number>>;
};

/**
 * Turns the raw clock readings into a report: each stage's duration is the
 * time since the previous mark (or the tap), and nothing is negative, absurd,
 * or fractional. Null when the reading cannot be trusted at all.
 */
export function buildCheckoutTimingReport(args: {
  flow: CheckoutFlow;
  newAccount: boolean;
  outcome: CheckoutOutcome;
  startedAt: number;
  endedAt: number;
  marks: { stage: CheckoutStage; at: number }[];
}): CheckoutTimingReport | null {
  const totalMs = Math.round(args.endedAt - args.startedAt);
  if (!Number.isFinite(totalMs) || totalMs < 0 || totalMs > MAX_CHECKOUT_TIMING_MS) return null;
  const stagesMs: Partial<Record<CheckoutStage, number>> = {};
  let previous = args.startedAt;
  for (const mark of args.marks) {
    if (!Number.isFinite(mark.at) || mark.at < previous || mark.at > args.endedAt) continue;
    stagesMs[mark.stage] = Math.round(mark.at - previous);
    previous = mark.at;
  }
  return { flow: args.flow, newAccount: args.newAccount, outcome: args.outcome, totalMs, stagesMs };
}

/** The value at a percentile (0-100) of a list of durations, nearest-rank. */
export function percentileMs(values: number[], percentile: number): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const rank = Math.ceil((Math.min(100, Math.max(0, percentile)) / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

/**
 * A timer the wizard holds for one tap. `finish` reports once and then goes
 * quiet, so a callback firing twice (an error after a dismiss) cannot double
 * count. The clock is injectable for tests.
 */
export function startCheckoutTimer(
  init: { flow: CheckoutFlow; newAccount: boolean },
  options: {
    now?: () => number;
    send?: (report: CheckoutTimingReport) => void;
  } = {}
) {
  const now = options.now ?? (() => performance.now());
  const send = options.send ?? sendCheckoutTiming;
  const startedAt = now();
  const marks: { stage: CheckoutStage; at: number }[] = [];
  let finished = false;
  return {
    mark(stage: CheckoutStage) {
      if (!finished) marks.push({ stage, at: now() });
    },
    finish(outcome: CheckoutOutcome) {
      if (finished) return;
      finished = true;
      const report = buildCheckoutTimingReport({
        ...init,
        outcome,
        startedAt,
        endedAt: now(),
        marks,
      });
      if (report) send(report);
    },
  };
}

export type CheckoutTimer = ReturnType<typeof startCheckoutTimer>;

/** Best-effort: a lost measurement must never touch the payment itself. */
export function sendCheckoutTiming(report: CheckoutTimingReport): void {
  try {
    void fetch("/api/razorpay/checkout-timing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
      // Survives the page being left the moment the sheet opens.
      keepalive: true,
    }).catch(() => {});
  } catch {
    // fetch itself unavailable -- nothing to do.
  }
}
