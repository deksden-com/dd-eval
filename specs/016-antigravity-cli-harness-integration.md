# Specification 016: Antigravity CLI harness integration

Status: proposed implementation contract; fork semantics experimentally characterized
Date: 2026-08-29
Owner: `dd-eval`
Affected repositories: `dd-eval`, `dd-flow-cli`
Feature branches: `feat/antigravity-cli-harness`
Initial harness ID: `antigravity-cli`
Initial runtime baseline: Antigravity CLI `1.1.22`

## Purpose

Add Antigravity CLI as a controlled Subject harness while retaining Codex as
the eval Controller. The implementation uses the official headless NDJSON
protocol for productive turns and an execution-scoped `dd-agy` daemon for
process ownership, lifecycle evidence, usage reconciliation, interactions and
tree cancellation.

This specification extends the common requirements in
[Specification 014](014-harness-backend-contract.md). It does not introduce a
backend plugin framework, replace `dd-flow` lifecycle authority, or treat the
Antigravity 2 GUI and Antigravity CLI as the same runtime.

## Terminology and identity

- **Antigravity 2** is the GUI product and is not controlled by this backend.
- **Antigravity CLI** is the locally installed `agy` executable.
- **Conversation** is the provider's persisted conversational state.
- **Turn** is one input `user` event and its terminal `result`.
- **Root conversation** is the physical Subject Session controlled by the
  execution daemon.
- **Subagent conversation** is a physical child reported by
  `step_update.subagent_info` or a trusted child hook.
- **Conversational fork** is a native clone made by the interactive `/fork`
  command. It is seed provenance, not subagent parentage.

Normalized Session IDs are namespaced:

```text
antigravity-cli:<conversation-id>
```

A native fork records `seed_source_session_id`; it must not populate
`parent_session_id`. Physical subagents use `parent_session_id`.

## Baseline and authoritative sources

The initial baseline observed on macOS arm64 is:

```text
agy 1.1.22
```

The implementation contract is based on:

- <https://antigravity.google/docs/cli/headless/>
- <https://antigravity.google/docs/cli/conversations/>
- <https://antigravity.google/docs/cli/subagents>
- <https://www.agy.dev/docs/hooks/>
- <https://github.com/google-antigravity/antigravity-cli>

The official repository distributes the CLI, changelog and documentation. The
installed CLI is a monolithic Mach-O binary; implementation does not assume
access to provider source code.

## Backend descriptor

```json
{
  "schema_id": "dd-eval/harness-backend@1",
  "harness": "antigravity-cli",
  "runtime_family": "antigravity",
  "driver": "dd-agy",
  "control_lifetime": "execution_daemon",
  "identity_scope": "provider_session",
  "workspace_strategy": "controller_owned_shared_workspace",
  "transport": "stdio_ndjson",
  "capabilities": {
    "create_and_prompt": true,
    "multi_turn_process": true,
    "resume_by_id": true,
    "tool_hooks": true,
    "terminal_usage": true,
    "tree_cancel": true,
    "deterministic_replay": true,
    "native_headless_fork": false,
    "native_tui_fork": "experimental",
    "targeted_child_cancel": "unverified",
    "child_usage_scope": "unverified"
  }
}
```

Capabilities are version- and platform-gated. `experimental` and `unverified`
values never satisfy a scored capability requirement.

## Scope

The first implementation includes:

- version/profile doctor;
- isolated configuration and runtime roots;
- execution-scoped daemon and Unix socket;
- one persistent `agy` stream process per root execution;
- create-and-prompt, prompt, inspect, resume and tree cancel;
- trusted tool hooks and settled-tree Stop evidence;
- cumulative usage snapshots and Work deltas;
- root and observable child Session registration;
- interaction continuation through subsequent `user` events;
- deterministic replay starters;
- diagnostic SPECIFY followed by clean E2E conformance.

The first implementation does not require:

- Antigravity 2 GUI automation;
- Antigravity SDK;
- direct mutation of provider SQLite stores;
- a generic runtime plugin framework;
- user hooks, plugins, MCP servers, skills or agents;
- native fork for clean E2E;
- targeted child cancellation until the headless control surface is proven.

## Process architecture

```text
Codex Controller
  -> dd-agy CLI client
      -> execution-private Unix socket
          -> dd-agy daemon
              -> persistent agy process
                  --input-format stream-json
                  --output-format stream-json

agy stdout
  -> append-only private provider journal
  -> turn state / topology projection
  -> dd-flow agy usage ingest

Antigravity hook command
  -> dd-agy hook handle
      -> daemon identity resolution
      -> dd-flow agy event handle
      -> Antigravity hook decision
```

The daemon owns one attempt, one controlled workspace, one private Gemini
directory and one root process tree. A daemon is not shared between eval
executions.

## Headless protocol

Productive work uses:

```bash
agy \
  --input-format stream-json \
  --output-format stream-json \
  --model gemini-3.1-pro-high \
  --mode accept-edits \
  --dangerously-skip-permissions \
  --print-timeout 30m \
  --gemini_dir <absolute-private-gemini-dir> \
  --app_data_dir runtime
```

Input is one NDJSON record per turn:

```json
{"event":"user","message":{"content":"<stage packet or interaction fixture>"}}
```

Only text content is allowed. The driver rejects binary or unknown content
blocks before writing them to the provider stream.

The expected output sequence is:

```text
init once
step_update zero or more times
result exactly once per accepted user input
```

The daemon permits one productive turn at a time. It waits for the current
terminal `result` before accepting the next prompt. Inspection and tree cancel
remain available while a turn runs.

### Slash commands and mode

Do not pass `--disable-slash-commands` in the scored profile. Live validation
showed that `agy 1.1.22` warns that `--mode plan` has no effect while slash
expansion is disabled. Stream input already rejects CLI slash commands, so
the flag is unnecessary and would weaken profile pinning.

Prompts beginning with `/` are rejected at the driver boundary unless they
are part of a dedicated, non-productive conformance operation.

## Session operations

### Doctor

```text
dd-agy doctor --agy-bin <path> --json
```

Doctor reports:

- driver version;
- `agy --version` output;
- binary path, SHA-256, platform and architecture;
- model-list availability;
- requested, documented and verified capabilities;
- support for hidden isolation flags;
- auth availability without account identity or secret values;
- private-directory writeability;
- compatibility with the pinned baseline.

Doctor must actively prove `--gemini_dir` and `--app_data_dir` behaviour in a
temporary directory. An accepted version is incompatible if either hidden
flag changes semantics even when `agy --version` remains `1.1.22`.

### Daemon

```text
dd-agy daemon start --state-dir <dir> --cwd <workspace> \
  --journal <events.jsonl> --agy-bin <path> \
  --dd-flow-bin <path> --dd-flow-home <path> \
  --project-root <stable-project-root> \
  --model gemini-3.1-pro-high --mode accept-edits --json

dd-agy daemon status --state-dir <dir> --json
dd-agy daemon stop --state-dir <dir> [--cancel-tree] --json
```

Start is idempotent only for an identical configuration and live daemon.
Status proves the control socket and owned `agy` PID are live; a state file is
not sufficient. Stop without `--cancel-tree` rejects an unsettled tree.

### Create

```text
dd-agy session create --state-dir <dir> --prompt-file <file> --json
```

The initial contract is `create_and_prompt`. The daemon starts `agy`, waits
for `init`, captures `conversation_id`, forwards the first prompt and waits for
its `result`. An idle create may be added only if conformance proves a stable
provider boundary before the first prompt.

### Prompt

```text
dd-agy session prompt --state-dir <dir> \
  --session-id <conversation-id> --prompt-file <file> --json
```

The target must equal the daemon's live root conversation unless a later
capability explicitly supports multiple controlled root processes.

### Inspect

```text
dd-agy session inspect --state-dir <dir> \
  --session-id <conversation-id> --json
```

Inspect is non-mutating and reports the daemon projection: requested and
observed profile, current turn, last terminal result, transcript locator,
known children, interaction state, cumulative usage and settlement evidence.
Inspect does not open a provider process or load a conversation.

### Resume

If the provider process exited cleanly with a settled tree, the same daemon
may start a new process with:

```text
--conversation <conversation-id>
```

Resume must use the same private Gemini directory. The first `init` must return
the requested conversation ID and model. A mismatched ID, workspace or model
is `profile_drift` or `session_not_found`, not a new Session.

### Cancel

```text
dd-agy session cancel --state-dir <dir> \
  --session-id <conversation-id> --tree --json
```

The first supported cancellation is complete-tree cancellation. The daemon
signals the exact process group it created, waits for settlement, then applies
bounded `SIGTERM` and `SIGKILL` fallback. The final receipt distinguishes
provider `CANCELED`, provider `INTERRUPTED`, clean process exit and forced
termination.

`cancel_child` remains unsupported until live subagent conformance proves a
non-model-mediated control path.

## Configuration and auth isolation

### Observed CLI layout

By default, Antigravity CLI uses:

```text
~/.gemini/config
~/.gemini/antigravity-cli
```

The installed binary also accepts hidden flags:

```text
--gemini_dir <absolute-directory>
--app_data_dir <relative-name>
```

With:

```text
--gemini_dir <state-dir>/gemini
--app_data_dir runtime
```

the observed layout is:

```text
<state-dir>/gemini/
├── config/
└── runtime/
    ├── conversations/
    ├── brain/
    ├── cache/
    ├── log/
    └── conversation_summaries.db
```

The daemon keeps the user's normal `HOME` so the existing macOS Keychain search
list remains available, while `--gemini_dir` prevents loading ordinary user
configuration and writing provider state into the normal CLI directory.

### Auth findings

Live validation established:

1. normal `HOME` can list models;
2. a clean replacement `HOME` cannot authenticate;
3. copying ordinary `.gemini` account metadata into the clean home is not
   sufficient because macOS Keychain lookup follows the home search list;
4. normal `HOME` plus isolated absolute `--gemini_dir` authenticates and writes
   all observed config/runtime state beneath the isolated directory.

Therefore the initial macOS profile imports no credential files. It relies on
the user's already-authorized Keychain while isolating file-backed state. If
the hidden flag disappears, scored execution fails closed; it does not fall
back to the normal `.gemini` directory.

### Onboarding state

Headless model calls succeed in a fresh isolated Gemini directory, but opening
the TUI can display onboarding and data-use screens. The driver must never
accept terms or change telemetry consent on behalf of the user.

An experimental TUI fork may import only an existing, explicitly selected
`cache/onboarding.json` receipt from an already-onboarded CLI profile. That
file is treated as user-controlled configuration, copied with mode `0600`,
hashed in the fork receipt, and excluded from Git. If it is absent or the TUI
asks for consent, native TUI fork is unavailable and the caller uses
deterministic replay.

### Environment

The child environment is allowlisted. It includes only values needed for the
executable, locale, private temporary directory, controlled workspace and
`dd-flow` adapter. Provider API-key variables, MCP configuration and unrelated
agent runtime variables are removed unless the accepted profile explicitly
requires them.

### Configuration origins

The profile receipt records paths and hashes, never contents, for:

- generated `config/hooks.json`;
- generated settings/permission overlay;
- admitted workspace instruction files;
- imported onboarding receipt when native TUI fork is requested;
- `agy` binary;
- model-list receipt.

Global hooks, MCP servers, plugins, skills, agents and instruction files are
not copied into the isolated Gemini directory.

## Profile contract

Initial profile:

```json
{
  "id": "antigravity-cli-google-gemini-3-1-pro-high",
  "harness": "antigravity-cli",
  "runtime_family": "antigravity",
  "driver": "dd-agy",
  "provider": "google",
  "model": "gemini-3.1-pro-high",
  "reasoning": "high",
  "mode": "accept-edits",
  "permission_mode": "always-proceed",
  "transport": "stdio_ndjson",
  "starter_mode": "deterministic_replay",
  "version": "1.1.22"
}
```

The `init.model` value is provider-observed. `init.permission_mode` must be
`always-proceed` when `--dangerously-skip-permissions` is selected. Effective
mode and effort require separate conformance because the documented `init`
schema does not guarantee distinct `mode` or `effort` fields. A requested argv
value is recorded as process-pinned, not mislabeled as provider-observed.

Unknown model selection is fatal. The driver never accepts provider fallback.

## Event and hook contract

Production installs only the minimal controlled hooks:

- `PreToolUse`;
- `PostToolUse`;
- `Stop`.

`PreInvocation` and `PostInvocation` are diagnostic conformance surfaces and
are not required for initial lifecycle correctness.

### Hook entrypoint

```text
dd-agy hook handle --state-dir <dir> \
  --project-root <root> --dd-flow-bin <path> --json
```

The hook reads the provider JSON payload from stdin, resolves the daemon and
physical Session identity, appends the raw private event, forwards a sanitized
event to `dd-flow`, and writes exactly one valid Antigravity hook response.

### `dd-flow` surface

```text
dd-flow agy event handle --project-root <absolute-root> --json
dd-flow agy usage ingest --project-root <absolute-root> --json
```

Provider event schema:

```json
{
  "schema_id": "dd-flow/agy-tool-event@1",
  "event_id": "<deterministic-id>",
  "phase": "before",
  "daemon_id": "<daemon-id>",
  "conversation_id": "<provider-id>",
  "parent_conversation_id": null,
  "step_index": 12,
  "tool": "run_command",
  "input": {},
  "workspace_paths": ["/absolute/workspace"],
  "transcript_path": "/private/runtime/brain/.../transcript.jsonl",
  "model": "gemini-3.1-pro-high",
  "observed_at": "<RFC3339>"
}
```

Antigravity hooks do not expose a provider tool-call ID or a documented input
rewrite field. The adapter derives an immutable event ID from daemon ID,
conversation ID, step index, phase, tool and canonical input digest. Lifecycle
claiming uses the existing synchronous recent-match fallback rather than
pretending the command was rewritten with `--hook-event-id`.

### Stop

Initial production Stop handling records:

- `executionNum`;
- `terminationReason`;
- `error` classification;
- `fullyIdle`;
- conversation/workspace/model identity.

It normally allows the stop. `decision: continue` is disabled in the first
profile because it can trigger additional model invocations and blur semantic
stage authority. A later liveness capability requires a bounded continuation
budget and a mechanical `dd-flow` next-action receipt.

## Turn outcomes and interactions

Normalized terminal mapping:

| Provider status | Normalized meaning |
| --- | --- |
| `SUCCESS` | current turn completed |
| `ERROR` | provider/model error |
| `CANCELED` | provider cancellation |
| `INTERRUPTED` | interrupted provider process |
| `WAITING` | interaction required |
| `INVALID` | invalid provider state |
| `RUNNING` | terminal barrier missing |

`SUCCESS` alone does not settle the execution tree. Checkpoint and finalization
also require `fullyIdle=true` or equivalent verified topology evidence.

For an interaction fixture, the daemon waits for the terminal `WAITING`
receipt, records the question evidence, and sends the fixture as the next
ordinary `user` event. It does not send unsupported `control_request` or
`control_response` records.

## Usage

`result.usage`, `result.num_turns` and `result.duration_seconds` are cumulative
over the conversation. The response text applies only to the current turn.

The daemon ingests a baseline before attributed Work and the final cumulative
value after Work:

```text
work usage = terminal cumulative after - cumulative before
```

It does not sum per-step usage into RUN totals.

Normalized source:

```text
harness = antigravity-cli
source_kind = antigravity_cli_session_usage_v1
```

Token fields map without guessed transformations:

```text
input_tokens     -> input_tokens
output_tokens    -> output_tokens
thinking_tokens  -> reasoning_output_tokens
cache_read_tokens -> cache_read_input_tokens
total_tokens     -> total_tokens
```

Tool calls are deduplicated by physical conversation, step index and tool
name. Hook and stream observations of the same tool are one call, not two.

Until a real subagent experiment proves whether root cumulative counters
include child work, usage scope is `unknown` and completeness is `partial`.
Scored usage remains unavailable at that capability level.

## Descendant topology

`step_update.subagent_info.subagents[]` can provide:

- child conversation ID;
- role;
- type name;
- log URI;
- workspace URIs.

Each observable child becomes a physical Session. A child hook with its own
`conversationId` can strengthen that identity. Prompt text, role names and
timing are never used as substitutes for provider identity.

The daemon must determine through conformance:

- whether child hooks fire;
- whether root `result` can arrive while a child remains active;
- whether Stop `fullyIdle` covers all children;
- whether root usage includes child usage;
- whether headless input exposes targeted child cancellation.

## Fork contract

### Proven negative: headless fork

Antigravity CLI `1.1.22` does not expose `/fork` through headless modes.

One-shot against an existing settled conversation:

```text
agy -p /fork --conversation <source> --output-format json
```

returns exit `2`, status `ERROR`, no usage and the provider error:

```text
/fork is not available in print mode
```

Streaming input containing `/fork` emits `init`, then the same terminal error
and exits `2`. `control_request` and `control_response` are also unsupported.

Therefore:

```text
native_headless_fork = false
```

### Proven native behaviour: interactive TUI fork

On a settled controlled source conversation, the interactive `/fork` command:

1. created a new provider conversation ID;
2. kept the source conversation unchanged;
3. copied all five completed source steps exactly into the child prefix;
4. recorded one provider parent-reference row containing the source ID;
5. allowed the child to continue independently;
6. allowed later headless resume of the child by its new ID;
7. preserved recall of the pre-fork source marker.

A second sibling was created non-interactively by placing the TUI under the
macOS `/usr/bin/script` pseudo-terminal and sending `/fork`. The isolated store
changed from two to three conversation databases, the new sibling contained
exactly the five source steps and its provider parent reference contained the
source ID.

This proves native fork semantics, but not yet a robust scored control path.
One early PTY attempt sent input before the TUI was ready and created no child;
a later bounded attempt succeeded. Fixed sleeps are not an acceptable
implementation barrier.

### Experimental `native_tui_fork`

An optional implementation may use the documented `/fork` command through a
controlled pseudo-terminal, subject to all of these gates:

1. source Session and complete tree are settled;
2. source store entry set and history digest are frozen;
3. TUI starts with the exact isolated Gemini directory and accepted profile;
4. no onboarding, consent, auth or permission prompt appears;
5. readiness is detected mechanically, not by a fixed sleep;
6. `/fork` is sent exactly once;
7. exactly one new conversation store appears;
8. the child history prefix exactly matches the source boundary;
9. the source store digest and step count remain unchanged;
10. child resume by ID succeeds without a model turn for verification where
    the CLI permits it;
11. the TUI process exits cleanly and no descendant remains;
12. any ambiguity returns `fork_verification_failed` and publishes no starter.

The driver must not parse or modify provider protobuf/SQLite contents to make
the fork. Store inspection may verify immutable counts/digests and discover
the exactly-one new conversation filename under the version-pinned layout.

Until a readiness detector and repeated conformance pass, the capability is:

```text
native_tui_fork = experimental
```

and is excluded from scored profiles.

### Required starter mode

The first accepted starter mode is:

```text
deterministic_replay
```

The Controller restores the project/RUN snapshot, starts a clean conversation,
sends the canonical stage packet and stores an immutable replay receipt. It
does not claim provider parentage or native clone semantics.

Clean full E2E does not require any fork: all stages can run sequentially in
one root conversation.

## Checkpoints and starters

An Antigravity checkpoint additionally requires:

- terminal result for the boundary turn;
- no pending interaction;
- verified settled-tree receipt;
- final cumulative usage ingestion;
- transcript locator and digest when present;
- exact isolated-runtime and binary receipts;
- deterministic replay packet digest, or a later accepted native fork receipt;
- paired project/RUN snapshot and checksum.

Provider runtime directories and secrets are private evidence. Git-tracked
manifests contain only non-secret locators, checksums and capability modes.

## Error taxonomy

Reuse common backend errors where semantics match. Antigravity-specific errors
include:

```text
agy_version_unsupported
agy_isolation_flag_missing
agy_auth_unavailable
agy_onboarding_required
agy_stream_protocol_mismatch
agy_terminal_result_missing
agy_profile_drift
agy_interaction_protocol_unsupported
agy_headless_fork_unsupported
agy_tui_not_ready
agy_tui_fork_ambiguous
agy_usage_scope_unverified
agy_child_control_unsupported
```

Provider process exit without a terminal result is a harness failure, not a
model failure. Daemon death with an active or unproven tree is
`invalid_harness_crash`.

## Required repository changes

### `dd-eval`

Planned files:

```text
bin/dd-agy.mjs
lib/dd-agy.mjs
lib/dd-agy-daemon.mjs
test/dd-agy.test.mjs
test/dd-agy-daemon.test.mjs
profiles/antigravity-cli-google-gemini-3-1-pro-high.json
runbooks/dd-agy-live-validation-YYYY-MM-DD.md
```

`lib/dd-eval.mjs` must replace repeated harness conditionals with a small static
descriptor table covering Codex, ZCode, Grok, OpenCode and Antigravity. This is
not a dynamic plugin system. The table owns runtime family, driver, supported
seed modes and archive requirements.

Package metadata publishes `dd-agy`.

### `dd-flow-cli`

Planned changes:

- add `agy event handle` and `agy usage ingest` dispatch;
- add `antigravity-cli` to the static external-harness registry;
- reuse generic `ingestHarnessUsage`;
- normalize trusted Agy hook payloads;
- register root/child physical identity;
- support Antigravity usage source and Work-window deltas;
- add CLI help and operation classification;
- extend runtime-cutover tests.

Provider-specific payload parsing remains provider-specific. SQLite storage,
Work attribution and usage windowing remain generic.

## Conformance plan

### Diagnostic

1. version and model list;
2. isolated Gemini directory;
3. auth without config leakage;
4. create-and-prompt;
5. stable multi-turn conversation ID;
6. clean close and resume;
7. cumulative usage delta;
8. clean daemon shutdown.

### Lifecycle

1. Pre/PostToolUse ordering;
2. exact workspace and transcript identity;
3. trusted lifecycle command claim;
4. Stop reason and `fullyIdle`;
5. permission and soft-denial handling;
6. process crash and missing-result classification.

### Interaction

1. force `ask_question` or equivalent wait;
2. observe `WAITING` terminal state;
3. send a fixture as the next `user` event;
4. preserve conversation identity and cumulative usage;
5. reject unsupported control messages.

### Delegated

1. invoke one bounded child;
2. capture `subagent_info` identity;
3. determine child hook behaviour;
4. determine root-result timing;
5. determine root/child usage scope;
6. test whole-tree cancellation;
7. test targeted child cancellation and mark the capability truthfully.

### Fork

1. retain headless-negative tests;
2. make TUI readiness deterministic or leave capability experimental;
3. repeat native TUI fork at least three times;
4. verify exact history prefix and unchanged source every time;
5. verify clean process teardown and child resume;
6. reject zero, multiple or ambiguous new conversation stores.

### Eval progression

1. diagnostic SPECIFY on `gemini-3.1-pro-high`;
2. focused SPECIFY with interaction fixture if required;
3. clean full E2E through CODE-REVIEW;
4. canonical chain with deterministic replay starters;
5. native TUI fork starters only after the experimental gate is promoted.

## Acceptance criteria for the first implementation

- `dd-agy doctor` fails closed on binary or isolation drift;
- all provider file state is under the exact isolated Gemini directory;
- no user config customization is loaded;
- a persistent stream completes multiple turns with one conversation ID;
- resume preserves verified context;
- lifecycle hooks bind the correct physical Session before mutation;
- terminal usage produces measured root Work deltas;
- complete-tree cancellation is bounded and leaves no process;
- checkpoint creation requires settled-tree and final-usage receipts;
- starters are honestly labeled `deterministic_replay`;
- native fork is not claimed by the initial scored profile;
- one real SPECIFY and one clean E2E pass before merge.

## Delivery sequence

1. Commit this specification and fork-validation runbook.
2. Implement isolated doctor and a small stream probe.
3. Complete create, multi-turn, resume, hook, interaction and usage conformance.
4. Record the capability matrix.
5. Implement the execution daemon and public `dd-agy` CLI.
6. Implement the `dd-flow agy` adapter.
7. Add the pinned Gemini 3.1 Pro High profile.
8. Run diagnostic SPECIFY and clean E2E.
9. Add deterministic replay checkpoint/starter support.
10. Promote `native_tui_fork` only in a separate change after robust readiness
    and repeated fork conformance.

