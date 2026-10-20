import { formatClinicDate, formatClinicDateTime } from "@/lib/formatDateTime";
import {
  BERG_BAND_LABEL,
  BERG_BAND_MEANING,
  BERG_ITEMS,
  BERG_MAX,
  BILATERAL_SECTIONS,
  EXAM_SIDES,
  GAIT_SPEED_LABEL,
  NEURO_ROWS,
  NEURO_SCALES,
  TUG_FALL_RISK_SECONDS,
  asymmetries,
  changeId,
  compareNeuroExams,
  gaitAidLabels,
  gaitPatternLabels,
  neuroHeadline,
  scaleOption,
  sectionTallies,
  type ExamSide,
  type NeuroChange,
  type NeuroScaleKey,
  type ParsedNeuroAssessment,
} from "@/lib/neuroExam";

type Voice = "patient" | "clinician";

const SIDE_LABEL: Record<ExamSide, string> = { left: "Left", right: "Right" };

const DIRECTION_STYLE: Record<NeuroChange["direction"], { glyph: string; className: string; word: string }> = {
  better: { glyph: "fa-arrow-trend-up", className: "text-emerald-700", word: "better than last time" },
  worse: { glyph: "fa-arrow-trend-down", className: "text-red-700", word: "worse than last time" },
  changed: { glyph: "fa-arrows-left-right", className: "text-slate-600", word: "different from last time" },
};

function meaningFor(scale: NeuroScaleKey, value: string, voice: Voice): string {
  const option = scaleOption(scale, value);
  if (!option) return "";
  return voice === "patient" ? (option.patientMeaning ?? option.meaning) : option.meaning;
}

/**
 * One neurological examination, read-only: the headline figures, what moved
 * since the exam before it, and every finding that was examined -- with
 * each grade's meaning printed beside it, so nobody has to remember what a
 * "1+" on the Modified Ashworth Scale is.
 *
 * Rows that were not examined are counted, never listed as blanks: a wall
 * of dashes buries the five findings that matter, and "6 not tested" is the
 * honest version of the same information.
 *
 * Shared by the therapist's chart, the patient's Health Profile and the
 * admin's condition detail, branching every sentence on `voice` rather than
 * keeping a copy per surface.
 */
export default function NeuroExamSummary({
  exam,
  previous,
  voice,
}: {
  exam: ParsedNeuroAssessment;
  previous: ParsedNeuroAssessment | null;
  voice: Voice;
}) {
  const clinician = voice === "clinician";
  const { findings } = exam;
  const headline = neuroHeadline(findings);
  const tallies = sectionTallies(findings);
  const asymmetric = new Set(asymmetries(findings).map((a) => a.rowKey));
  const changes = previous ? compareNeuroExams(findings, previous.findings) : [];
  const changeById = new Map(changes.map((c) => [c.id, c]));
  const better = changes.filter((c) => c.direction === "better");
  const worse = changes.filter((c) => c.direction === "worse");
  const other = changes.filter((c) => c.direction === "changed");

  const tiles: {
    label: string;
    value: string;
    note: string;
    tone: "good" | "warn" | "bad" | "neutral";
    change?: NeuroChange;
  }[] = [];
  if (headline.berg) {
    tiles.push({
      label: clinician ? "Berg Balance Scale" : "Balance score",
      value: `${headline.berg.total}/${BERG_MAX}`,
      note: `${BERG_BAND_LABEL[headline.berg.band]} - ${BERG_BAND_MEANING[headline.berg.band].split(": ")[1]}`,
      tone: headline.berg.band === "low" ? "good" : headline.berg.band === "medium" ? "warn" : "bad",
      change: changeById.get("balance.bergTotal"),
    });
  }
  if (headline.tug) {
    tiles.push({
      label: clinician ? "Timed Up and Go" : "Stand, walk and sit",
      value: `${headline.tug.seconds} s`,
      note: headline.tug.atRisk
        ? `${TUG_FALL_RISK_SECONDS} s or more - raised fall risk`
        : `Under ${TUG_FALL_RISK_SECONDS} s - below the fall-risk line`,
      tone: headline.tug.atRisk ? "warn" : "good",
      change: changeById.get("gait.tugSeconds"),
    });
  }
  if (headline.walk) {
    tiles.push({
      label: clinician ? "Gait speed (10 m walk)" : "Walking speed",
      value: `${headline.walk.speed} m/s`,
      note: `${headline.walk.seconds} s for 10 m - ${GAIT_SPEED_LABEL[headline.walk.band].split(" (")[0].toLowerCase()}`,
      tone: headline.walk.band === "community" ? "good" : headline.walk.band === "limited" ? "warn" : "bad",
      change: changeById.get("gait.tenMetreWalkSeconds"),
    });
  }
  if (clinician && headline.testedCount > 0) {
    tiles.push({
      label: "Side to side",
      value: String(headline.asymmetryCount),
      note:
        headline.asymmetryCount === 0
          ? "No left-right difference"
          : `${headline.asymmetryCount === 1 ? "finding differs" : "findings differ"} between sides${
              headline.predominantSide ? ` - ${headline.predominantSide} more affected` : ""
            }`,
      tone: headline.asymmetryCount === 0 ? "good" : "warn",
    });
  }
  const TILE_TONE = {
    good: "border-emerald-200 bg-emerald-50/60",
    warn: "border-amber-200 bg-amber-50/60",
    bad: "border-red-200 bg-red-50/60",
    neutral: "border-slate-200 bg-slate-50",
  } as const;

  const { balance, gait } = findings;
  const balanceRows: { label: string; value: string; meaning: string; id: string }[] = [];
  if (balance.romberg) {
    balanceRows.push({ id: "balance.romberg", label: "Romberg", value: scaleOption("romberg", balance.romberg)?.short ?? "", meaning: meaningFor("romberg", balance.romberg, voice) });
  }
  if (balance.sitting) {
    balanceRows.push({ id: "balance.sitting", label: clinician ? "Sitting balance" : "Balance sitting", value: scaleOption("balance_grade", balance.sitting)?.short ?? "", meaning: meaningFor("balance_grade", balance.sitting, voice) });
  }
  if (balance.standing) {
    balanceRows.push({ id: "balance.standing", label: clinician ? "Standing balance" : "Balance standing", value: scaleOption("balance_grade", balance.standing)?.short ?? "", meaning: meaningFor("balance_grade", balance.standing, voice) });
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">
        Examined {formatClinicDateTime(exam.createdAt)}
        {clinician ? ` - recorded by the ${exam.submittedByRole === "admin" ? "clinic's admin" : "therapist"}` : ""}
        {previous ? `. Compared with ${formatClinicDate(previous.createdAt)}.` : ". The first examination on record."}
      </p>

      {tiles.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          {tiles.map((tile) => (
            <li key={tile.label} className={`rounded-xl border px-3 py-2.5 ${TILE_TONE[tile.tone]}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{tile.label}</p>
              <p className="font-display text-xl font-bold text-slate-900">
                {tile.value}
                {tile.change && <ChangeMark change={tile.change} />}
              </p>
              <p className="text-[11px] leading-snug text-slate-600">{tile.note}</p>
            </li>
          ))}
        </ul>
      )}

      {previous && (
        <section aria-label={clinician ? "Change since the previous examination" : "What has changed"} className="rounded-xl border border-slate-200 bg-white p-3.5">
          <h4 className="text-sm font-bold text-slate-800">
            Since {formatClinicDate(previous.createdAt)}
          </h4>
          {changes.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              {clinician
                ? "Nothing recorded at both examinations has changed."
                : "No change in anything your therapist checked both times."}
            </p>
          ) : (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <ChangeList title={`Better (${better.length})`} items={better} tone="better" />
              <ChangeList title={`Worse (${worse.length})`} items={worse} tone="worse" />
              {other.length > 0 && (
                <div className="sm:col-span-2">
                  <ChangeList title={`Different (${other.length})`} items={other} tone="changed" />
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {BILATERAL_SECTIONS.map((section) => {
        const rows = NEURO_ROWS.filter((r) => r.section.key === section.key && findings.bilateral[r.key]);
        if (rows.length === 0) return null;
        const tally = tallies[section.key];
        const untested = tally.rows - tally.tested;
        return (
          <section key={section.key} aria-labelledby={`neuro-sum-${exam.id}-${section.key}`}>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
              <h4 id={`neuro-sum-${exam.id}-${section.key}`} className="text-sm font-bold text-slate-800">
                {clinician ? section.title : section.patientTitle}
              </h4>
              <p className="text-[11px] text-slate-500">
                {clinician ? `${NEURO_SCALES[section.scale].name} · ` : ""}
                {tally.abnormal === 0 ? "all normal" : `${tally.abnormal} not normal`}
                {untested > 0 ? ` · ${untested} not tested` : ""}
              </p>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full table-fixed text-left text-xs">
                <caption className="sr-only">
                  {section.title}, left and right{previous ? ", with change since the previous examination" : ""}
                </caption>
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600">
                  <tr>
                    <th scope="col" className="w-[38%] px-2.5 py-1.5 font-semibold">
                      {clinician ? "Finding" : "What was checked"}
                    </th>
                    {EXAM_SIDES.map((side) => (
                      <th key={side} scope="col" className="px-2.5 py-1.5 font-semibold">
                        {SIDE_LABEL[side]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => {
                    const sides = findings.bilateral[row.key];
                    return (
                      <tr key={row.key} className="align-top">
                        <th scope="row" className="px-2.5 py-2 font-semibold text-slate-700 [overflow-wrap:anywhere]">
                          {row.group !== "Tests" && section.key === "sensation" && (
                            <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{row.group}</span>
                          )}
                          {row.label}
                          {row.detail && <span className="ml-1 font-normal text-slate-500">{row.detail}</span>}
                          {clinician && asymmetric.has(row.key) && (
                            <span className="ml-1.5 inline-block rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-800">
                              L≠R
                            </span>
                          )}
                        </th>
                        {EXAM_SIDES.map((side) => {
                          const value = sides[side];
                          const change = changeById.get(changeId(row.key, side));
                          if (!value) {
                            return (
                              <td key={side} className="px-2.5 py-2 text-slate-500">
                                Not tested
                              </td>
                            );
                          }
                          const abnormal = value !== NEURO_SCALES[row.scale].normal;
                          return (
                            <td key={side} className="px-2.5 py-2">
                              <span className={`font-bold ${abnormal ? "text-amber-800" : "text-slate-800"}`}>
                                {scaleOption(row.scale, value)?.short ?? value}
                              </span>
                              {change && <ChangeMark change={change} />}
                              <span className="block text-[11px] leading-snug text-slate-500 [overflow-wrap:anywhere]">
                                {meaningFor(row.scale, value, voice)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {(balanceRows.length > 0 || balance.bergTotal !== undefined) && (
        <section aria-label="Balance">
          <h4 className="mb-1.5 text-sm font-bold text-slate-800">Balance</h4>
          <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {balanceRows.map((row) => (
              <div key={row.id} className="grid grid-cols-[minmax(0,38%)_1fr] gap-2 px-2.5 py-2 text-xs">
                <dt className="font-semibold text-slate-700">{row.label}</dt>
                <dd>
                  <span className="font-bold text-slate-800">{row.value}</span>
                  {changeById.get(row.id) && <ChangeMark change={changeById.get(row.id)!} />}
                  <span className="block text-[11px] text-slate-500">{row.meaning}</span>
                </dd>
              </div>
            ))}
            {balance.bergTotal !== undefined && (
              <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-2 px-2.5 py-2 text-xs">
                <dt className="font-semibold text-slate-700">{clinician ? "Berg Balance Scale" : "Balance score"}</dt>
                <dd>
                  <span className="font-bold text-slate-800">
                    {balance.bergTotal}/{BERG_MAX}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    {BERG_BAND_LABEL[headline.berg!.band]} ({BERG_BAND_MEANING[headline.berg!.band]})
                  </span>
                  {clinician && balance.bergItems && (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer rounded text-[11px] font-semibold text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                        Item scores ({Object.keys(balance.bergItems).length} of {BERG_ITEMS.length})
                      </summary>
                      <ul className="mt-1 grid gap-x-4 gap-y-0.5 text-[11px] text-slate-600 sm:grid-cols-2">
                        {BERG_ITEMS.map((item) => (
                          <li key={item.key} className="flex justify-between gap-2">
                            <span>
                              {item.key}. {item.label}
                            </span>
                            <span className="font-semibold text-slate-800">{balance.bergItems?.[item.key] ?? "–"}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {(gait.patterns.length > 0 || gait.aids.length > 0 || gait.tenMetreWalkSeconds !== undefined || gait.tugSeconds !== undefined) && (
        <section aria-label={clinician ? "Gait" : "Walking"}>
          <h4 className="mb-1.5 text-sm font-bold text-slate-800">{clinician ? "Gait" : "Walking"}</h4>
          <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-xs">
            {gait.patterns.length > 0 && (
              <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-2 px-2.5 py-2">
                <dt className="font-semibold text-slate-700">{clinician ? "Pattern" : "How you walk"}</dt>
                <dd className="font-bold text-slate-800">{gaitPatternLabels(gait.patterns).join(", ")}</dd>
              </div>
            )}
            {gait.aids.length > 0 && (
              <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-2 px-2.5 py-2">
                <dt className="font-semibold text-slate-700">{clinician ? "Aids" : "What helps you walk"}</dt>
                <dd className="font-bold text-slate-800">
                  {gaitAidLabels(gait.aids).join(", ")}
                  {changeById.get("gait.aids") && <ChangeMark change={changeById.get("gait.aids")!} />}
                </dd>
              </div>
            )}
            {gait.tenMetreWalkSeconds !== undefined && (
              <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-2 px-2.5 py-2">
                <dt className="font-semibold text-slate-700">10-metre walk</dt>
                <dd>
                  <span className="font-bold text-slate-800">{gait.tenMetreWalkSeconds} s</span>
                  {changeById.get("gait.tenMetreWalkSeconds") && <ChangeMark change={changeById.get("gait.tenMetreWalkSeconds")!} />}
                  <span className="block text-[11px] text-slate-500">{headline.walk && GAIT_SPEED_LABEL[headline.walk.band]}</span>
                </dd>
              </div>
            )}
            {gait.tugSeconds !== undefined && (
              <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-2 px-2.5 py-2">
                <dt className="font-semibold text-slate-700">Timed Up and Go</dt>
                <dd>
                  <span className="font-bold text-slate-800">{gait.tugSeconds} s</span>
                  {changeById.get("gait.tugSeconds") && <ChangeMark change={changeById.get("gait.tugSeconds")!} />}
                  <span className="block text-[11px] text-slate-500">
                    {headline.tug?.atRisk ? `${TUG_FALL_RISK_SECONDS} s or more - raised fall risk` : `Under ${TUG_FALL_RISK_SECONDS} s`}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {findings.notes && (
        <section aria-label={clinician ? "Clinical notes" : "Your therapist's notes"}>
          <h4 className="mb-1 text-sm font-bold text-slate-800">{clinician ? "Clinical notes" : "Your therapist's notes"}</h4>
          <p className="whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-700 [overflow-wrap:anywhere]">
            {findings.notes}
          </p>
        </section>
      )}
    </div>
  );
}

function ChangeMark({ change }: { change: NeuroChange }) {
  const style = DIRECTION_STYLE[change.direction];
  return (
    <span className={`ml-1.5 inline-flex items-center gap-1 text-[11px] font-semibold ${style.className}`}>
      <i aria-hidden className={`fa-solid ${style.glyph} text-[10px]`} />
      <span>
        was {change.from}
        <span className="sr-only">, {style.word}</span>
      </span>
    </span>
  );
}

function ChangeList({ title, items, tone }: { title: string; items: NeuroChange[]; tone: NeuroChange["direction"] }) {
  const style = DIRECTION_STYLE[tone];
  return (
    <div>
      <p className={`text-[11px] font-bold uppercase tracking-wide ${style.className}`}>
        <i aria-hidden className={`fa-solid ${style.glyph} mr-1`} />
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-0.5 text-xs text-slate-500">None</p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
          {items.map((c) => (
            <li key={c.id} className="[overflow-wrap:anywhere]">
              {c.label}: <span className="text-slate-500">{c.from}</span> → <span className="font-semibold">{c.to}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
