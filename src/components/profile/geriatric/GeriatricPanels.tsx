import RecordTestButton, { type RecordSetup } from "@/components/profile/progress/RecordTestButton";
import { formatClinicDate } from "@/lib/formatDateTime";
import type { HomeSafetyView } from "@/lib/geriatricProfile";
import type { KatzView, OrthostaticFlag } from "@/lib/geriatricRisk";
import { GERI_KATZ_ACTIVITIES } from "@/lib/intakeGeriatric";
import type { SteadiBadge, SteadiCard } from "@/lib/steadiCards";
import type { Voice } from "@/lib/progressView";

const CARD = "min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4";

const BADGE_TONE: Record<SteadiBadge, string> = {
  safer: "border-emerald-300 bg-emerald-50 text-emerald-900",
  close: "border-amber-300 bg-amber-50 text-amber-900",
  not_yet: "border-rose-300 bg-rose-50 text-rose-900",
  not_done: "border-slate-300 bg-slate-50 text-slate-800",
  no_norm: "border-slate-300 bg-slate-50 text-slate-800",
};

/**
 * The four STEADI tests as cards: each with the reading, a badge that says
 * where it sits against its own line (never colour alone: the badge is a
 * sentence), a little bar with the safer line marked and the reading before.
 * A test not done is "Not done yet", never a failure.
 */
export function SteadiTestCards({ cards, voice }: { cards: SteadiCard[]; voice: Voice }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2" data-testid="steadi-cards">
      {cards.map((c) => (
        <li key={c.key} className={CARD} data-testid={`steadi-${c.key}`} data-badge={c.badge}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="min-w-0 text-sm font-bold text-slate-900 [overflow-wrap:anywhere]">{c.name}</h3>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${BADGE_TONE[c.badge]}`}>{c.badgeText}</span>
          </div>
          <p className="mt-1.5 font-display text-2xl font-extrabold leading-tight text-slate-900 [overflow-wrap:anywhere]">
            {c.valueText ?? <span className="text-base font-semibold text-slate-700">{voice === "patient" ? "Your physiotherapist will do this one" : "Not recorded"}</span>}
          </p>
          {c.position !== null && (
            <div aria-hidden className="relative mt-3 h-2 rounded-full bg-slate-200">
              <div className="absolute inset-y-0 right-0 rounded-r-full bg-emerald-200" style={{ width: `${(1 - c.linePosition) * 100}%` }} />
              <span className="absolute -top-1 h-4 w-0.5" style={{ left: `${c.linePosition * 100}%`, background: "var(--chart-axis)" }} />
              <span className="absolute -top-1 h-4 w-2.5 rounded" style={{ left: `calc(${c.position * 100}% - 5px)`, background: "var(--chart-ink)", boxShadow: "0 0 0 2px var(--background)" }} />
            </div>
          )}
          <p className="mt-2 text-xs text-slate-700">{c.lineText}</p>
          {c.note && <p className="mt-1 text-xs font-semibold text-slate-800">{c.note}</p>}
          {c.wasText && <p className="mt-1 text-xs text-slate-700">{c.wasText}</p>}
        </li>
      ))}
    </ul>
  );
}

/** The Katz six everyday activities: which are done without help. */
export function DailyLivingCard({ katz, voice }: { katz: KatzView | null; voice: Voice }) {
  const patient = voice === "patient";
  return (
    <section aria-label="Daily living" className={CARD} data-testid="daily-living">
      <h3 className="font-display text-base font-bold text-slate-900">Daily living</h3>
      {katz ? (
        <>
          <p className="mt-0.5 text-sm text-slate-800">
            <span className="font-display text-xl font-extrabold text-slate-900">{katz.score} of 6</span>{" "}
            {patient ? "done on your own" : "done without help (Katz)"}
          </p>
          {katz.needsHelpWith.length > 0 || katz.score === 6 ? (
            <ul className="mt-2 divide-y divide-slate-100">
              {GERI_KATZ_ACTIVITIES.map((a) => {
                const needs = katz.needsHelpWith.includes(a);
                return (
                  <li key={a} className="flex min-h-[36px] items-center justify-between gap-3 py-1.5 text-sm">
                    <span className="text-slate-900">{a}</span>
                    <span className={`shrink-0 text-xs font-semibold ${needs ? "text-amber-900" : "text-emerald-800"}`}>
                      <i aria-hidden className={`fa-solid ${needs ? "fa-hand-holding-hand" : "fa-check"} mr-1`} />
                      {needs ? (patient ? "Needs a hand" : "Needs help") : patient ? "On your own" : "Independent"}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-700">Which ones need a hand was not written down with this score.</p>
          )}
          <p className="mt-2 text-xs text-slate-700">
            {katz.source === "measurement" && katz.measuredAt
              ? `From the score sheet on ${formatClinicDate(katz.measuredAt)}.`
              : patient
                ? "From what you told us when you filled in your record."
                : "From the intake answer; a score sheet from a session replaces it."}
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-slate-700">{patient ? "Not asked yet." : "Not asked yet: no intake answer and no score sheet."}</p>
      )}
    </section>
  );
}

/** The home safety checklist: the latest snapshot, n of N done, with dates. */
export function HomeSafetyCard({ view, voice, record }: { view: HomeSafetyView; voice: Voice; record: RecordSetup | null }) {
  const patient = voice === "patient";
  return (
    <section aria-label="Home safety" className={CARD} data-testid="home-safety">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-display text-base font-bold text-slate-900">{patient ? "Making your home safer" : "Home safety check"}</h3>
        {view.status === "recorded" && (
          <p className="text-sm font-semibold text-slate-900" data-testid="home-safety-count">
            {view.done} of {view.total} done
          </p>
        )}
      </div>
      {view.status === "recorded" ? (
        <>
          <p className="mt-0.5 text-xs text-slate-700">
            Checked {formatClinicDate(view.measuredAt)}
            {view.previous ? `. Before that: ${view.previous.done} of ${view.previous.total} on ${formatClinicDate(view.previous.measuredAt)}` : ""}.
          </p>
          <ul className="mt-2 divide-y divide-slate-100">
            {view.items.map((i) => (
              <li key={i.key} className="flex min-h-[36px] items-center justify-between gap-3 py-1.5 text-sm">
                <span className={i.done ? "text-slate-900" : "text-slate-800"}>{i.label}</span>
                <span className={`shrink-0 text-xs font-semibold ${i.done ? "text-emerald-800" : "text-slate-700"}`}>
                  <i aria-hidden className={`fa-solid ${i.done ? "fa-check" : "fa-minus"} mr-1`} />
                  {i.done ? (i.newlyDone ? "Done since last time" : "Done") : "Not yet"}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-1 text-sm text-slate-700">
          {patient ? "Your physiotherapist will go through the small changes that make a home safer, and tick them off here." : "No home safety check recorded yet."}
        </p>
      )}
      {record && (
        <div className="mt-3">
          <RecordTestButton setup={record} measureKey="home_safety_check" label={view.status === "recorded" ? "Record a new check" : "Record the home safety check"} icon="fa-house-circle-check" />
        </div>
      )}
    </section>
  );
}

/**
 * Standing blood pressure: the latest result, and - when it is positive -
 * the "tell the patient's doctor" guidance. The profile records the result
 * and says who it is for; it never says what it means for the heart.
 * Whether the doctor has been told is not recorded here (the registry has
 * no place for it without a schema change); the guidance stands until the
 * physiotherapist has passed it on.
 */
export function OrthostaticCard({ flag, voice, record }: { flag: OrthostaticFlag; voice: Voice; record: RecordSetup | null }) {
  const patient = voice === "patient";
  return (
    <section aria-label="Blood pressure on standing" className={CARD} data-testid="orthostatic">
      <h3 className="font-display text-base font-bold text-slate-900">{patient ? "Blood pressure when you stand up" : "Standing blood pressure"}</h3>
      {flag.status === "not_recorded" ? (
        <p className="mt-1 text-sm text-slate-700">{patient ? "Not checked yet." : "Not recorded yet."}</p>
      ) : (
        <>
          <p className="mt-0.5 text-sm text-slate-800">
            {patient ? "Your top number fell" : "Top number fell"} <span className="font-display text-xl font-extrabold text-slate-900">{flag.systolicDrop}</span>
            {flag.diastolicDrop !== null && <>, bottom number {flag.diastolicDrop}</>} on standing ({formatClinicDate(flag.measuredAt)}).
          </p>
          {flag.status === "positive" ? (
            <p role="status" className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950" data-testid="orthostatic-tell-doctor">
              {patient
                ? "This is worth telling your doctor. Your physiotherapist will pass it on, and you can mention it at your next visit."
                : "Positive (a fall of 20 in the top number or 10 in the bottom). Tell the patient's doctor."}
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-800">{patient ? "No important drop." : "Negative: no fall of 20 in the top number or 10 in the bottom."}</p>
          )}
        </>
      )}
      {record && (
        <div className="mt-3">
          <RecordTestButton setup={record} measureKey="orthostatic_bp" label="Record standing blood pressure" icon="fa-heart-pulse" />
        </div>
      )}
    </section>
  );
}
