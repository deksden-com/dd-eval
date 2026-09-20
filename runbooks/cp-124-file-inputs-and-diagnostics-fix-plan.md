# CP-124: file-based agent inputs and lifecycle diagnostics

Status: implemented; verification and clean E2E pending. Date: 2026-09-21.

## Evidence and objective

EVAL-20260920194004-f2f6f622 stopped during PLAN-REVIEW. WRK-006 submitted a
quoted heredoc with two closing DD_FLOW_RESULT lines. Native hook event 14 was
persisted, but observeLifecycleInvocation did not bind the compound command.
The CLI saw ordinary argv and returned invocation_receipt_missing, recoverable=false.
The child obeyed the infrastructure-error instruction and stopped. Controller then
reported execution_ended_without_work_result / fanout_reconciliation_required.
On published beta.86, parsing the original command yields compound/shell_composition;
removing the duplicate delimiter yields standalone. The error is not an absent hook.

All model-authored structured input must use a JSON file and a separately executed
short CLI command. Remove recommendations to construct JSON in shell strings,
heredocs, pipes or base64. Keep existing machine-facing transports compatible.
Do not require models to copy runtime IDs, checksums or materializable metadata.

## Input contract

- Reuse existing --result-file, --semantic-file, --decision-file, --verification-file,
  --context-file, --observations-file, --payload-file and --file options. Do not
  introduce synonymous flags where a file contract already exists.
- Runtime issues the exact input path and submission command together. Expose an
  absolute path for the editor and a quoted scoped alias for CLI parameters where
  supported. Aliases are not shell expansion and must not be passed to generic
  file tools as if they were filesystem paths.
- Work submission drafts live in an attempt-specific Work input location, separate
  from the canonical works/<id>/result.json. Use existing attempt/generation identity
  to prevent sibling/retry/fork collisions. Stage drafts likewise remain separate
  from accepted receipts. Re-render/show/status must not overwrite user drafts.
- Runtime-owned fields are materialized through existing mechanisms. The model edits
  semantic fields only. Do not emit a placeholder JSON that accidentally passes as
  a real successful result; describe missing semantic fields explicitly.
- Ordinary file-edit tools create/edit drafts. A separate standalone CLI call submits
  them. Prompt examples must not replace heredoc with echo/printf/base64 shell writers.
- Read and validate all input before productive actions: argument conflicts, alias
  resolution, readable regular file, complete JSON, schema and contextual validation.
  Reuse prepared input bytes/value in execution; do not read a changed file again
  after validation. Claim/evidence bookkeeping is distinct from productive effects.
- No-effect input errors identify parameter/path/JSON field and provide the existing
  safe retry mechanism. Correcting a draft must not replay a settled successful
  invocation. Preserve immutable outcomes and explicit retry/attempt semantics.
- HITL question/answer currently contain text, not JSON. Add --question-file and
  --answer-file for their existing UTF-8 text contract; preserve canonical answer
  bytes. Do not silently JSON-wrap or parse fixture text. Structured HITL envelopes,
  if ever required, are a separate versioned contract. This migration removes shell
  assembly for all input, while JSON remains the format for structured content.
- Add text-file alternatives for agent-facing --task-stdin and --summary-stdin;
  retain --intake-file for intake. Preserve short scalar CLI arguments.

## Change inventory

Paths below are relative to the named repository. Audit includes active source,
hidden memory-bank instructions, examples, CLI input tables and existing tests.
Historical snapshots are evidence, not templates to rewrite.

### dd-flow-cli: preparation and command generation

1. src/services/work-registry.ts: replace --result-stdin/heredoc completion template
   and the instruction forbidding result drafts with a runtime-issued draft path,
   JSON example and --result-file command. Reuse this for review/code/repair workers.
   Review hard_write_boundary so the advertised input path is actually writable.
2. src/services/stage-pause.ts: replace stagePauseCommandTemplate heredoc generation
   with question draft path/template plus standalone --question-file; resume emits
   --answer-file. Preserve pause identity, same-session resume and accepted answer bytes.
3. src/services/vnext-specify.ts, vnext-protocolize.ts, vnext-plan.ts,
   vnext-plan-review.ts, vnext-merge.ts: remove all mandatory-heredoc/no-file wording;
   use the common HITL packet. Retain already working semantic/decision/result files.
   Cover CODE and CODE-REVIEW through their shared Work/pause producers as well.
4. src/services/run-controller.ts: replace --answer-stdin shell redirection with
   --answer-file for the existing controller-owned answer file. Keep issued authority
   and actual supplied path consistent across retention, continuation and recovery.
5. src/cli/command-inputs.ts, run-cli.ts, help.ts: add file alternatives and exclusive
   input groups, declared contextual paths and accurate help; cover both preparation
   and execution branches (work finish and stage finish have multiple branches).
   Reuse prepareTextFile/prepareJsonFile/prepareWorkResult and prepared interactionText.
   Remove agent-facing help advice recommending pipes for long JSON.
6. Inventory every input family in command-inputs.ts: stage start/finish/pause/resume/
   block, work add-batch/finish/repair, session register, plan inputs, native observations,
   schema validation, run context/routing and recovery/runtime inputs. Verify file
   readability/schema-before-effect for each exposed file option. Add file variants
   for inline JSON only where an agent-facing producer uses it. Internal argv-based
   interruption-json/settlement-json/manifest-json/budget-json do not require converting
   trusted in-process calls to temporary files merely for stylistic uniformity.

### dd-flow-cli: hooks, matching and diagnostics

7. src/services/lifecycle-command.ts: file options with quoted absolute paths, spaces,
   aliases and flags must remain standalone. File contents are data and must never
   be parsed as shell. Retain support for historical valid stdin invocations.
8. src/services/lifecycle-invocations.ts: examine fingerprint, canonicalManagedCommand,
   observeLifecycleInvocation, observedLifecycleInvocation and argument resolution
   together. Test issued file command versus observed command and actual CLI argv.
   Preserve semantic target identity; do not strip file options indiscriminately or
   substitute stale issued paths for a corrected submission without explicit rules.
9. src/services/hooks.ts and codex-hook-delivery.ts: retain trusted native receipt and
   parse classification even if the command cannot bind. Hook records facts; CLI
   validates the command. Do not execute file validation/productive work in the hook.
   Do not depend on updatedInput to convey essential identity.
10. src/cli/run-cli.ts: distinguish missing native evidence from present evidence
    describing unsupported shell composition. Resolve diagnostic evidence only with
    exact native call/session association; never use global latest receipt or fuzzy
    command matching. If current transport cannot provide this identity, explicitly
    add a deterministic adapter-owned binding before enabling diagnostic lookup.
    Unknown/ambiguous ownership remains an infrastructure error.
11. Return an actionable input diagnostic with preserved parse reason when proven.
    no_effect applies to CLI productive state, not arbitrary neighbouring shell
    commands. Offer automatic retry only when effect and identity are proven safe.
    Do not solve the incident by accepting arbitrary compound shell commands or
    making every invocation_receipt_missing recoverable.
12. src/services/vnext-fanout.ts and controller-fanout.ts: retain the concrete CLI
    rejection/native error alongside execution_ended_without_work_result, using
    existing evidence links. Native chat completion never implies Work completion.
13. Exercise all managed adapters: Codex, ZCode, Grok, OpenCode, Antigravity and Droid
    through shared hook/parser contracts and their actual payload envelopes in
    src/harness-runtime. Include Code-mode nested shell calls and fresh children.
    Adapter-specific success/failure transport must preserve the same diagnosis.

### dd-eval and documentation sources

14. lib/runner.mjs: replace heredocDelimiter/building of accepted-answer continuation
    with a persisted exact answer file and --answer-file command. Remove the explicit
    prohibition on files. Check whether each caller is active or legacy before deletion.
15. lib/managed-flow-client.mjs: already sends run drive answer --answer-file; retain
    this path and verify end-to-end bytes through controller stage resume.
16. Review lib/cli-input.mjs and all model-facing eval examples for inline structured
    inputs; retain deterministic machine-only invocation contracts. Surface the
    original failure in eval results without replacing it with cleanup errors.
17. dd-flow/.memory-bank/dd-flow/common/runtime-cli.md: update the canonical instruction.
18. dd-memorybank/.memory-bank/spec/engineering/SPC-010-agent-owned-verification-and-safe-hitl.md,
    SPC-012-deterministic-merge-stage-and-server.md and protocol
    PRT-036-protocol-transition-runtime-sync.md: reconcile active normative instructions
    with file transport. Preserve historical narrative as history where appropriate.
19. dd-eval/runbooks/execute-eval.md and e2e-monitoring.md: document file-first submission,
    input-error versus hook-error distinction, and retained primary-cause inspection.
    Older cp-101/reliability/hook incident plans describe historical heredoc decisions;
    add supersession links where still used as guidance, do not rewrite old evidence.
20. Audit generated docs/help/schema examples and prompt tests after changes. Search
    hidden directories too. Initial searches found no matching active instructions
    in dd-console; verify its error/status rendering accepts the richer diagnostics.
    Do not modify frozen case checkpoints, scored runs, release assets or installed
    campaign engines in place. Publish updated canonical resources for future inputs.

## Required bounded refactoring

Implement these extractions with their first real callers, not as unused infrastructure.
Reuse existing helpers and types before introducing a new module. Keep stage semantics,
authorization and accepted-result replay explicit in their owning services.

### R1 — One preparation path for each input

Extend src/cli/input-preparation.ts around existing prepareTextFile, prepareJsonFile
and prepareJsonSchema. Share exclusive source selection and file/stdin reading;
return the prepared text/value and source path. Command-specific schema and state
validation remain with the command. run-cli.ts must pass prepared values into execution
instead of repeating source selection, parsing or file reads in its dispatch branches.
Inspect work finish, stage finish, pause/resume, block and repair together. Use existing
command-inputs.ts declarations for conflicting flags; avoid a second option registry.
Keep optional compatibility fallbacks for direct service callers explicit.

Acceptance: a file modified after preparation cannot change executed data; invalid
input reaches no productive handler; corrected input follows existing retry semantics.

### R2 — Shared file submission descriptor and rendering

Use a small shared descriptor for absolute editor path, CLI path presentation, format
and option name. A pure renderer builds the common file-edit/submission instructions;
stage/Work services supply their own schemas, examples and semantic instructions.
Reuse existing managedLifecycleCommand authority and alias helpers. Centralize draft
path construction using existing attempt/generation identity. Separate draft creation
from rendering and status inspection; never overwrite drafts on repeat reads.

First callers: work-registry.ts, stage-pause.ts and stage generators listed above.
Do not unify all stage prompts into a configurable prompt framework.

Acceptance: editor path, issued file option, observed command and actual read resolve
to the same file; sibling attempts do not collide; canonical output is separate.

### R3 — Shared HITL instruction block

Replace stagePauseCommandTemplate's shell body with a common file-based HITL packet
and common instructions. SPECIFY, PROTOCOLIZE, PLAN, PLAN-REVIEW and MERGE consume it
with stage-specific context. CODE/CODE-REVIEW retain their actual declared HITL policy;
do not add new interaction points merely to make templates uniform. Controller and
eval consume persisted answer paths rather than constructing their own shell bodies.

Acceptance: every enabled HITL entry uses the declared file contract; canonical answer
bytes and same-session resume survive; forbidden HITL remains forbidden.

### R4 — Shared observation/admission diagnostic result

Reuse the lifecycle-command parser result across observation and admission. Represent
missing evidence, observed unsupported syntax, ambiguous ownership and bound invocation
explicitly in existing lifecycle types. Hook persists facts; CLI classifies errors and
retryability. Controller/fanout/eval propagate the original code, source and evidence
reference without each layer inventing a generic replacement. Retain cleanup errors
separately. Do not infer missing exact identity from a latest-row search.

Acceptance: CP-124 preserves shell_composition as the cause; absent hook remains an
infrastructure failure; no ambiguous command obtains execution authority.

### R5 — Correct shell argument rendering at touched producers

Additional finding: several finishCommand helpers and run-controller.ts build shell
strings using JSON.stringify(path). JSON string quoting is not shell escaping: dollar
substitution and backticks may still be evaluated in double quotes. Audit touched
producers in vnext-code.ts, vnext-code-review.ts, vnext-plan-review.ts, vnext-specify.ts,
vnext-protocolize.ts, vnext-merge.ts, stage-pause.ts and dd-eval/lib/runner.mjs.
Reuse the existing shell quoting helper after verifying its semantics. Quote literal
argv separately from intentional executable expressions such as "$DD_FLOW_BIN";
do not blindly quote an expression into a literal executable name. Keep direct
spawn(argv) calls as argv. Extract a small command builder only if existing helpers
cannot express these actual callers; preserve per-stage options and authority issuance.

Acceptance: paths containing spaces, quotes, dollar signs and backticks reach CLI
unchanged, with no command substitution; generated commands pass the production parser.

### R6 — Preserve accepted-result semantics while removing rereads

Additional review target: vnext-code-review.ts already distinguishes prepared input
from an accepted frozen decision and supports direct-call fallback reads. Review its
decision reader and corresponding PLAN-REVIEW/SPECIFY paths before deduplicating them.
Share file preparation, not the stage-specific decision/replay policy. Never replace
an accepted decision with an edited draft or turn a read-only replay into a write.

Acceptance: first submission consumes prepared bytes; accepted-result replay remains
immutable; explicit incompatible resubmission produces its original diagnostic.

### R7 — Reuse behavioural test cases

Use one parameterized matrix of file-input and shell-quoting cases across shared
parser/admission tests, plus narrow end-to-end tests for Work finish and HITL resume.
Adapter tests supply actual native envelopes to the shared assertions. Keep tests
of productive effects and diagnostic preservation; avoid duplicate string snapshots
for every stage or a new test framework. Prompt tests check that issued options exist
and that generated commands execute with the intended file, not just expected wording.

## Verification and execution sequence

1. Implement R1/R2 shared file preparation and packet/path contract, then command
   tables/help. Apply R5 quoting to each producer as it is migrated.
2. Migrate shared Work and HITL producers, all stage callers, controller and eval answer
   continuation. Update canonical instructions and examples in the same change set.
3. Implement R3 shared HITL packets and R4 evidence-based diagnostic distinction and
   propagation to fanout/eval. Preserve R6 accepted-result semantics throughout.
4. Run focused behavioural regressions using existing suites: lifecycle-invocations,
   hooks-shell, runtime-cutover, run-cli, stage-pause, Work registry, stage-specific,
   controller and eval interaction tests, sharing R7 behavioural cases. Locate actual
   suite names before wiring.
5. Required cases: generated file command accepted by production parser and hook;
   exact fresh-child association; sibling concurrent submissions; alias/space/quoted
   path; absent/unreadable/directory file; malformed JSON/schema failure; conflicting
   inputs; changed file between prepare and execute; corrected no-effect retry;
   settled replay and fork/new generation. Assert productive effects exactly once.
6. Reproduce CP-124 duplicate delimiter with real hook→CLI path: native evidence exists,
   correct composition diagnostic survives controller/eval. Separately test missing
   hook, foreign/ambiguous receipt, two lifecycle calls, trailing command, unfinished
   heredoc and valid legacy stdin. Never run historical submission against live RUN.
7. HITL: canonical text bytes preserved, empty input rejected, declared fixture matching
   unchanged, same-session resume, no manual answer at unsupported stages.
8. Prompt acceptance check: no active model instruction recommends heredoc/inline JSON
   shell construction; every advertised file option exists and uses declared aliases.
   Native protocol stdin and historical compatibility tests are explicit exceptions.
9. Review/typecheck/targeted tests and required release checks. Publish engine and any
   changed flow/memory-bank resources with exact versions; update checkpoint inputs
   honestly if prompts/canon changed (do not claim engine-only comparability).
10. Prepare an isolated fork at the completed PLAN boundary to qualify PLAN-REVIEW quickly;
    preserve source RUN. Verify new file commands, primary errors and settled children.
    A full clean E2E is then required to qualify earlier HITL and all later stage paths.
    Launch only after preflight, monitor actual RUN timeline/Work/native progress.

## Completion criteria

All active model-facing structured inputs use files; all generated commands round-trip
through native observation and CLI; file errors precede productive effects; canonical
receipts remain CLI-owned; true hook failures remain infrastructure failures; original
diagnosis is retained through fanout/eval; source runs remain unchanged. Report code/test
completion separately from successful live qualification and any adapter coverage gaps.
