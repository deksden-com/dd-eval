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
identity, model/reasoning profile and observed usage. Provider Sessions are
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
