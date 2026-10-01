# Branches: `staging` is the default, `main` is live

Two long-lived branches, and the difference between them is a real database
and real patients rather than a naming convention.

**`staging` is the default branch, and it is where everything lands.** A
feature branch opens its pull request against `staging`, and "merge" with no
branch named means merge to `staging`. It carries its own Supabase project, so
a mistake there costs a test fixture.

**`main` is live.** It is merged **by the owner, by hand, deliberately** --
never as part of finishing a piece of work, and never by an agent. A merge to
`main` is a release: it reaches the deployed site, the production Supabase
project and whatever real patients exist by then.

```
feature branch ──PR──▶ staging ──(owner, by hand)──▶ main
                          │                            │
                    staging Supabase              LIVE Supabase
```

Both branches carry a ruleset requiring changes to arrive through a pull
request, so neither takes a direct push -- a `git push` to either is refused
with `GH013`, which is the rule working rather than a credential problem.

## The schema is the part that does not follow the merge

`supabase/schema.sql` is applied to a database by
`.github/workflows/schema-apply.yml`, and that workflow fires on **`main`
only** and runs inside the **`Production`** GitHub environment, whose secrets
point at the live project.

That is deliberate and must stay: adding `staging` to its trigger would take a
staging merge and apply its schema to the **production** database, which is
the one outcome this split exists to prevent.

So a schema change merged to `staging` reaches staging's database **only when
somebody applies it** -- `node scripts/run-schema.mjs` against the staging
project, or the file pasted into that project's SQL editor. Until then the
staging app is running code whose policies and functions are simply absent,
which fails in ways that read as code bugs rather than as a missing migration.
Apply it **before** exercising the app there, not after.

Automating that would mean a second GitHub environment (`Staging`) holding
that project's own `SUPABASE_ACCESS_TOKEN` and `NEXT_PUBLIC_SUPABASE_URL`, and
a trigger naming it. That is a credentials decision rather than a code one, so
it is left to a person; the manual step is the honest default until then.

## What else keys on the default branch

- **`docs-freshness.yml`** warns on a pull request that changes the app and
  leaves the docs alone. It listened on `main` alone, so the moment pull
  requests started targeting `staging` it stopped firing at all -- a reminder
  that is silent is worse than no reminder, because its absence reads as
  approval. It covers both branches now.
- **`graphify.yml`** rebuilds the committed knowledge graph where code lands,
  which is `staging`. Its pull request is opened against whichever branch the
  push was on (`github.ref_name`), so the trigger is the only thing that
  decides this. It deliberately does **not** also fire on `main`: the graph
  travels there with the release merge, and a second trigger would open a
  duplicate pull request to rebuild something already current.
