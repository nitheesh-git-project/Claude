# Staging smoke

`.github/workflows/staging-smoke.yml` runs `scripts/ci/staging-smoke.mjs`:
six anonymous GETs against the deployed staging site (three public pages
answer 200; the patient, therapist and admin dashboards do not hand an
anonymous caller a page). It signs in as nobody and writes nothing. It is not
part of the pre-merge gate and not a required check.

## When it runs

- **By hand** (`workflow_dispatch`): always checks. With `STAGING_URL` unset
  it fails, because "nothing was checked" is not a pass.
- **On a `deployment_status` event** from the hosting integration, when the
  status is `success` and the environment is not `Production`. The job then
  runs a gate step first (`scripts/ci/staging-smoke-gate.mjs`, judgement in
  `scripts/ci/lib/smoke-gate.mjs`) that asks GitHub's compare API whether the
  deployed SHA is on the `staging` branch:

  | Gate answer | Smoke step | Run result |
  | --- | --- | --- |
  | SHA is staging's head, or staging has moved past it, and `STAGING_URL` is set | runs | its own result |
  | SHA is on staging but `STAGING_URL` is not set | skipped | green, with a warning annotation naming the variable |
  | SHA is not on staging (a pull-request preview) | skipped | green |
  | GitHub could not be asked, or the event carried no SHA | skipped | **red** - couldn't check is not "not staging" |
  | Production deployment | skipped | green |

  **Every one of those writes its reason to the job summary** ("Staging
  smoke" heading), so a run that checked nothing says which of these it was.

## Why it is not a job-level condition on the branch (QA F-08)

The job used to be filtered with `github.event.deployment.ref == 'staging'`.
Vercel's GitHub integration creates every non-production deployment -
staging's included - with **`ref` set to the commit SHA** and
**`environment: "Preview"`**, so that comparison was never true and every
staging deployment skipped the job silently. The evidence was run
38498440871 (14 Oct, head `2128e833`): event `deployment_status`, run branch
`staging`, deployment `ref` `2128e8339ef6…`, environment `Preview`,
conclusion skipped with no steps. A skipped job has no log and no summary,
which is how it read as a successful run.

Nor can the branch be read from the event: for `deployment_status`,
`GITHUB_REF` is empty when a commit rather than a branch was deployed, and
Vercel marks staging and pull-request previews identically. Asking whether the
SHA is in `staging`'s history is the one test that separates them.

The cost of the change is a short green "smoke" job on pull-request preview
deployments too, whose summary says it was a preview. That is deliberate: a
job filtered out at the `if:` cannot say why.

## Setting it up

Repository *variables* (Settings -> Secrets and variables -> Actions ->
Variables), not secrets: `STAGING_URL` (the stable staging origin, https),
and `PRODUCTION_URL` so the smoke script can refuse it as a target.
