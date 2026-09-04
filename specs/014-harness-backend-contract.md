# Specification 014: Harness backend contract

Status: proposed implementation contract
Date: 2026-08-29
Owner: `dd-eval`
Affected repositories: `dd-eval`, `dd-flow-cli`

Pending contract revision: [repair plan 019](019-durable-execution-and-e2e-repair-plan.md)
defines the public `harness_id` + native `session_id` pair, observation versus
execution semantics, process ownership and confirmed shutdown. Its migration
must update all active callers together. Existing wire examples below describe
the pre-migration contract; do not implement another prefixed Session identity.

## Purpose

Define the smallest common contract that lets a Codex Controller evaluate a
Subject running in a different agent harness without treating unlike provider
behaviour as interchangeable. The contract standardizes evidence and lifecycle
outcomes, not transport. Codex Desktop tools, ACP, HTTP/SSE and a local process
may implement the same operation through different native mechanisms.

This specification consolidates the lessons from Codex, ZCode and Grok before
adding OpenCode. A backend may advertise an optional capability only when its
native result can be verified. Missing native behaviour is represented as an
explicit capability gap or replay mode; it is never fabricated with prompt
conventions, dummy filesystem writes or inferred identifiers.

## Roles and trust boundary

- The **Controller** remains a Codex task and owns eval orchestration.
- The **Subject backend** owns physical Subject Sessions and provider turns.
- `dd-flow` owns RUN, Stage, Work, lifecycle and usage projections.
- `dd-eval` owns immutable inputs, profiles, checkpoints, starter references,
  candidate evidence, Judge packets and scoring gates.
- The provider owns model execution and its native session state.
- A backend driver translates native facts; it must not repair Subject output,
  edit RUN artifacts, answer HITL questions or make semantic stage decisions.

The Judge is independent of the Subject backend unless a future evaluation
case explicitly defines otherwise.

## Backend descriptor

Every supported backend has one versioned descriptor:

```json
{
  "schema_id": "dd-eval/harness-backend@1",
  "harness": "opencode-server",
  "runtime_family": "opencode",
  "driver": "dd-opencode",
  "control_lifetime": "execution_daemon",
  "identity_scope": "provider_session",
  "workspace_strategy": "controller_owned_shared_workspace",
  "transport": "http_sse",
  "capabilities": {},
  "version_gate": {}
}
```

`harness` is the globally unique evidence namespace. `runtime_family` groups
related runtimes for reporting only. `driver` identifies the executable
control surface. Provider Session IDs are opaque and meaningful only within
their harness namespace.

## Required operation semantics

### Doctor

`doctor` is read-only and reports:

- driver version;
- installed harness version and build identity when available;
- protocol/API version or schema fingerprint;
- platform and architecture;
- requested, advertised and verified capabilities separately;
- auth presence without secret values;
- compatibility verdict against a pinned baseline.

An untested version is drift. A version string alone is insufficient when an
API schema or extension set can change independently.

### Daemon start and status

An execution daemon is required when any of these are true:

- background descendants need a live provider process;
- events are delivered through a persistent subscription;
- several Controller commands must address the same local server;
- final usage or cancellation requires a live runtime handle.

Start is idempotent only for an identical configuration and live daemon. The
daemon owns one attempt, one controlled workspace and one evidence journal.
Status performs a live handshake and returns PID, daemon ID, version receipt,
controlled paths, active operation, tracked roots, descendant topology and
shutdown state.

The proven ZCode/Grok daemon safety rules are common requirements, not
provider details:

- the state directory is execution-private and cannot be reused after a clean
  terminal shutdown;
- an identical second `start` may return the live daemon, while a different
  configuration returns `daemon_config_mismatch`;
- the Unix socket path is derived from the exact state directory and may use a
  deterministic short path under `/tmp` when the platform path limit requires
  it;
- startup and shutdown use `lstat`; a driver never unlinks a non-socket or a
  socket not derived from that exact state directory;
- the daemon directory is `0700` and the socket is `0600`;
- status proves liveness over the control socket and, for a child server,
  through the provider health endpoint; a state file alone is not status;
- productive-operation failure leaves `active_tree=true` until successful
  reconciliation proves otherwise;
- a previous `running` state with an active or unproven tree is
  `invalid_harness_crash`, not an idle recovery;
- the daemon owns the exact child PID it started. Forced termination is a
  bounded `SIGTERM` then `SIGKILL` fallback and records an unclean receipt.

Scored execution uses the daemon path. A one-shot mode may exist for doctor or
transport diagnostics, but it must cancel descendants and cannot publish
checkpoint or scoring evidence.

### Create

Create returns a physical provider Session ID, controlled directory, requested
profile and provider-observed identity where available. An idle Session may be
created without a prompt when the native API supports it. Otherwise the
backend must distinguish `create_idle` from `create_and_prompt`.

### Prompt

Prompt targets exactly one physical Session and returns:

- Session and turn/message IDs;
- ordered terminal outcome;
- observed model/profile;
- interaction state;
- descendant topology;
- usage snapshot and tool-call evidence;
- error classification.

Only one productive operation per root tree may run unless the backend proves
native concurrency isolation. Inspection and targeted cancellation remain
available during a productive operation.

### Inspect

Inspect is non-mutating. It returns provider identity, directory, state,
profile, messages/turn boundary, descendants, interactions and cumulative
usage. Loading or resuming a Session is a separate mutation and must not hide
inside inspect.

### Fork

Fork means cloning provider conversational state at a named completed boundary.
The receipt records source Session, source boundary, new Session and native or
verified relationship evidence. A backend that cannot prove native parentage
must verify the cloned history and store its own immutable fork receipt.

Filesystem restoration is not implied by conversational fork. `dd-flow` owns
the corresponding project/RUN snapshot. A backend must document whether its
fork mutates, shares, copies or ignores the source workspace.

Physical topology and seed provenance are separate relations. A native child
uses `parent_session_id`; a fork or imported starter uses a dedicated seed
receipt containing `seed_source_session_id`, boundary and verification. A
backend must not overload the physical parent column to satisfy a starter
registry check.

### Descendant topology

Every physical subagent is a Session. The normalized topology contains:

```json
{
  "session_id": "<native>",
  "parent_session_id": "<native-or-null>",
  "agent_id": "<native-or-null>",
  "subagent_type": "<native-or-null>",
  "status": "idle|running|retry|paused|failed|cancelled|completed|unknown",
  "source": "<authoritative-native-source>"
}
```

Prompt text, task names, filesystem paths and timing correlation are not
identity evidence. If the provider exposes only a root-inclusive aggregate,
physical children are still recorded when observable, but usage aggregation
must avoid double counting.

### Native productive delegation

Capacity qualification and productive Work must exercise the same native
depth-one child mechanism of the selected harness profile. The Controller must
not qualify native children and then execute PLAN-REVIEW, CODE or CODE-REVIEW
Works as unrelated provider roots.

The Stage coordinator invokes each child through its harness-native subagent
tool. The child first executes the exact `dd-flow work start` returned for its
ready Work; the lifecycle hook binds the observed native child and physical
parent identities. `dd-flow` owns Work semantics and capacity-limited packing,
but knows no provider tool names. The adapter owns topology, settlement,
cancellation and usage scope. The complete cross-harness migration and
acceptance matrix is defined by
[specification 022](022-native-subagent-capacity-and-productive-fanout.md).

### Cancel

The common surface distinguishes:

- cancel one child while retaining the parent;
- abort the current turn of one Session;
- cancel the complete root tree;
- close a settled Session;
- stop the execution daemon.

Daemon stop without `--cancel-tree` succeeds only for a settled topology.
`tree_not_settled` is evidence, not permission to silently kill descendants.
Partial cancellation or an unclean daemon death with a running tree makes a
scored attempt infrastructure-invalid.

### Archive and portability

A Session archive is optional. When required, it includes exactly one Session
and a non-secret manifest, rejects links, has private permissions and is bound
to the pinned harness version. Auth, global configuration, plugins, unrelated
Sessions and provider caches are excluded.

If the native server persists Session state in a stable data store reachable
by ID, the backend should reference the Session and use native fork instead of
inventing an archive format.

That reference is sufficient only while the next attempt can safely address
the same isolated data store. If every scored attempt has a fresh provider
home, the checkpoint must carry a native export/import archive or an explicit
deterministic replay receipt. Import is verified in a fresh home before the
starter is accepted. The archive manifest records provider version, native
Session ID, history checksum, source boundary, source directory, archive
checksum and import/fork receipts. An archive is private runtime evidence;
only its locator, checksum and non-secret manifest belong in Git.

## Lifecycle event contract

A trusted lifecycle claim must be observed before the corresponding `dd-flow`
mutation takes effect. Minimum event identity:

```json
{
  "schema_id": "dd-flow/harness-tool-event@1",
  "harness": "opencode-server",
  "daemon_id": "<id>",
  "session_id": "<native>",
  "parent_session_id": null,
  "message_id": "<native-or-null>",
  "tool_call_id": "<native>",
  "phase": "before|after",
  "tool": "bash",
  "input": {},
  "cwd": "<absolute>",
  "observed_at": "<RFC3339>"
}
```

The adapter applies only a cheap candidate gate (for example, a literal
`dd-flow` occurrence) and forwards the original command bytes. It must not
decide lifecycle semantics with a harness-specific regular expression.
`dd-flow` owns the single authoritative shell parser for every harness: it
recognizes the executable command word (including a quoted absolute path),
distinguishes arguments and heredoc bodies from commands, accepts an exact
standalone lifecycle invocation and rejects a genuinely compound lifecycle
call. False candidates are recorded as non-participating observations and do
not create trusted claims. `dd-flow` then binds the physical Session to
RUN/Work and rejects mismatched or replayed claims.
After-events may enrich outcome evidence but cannot retroactively authorize a
mutation that lacked a before-event.

Every accepted event has an immutable deduplication key and bounded delivery
contract. When the harness can rewrite tool input, the normal result is the
same `--hook-event-id` insertion already used by Codex/Grok; a synchronous
pre-hook may use the existing recent-match fallback only for an input form
that cannot safely be rewritten, such as a heredoc. A provider adapter does
not introduce a parallel claim database when the existing `hook_events`
single-use claim path can represent the event.

The raw provider journal remains append-only; normalized SQLite rows are
projections, not a replacement for raw evidence. Raw prompts, tool output and
provider events can contain secrets, so the journal stays outside Git with
private permissions and an explicit retention policy. Normalized rows store
sanitized summaries only. A lossy event stream may support topology and
observability, but it cannot replace a synchronous pre-effect hook for trusted
lifecycle mutation.

## Usage contract

Usage is stored per physical Session with explicit scope:

```json
{
  "schema_id": "dd-flow/session-usage@1",
  "harness": "opencode-server",
  "provider_session_id": "<native>",
  "scope": "physical_session",
  "status": "provisional|final|partial|unavailable",
  "tokens": {
    "input": 0,
    "output": 0,
    "reasoning": 0,
    "cache_read": 0,
    "cache_write": 0,
    "total": 0
  },
  "cost": null,
  "tool_calls": {
    "status": "measured|partial|unavailable",
    "total": 0,
    "failures": 0,
    "by_tool": {}
  }
}
```

The backend documents whether provider input already includes cached tokens.
It does not normalize provider accounting by guesswork. Root-inclusive usage
and per-child usage may coexist, but exactly one aggregation route contributes
to RUN totals. Finalization requires a settled tree, a last provider read and
successful ingestion for all tracked Sessions.

Conformance must measure whether root counters are physical-only or
tree-inclusive with at least one real child. Until that experiment passes,
the scope is `unknown` and scored usage is unavailable. A daemon snapshots the
baseline before Work attribution and a final cumulative value after the Work;
one terminal value without a baseline is not a measurable delta.

## Configuration and credential isolation

Scored execution uses an attempt-private configuration and data root. The
backend imports only the minimum credential material required for the selected
provider. It must exclude user hooks, plugins, MCP servers, skills, agents,
instructions, compatibility layers and auto-update state unless the profile
explicitly declares them.

Secrets never appear in state, journals, manifests, command output or Git.
Private directories use mode `0700`; secret-bearing files and control sockets
use `0600`. A profile receipt lists loaded configuration origins without
including their contents.

Required non-secret provider configuration is rebuilt as a reviewed overlay,
not copied wholesale from the user's home. Its checksum and origin list are
profile evidence. Provider auth is copied separately. The backend also records
which instruction sources were disabled and hashes every instruction source
explicitly admitted by the profile.

## Profile contract

Requested profile fields include harness, runtime family, driver, provider,
model, reasoning/variant, agent/mode, permission mode, subagent depth,
background policy and workspace strategy. Provider-observed evidence is
compared after the first real turn and after resume/fork when the provider may
re-resolve defaults.

Fallback to another agent, provider, model or reasoning mode is
infrastructure-invalid. A backend may not make drift look comparable by
rewriting the observed receipt to the requested values.

## Checkpoint and starter contract

A checkpoint is accepted only when:

1. the provider Session is at a completed boundary;
2. the target stage has not started;
3. the RUN is quiescent and reconciled;
4. no interaction is pending;
5. the complete physical Session tree is settled;
6. final usage through the boundary is ingested;
7. the project/RUN snapshot exists and is checksummed;
8. a frozen native fork, replay receipt or archive is verified;
9. the human acceptance review records any backend-specific limitation.

The provider boundary is frozen in this order: stop new productive operations,
settle and reconcile the complete tree, ingest final usage for every tracked
physical Session, create the frozen native fork/export, verify it without a
model turn, capture the paired project/RUN snapshot, and only then publish the
manifest. Any mutation after the accepted boundary invalidates the capture.

Starter mode is one of `native_fork`, `deterministic_replay`,
`archive_native_fork` or a future explicitly specified value. The registry
must never label a replay as a native fork.

## Error taxonomy

Common error codes include:

- `unsupported_harness_version`;
- `api_schema_drift`;
- `profile_drift`;
- `session_not_found`;
- `session_not_idle`;
- `tree_not_settled`;
- `operation_in_progress`;
- `interaction_required`;
- `fork_boundary_invalid`;
- `fork_verification_failed`;
- `lifecycle_event_missing`;
- `lifecycle_event_mismatch`;
- `usage_reconciliation_failed`;
- `partial_cancellation`;
- `daemon_state_terminal`;
- `invalid_harness_crash`.

Errors include retryability and non-secret details. Controller policy decides
whether to retry, ask the user, invalidate an attempt or stop the chain.

## Conformance levels

### Diagnostic

Doctor, create, prompt, inspect, status, basic usage and clean shutdown.

### Delegated

Root/child identity, targeted cancellation, lifecycle before/after events,
tool attribution and settled-tree enforcement.

### Focused-stage

Checkpoint restore, verified starter seed, first continuation, stage finish,
final usage and Judge preparation.

### Canonical-chain

All six stage boundaries, frozen checkpoints, starters and provider-specific
portability evidence.

### Scored E2E

Clean start through CODE-REVIEW, complete tree reconciliation, accepted Judge
results, final measured usage and successful finalization.

Passing a lower level does not imply a higher level.

## Extensibility rule

Adding a backend means adding one driver, one normalized lifecycle/usage path,
one profile family and conformance evidence. Do not create a dynamic plugin
marketplace or a class hierarchy merely because several backends exist. Share
schemas and pure normalization helpers where behaviour is genuinely identical;
keep provider-specific control semantics in the provider driver.
