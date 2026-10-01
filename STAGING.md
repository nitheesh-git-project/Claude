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

## A new Supabase project needs table grants, which the schema does not carry

Applying `supabase/schema.sql` to a fresh project (staging or production) is
not always enough. The file creates tables, RLS policies and functions but
relies on the platform's default table privileges for `anon`, `authenticated`
and `service_role`, and a project created with automatic Data API table
exposure off has none. Every signed-in read then fails with
`permission denied for table ...`, and the app reports it as a role problem:
a correctly promoted admin lands on `/get-started` instead of the dashboard.

After applying the schema to a new project, confirm no table has RLS off and
then apply the grant block in `docs/rules/data-schema.md` (the "new Supabase
project may hold no table privileges" bullet under Schema conventions). It is
safe to re-run. Do this **before** the first sign-in, not after.

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
- **A new cloud session's clone.** A Claude Code session clones the
  repository its environment names, at the source revision if one is pinned
  and otherwise at the **default branch**. Nothing pins one here, so a
  session started now begins on `staging` -- with every merged change
  already in the checkout -- where a session started before the change began
  on `main`. Worth knowing because it is silent: the first session that
  comes up on the older branch looks like a session whose work has
  disappeared. `git branch --show-current && git log --oneline -1` in the
  first turn settles it, and `git fetch origin staging && git checkout
  staging` is the whole fix.

## Releasing to `main`

The owner's own step, by hand, deliberately. A merge to `main` is a release
to the deployed site **and** to the production Supabase project: pushing
`supabase/schema.sql` there triggers `schema-apply.yml`, which applies it to
the live database. That is not something to arrive at as the last step of
finishing a piece of work, which is the whole reason it is not automated and
the reason no agent takes it.

Before taking it, the two things worth checking are that the full e2e suite
was run on `staging` as it stands (see `e2e/README.md` for what a legitimate
red looks like) and that any schema change in the merge is one you intend to
apply to production the moment it lands.
