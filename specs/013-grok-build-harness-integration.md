# Specification 013: Grok Build harness integration

Status: implemented; live conformance passed
Date: 2026-08-28  
Owner: `dd-eval`  
Affected repositories: `dd-eval`, `dd-flow-cli`  
Initial harness profile: `grok-acp`  

## Goal

Add Grok Build as a controlled Subject harness without moving the Controller or
Judge out of Codex. A Codex Controller must be able to create, fork, prompt,
inspect and cancel Grok Sessions, observe the complete root/child tree, bind
trusted lifecycle commands to `dd-flow`, collect non-duplicated usage and prove
a settled execution before checkpointing or scoring.

The implementation reuses the multi-harness contract established by ZCode. It
does not introduce a general plugin framework: one small `dd-grok` driver and
one Grok normalization path in `dd-flow-cli` are sufficient.

## Baseline and source of truth

Planning starts from the revisions that already contain the complete ZCode
integration:

| Repository | Base branch | Base revision | Feature branch |
| --- | --- | --- | --- |
| `dd-eval` | `beta/vnext-plan-review` | current beta branch | `feat/grok-harness` |
| `dd-flow-cli` | `main` | `30f822c` | `feat/grok-harness` |

The local Grok Build baseline observed during research is:

```text
grok 1.0.12 (ece2b556c271)
platform: macOS arm64
models: grok-4.6, grok-4.5
grok-4.6 effort: low, medium, high, xhigh
```

The implementation must pin the exact released version and build revision in
the profile and doctor receipt. A different version is drift until its
conformance suite passes. Open-source `main` is an explanatory oracle, not an
implicit substitute for the pinned installed binary.

Authoritative upstream references:

- <https://docs.x.ai/build/overview>
- <https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md>
- <https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/10-hooks.md>
- <https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/16-subagents.md>
- <https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/17-sessions.md>

## Scope

In scope:

- Grok Build as root Subject and as the owner of its native subagents;
- ACP over a locally owned `grok agent --no-leader stdio` process;
- an execution-scoped `dd-grok` daemon and append-only journal;
- create, load/resume, prompt, inspect, explicit fork and tree cancellation;
- requested and observed model/reasoning/mode receipts;
- Grok `PreToolUse` lifecycle binding for root and child Sessions;
- native child topology, progress, completion and per-Session evidence;
- cumulative usage snapshots with explicit aggregation scope;
- clean E2E execution and focused-stage starter execution;
- diagnostic, delegated and scored conformance gates;
- macOS and Linux Unix-domain sockets.

Out of scope for the first version:

- moving the Controller or Judge to Grok;
- a machine-wide Grok daemon;
- Grok `leader`, relay or public WebSocket exposure;
- Grok-managed worktrees for ordinary `dd-flow` children;
- nested subagents beyond Grok's native depth-one limit;
- accepting user plugins, user hooks, user MCP servers or foreign harness
  compatibility state as part of a scored profile;
- reading or mutating Grok's internal Session files as a production control
  plane;
- patching or forking `xai-org/grok-build` unless a conformance blocker is
  demonstrated against the pinned release;
- exact dollar cost when the provider marks cost absent or partial.

## Required architecture

```text
Codex Controller
  -> dd-grok CLI client
      -> execution-scoped Unix socket
          -> dd-grok daemon
              -> persistent ACP stdio: grok agent --no-leader
                  -> root Grok Session
                      -> foreground/background child Grok Sessions

Grok controlled PreToolUse hook
  -> dd-flow grok event handle

ACP lifecycle/topology/usage
  -> dd-grok append-only journal
  -> dd-flow normalized evidence
  -> dd-eval execution evidence
```

The wrapper daemon is required even though Grok already provides a long-lived
ACP process. Controller actions are separate CLI invocations, while background
children and their cancellation handles belong to the live Grok process. The
daemon keeps that process, the ACP subscription and the evidence order alive
for one execution.

`grok agent serve` is a valid future transport, but does not remove our need to
own execution identity, journal ordering, hook configuration and settled
cleanup. `grok agent leader` is rejected for scored work because it is shared
across executions and weakens version/configuration isolation.

## Harness identity

The harness identifier is `grok-acp`; the runtime family is `grok`; the driver
is `dd-grok`.

Provider Session IDs are opaque. The normalized `dd-flow` key is:

```text
grok-acp:<provider-session-id>
```

The root and every child are physical Sessions. A child relation comes only
from native `SubagentSpawned` evidence or an equivalent authoritative ACP
snapshot. Prompt text, task descriptions and inferred string patterns are not
identity evidence.

Minimum Session evidence:

```json
{
  "harness": "grok-acp",
  "runtime_family": "grok",
  "provider_session_id": "<uuid>",
  "adapter_session_id": null,
  "daemon_id": "<uuid>",
  "parent_session_id": "<root-or-null>",
  "agent_id": "<native-agent-id-or-null>",
  "subagent_type": "<type-or-null>",
  "requested_profile": {},
  "observed_profile": {}
}
```

Grok's ACP Session ID is the provider identity, so a second adapter ID is not
invented. `agentInstanceId` identifies one runtime process and belongs in the
daemon receipt, not in the provider Session key.

## Capability contract

`dd-grok doctor --json` must report requested, advertised and verified
capabilities separately. The initial profile requires:

| Capability | Native source | Required evidence |
| --- | --- | --- |
| create | `session/new` | new opaque Session ID and verified cwd |
| resume | `session/load` | loaded same Session ID and session info |
| prompt | `session/prompt` | prompt ID, ordered updates and terminal result |
| cancel root | `session/cancel` | cancelled/terminal root turn |
| close | `_x.ai/session/close` | explicit close outcome |
| inspect | `_x.ai/session/info` | cwd, resolved model and turn/context facts |
| fork | `_x.ai/session/fork` | new ID, parent ID, target and new cwd |
| child list | `_x.ai/subagent/list_running` | authoritative running descendants |
| child inspect | `_x.ai/subagent/get` | child/parent IDs, status and provenance |
| child cancel | `_x.ai/subagent/cancel` | explicit cancellation outcome |
| usage | `_x.ai/session/usage` | cumulative tokens and completeness flags |
| lifecycle gate | Grok `PreToolUse` | pre-effect trusted claim |

Raw ACP JSON-RPC extension methods require the ACP extension wire prefix `_`.
For example, the logical method `x.ai/session/usage` is sent as
`_x.ai/session/usage`. A protocol test must pin this because omitting `_`
returns `-32601 Method not found` and looks like a missing Grok capability.

The driver must still discover advertised metadata from `initialize`; a hard
coded method table cannot turn a missing method into a supported capability.

## Profile and environment isolation

The initial profile is expected to resemble:

```json
{
  "schema_version": 1,
  "id": "grok-acp-xai-grok-4-6-high",
  "harness": "grok-acp",
  "runtime_family": "grok",
  "driver": "dd-grok",
  "control_lifetime": "execution_daemon",
  "delegated_background": true,
  "provider": "xai",
  "model": "grok-4.6",
  "reasoning": "high",
  "mode": "bypassPermissions",
  "subagent_depth": 1,
  "workspace_strategy": "controller_owned_shared_workspace"
}
```

The final mode label must match the observed Grok wire value; the example is
not permission to relabel an observed value. Requested and observed profiles
remain separate.

Every daemon uses a fresh `<state-dir>/grok-home` as both `GROK_HOME` and the
child process `HOME`. The generated configuration disables auto-update and all
Cursor/Claude compatibility surfaces. Before the ACP process starts, `dd-grok`
runs `grok inspect --json` in that same environment and fails closed if it sees
a foreign config layer, skill/agent/hook source, plugin, MCP, permission source,
remote compatibility setting or enabled external-compatibility cell. The
generated configuration must:

- disable auto-update;
- disable Cursor and Claude hooks, skills, agents, rules, MCP and Sessions;
- load only the controlled Grok hook and project-owned canonical instructions;
- disable unrequested user plugins, marketplaces and workflows;
- declare no MCP servers unless the eval profile explicitly pins them;
- keep subagents enabled and reject depth or isolation outside the profile;
- select the exact model and reasoning effort through process flags;
- retain an immutable effective-config receipt without secrets.

Authentication is not copied into evidence. `GROK_AUTH_PATH` may point to the
operator's protected credential file, or `XAI_API_KEY` may be inherited through
the daemon's controlled environment. Tokens, API keys and auth JSON contents
must never enter stdout, `daemon.json`, the journal or an eval artifact.

Authentication failure is `auth_required`, not model-quality evidence. The
local `1.0.12` profile was live-conformed with copied private auth, model
`grok-4.6` and reasoning `high`.

## `dd-grok` CLI contract

The public command shape follows `dd-zcode` so the Controller needs no new
orchestration concepts:

```text
dd-grok doctor [--grok-bin <path>] --json

dd-grok daemon start --state-dir <dir> --cwd <workspace> \
  --journal <events.jsonl> --grok-bin <path> \
  --dd-flow-bin <path> --dd-flow-home <dir> \
  --project-root <root> --model grok-4.6 \
  --reasoning high --mode bypassPermissions --json

dd-grok daemon status --state-dir <dir> --json
dd-grok daemon stop --state-dir <dir> [--cancel-tree] --json

dd-grok session create --state-dir <dir> --prompt-file <file> --json
dd-grok session prompt --state-dir <dir> --session-id <id> \
  --prompt-file <file> --json
dd-grok session inspect --state-dir <dir> --session-id <id> --json
dd-grok session fork --state-dir <dir> --session-id <id> \
  --target-json '{"newCwd":"<attempt-root>"}' --json
dd-grok session cancel --state-dir <dir> --session-id <id> --json
```

`session create` means create followed by the supplied first turn. An internal
create-without-prompt operation may exist for tests and starter preparation,
but it is not a scored productive Session.

`session prompt` returns only after the root turn reaches a terminal response.
It may return with background children still running; the daemon stays alive
and reports `tree_status=running`. Checkpointing remains forbidden until the
separate settled barrier passes.

Productive create, prompt and fork operations are serialized. Status, inspect
and cancel remain available while a turn is running. A second productive
request returns `operation_busy` rather than waiting invisibly.

### Live conformance receipt

The implemented profile passed a clean, disposable live run on 2026-08-28:

- isolated daemon startup: one controlled hook, zero external skills, and one
  managed config layer;
- root create and observed-profile match for `grok-4.6/high`;
- trusted `PreToolUse` bootstrap binding accepted by `dd-flow`;
- native fork with copied history, then explicit `session/load` before a child
  prompt;
- root-inclusive `grok_session_usage_v1` ingestion without child double count;
- active child turn cancelled with provider `stopReason=cancelled` and
  `cancellationCategory=MidTurnAbort`.

## Daemon state and journal

The existing `dd-zcode` daemon implementation is the reference for:

- Unix socket ownership and permissions;
- deterministic short socket paths on macOS;
- live handshake rather than PID-only identity;
- terminal state directories;
- one active productive operation;
- concurrent inspect/cancel;
- append-only journal writes;
- clean and unclean shutdown classification.

Only genuinely shared mechanics should be extracted, preferably:

```text
lib/harness-daemon.mjs
  socket path and permissions
  request/response framing
  daemon start/status/stop handshake
  terminal state handling
  append-only journal primitive
```

ACP and provider policy remain in `dd-zcode` and `dd-grok`. Do not build a
generic provider interface, registry or plugin loader.

The daemon journal uses monotonically increasing local `order` and records:

- daemon start/config/version receipt;
- exact outbound ACP requests with secret-free params;
- inbound responses and notifications;
- hook registration and hook outcomes;
- root and child topology changes;
- usage snapshots and their aggregation scope;
- requested/observed profile checks;
- cancellation attempts and outcomes;
- settled-barrier snapshots;
- clean or unclean terminal receipt.

Native order is trusted only inside one ACP connection epoch. After reconnect,
the journal opens a new epoch and reconciles authoritative state before any
productive operation.

## Session create, resume and fork

### Create and resume

`session/new` receives the absolute controlled cwd, no MCP servers and a
non-interactive permission mode. The returned Session ID is registered before
the first productive prompt.

`session/load` must verify:

- the requested provider Session exists;
- its effective cwd equals the controlled workspace;
- its observed model/reasoning match the execution profile;
- its parent and role agree with existing evidence;
- it has no unexplained active turn or child before a new prompt.

A warm attach cannot silently change permission mode. If the requested mode is
not observed, resume fails with `profile_mismatch`.

### Fork

Focused-stage evals use `_x.ai/session/fork`, never `/fork` through model text.
The request includes:

- exact source Session ID and source cwd;
- Controller-generated new Session ID or accepted provider-generated ID;
- exact attempt cwd;
- explicit `targetPromptIndex` from accepted starter evidence;
- the expected model ID.

Fork is allowed only when the source is terminal and has no running child. The
response must prove a different ID, the correct parent ID, copied history and
the requested new cwd. The fork copies conversation state; the Controller owns
materialization of the corresponding filesystem checkpoint. Grok rewind or
`--restore-code` is never used as an implicit filesystem reset.

Starter registries remain partitioned by harness. A Codex or ZCode starter
cannot satisfy a Grok profile.

## Subagent topology and workspace policy

Grok emits `SubagentSpawned` on the parent channel before dispatching the child
prompt. The daemon must atomically record:

```text
root provider Session
parent prompt ID
child/subagent Session ID
subagent type and description
effective model
context source and resumed-from ID
capability mode
workspace/cwd
```

The mapping is forwarded to `dd-flow` before the child can claim a Work. Child
progress and terminal updates mutate only the observed topology; parentage is
immutable.

The first profile permits a flat tree only. Any attempt by a child to spawn a
descendant is an unsupported-capability failure even if a future Grok release
starts allowing it.

The normal `dd-flow` profile uses the Controller-owned attempt workspace with
`isolation=none`. A `PreToolUse` policy hook rejects Grok-native
`isolation=worktree` for `spawn_subagent`, because that worktree would be
outside the flow's registered workspace and merge policy. Native worktree mode
may be added later as a distinct, separately conformed profile.

## Trusted lifecycle adapter

The primary lifecycle evidence source is a controlled Grok `PreToolUse` hook,
not a post-effect ACP projection. It runs for both root and child Sessions and
provides the native `sessionId`, `promptId`, cwd, tool name, tool input and
`subagentType` when applicable.

The generated hook invokes:

```text
dd-flow grok event handle --project-root <absolute-root> --json
```

with the Grok hook payload on stdin and daemon identity/profile/tree context in
a protected environment or local state lookup. The normalized event contains:

```json
{
  "schema_id": "dd-flow/runtime-event@1",
  "harness": "grok-acp",
  "provider_session_id": "<native-session-id>",
  "parent_session_id": "<native-parent-or-null>",
  "daemon_id": "<daemon-id>",
  "prompt_id": "<native-prompt-id>",
  "event": "tool_scheduled",
  "tool": "run_terminal_command",
  "cwd": "<controlled-root>",
  "source_event_id": "<stable-hook-event-id>"
}
```

For a protected lifecycle command the adapter performs the same narrow shell
analysis as the Codex and ZCode paths, creates one trusted claim, and returns
Grok-compatible `updatedInput` containing `--hook-event-id`. Compound commands,
wrong cwd, unknown child, replayed event IDs and mismatched Work/Session are
denied.

Grok hooks fail open on process crash or timeout. The system therefore retains
the existing second barrier: protected `dd-flow` lifecycle commands themselves
require the trusted `--hook-event-id`. If the hook fails to start, it cannot
inject a valid claim and the lifecycle command fails without committing stage
or Work state. Post-turn reconciliation classifies any unexplained side effect
as `invalid_infrastructure_flow`.

ACP `tool_call` and `tool_call_update` events remain journal evidence and a
reconciliation source, but they do not replace the pre-effect hook claim.

## Usage accounting

Grok's root cumulative usage can include completed subagent usage. Summing the
root and children would double count. Every snapshot therefore declares:

```text
scope = physical_session | execution_tree_inclusive
completeness = complete | incomplete | unknown
```

Rules:

1. The root `_x.ai/session/usage` snapshot is stored as
   `execution_tree_inclusive` when Grok declares folded child usage.
2. A child snapshot is stored as `physical_session`.
3. RUN total comes from the root-inclusive delta, never root plus children.
4. Child physical deltas provide Work/stage attribution.
5. Root-exclusive usage may be derived only when every child is terminal and
   complete and the inclusive counters are greater than or equal to the child
   sum. Otherwise it remains unknown.
6. `usageIsIncomplete`, partial subagent drains or missing snapshots keep the
   settled barrier provisional.
7. Missing/partial cost means unknown cost, never zero.
8. Tool calls use ACP `tool_call`/terminal updates and are deduplicated by
   `(harness, provider_session_id, tool_call_id)`.

`dd-flow-cli` must remove ZCode-only branching from the generic snapshot read
path. `harness_usage_snapshots` becomes usable for any external harness and
stores at least `scope`, `completeness` and source kind. Existing ZCode rows
default to `physical_session` so the migration preserves current reports.

Expected Grok source kind:

```text
grok_session_usage_v1
```

## Settled barrier and cancellation

A Grok execution is settled only when all conditions hold:

- the root prompt is terminal and no root turn is running;
- `_x.ai/subagent/list_running` is empty;
- every observed child has a terminal `SubagentFinished` or reconciled terminal
  status;
- no permission, elicitation, background shell or scheduled task remains;
- all hook events and ACP updates through the terminal barrier are journalled;
- final root-inclusive and child usage snapshots were ingested;
- every productive physical Session matches the requested profile;
- `dd-flow` has no active binding or unfinished stage-owned Work;
- the project and RUN have not changed after checkpoint capture.

Cancellation order:

1. Snapshot root and child topology.
2. Cancel every running child with `_x.ai/subagent/cancel`.
3. Cancel the running root turn with `session/cancel` when necessary.
4. Re-query running children and root state.
5. Close resident Sessions only after terminal evidence is captured.
6. Emit a settled or partial-cancellation receipt.

Root cancellation alone is not tree cancellation. A daemon crash with an
observed running descendant produces `invalid_harness_crash`; persisted history
may aid diagnosis but cannot prove that the lost runtime was cancelled.

## Failure codes

Reuse existing cross-harness codes where semantics match:

```text
auth_required
daemon_not_running
daemon_state_terminal
daemon_config_mismatch
daemon_protocol_mismatch
operation_busy
session_identity_mismatch
profile_mismatch
interaction_policy_missing
tree_not_settled
partial_cancellation
invalid_harness_crash
bridge_exited
```

Grok-specific diagnostics:

```text
grok_capability_missing
grok_extension_wire_mismatch
grok_subagent_depth_unsupported
grok_workspace_isolation_unsupported
grok_usage_scope_incomplete
```

Diagnostics are infrastructure evidence. They never become a scored model
failure.

## Repository changes

### `dd-eval`

Add:

- `bin/dd-grok.mjs`;
- `lib/dd-grok.mjs` for ACP and provider policy;
- `lib/dd-grok-daemon.mjs` for execution ownership;
- optionally `lib/harness-daemon.mjs` containing only proven shared daemon
  mechanics extracted from `dd-zcode`;
- `test/dd-grok.test.mjs`;
- `test/dd-grok-daemon.test.mjs`;
- `profiles/grok-acp-grok-4-6-xhigh.json` after live profile verification;
- `runbooks/dd-grok-live-validation-YYYY-MM-DD.md` after conformance.

Update:

- `package.json` to publish the `dd-grok` binary;
- `lib/dd-eval.mjs` to recognize `grok-acp` in profile, checkpoint, starter,
  Session and runtime-family validation;
- `runbooks/harness-backends.md` with the accepted Grok operating contract;
- `runbooks/execute-eval.md` with Grok create/fork/settle commands;
- eval tests so supported harness checks are table-driven rather than adding a
  third chain of string comparisons.

The table-driven refactor is limited to existing harness validation sites. It
does not introduce dynamic plugin discovery.

### `dd-flow-cli`

Add or update:

- `src/services/hooks.ts`: Grok hook normalizer and trusted child mapping;
- `src/services/usage.ts`: generic external-harness ingestion and Grok usage
  scope rules;
- `src/cli/run-cli.ts`: `grok event handle` and `grok usage ingest` dispatch;
- `src/cli/help.ts`: operator help;
- `src/storage/database.ts`: usage scope/completeness migration if required;
- `src/services/cli-operation-classifier.ts`: mutating-operation
  classification;
- `test/runtime-cutover.test.ts`: root/child lifecycle and usage accounting;
- focused hook shell tests for updated-input allow/deny behavior;
- `CHANGELOG.md` and one changeset.

Prefer a generic internal helper such as `ingestHarnessUsage(..., harness,
sourceKind)` over copying `ingestZcodeUsage`. Public CLI commands remain
provider-specific because their native envelopes differ.

No Grok code is added to `dd-memorybank` or `dd-tasks`: they are evaluated
content and workflow consumers, not harness owners.

## Implementation phases

### Phase 0 — authenticated conformance fixture

1. Authenticate the local Grok installation without exposing credentials.
2. Generate an isolated `GROK_HOME` and controlled config.
3. Capture `version --json`, `initialize` and effective model/effort receipts.
4. Prove raw `_x.ai/*` extension calls against the pinned binary.
5. Record a capability matrix; stop on version or entitlement mismatch.

Exit: root Session can be created and closed without repository mutation.

### Phase 1 — root ACP driver

1. Implement the newline JSON-RPC ACP client with request correlation,
   reverse-request handling, timeouts and append-only journal.
2. Implement doctor, create, load, prompt, info, usage, cancel and close.
3. Verify requested versus observed model/reasoning/mode.
4. Unit-test with a fake Grok ACP process; live-test one no-tool and one tool
   turn.

Exit: conformance level A, root diagnostic.

### Phase 2 — fork and starter semantics

1. Implement explicit `targetPromptIndex` fork.
2. Prove parent relation, new cwd and no implicit filesystem rewind.
3. Register a Grok canonical checkpoint and one untouched Grok starter.
4. Exercise one focused-stage diagnostic without scoring.

Exit: conformance level B, seeded root eval.

### Phase 3 — daemon and delegated tree

1. Extract the minimal shared daemon mechanics from `dd-zcode`.
2. Keep one `grok agent --no-leader stdio` alive for the execution.
3. Journal `SubagentSpawned/Progress/Finished` and implement list/get/cancel.
4. Prove foreground, background, resume-from and parallel child behavior.
5. Prove cancel while root is running and cancel after root returns with a
   background child.
6. Prove unclean crash classification.

Exit: authoritative flat topology and deterministic cleanup.

### Phase 4 — trusted `dd-flow` lifecycle

1. Install the controlled Grok hook in isolated config.
2. Normalize root and child `PreToolUse` events.
3. Register native parent/child mapping before Work claim.
4. Return `updatedInput` with the trusted hook event ID.
5. Deny compound, wrong-root, wrong-parent and Grok-worktree starts.
6. Prove the lifecycle command itself fails if the hook is absent or crashes.

Exit: root and child can start/finish real `dd-flow` stages/Works without
untrusted identity.

### Phase 5 — usage and reconciliation

1. Add generic external-harness snapshot storage fields.
2. Ingest root-inclusive and child-physical snapshots.
3. Prove no double counting with one root and at least two children.
4. Reconcile tool calls, failures, model calls and incomplete usage.
5. Block settled/scoring on missing productive Session evidence.

Exit: conformance level C, delegated eval.

### Phase 6 — scored parity

1. Run a clean E2E diagnostic on a small case revision.
2. Run a focused starter diagnostic.
3. Exercise permission rejection, root cancellation, child cancellation,
   profile drift and daemon crash fixtures.
4. Repeat the successful smoke to establish deterministic control behavior.
5. Capture a dated live-validation runbook and freeze the profile.
6. Only then enable Grok in a scored case definition.

Exit: conformance level D, scored parity.

## Test matrix

Automated tests must cover:

| Area | Cases |
| --- | --- |
| protocol | initialize, raw extension `_`, unknown method, timeout, malformed line, process exit |
| profile | exact match, model drift, effort drift, mode drift, version drift |
| Session | create, load, close, duplicate ID, wrong cwd, explicit fork target |
| prompt | text, tool call, terminal error, cancel, reverse permission request |
| hooks | root allow, child allow, duplicate, compound deny, wrong root deny, missing claim |
| topology | foreground child, background child, parallel children, finished child, flat-depth rejection |
| cancellation | child, root plus child, already terminal, partial, daemon crash |
| usage | root only, root-inclusive plus children, cache/reasoning fields, incomplete, partial cost |
| daemon | idempotent start, config mismatch, busy operation, status during prompt, clean stop, terminal reuse |
| eval | profile load, Session add, checkpoint by harness, starter by harness, settled sync |

Live tests must use a disposable repository and isolated runtime homes. They
must not modify canonical cases, current user Sessions or current user hooks.

## Acceptance criteria

The integration is complete only when:

- `dd-grok doctor` pins and verifies the installed Grok release;
- a Codex Controller can create and prompt a Grok Subject without manual TUI
  interaction;
- every productive root and child has native identity, parent, observed
  profile, terminal state and usage evidence;
- root and child lifecycle commands bind before side effects;
- Grok-managed worktree escape is rejected in the initial profile;
- fork uses an explicit accepted target and new controlled cwd;
- cancellation proves an empty tree or returns an infrastructure-invalid
  diagnostic;
- root-inclusive usage is not double counted with child usage;
- an unauthenticated, drifted, incomplete or crashed execution cannot be
  checkpointed or scored;
- `dd-flow-cli` typecheck, lint and full test suite pass;
- `dd-eval` full test suite passes;
- the dated live-validation runbook records successful root, delegated,
  background cancellation, fork and usage experiments;
- the profile is enabled in a case only after conformance level D.

## Merge and release plan

Changes land dependency-first.

1. Rebase both feature branches on their current upstream base immediately
   before final validation.
2. Merge and release `dd-flow-cli` first:
   - generic external usage storage;
   - Grok event/usage adapters;
   - tests, changelog and changeset;
   - publish the next beta engine tag.
3. Update the `dd-eval` Grok profile to the exact released engine revision.
4. Complete `dd-eval` driver, daemon, runbooks and conformance receipts.
5. Re-run the full live smoke using the released `dd-flow-cli`, not a source
   checkout masquerading as the release.
6. Merge `dd-eval` into the active `beta/vnext-plan-review` line after
   reconciling any newer canonical case revisions. Do not rewrite or regenerate
   unrelated checkpoints as part of the harness merge.
7. Push feature branches and merge only after both repositories are clean and
   the pinned cross-repository revisions agree.
8. Delete feature branches/worktrees only after remote merge and a clean
   post-merge smoke.

Rollback is configuration-only until a scored case declares the Grok profile:
remove the profile from the case definition and keep the driver/evidence for
diagnostics. Database additions are additive and must not require destructive
rollback. Existing Codex and ZCode paths remain unchanged.

## Open live questions

The documentation and source resolve the architecture. These facts still need
authenticated confirmation against the pinned binary:

1. Exact terminal ACP response fields for requested `xhigh` effort.
2. Whether root `_x.ai/session/usage` is complete immediately at root turn end
   when a background child remains live.
3. Whether a terminal child stays resident long enough for a final direct
   child usage query, and the fallback notification fields if it does not.
4. Exact ordering among controlled `PreToolUse`, ACP `tool_call` and actual
   shell start.
5. Whether `session/cancel` on the root also cancels children in every path;
   the implementation still performs explicit child cancellation regardless.
6. Fork behavior after compaction and the stable meaning of
   `targetPromptIndex` across the accepted starter lifecycle.
7. Permission/elicitation reverse-request shapes in non-interactive ACP mode.

Each answer becomes a conformance assertion or an explicit unsupported
capability. None may remain an operator assumption in a scored profile.
