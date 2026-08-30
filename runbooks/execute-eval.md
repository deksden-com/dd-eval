# Execute an eval

The only routine interface is `dd-eval runner`.  A focused execution begins
from an empty provider Session and a portable stage-entry fixture; it does not
fork, warm up, or read a canonical provider Session.  All mutable files belong
under an absolute `DD_EVAL_HOME`.

## Before launch

1. Work from a clean committed `dd-eval` definition tree.
2. Select a committed `run-profile.json`. It names one case, Subject profile,
   selected focused stages/E2E, Judge policy and resource limits.
3. Validate the accepted package:

   ```sh
   export DD_EVAL_HOME=/absolute/path/to/eval-data
   dd-eval runner fixtures validate --case <case-id>
   ```

   This verifies the declared entry descriptors and context blueprint. It is
   not permission to score an `authoring` case; a scored run additionally
   requires `case.json.status = "runnable"` and an accepted entry pack.

## Run

```sh
dd-eval runner eval run --profile \
  cases/<case-id>/run-profiles/<profile>.json
```

The runner allocates a fresh directory under
`$DD_EVAL_HOME/runs/<eval-id>/`. Each execution gets its own restored project,
`DD_FLOW_HOME`, managed harness state and append-only `events.jsonl`.

## Operational model

The same short sequence applies to every harness. Keeping these roles separate
is what makes a focused stage comparable to an E2E contour instead of a replay
of an earlier provider conversation.

| Step | Owner | Durable result |
| --- | --- | --- |
| Resolve a committed case and profile | Runner | resolved identities of the case, package, flow, engine and harness |
| Restore the requested boundary | Runner | fresh project and runtime roots inside this execution only |
| Materialize the stage slice | Runner + `dd-flow` | read-only context; `stage start` resolves live paths and lifecycle commands |
| Perform the stage | Subject | its own artifacts and a `dd-flow` lifecycle receipt |
| Handle an allowed question | Runner + clean Interaction Judge | exact question, match decision and one authorized answer in the same Stage/Session |
| Capture or advance | Runner | candidate boundary, append-only journal and, for E2E, the next provider turn |
| Assess | clean Judge | verdict over immutable evidence; it never edits the evaluated RUN |

`dd-flow` is the sole authority for RUN, Stage and Work state. The runner is
the sole authority for restoring attempts, creating provider Sessions,
dispatching turns and recording the journal. The Subject makes product and
flow decisions; it does not manufacture snapshots, statistics or Judge
evidence. A Judge assesses captured facts and cannot repair the Subject's
output. The human operator only accepts a canonical reference boundary or
changes the versioned case definition.

For a focused stage it restores exactly that entry boundary, materializes the
read-only stage context, opens an empty Subject Session and sends one launcher.
For E2E it restores only the initial entry and follows the Subject's own
outputs through the selected contour. Never copy a later-stage focused fixture
into E2E.

The launcher tells the Subject to use the returned standalone `dd-flow stage
start` command first. Do not prepend `cd`, `cat`, `git`, a help command, a pipe
or another shell command: the harness hook must see this lifecycle call as its
own Bash action. `stage start` is the source of the actual context, paths,
completion command and Work contract.

For each E2E stage the operational sequence is: runner sends one launcher →
Subject invokes standalone `stage start` first → Subject performs only that
Stage → `dd-flow` returns a terminal receipt or a registered pause → runner
records the boundary → runner, not the Subject, sends the successor in a later
turn. A focused execution stops at the same boundary. This difference is
intentional: a focused result may use its accepted predecessor snapshot, while
an E2E successor consumes the Subject's own preceding result.

Some stages materialize a graph of fresh worker Work records. This is still
one normal Stage: when the graph is agent-owned, the runner first returns the
same coordinator once to materialize it; when it has a deterministic
dispatcher, `dd-flow` materializes it directly. Only then the runner performs
mechanical worker launches from engine-returned descriptors, waits for their
`work finish` receipts and returns the coordinator to the normal stage-finish
path. The runner does not choose review aspects, change the graph, author
results or retry workers. If the graph first requires capacity, it performs one
concurrent 15-agent probe,
waits at most three minutes, records only the number of successful original
launches, and reuses that RUN fact for later fan-out.  A quiet worker is not a
failure and must not be stopped merely because no new message has appeared.

Each launcher permits exactly its named Stage. Once that Stage is finished, the
Subject stops; it must not follow a successor command shown by a normal
`dd-flow` receipt. The runner checkpoints the boundary and sends the successor
only in a later provider turn.

For Codex Desktop, the runner creates an isolated `CODEX_HOME` through
`dd-flow` and trusts only its generated lifecycle hook for that eval Session.
It does not reuse an interactive hook-trust decision or load user plugin hooks.

Monitor without modifying the evaluated Session:

```sh
dd-eval runner status --eval "$DD_EVAL_HOME/runs/<eval-id>"
```

Provider silence or a missing current tool call is not a failure. The runner
waits for a provider terminal state, a registered `dd-flow` pause, an explicit
provider error/cancellation or a configured hard deadline. A terminal chat
message is not a completed Stage: completion requires a matching `dd-flow`
lifecycle receipt for the expected Stage.

## HITL and failure handling

Only a registered `dd-flow` pause at an interaction point declared by the
case may receive a response. The runner preserves the actual question, asks a
clean Interaction Judge to select an existing canonical response, and resumes
the same Stage and Session only after a match. An unplanned question or
unmatched response fails that execution with its evidence intact.

On a host/controller restart, use:

```sh
dd-eval runner resume --eval "$DD_EVAL_HOME/runs/<eval-id>"
```

Resume first reduces `events.jsonl` and observes both harness and `dd-flow`.
It may finalize a completed stage, deliver one already-authorized HITL answer,
or send the next E2E-stage launcher after its predecessor boundary is present;
it never repeats a launcher, model turn, stage finish, resume, or checkpoint
whose operation receipt is already terminal. To stop an isolated execution
without touching another cell:

```sh
dd-eval runner cancel --eval "$DD_EVAL_HOME/runs/<eval-id>" --execution <id>
```

If the provider itself ends a Subject turn while the expected Stage remains
`running`, the candidate is `incomplete_subject_turn`. The runner preserves
the journal and does not send a hand-written continuation or attempt to repair
partially written artifacts. For a reference build, abandon that revision and
create a fresh one; for a scored execution, retain the failed candidate for
analysis. This is different from a controller restart: only the latter may be
reconciled without a new Subject turn.

If a controller stops between a provider terminal message and lifecycle
reconciliation, resume never sends that provider turn again. At an allowed
HITL point it may ask the independent Interaction Judge to validate the exact
saved question and then persist those exact bytes as the Stage pause; otherwise
the attempt remains failed/incomplete with its evidence. It never searches for
question-like text heuristically and never invents an answer.

## Result interpretation

The immutable execution directory contains the resolved manifest, launcher,
harness journal, `dd-flow` receipts, a terminal candidate checkpoint and
optional Judge output. A candidate checkpoint is evidence only; it is never a
substitute for a stage-entry fixture and cannot be restored to continue work.
Context observations (extra reads, searches and help calls) are input
for later analysis, not automatic defects. A context miss must show that the
package omitted a fact/path/command it was responsible for providing.

Do not use historical `prepare`, `starter`, `checkpoint`, `continuation`,
manual Session fork or hand-written `DD_FLOW_HOME` workflows. They belong to
the retired pre-runner procedure and are not accepted eval evidence.
