// What the Risk screen may say about the last detector sweep. Dependency-free
// so the one judgement that matters -- can an empty queue be read as "all
// clear"? -- is tested without rendering.
//
// The sweep's report is stored by runRiskSweep (riskDetectors.ts). An empty
// queue is only an all-clear when the last sweep ran every enabled rule, no
// read failed or hit its row cap, and every finding was written. Anything
// less is said in words, naming the rules, because "Nothing waiting" from a
// scan that did not run is the failure this exists to prevent.

export type SweepReportLike = {
  finishedAt: string;
  complete: boolean;
  failedRules: string[];
  unreachedRules: string[];
  truncatedRules: string[];
  unrecordedCount: number;
};

export type SweepSummary = {
  /** True only when an empty queue can honestly read as "nothing found". */
  trustworthy: boolean;
  /** Sentences for the notice, in reading order. Empty when trustworthy. */
  problems: string[];
};

function list(keys: string[], labelFor: (key: string) => string): string {
  const names = keys.map(labelFor);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function summariseRiskSweep(
  sweep: { report: SweepReportLike | null; readFailed: boolean },
  labelFor: (ruleKey: string) => string
): SweepSummary {
  if (sweep.readFailed) {
    return {
      trustworthy: false,
      problems: ["We couldn't read how the last check went, so an empty list here can't be taken as all clear."],
    };
  }
  const r = sweep.report;
  if (!r) {
    return {
      trustworthy: false,
      problems: ["The checks haven't finished a run yet, so an empty list here doesn't mean nothing was found."],
    };
  }
  if (r.complete) return { trustworthy: true, problems: [] };

  const problems: string[] = [];
  if (r.failedRules.length > 0) {
    problems.push(`Couldn't run: ${list(r.failedRules, labelFor)}. Their findings, if any, are missing.`);
  }
  if (r.unreachedRules.length > 0) {
    problems.push(
      `Not reached before the time limit: ${list(r.unreachedRules, labelFor)}. They run again on the next check.`
    );
  }
  if (r.truncatedRules.length > 0) {
    problems.push(
      `Checked only the most recent records: ${list(r.truncatedRules, labelFor)}. Older activity was not looked at.`
    );
  }
  if (r.unrecordedCount > 0) {
    problems.push(
      `${r.unrecordedCount === 1 ? "One finding" : `${r.unrecordedCount} findings`} couldn't be saved and ${
        r.unrecordedCount === 1 ? "isn't" : "aren't"
      } listed.`
    );
  }
  // complete=false with nothing named (should not happen) still must not
  // read as all clear.
  if (problems.length === 0) problems.push("The last check didn't complete.");
  return { trustworthy: false, problems };
}
