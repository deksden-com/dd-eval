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
