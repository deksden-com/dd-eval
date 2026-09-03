# Execute an eval

The only routine interface is `dd-eval runner`.  A focused execution begins
from an empty provider Session and a portable stage-entry fixture; it does not
fork, warm up, or read a canonical provider Session.  All mutable files belong
under an absolute `DD_EVAL_HOME`.

Reliability work is tracked in [repair plan 019](../specs/019-durable-execution-and-e2e-repair-plan.md).
It is delivered in tested increments, but the current AGY E2E remains
unqualified until the plan's migration, fault tests and AGY adapter preflight
are complete. Luna, Grok and ZCode are not part of this launch set.
Do not work around a recovery error by editing runtime SQLite, accepted results
or MERGE freeze files. In particular, an RPC/daemon/Turn timeout means that the
client did not observe an outcome; reconcile the existing operation before any
new prompt, cancellation or retry.

## Before launch

1. Work from a clean committed `dd-eval` definition tree.
2. Select a committed `run-profile.json`. It names one case, Subject profile,
   selected focused stages/E2E, Judge policy and resource limits.
   A profile names the harness/model/reasoning experiment; it is not a copy of
   an engine version. The exact engine package, version and checksum are
   pinned by the input checkpoint and recorded in each run manifest. Update a
   harness profile only when its provider settings change; rebuild the input
   checkpoint when a changed engine contract needs new qualification.
3. Validate the accepted package:

   ```sh
   export DD_EVAL_HOME=/absolute/path/to/eval-data
   dd-eval runner fixtures validate --case <case-id>
   ```

   This verifies the declared entry descriptors and context blueprint. Focused
   and segment runs require a non-null `case.json.entry_pack` whose referenced
   package is accepted. E2E starts from the committed input checkpoint and does
   not require an entry pack.

## Run

```sh
dd-eval runner eval run --profile \
  cases/<case-id>/run-profiles/<profile>.json
```

### Pinned local engine before a beta publish

When a committed engine release is temporarily unavailable from npm, use its
absolute, already-built source entrypoint for the entire runner invocation:

```sh
DD_FLOW_BIN=/absolute/path/to/dd-flow-cli/dist/cli.js \
DD_EVAL_HOME=/absolute/path/to/eval-data \
dd-eval runner eval run --profile /absolute/path/to/profile.json
```

This is one explicit development override. Its commit and package version must
match the case input checkpoint, and the runner records the resolved engine in
the run manifest. Do not mix a local override with another checkpoint or
silently fall back to the host-global executable. Once npm publication is
available, remove `DD_FLOW_BIN` and use the published engine.

The runner allocates a fresh directory under
`$DD_EVAL_HOME/runs/<eval-id>/`. Each execution gets its own restored project,
`DD_FLOW_HOME`, managed harness state and append-only `events.jsonl`.

Before restoring the engine, the runner copies only the portable harness
configuration from `${DD_FLOW_CONFIG_HOME:-${DD_FLOW_HOME:-~/.dd-flow}}`:
`harnesses.json` and optional `agent-profiles/`. `harnesses.json` names the
absolute adapter and native executable for every harness. It contains no
credentials. The isolated home never inherits `db.sqlite`, RUNs, locks, ports,
engines, logs or daemons from the source home. A missing or invalid harness
configuration is a setup blocker; do not work around it with PATH discovery or
ad-hoc adapter environment variables.

## Parallel canonical preparation and E2E

Canonical preparation and ordinary E2E evaluations are independent contours.
A canonical build owns only its directory below
`$DD_EVAL_HOME/canonical/<case>/<revision>/`; an E2E owns a fresh directory
below `$DD_EVAL_HOME/runs/<eval-id>/` and begins from the committed input
checkpoint. An E2E never reads, resumes, forks, or waits for a canonical
provider Session.

They may therefore run at the same time. This is useful when a reference chain
is still being captured while a release comparison is already ready to run.
Keep the following boundaries intact:

- use a separate, fresh E2E directory for every invocation;
- keep `DD_FLOW_RESOURCE_HOME` common and absolute so ports and managed
  processes are coordinated across all concurrent runs;
- do not modify or dirty the `dd-eval` definition worktree used by a live
  canonical build; prepare documentation or unrelated source changes in a
  separate worktree and merge them after the build has reached its boundary;
- treat a missing accepted focused entry pack as irrelevant to an E2E. It
  affects focused-stage qualification only; E2E uses the input checkpoint.

The runner also creates `$DD_FLOW_HOME/bin/dd-flow`: a tiny private launcher
for the exact engine snapshot named by the accepted entry pack. It exports its
own absolute path as `DD_FLOW_BIN`, is placed first in the Subject, worker and
merge-server `PATH`, and is passed explicitly to the managed harness daemon.
Every first lifecycle command explicitly names both `DD_FLOW_BIN` and this
absolute launcher; later commands retain the same identity from the launcher.
`PATH` is only a convenience, not an identity guarantee. Do not replace it
with a globally installed `dd-flow`; the global executable is used only to
bootstrap or restore an isolated runtime before that snapshot launcher exists.

For `merge_mode=server`, the runner does not send MERGE to the coordinator
Session. It invokes one isolated `dd-flow merge serve --once`, records the
server-launched Session and waits for request/Work/Stage/RUN convergence. Do
not run a second merge server or hand-write a MERGE prompt in that execution.

## What counts as a successful qualification

The required qualification set is one successful **focused** execution for
each declared stage. They are independent cells: a successful `PLAN` cell is
not invalidated because a later `CODE-REVIEW` or E2E experiment fails. This is
the evidence used to accept a portable entry pack.

An E2E execution is a separate integration experiment. Run it only when the
selected profile explicitly sets `selection.e2e: true` (for example, when a
release plan calls for an end-to-end comparison). Its result is retained and
judged on its own merits; it is not a hidden prerequisite for accepting the
focused-stage set.

## Current live qualification: AGY only

For repair plan 019, run exactly one full E2E through the `antigravity-cli`
harness after deterministic suites and the AGY adapter smoke pass. The smoke
uses the same isolated roots as an ordinary execution and proves: profile
observation, session creation, hook forwarding, one terminal result, usage
ingest and daemon/process-tree cleanup. A smoke failure is a harness blocker:
record its evidence and do not start the E2E.

Create an ordinary committed run profile whose Subject is
`antigravity-cli-google-gemini-3-1-pro-high`, `selection.e2e` is `true`, and
whose Judge/interaction-Judge are explicit. Do not copy literal model settings
into the runner command: the profile and resulting manifest are the source of
truth. Continue stages in the same Subject session unless that profile
explicitly selects another supported mode. Luna, Grok and ZCode profiles are
retained as historical/comparison material, but are deliberately not launched
by this qualification procedure.

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

The Final Judge must return the exact outcome and flow criterion sets declared
for its chosen assessment scope. Every applicable criterion needs a score,
rationale and evidence; an unknown scope, duplicate/missing criterion or empty
applicable evidence fails the evaluation machinery instead of producing a
partial score.

The Subject may inspect the isolated runtime. The runner verifies the selected
engine snapshot before a Subject Session starts, records the harness journal,
and captures the resulting RUN boundary. It does not infer the legitimacy or
semantic meaning of shell commands from journal text: that is neither a
reliable safety boundary nor an evaluation criterion.

Usage accounting preserves the provider's native scope. Grok's root counter is
an inclusive execution-tree snapshot; ZCode reports individual physical
sessions. The resulting statistics expose scope and included records rather
than pretending those two measurements are the same.

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

Lifecycle recognition is centralized in `dd-flow`, not duplicated in provider
adapters. A quoted absolute `dd-flow` executable emitted by the launcher is a
valid command word. Text such as `dd-flow stage start` inside `grep` patterns,
JSON, comments or heredoc bodies is data and must not be trusted or blocked.
If a real lifecycle invocation is joined to another command with `;`, `&&` or
a pipe, `dd-flow` rejects it and returns the standalone retry.

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

An explicit terminal provider error in one fan-out worker ends that wave. The
runner records the provider code and details, cancels already-launched sibling
workers, and preserves every journal; it does not retry, replace or manually
complete the failed Work. Do not cancel healthy workers merely for silence.

## HITL and failure handling

Only a registered `dd-flow` pause at an interaction point declared by the
case may receive a response. The runner preserves the actual question, asks a
clean Interaction Judge to select an existing canonical response, and resumes
the same Stage and Session only after a match. An unplanned question or
unmatched response terminates that execution with its evidence intact. A
`fixture_gap` or ambiguous match marks the run invalid as evaluation
infrastructure and is not a Subject-quality failure; an unnecessary or
out-of-scope question remains a Subject failure. Repair the committed fixture
and start a new eval rather than changing the definition underneath an existing
run.

For canonical entry authoring, do not resume an old build after changing or
dirtying the `dd-eval` definition. Commit the corrected definition and start a
new canonical build. The runner checks the recorded definition commit/tree at
every mutating canonical transition. An accepted answer is bound to one pause
and one semantic round. Transport recovery may resend only the already saved
answer file with the same checksum; it must not invoke the Interaction Judge
again or author new bytes. `hitl_resume_not_applied` means a successful Subject
Turn left the same pause unchanged and is a flow defect, not permission to ask
or answer again.

Keep `DD_FLOW_RESOURCE_HOME` common to every parallel execution. The runner
defaults it to `$DD_EVAL_HOME/resources`; override it only with another absolute
host-local resource directory shared by all concurrent runs. Do not place it
inside an execution-specific `DD_FLOW_HOME`.

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

The journal is an operation registry, not an instruction log. A completed
operation is reused with its recorded result; a conflicting duplicate is a
failed execution with preserved evidence. Status and storage commands continue
to list unrelated runs even if one historical journal is conflicting.

`dd-eval storage status` is intentionally metadata-only: canonical snapshots
may contain complete dependency trees, so recursively measuring them would make
an ordinary status lookup appear hung. Garbage-collection planning performs the
explicit, potentially expensive measurement only when it needs reclaimable
bytes.

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
