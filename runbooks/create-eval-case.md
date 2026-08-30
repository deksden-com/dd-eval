# Create an eval case

An eval case is a Git definition plus runner-owned immutable snapshots. It
does not contain canonical provider Sessions, starter Sessions or provider
forks. Every routine focused execution starts in an empty Session.

## Definition tree

Create and commit only compact, reviewable inputs:

```text
cases/<case-id>/
  case.json
  assessment.json
  entry-pack-source/
    stage-context.json
    interactions/<stage>.json
    context-oracles/<stage>.json
  run-profiles/<profile>.json
  stage-entries/REV-<NNN>/       # written after explicit acceptance
```

`case.json` uses `dd-eval/case@6` and points to exactly one accepted
`entry_pack`. It declares the selected flow contour and terminal stage.
`entry-pack-source/` is mutable authoring input; accepted descriptors under
`stage-entries/` are immutable. A run profile is the experiment: harness/model,
reasoning, focused/E2E selection, Judge policy and concurrency.

The stage-context blueprint maps *roles* to relative project, workspace or RUN
paths. It must include the ordered raw user input for SPECIFY and only the
project sources needed at a stage boundary. It never embeds an absolute host
path, provider Session ID, golden answer, Judge rationale or hidden response.

## Walk through the case before building it

Mentally execute one ordinary Subject turn for every declared stage. This
practical check catches a missing context role before a model is asked to
compensate by searching the repository.

1. Start with the ordered raw user input. `specify` must understand the request
   without a prior provider conversation.
2. At each later boundary, list the predecessor artifacts genuinely consumed,
   the project documentation/indexes needed to interpret them and the dynamic
   paths that only `dd-flow stage start` can resolve in a restored RUN. Put the
   first two in `stage-context.json`; leave live paths to the lifecycle result.
3. State whether the Stage may ask a material user question. If so, add
   canonical *answers* to `interactions/<stage>.json`; do not encode brittle
   question wording. A clean Interaction Judge decides whether an actual
   question is covered.
4. Write the hidden context oracle separately. It can say which facts a good
   Subject should use, but it is never Subject-visible context or a replacement
   for the Stage's own reasoning.
5. For every focused stage, verify that an empty Session plus that boundary can
   begin the Stage. For E2E, verify the opposite: restore only the initial
   boundary and make every later input come from the execution's own RUN.

If this reveals a missing product decision, add it to user input or the right
predecessor artifact. Do not hard-code a downstream answer into a package and
do not add a provider Session as a shortcut.

### Boundary simulation checklist

For each entry, simulate the exact next Subject turn before accepting the
package. The answer to every item must come from the entry itself, its rendered
`stage start` response, or normal project files named by the package—not from
the reference conversation or an operator's memory.

| Question | Correct owner | What to do if it is missing |
| --- | --- | --- |
| What task and already accepted decisions apply? | raw input or predecessor artifact | add the smallest relevant source role |
| Where may this Stage read and write? | rendered lifecycle context | correct the dynamic role/flow contract, never hard-code an old absolute path |
| Which product/project rules make the decision meaningful? | semantic context package | add the governing index or document, not a prose duplicate |
| Which output, checks, Work graph and stop state are required? | rendered lifecycle context | fix the stage contract or its context mapping |
| May it ask the user, and what happens then? | subject-visible policy plus hidden canonical answers | declare the interaction point; do not supply anticipated question wording |
| Can a fresh empty Session complete this Stage? | complete package plus launcher | repair the package; do not use a reference Session/fork as a shortcut |

Then simulate the E2E path separately: it restores only the initial entry;
each successor receives artifacts produced by this Subject, not the later
focused fixture. This catches accidental leakage of canonical downstream
answers into the E2E input.

## Build a canonical entry pack

1. Commit the case inputs, including its hash-pinned input checkpoint. The
   runner refuses to start a canonical build from a dirty `dd-eval` definition
   tree and records its commit and tree hash in the build state. Prepare
   two clean checkouts: the product checkout at the checkpoint's `source.commit`
   (detached is valid) and the flow checkout at `flow_pack.commit`. The runner
   clones the former, creates a local clean `main` materialization commit that
   overlays only `.memory-bank/dd-flow` from the latter, and records both the
   product commit and that materialized commit. This lets normal Git policy run
   unchanged while ensuring it never tests a later product state merely because
   that state is on `main`. Runner-local task input is placed under
   `.dd-eval/` and excluded through the restored checkout's local Git exclude;
   it is context, never a product edit.
2. Set an absolute `DD_EVAL_HOME` and run:

   ```sh
   dd-eval runner canonical build --profile \
     cases/<case-id>/run-profiles/<reference>.json \
     --project-root /absolute/path/to/clean/checkpoint-product \
     --flow-root /absolute/path/to/clean/flow-pack
   ```

   The runner allocates a pending revision and journals every reference action.
   The reference chain is provenance only: its provider Session is never an
   input to a routine eval.
3. Before the first reference Session, the runner restores the bootstrap
   project and registers that restored root in its otherwise empty dedicated
   `DD_FLOW_HOME`; this enables deterministic harness/hook setup but does not
   create a RUN. Before each reference stage starts, capture the project/RUN
   boundary and construct that stage's portable descriptor. After the stage
   ends, review the result explicitly; boundary acceptance captures the
   successor input but does not itself send another provider prompt. The
   generated launcher limits the Subject to that one Stage: its normal finish
   receipt can mention a successor, but only the runner may dispatch it in the
   next provider turn.
4. Verify that each entry has the captured `dd-eval/engine-snapshot@1`
   descriptor: package name, version and content checksum must be the same as
   the reference RUN binding. For a completed older build, run `canonical
   engine capture` once before qualification; do not let qualification resolve
   an ambient same-version engine. Then run mechanical validation for paths,
   hashes, flow state, workspace route,
   absence of live Work/provider identity and dynamic-role containment.
5. Run isolated context qualification for every focused entry and then E2E.
   Use normal launchers, preserve tool/transcript evidence and correct only
   demonstrated package gaps.
6. Obtain clean semantic review plus explicit human acceptance. The final
   acceptance writes `entry-pack.json`, updates `case.json.entry_pack`, and
   leaves the definition runnable pending Git review/commit/push.

A changed task fact, predecessor result, source map, project/runtime snapshot,
flow pack or engine identity requires a new revision and recapture of dependent
entries. A changed scoring methodology alone does not.

### Diagnose a failed reference or qualification run

- A missing or stale role, path or policy is an **entry-package defect**:
  amend source, create a new revision and recapture affected boundaries.
- A failed lifecycle call, restore, hash check or harness protocol is
  **infrastructure**: repair runner/adapter/engine first; never accept a
  partial reference result.
- A weak decision, needless search or unjustified question is **evaluation
  evidence**. Preserve it for the Judge and improve the package only when the
  evidence shows that the package omitted something it was responsible for
  supplying.
- A provider turn that becomes terminal while its Stage is still running is an
  **incomplete subject turn**. Preserve the trace and abandon that canonical
  revision; do not hand-write a continuation, repair partially written output
  or accept any later boundary from it. Start a clean revision after the
  infrastructure cause is understood.

This distinction keeps packages general: they provide necessary context, not
answers tuned to one model's particular mistakes.

## Required acceptance checks

Before marking `case.json.status` as `runnable`, prove that each accepted entry:

- restores a contained project/runtime snapshot with matching hashes;
- contains the right RUN state and no later-stage artifact;
- resolves every dynamic role inside the restored attempt;
- materializes the same semantic context hash in a clean temporary restore;
- supplies all accepted decisions needed by the stage, without a private
  reference conversation;
- has a successful isolated qualification receipt and an explicit semantic
  review;
- is free of provider Sessions, hook claims, usage samples and other reference
  observability state.

For any new harness, reuse the same accepted portable package. Harness-native
fork capability is neither required nor a fallback path; it can be evaluated
separately as a session-continuity experiment.
