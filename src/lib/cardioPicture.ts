import type { CardioView } from "@/lib/cardioProfile";
import { predictionLine } from "@/lib/cardioProfile";
import type { Voice } from "@/lib/progressView";

// The geometry and words behind the Heart and lung rehabilitation page's
// condition picture (Health Profile redesign, phase 6b): the six-minute-walk
// track and the oxygen bar. Pure, so the screens only draw.

export type WalkTrackModel = {
  /** The scale's far end in metres. */
  max: number;
  first: { value: number; pct: number } | null;
  latest: { value: number; pct: number } | null;
  predicted: { value: number; pct: number; percentText: string | null } | null;
  /** "% of predicted" or the "needs ..." / "couldn't check" line. */
  predictionText: string | null;
  /** "A change of about 25 to 35 metres is a real one; you have gained 145." */
  changeText: string | null;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function walkTrack(
  view: Pick<CardioView, "walk" | "predictionNeeds" | "measuresFailed" | "personFailed">,
  voice: Voice
): WalkTrackModel | null {
  const { latest, first, prediction } = view.walk;
  if (!latest) return null;
  const predicted = prediction.status === "ok" ? prediction.predictedMetres : null;
  const top = Math.max(latest.value, first?.value ?? 0, predicted ?? 0);
  const max = Math.max(300, Math.ceil((top * 1.1) / 100) * 100);
  const pct = (v: number) => clamp((v / max) * 100, 0, 100);
  const hasFirst = !!first && first.measurementId !== latest.measurementId;
  const gain = hasFirst ? latest.value - first!.value : null;
  const you = voice === "patient";
  let changeText: string | null = null;
  if (gain !== null) {
    const verb = gain >= 0 ? (you ? "you have gained" : "gained") : you ? "you are down" : "down";
    changeText = `A change of about 25 to 35 metres is a real one; ${verb} ${Math.abs(gain)}.`;
  }
  return {
    max,
    first: hasFirst ? { value: first!.value, pct: pct(first!.value) } : null,
    latest: { value: latest.value, pct: pct(latest.value) },
    predicted:
      prediction.status === "ok"
        ? { value: prediction.predictedMetres, pct: pct(prediction.predictedMetres), percentText: prediction.percent !== null ? `${prediction.percent}%` : null }
        : null,
    predictionText: predictionLine(view, voice),
    changeText,
  };
}

export type OxygenBarModel = {
  min: number;
  max: number;
  limit: { percent: number; pct: number };
  rest: { value: number; pct: number } | null;
  lowest: { value: number; pct: number } | null;
  /** The marker is off the left of the scale (a reading under `min`). */
  restBelowScale: boolean;
  lowestBelowScale: boolean;
};

/** The oxygen scale: 80 to 100, the patient's OWN stop limit marked. */
export function oxygenBar(view: Pick<CardioView, "limit" | "vitals">): OxygenBarModel {
  const min = 80;
  const max = 100;
  const pct = (v: number) => clamp(((v - min) / (max - min)) * 100, 0, 100);
  const rest = view.vitals.spo2Rest;
  const lowest = view.vitals.spo2Lowest;
  return {
    min,
    max,
    limit: { percent: view.limit.percent, pct: pct(view.limit.percent) },
    rest: rest ? { value: rest.value, pct: pct(rest.value) } : null,
    lowest: lowest ? { value: lowest.value, pct: pct(lowest.value) } : null,
    restBelowScale: !!rest && rest.value < min,
    lowestBelowScale: !!lowest && lowest.value < min,
  };
}

/** The stop-at-once list, in the reader's words. The patient's copy is
 *  gentle ("if you notice ... stop and rest, and tell your physiotherapist")
 *  and names THEIR oxygen limit instead of "the stop limit". */
export function stopAtOnceItems(items: readonly string[], limitPercent: number, voice: Voice): string[] {
  return items.map((item) => {
    if (!/oxygen dropping below the stop limit/i.test(item)) return item;
    return voice === "patient" ? `Your oxygen reading falls below ${limitPercent}%` : `Oxygen below the patient's stop limit (${limitPercent}%)`;
  });
}
