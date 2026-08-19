# Eval storage and retention

This runbook defines where `dd-eval` stores data and how it is retained. It
applies to every case and beta contour.

## Root

`DD_EVAL_HOME` is the sole root for non-Git eval data. Its default is
`~/.dd-eval`; an operator may set it to another absolute path, for example a
dedicated external volume. `dd-eval` source, case definitions, prompts,
rubrics and compact accepted results remain in the Git checkout.

```sh
export DD_EVAL_HOME="$HOME/.dd-eval"
```

Until the CLI enforces this placement itself, every `dd-eval prepare --output`
path must be below `$DD_EVAL_HOME/attempts/active`. Do not create eval project
checkouts, `DD_FLOW_HOME` directories, or snapshots under `_Projects`.

```text
$DD_EVAL_HOME/
  sequence.json                                next local EVAL number only
  canonical/<case-id>/REV-<NNN>/
    workspace/project/                         canonical stable checkout
    workspace/workspace/                       canonical feature worktree when routed
    workspace/runtime/                         dedicated canonical DD_FLOW_HOME
    checkpoints/<stage>-entry/                 immutable project/RUN snapshots
  attempts/active/<EVAL-id>/                  complete live attempt
  attempts/archive/<EVAL-id>/                 explicitly retained complete attempt
  tmp/                                         disposable CLI staging only
```

An attempt contains `manifest.json`, `state.json`, `sessions.json`, generated
prompts, candidate and Judge evidence, its project checkout, and its dedicated
`runtime/` (`DD_FLOW_HOME`). Canonical snapshots contain the stable project
tree and dedicated runtime captured by `dd-flow`. From the PROTOCOLIZE route
onward they also contain the separate feature workspace and named branch; on
restore `dd-flow` recreates it beside the fresh stable checkout. It never
silently points a routed RUN back at the stable checkout.

## Truth and sessions

Filesystem manifests are the source of truth. Do not add a registry SQLite
database yet. A future `registry.sqlite` may be a rebuildable index only; it
must never be required to discover, reproduce, retain, or delete an attempt.

Canonical Session IDs remain in the Git checkpoint records. Current starter
Session IDs remain in `cases/<case-id>/starter-sessions.json`; they are provider
references, not non-Git archives. Routine Controllers resolve only the starter
registry. Case creation and starter recovery are the only procedures that read
canonical Session IDs.

`sessions.json` records provider Session ID, Agent ID, role, parent Session,
optional source turn evidence, model/reasoning profile and observed usage. It
records the starter parent and evaluated child used by the attempt; canonical
Session identities stay in checkpoint evidence. Provider JSONL is not copied by default. Preserve
raw transcripts only through an explicit archive decision and record their
external locator and checksum.

The compact, comparison-worthy result is committed under
`cases/<case-id>/results/<EVAL-id>/`. It contains manifests, selected artifacts,
Judge result, score, timing and usage summaries—not the project checkout,
runtime SQLite database, engine cache, or raw transcript.

## Lifecycle and retention

1. `canonical/` is retained until its case revision is superseded. It is
   immutable after acceptance.
2. `attempts/active/` contains only unfinished work and a run being inspected.
3. On completion, retain only a compact result by default, then delete the
   complete attempt. Move the complete directory to `attempts/archive/` only
   when an operator explicitly needs forensic replay.
4. `tmp/` has no retention promise and is removed after each command.

Each new attempt receives a generated, monotonic
`EVAL-<zero-padded-number>--<case>--<mode>` directory. `sequence.json` is a
small counter updated under an exclusive filesystem lock; it is not a registry
and contains no run metadata. The manifest—not the directory spelling—records
model, engine, flow-pack and case revision.

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
are launch blockers. The `storage` and `gc` commands may be implemented after
the first accepted canonical run.
