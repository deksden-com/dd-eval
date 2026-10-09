# Eval storage and retention

This runbook defines where `dd-eval` stores data and how it is retained. It
applies to every case and beta contour.

## Root

`DD_EVAL_HOME` is the sole root for non-Git eval data. Its default is
`~/.dd-eval`; an operator may set it to another absolute path, for example a
dedicated external volume. `dd-eval` source, case definitions, prompts,
accepted assessment/golden material and compact accepted results remain in the
Git checkout.

```sh
export DD_EVAL_HOME="$HOME/.dd-eval"
```

The runner creates every mutable execution below this root. Do not create eval
project checkouts, `DD_FLOW_HOME` directories, or snapshots under `_Projects`.

```text
$DD_EVAL_HOME/
  canonical/<case-id>/REV-<NNN>/
    build/                                     append-only reference-build truth
    stages/<stage>/project/                    immutable project snapshot
    stages/<stage>/runtime/                    immutable RUN/DD_FLOW_HOME snapshot
  runs/<EVAL-id>/                              complete runner-owned eval
    executions/<entry>/                        isolated project, runtime, harness state
    events.jsonl                               append-only runner truth
  tmp/                                         disposable CLI staging only
```

An execution contains its manifest, generated launcher/context, candidate and
Judge evidence, provider journal, project checkout and dedicated `DD_FLOW_HOME`.
Canonical snapshots contain only portable project/RUN truth; provider Sessions,
hook claims and usage are scrubbed. Routed workspaces are recreated inside the
execution, never pointed at a canonical tree.

## Truth and sessions

Filesystem manifests are the source of truth. Do not add a registry SQLite
database yet. A future `registry.sqlite` may be a rebuildable index only; it
must never be required to discover, reproduce, retain, or delete an attempt.

The runner journal records provider Session ID, Agent ID, role, optional parent
identity, model/reasoning profile and observed usage. Attempt-qualified paths
in durable records are rewritten only for known path fields when an attempt is
archived; raw receipts remain immutable. Provider Sessions are
forensic evidence only; no routine launch depends on a stored Session ID.

Archiving a completed provider task is allowed after its compact evidence is
saved. It is organizational only and never a requirement to reproduce a
portable entry.

The compact, comparison-worthy result is committed under
`cases/<case-id>/results/<EVAL-id>/`. It contains manifests, selected artifacts,
Judge result, score, timing and usage summaries—not the project checkout,
runtime SQLite database, engine cache, or raw transcript.

## Lifecycle and retention

1. `canonical/` is retained until its case revision is superseded. It is
   immutable after acceptance.
2. `runs/` contains the runner's immutable completed attempt or its resumable
   in-progress journal.
3. On completion, retain only a compact result by default; retain the complete
   execution only when forensic replay is needed.
4. `tmp/` has no retention promise and is removed after each command.

Canonical directories are read-only sources. If a Controller or worker is
ever pointed at `canonical/` as its writable eval root, stop before launching
the provider task and prepare a fresh attempt instead.

Each new runner execution receives a generated `EVAL-<timestamp>-<nonce>`
directory. The manifest—not directory spelling—records model, engine, flow
pack, case revision and definition-tree identity.

Canonical checkpoint records committed to Git use paths relative to
`DD_EVAL_HOME`. Absolute source paths may appear only as historical evidence
inside a snapshot manifest, never as the locator used to restore it.
Compact checkpoint acceptance reviews are source material and remain in Git at
`cases/<case-id>/checkpoint-reviews/REV-<NNN>/`.

## Storage operations

The intended minimal CLI surface is:

```sh
dd-eval storage ls [--case <case-id>]
dd-eval storage status
dd-eval gc plan
dd-eval gc apply --plan <plan-file>
```

`storage` reads manifests from disk. `gc plan` is read-only and produces exact
absolute paths, retention reason and reclaimed bytes. `gc apply` accepts only
that plan and never deletes canonical snapshots or active attempts without an
explicit selection. Do not build a scheduler, daemon, or SQLite registry for
this milestone.

Only home resolution, layout creation, eval ID allocation and path containment
are launch blockers. `gc apply` accepts only a plan made for the same
`DD_EVAL_HOME`, deletes only listed terminal directories below `runs/`, and
never touches canonical revisions.

## 30-day preparation cleanup

Before every new campaign, use a fixed UTC cutoff of preparation time minus
30 days. The age threshold identifies candidates, not permission to erase
unknown ownership or active work. Save the cutoff and exact selected paths,
database names/OIDs, owners, age evidence and removal/readback results outside
the deletion targets. Preserve compact verdicts, timings and defect evidence.

- Execution data: inspect each explicitly selected `DD_EVAL_HOME`, including
  qualification homes. Use `storage ls/status` and `gc plan`; restrict the plan
  to disposable terminal runs whose latest terminal/cleanup timestamp is older
  than the cutoff. The current GC command has no age option: review/filter its
  candidate list explicitly before `gc apply`, preserving its schema and home.
  Its default plan selects all disposable runs, including recent ones. Application
  rechecks exact runtime ownership under the lifecycle lock. Failed, blocked,
  resumable, malformed and unknown attempts are not automatically disposable;
  a dead PID or old directory name is insufficient. Retain them for explicit
  scoped settlement/retirement. Do not recursively remove `DD_EVAL_HOME`.
- Staging/caches: remove only exact stale disposable directories with proven
  dead owners and no references from retained runs or accepted qualification.
  Current canonical checkpoints, shared engine snapshots, qualification receipts,
  credentials and project data are not ordinary 30-day garbage.
- PostgreSQL: inventory the exact local project server, not a remote/ambient
  `DATABASE_URL`. Preserve `postgres`, templates and `dd_tasks_foundation_local`.
  Select only verified invocation/test databases, with exact ownership from
  receipts/database markers or independently matched historical fixture data.
  Require proven age over 30 days, no active owner/retained dependency, and no
  client connections or prepared transactions. PostgreSQL has no catalog
  creation timestamp: names, OIDs and `pg_stat_database.stats_reset` are not age
  evidence. Prefer retained invocation timestamps. For legacy fixtures, an
  independently verified fixture identity plus an old initialization timestamp
  and all database-file modification times older than the cutoff is conservative
  evidence; document that basis. Missing/conflicting evidence means retain.
  Dump selected legacy databases and verify the backups before dropping them.
  Recheck name/OID/owner and clients immediately before each exact quoted
  `DROP DATABASE`; do not use `WITH (FORCE)`, terminate unrelated backends or
  delete database directories directly. Fail closed on a changed identity or a
  newly active consumer. Verify absence afterward. Keep the shared Docker volume.

This is an operator preparation step using existing storage/owner mechanisms,
not an age-based background daemon or a change to historical EVAL verdicts.

## Container retirement after an eval

After terminal success, failure or scoped cancellation, first settle the EVAL's
native tree, workers, checks, Judge and owned runtime resources; save their
receipts and compact result. Then retire the campaign's PostgreSQL container so
it does not remain running between campaigns. Do not stop a database while a
late result, recovery, Judge, baseline or check still requires it.

An isolated campaign container can be stopped by its verified exact ID once
its consumers settle. The standard `dd-tasks` container is shared: one parallel
EVAL finishing is not permission to interrupt the other EVALs or ordinary local
development. Stop it after the last consumer has settled, after checking both
active campaign/process ownership and `pg_stat_activity`; an empty connection
list alone is insufficient because a live consumer may be between connections.
If another/unknown owner still needs the service, leave it running and record
the deferral. Apply the same rule after preflight failure with no launched RUN.

Use `docker stop <verified-container-id>` and verify it is stopped. Preserve its
volume and images; a future project bootstrap can start the service again. Remove
an obsolete stopped container only by explicit verified selection, without `-v`
or `--force`. Never use `docker compose down -v`, `docker system prune` or stop
containers by a broad name filter. Docker/network failure is a cleanup warning,
not permission to overwrite the semantic verdict or claim physical settlement.
