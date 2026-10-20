// Whether a "Staging smoke" run should check anything, and the one sentence
// that says why -- written to the job summary either way, so a run that did
// not check anything says so instead of reading as a skipped job.
//
// Why this exists (QA F-08): the workflow's job-level `if:` matched
// `github.event.deployment.ref == 'staging'`. Vercel's GitHub integration
// creates every non-production deployment with `ref` set to the commit SHA
// and `environment: "Preview"` -- staging's included -- so the ref was never
// "staging" and the job was skipped on every staging deployment, silently
// (run 38498440871, head 2128e833, 14 Oct: event deployment_status, branch
// staging, Preview, ref 2128e8339ef6...). Whether a deployment is staging's is
// now answered by asking GitHub whether its SHA is in the staging branch.
//
// Pure: the caller does the API read and passes its answer in.

/**
 * @param {{
 *   eventName: string,
 *   stagingUrl?: string,
 *   deployedSha?: string,
 *   environment?: string,
 *   compareStatus?: string | null,   // GitHub compare {sha}...staging: identical | ahead | behind | diverged
 *   compareError?: string | null,    // the compare read failed
 * }} input
 * @returns {{ run: boolean, fail: boolean, reason: string }}
 */
export function decideSmokeRun(input) {
  if (input.eventName === "workflow_dispatch") {
    // Somebody asked for a check: the smoke script itself fails when there
    // is no STAGING_URL, because "nothing was checked" is not a pass.
    return { run: true, fail: false, reason: "Manual run: checking STAGING_URL." };
  }
  if (input.eventName !== "deployment_status") {
    return { run: false, fail: false, reason: `Skipped: ${input.eventName} is not an event this check runs on.` };
  }
  const env = (input.environment ?? "").toLowerCase();
  if (env === "production") {
    return { run: false, fail: false, reason: "Skipped: a production deployment. This check never targets production." };
  }
  if (!input.deployedSha) {
    return { run: false, fail: true, reason: "Could not tell which commit was deployed (no deployment SHA), so nothing was checked." };
  }
  const short = input.deployedSha.slice(0, 8);
  if (input.compareError) {
    // "Couldn't check" is not "not staging": a red run is the honest answer.
    return {
      run: false,
      fail: true,
      reason: `Could not ask GitHub whether ${short} is on the staging branch (${input.compareError}), so nothing was checked.`,
    };
  }
  // compare {sha}...staging: "identical" = it is staging's head; "ahead" =
  // staging has moved on past it (a newer push raced this event), so it is
  // still staging's code. "behind"/"diverged" = not in staging -- a pull
  // request preview.
  const onStaging = input.compareStatus === "identical" || input.compareStatus === "ahead";
  if (!onStaging) {
    return {
      run: false,
      fail: false,
      reason: `Skipped: ${short} is not on the staging branch (compare: ${input.compareStatus ?? "unknown"}), so this is a pull-request preview.`,
    };
  }
  if (!input.stagingUrl) {
    return {
      run: false,
      fail: false,
      reason: `Skipped: ${short} is a staging deployment, but the repository variable STAGING_URL is not set, so there is nothing to check against. Set it to turn this check on.`,
    };
  }
  return { run: true, fail: false, reason: `Staging deployment of ${short}: checking STAGING_URL.` };
}
