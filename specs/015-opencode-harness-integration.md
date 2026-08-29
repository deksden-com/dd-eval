# Specification 015: OpenCode harness integration

Status: researched; implementation planned
Date: 2026-08-29
Owner: `dd-eval`
Affected repositories: `dd-eval`, `dd-flow-cli`
Feature branches: `feat/opencode-harness`
Initial harness ID: `opencode-server`

## Goal

Run an evaluated Subject and its native subagents in OpenCode while the
Controller and Judge remain Codex tasks. The Controller must control OpenCode
Sessions through a long-lived headless server, bind every physical root/child
Session to `dd-flow`, capture trusted pre-effect lifecycle events, verify
native conversational forks, reconcile per-Session usage and prove a settled
tree before checkpointing, judging or stopping the harness.

OpenCode implements the common contract in
[Specification 014](014-harness-backend-contract.md). This document owns only
OpenCode-specific transport, identity, isolation and evidence rules.

## Verified baseline

Local research was performed against:

```text
binary: /Users/deksden/.opencode/bin/opencode
version: 1.18.23
platform: macOS arm64
headless transport: opencode serve
server protocol: HTTP + Server-Sent Events
auth: optional HTTP Basic Auth
```

The upstream source checkout used for behavioural inspection was
`anomalyco/opencode` at `dc4449df0d52199704ea4989a5a993ebbc605612`.
Upstream `dev` explains behaviour but does not replace conformance against the
installed binary. The implementation pins installed version `1.18.23` plus a
normalized OpenAPI fingerprint obtained from its `/doc` schema.

Authoritative references:

- <https://dev.opencode.ai/docs/server/>
- <https://dev.opencode.ai/docs/cli>
- <https://opencode.ai/docs/config/>
- <https://opencode.ai/docs/providers/>
- <https://opencode.ai/docs/agents/>
- <https://opencode.ai/v2/docs/build/plugins/>
- <https://github.com/anomalyco/opencode>

## Observed live facts

A no-model-call smoke test against an authenticated local server proved:

- `GET /global/health` reports version `1.18.23`;
- an idle root Session can be created with `POST /session`;
- `POST /session/:id/fork` can fork an empty Session;
- both Sessions report zero cumulative tokens and cost;
- idle Sessions are absent from the busy-status map;
- fork history is independently queryable;
- the forked Session has no `parentID` and is absent from the source Session's
  `/children` response;
- Session deletion succeeds through the native API.

A second isolated no-model-call experiment proved the portability path:

- `opencode export <session-id>` emits one Session plus its messages as JSON;
- `opencode import <archive>` into a fresh XDG data root preserves the native
  Session ID;
- import rewrites the native project and directory to the importing instance;
- the imported Session can be read and forked by a fresh authenticated server;
- the new fork still has no native `parentID`.

The live directory comparison must canonicalize macOS `/tmp` and
`/private/tmp`; lexical path comparison produced a false mismatch in the
experiment even though the imported directory was correct.

The test also proved that a normal user launch loads global plugins. An
unrelated `moshi-hooks.ts` plugin attempted to contact its user socket during
Session deletion. Scored work therefore requires full XDG isolation and an
allowlisted eval adapter; reusing the user's normal OpenCode configuration is
not acceptable.

## Scope

In scope for the first implementation:

- `opencode serve` as an execution-scoped headless server;
- one `dd-opencode` CLI and daemon in `dd-eval`;
- Basic Auth on a loopback-only random port;
- create idle Session, prompt, async prompt, inspect, message history, status,
  fork, child list, targeted abort and recursive tree cancellation;
- SSE event subscription and reconnect reconciliation;
- root and foreground subagent Session identity;
- capability-gated background subagents;
- exact provider/model/variant/agent verification;
- per-message and cumulative Session usage;
- measured tool calls from message parts;
- an allowlisted OpenCode plugin forwarding pre/post tool evidence to
  `dd-flow`;
- focused-stage native starters and full E2E attempts;
- macOS and Linux local execution.

Out of scope initially:

- moving Controller or Judge into OpenCode;
- attaching to an arbitrary user-owned OpenCode server;
- TUI automation;
- exposing the server outside loopback;
- mDNS discovery, sharing or public Session links;
- OpenCode-managed worktrees as a replacement for `dd-flow` workspaces;
- relying on experimental V2-only APIs for mandatory conformance;
- nested subagents beyond depth one;
- accepting user plugins, project plugins, MCP servers or global agent files;
- exact cost when the provider reports none;
- cross-machine Session portability beyond the native JSON format;
- deleting provider Sessions automatically after a successful scored run.

## Reuse map from ZCode and Grok

OpenCode is a new provider driver, not a third independent orchestration
design. The implementation reuses these proven parts:

| Existing lesson | OpenCode application |
| --- | --- |
| ZCode/Grok private daemon socket | same request/response framing, exact socket derivation, `0700` state and `0600` socket |
| terminal state directory | never reuse an execution state directory after clean stop |
| config-equal idempotent start | return the live daemon only for byte-equivalent normalized config |
| fail-closed `active_tree` | any productive error keeps the tree active until HTTP reconciliation proves idle |
| Grok archive manifest | wrap native OpenCode export with locator, checksum, version, Session and history evidence |
| Grok auth isolation | copy only provider auth into an isolated home; build reviewed non-secret config separately |
| Grok root registration fix | register/track the root before the first prompt so a first-turn lifecycle hook cannot race Session discovery |
| ZCode/Grok lifecycle normalizers | reuse standalone-command parsing, match keys, `hook_events`, updated input and single-use claim |
| ZCode/Grok usage snapshots | extend the generic harness snapshot ingester; do not add an OpenCode-only accounting store |
| Grok scope lesson | prove physical-only versus tree-inclusive counters with a real child before scoring |
| Grok cancel-tree lesson | recursively cancel descendants deepest-first; root abort alone is insufficient |
| interaction fixtures | pause on permission/question and answer only from a declared fixture or user input |
| checkpoint acceptance | settle, final-usage ingest, frozen seed, runtime snapshot and checksum before publication |

Provider-specific code remains responsible for HTTP/SSE, native message
canonicalization, OpenCode export/import and OpenCode permission endpoints.
Shared extraction is allowed only after the OpenCode implementation passes the
existing daemon tests unchanged.

## Required architecture

```text
Codex Controller
  -> dd-opencode CLI
      -> private Unix socket
          -> dd-opencode daemon
              -> authenticated loopback HTTP
                  -> opencode serve
                      -> root Subject Session
                          -> foreground/background child Sessions

OpenCode eval adapter plugin
  -> tool.execute.before / tool.execute.after
      -> dd-flow opencode event handle

OpenCode HTTP + SSE + message reconciliation
  -> append-only daemon journal
  -> dd-flow lifecycle and usage projections
  -> dd-eval Session/checkpoint/scoring evidence
```

`opencode run --attach` is useful for human diagnostics but is not the control
plane: it formats output, owns its own event loop and exposes fewer explicit
operations than the HTTP API. `opencode acp` is also unnecessary because the
native server already exposes richer Session, fork, children, usage and event
surfaces. The driver should not add an ACP proxy over an existing official API.

## Harness identity

The normalized identity is:

```text
opencode-server:<native-session-id>
```

The native ID has the observed form `ses_*` but is treated as opaque. Minimum
evidence:

```json
{
  "harness": "opencode-server",
  "runtime_family": "opencode",
  "provider_session_id": "ses_...",
  "adapter_session_id": null,
  "daemon_id": "<uuid>",
  "parent_session_id": "ses_...|null",
  "agent_id": "build|general|explore|<configured>",
  "requested_profile": {},
  "observed_profile": {},
  "directory": "/absolute/workspace",
  "project_id": "<native-project-id>",
  "opencode_version": "1.18.23"
}
```

`parentID` is authoritative for subagent relations only. It must not be
invented for conversational forks.

## Server ownership and endpoint contract

The daemon starts:

```sh
opencode serve \
  --hostname 127.0.0.1 \
  --port <random-reserved-port> \
  --print-logs \
  --log-level INFO
```

Environment includes a random `OPENCODE_SERVER_PASSWORD`; the username is a
fixed non-secret `opencode`. The password is written only to a private daemon
file or kept in memory, never journalled. The daemon verifies that the bound
address is loopback and refuses `--hostname 0.0.0.0`, mDNS and CORS options.

Required endpoints for baseline conformance:

| Operation | Endpoint | Required result |
| --- | --- | --- |
| health | `GET /global/health` | healthy and pinned version |
| schema | `GET /doc` | accepted OpenAPI fingerprint |
| current path | `GET /path` | controlled directory |
| create | `POST /session` | new idle Session |
| inspect | `GET /session/:id` | exact Session facts |
| list | `GET /session` | controlled-project Sessions |
| status | `GET /session/status` | busy/retry states |
| messages | `GET /session/:id/message` | ordered complete messages |
| prompt | `POST /session/:id/message` | terminal assistant message |
| async prompt | `POST /session/:id/prompt_async` | accepted operation |
| fork | `POST /session/:id/fork` | independent cloned Session |
| children | `GET /session/:id/children` | direct subagent Sessions |
| abort | `POST /session/:id/abort` | target execution interrupted |
| events | `GET /event` | SSE stream |

Every request carries the exact controlled `directory` query where required.
A Session whose native `directory` differs from the daemon workspace is
foreign and rejected.

## OpenAPI compatibility gate

Version pinning alone does not protect request/response shapes. `doctor`
downloads `/doc`, extracts the OpenAPI JSON, removes presentation-only fields
and hashes the required paths, verbs, request schemas and response schemas.

The baseline stores:

```json
{
  "opencode_version": "1.18.23",
  "required_api_fingerprint": "<sha256>",
  "required_paths": [
    "/global/health",
    "/session",
    "/session/status",
    "/session/{id}",
    "/session/{id}/children",
    "/session/{id}/fork",
    "/session/{id}/abort",
    "/session/{id}/message",
    "/session/{id}/prompt_async",
    "/event"
  ]
}
```

Additional endpoints do not cause drift. A changed or missing required schema
does. Conformance may approve a new fingerprint in a later profile revision.

## Daemon state machine

Persistent state:

```json
{
  "schema_id": "dd-opencode/daemon-state@1",
  "daemon_id": "<uuid>",
  "status": "starting|ready|stopping|stopped|crashed",
  "pid": 0,
  "server_pid": 0,
  "base_url": "http://127.0.0.1:<port>",
  "cwd": "/absolute/workspace",
  "active_operation": null,
  "active_tree": false,
  "sessions": [],
  "event_cursor": null,
  "recovery_status": "live|reconciled|lost_runtime",
  "shutdown_state": "open|clean|cancelled|unclean"
}
```

Productive operations are serialized. State writes are atomic. The raw SSE
and HTTP journal is append-only with monotonically increasing local order. The
daemon periodically reconciles `/session/status`, tracked Session details,
children and messages so an SSE disconnect cannot silently lose terminal
state.

The daemon copies the already-tested ZCode/Grok control mechanics:

- normalize and hash configuration for idempotent live start;
- reject a cleanly stopped state directory with `daemon_state_terminal`;
- reject a different live configuration with `daemon_config_mismatch`;
- shorten an overlong macOS Unix socket path deterministically under `/tmp`;
- verify the exact derived path with `lstat` and never unlink a regular file;
- chmod the state directory `0700` and control socket `0600`;
- treat a productive exception or failed tree refresh as active/unproven;
- require both control-socket response and `/global/health` for status;
- retain the exact `opencode serve` child PID and bound port in private state;
- perform clean server shutdown only after final Session/message/usage reads;
- use bounded `SIGTERM` then `SIGKILL` only as an unclean failure path.

The Basic Auth password is not part of the normalized public state or status
response. It remains in daemon memory or a `0600` secret file. Logs and error
objects redact authorization headers, prompt text, tool output, provider
environment and auth paths.

The journal is private runtime evidence, not a Git artifact. Full raw SSE and
HTTP bodies may contain user prompts, tool results and secrets; normalized
reports store hashes and sanitized summaries, and successful attempt cleanup
follows an explicit retention policy.

On server death:

- mark all active operations interrupted;
- retain the last known tree;
- do not claim descendants cancelled;
- attempt read-only recovery only after a new authenticated server starts on
  the same isolated data root;
- mark scored execution `invalid_harness_crash` when any Session was busy or
  its terminal state cannot be proven.

SSE has no trusted replay guarantee in the pinned baseline. It accelerates
topology and progress observation only. Finite HTTP reads reconcile Session,
message, interaction and usage state; the synchronous plugin hook remains the
only pre-effect lifecycle authority. A stream disconnect during a productive
turn keeps the operation provisional until reconciliation succeeds.

## Session creation and prompting

Create body sets title, primary agent, exact model object, eval metadata and
permission rules when supported by the pinned schema. The driver then reads
the Session back and verifies directory, version, agent/model fields and zero
or expected initial usage.

Immediately after the create/read-back receipt, the daemon tracks and exposes
the physical root before sending any real prompt. The Controller registers the
root in `dd-eval`, and the adapter has enough immutable identity to accept a
first-turn tool hook. This ordering reuses the Grok fix for the race where the
first lifecycle command arrived before root Session registration.

Prompt body uses explicit fields rather than server defaults:

```json
{
  "model": {
    "providerID": "<provider>",
    "modelID": "<model>"
  },
  "agent": "dd-flow-orchestrator",
  "parts": [
    { "type": "text", "text": "<packet>" }
  ]
}
```

Variant/reasoning is fixed by isolated configuration and verified from the
Session/model receipt plus provider-specific assistant evidence when exposed.
The first real assistant message must contain the requested provider/model.

Synchronous prompt is the default for simple foreground turns. Async prompt
plus SSE is used when the Controller must remain able to inspect and cancel a
long root turn. Both paths terminate only after status becomes idle/error and
messages contain the matching terminal assistant response.

Every productive prompt captures a cumulative baseline for the addressed
Session first. When a previously unseen native child appears, the daemon
registers its immutable identity and initial usage baseline from finite reads
without prompting, loading or otherwise mutating it. Finalization rereads all
tracked roots and children after their terminal boundary.

## Native fork semantics and verification

OpenCode fork copies messages into a new Session. In current source and live
baseline it does **not** store the source as `parentID`. Therefore the driver
creates this receipt:

```json
{
  "schema_id": "dd-opencode/fork-receipt@1",
  "source_session_id": "ses_source",
  "source_boundary_message_id": "msg_boundary|null",
  "fork_session_id": "ses_fork",
  "native_parent_id": null,
  "verification": {
    "source_prefix_messages": 12,
    "fork_messages": 12,
    "source_prefix_sha256": "<sha256>",
    "fork_history_sha256": "<sha256>",
    "matched": true
  },
  "source_directory": "/workspace",
  "fork_directory": "/workspace",
  "created_at": "<RFC3339>"
}
```

History canonicalization includes message role/order, text, tool inputs and
terminal outputs required for context, but excludes newly allocated message
and part IDs. It also excludes timestamps and presentation metadata. The
canonicalizer is versioned and covered by fixtures.

Fork is rejected when:

- the source tree is not settled;
- the boundary message is absent or incomplete;
- the fork has a different directory;
- canonical histories differ;
- the new Session already has an extra message;
- profile or OpenCode version differs.

`dd-flow.sessions.parent_session_id` remains the physical native topology
column and is `null` for a forked root. `dd-eval` records seed lineage in the
starter/fork receipt instead:

```json
{
  "seed_source_session_id": "ses_checkpoint",
  "seed_boundary_message_id": "msg_boundary|null",
  "seed_mode": "archive_native_fork",
  "native_parent_session_id": null,
  "fork_receipt": "<locator>"
}
```

Current registry validation that requires `parent_session_id` to equal the
checkpoint Session must become seed-receipt validation for OpenCode. It must
not place a fictional `parentID` into either OpenCode evidence or the physical
`dd-flow` topology.

## Portable checkpoint and starter archive

Scored attempts use fresh isolated XDG roots, so same-home native references
are insufficient. OpenCode supplies an official one-Session JSON transport:

```text
opencode export <checkpoint-or-starter-session-id>
opencode import <private-archive.json>
```

`dd-opencode session export` wraps native export and creates:

```json
{
  "schema_id": "dd-opencode/session-archive@1",
  "provider_session_id": "ses_...",
  "opencode_version": "1.18.23",
  "api_fingerprint": "<sha256>",
  "source_directory": "/canonical/workspace",
  "source_boundary_message_id": "msg_...|null",
  "message_count": 12,
  "history_sha256": "<sha256>",
  "payload": {
    "locator": "<private-runtime-relative-path>",
    "sha256": "<sha256>",
    "size_bytes": 0
  }
}
```

The native JSON is not sanitized because redaction replaces conversational
content and would destroy the continuation context. Therefore it is secret-
bearing private runtime material, mode `0600`, excluded from Git and never
included in Judge packets. A separately sanitized export may be generated for
diagnostics but is never a starter.

At attempt setup, `dd-opencode daemon start --session-archive ...`:

1. verifies manifest, checksum, size limit, regular-file type and pinned
   version/API fingerprint;
2. rejects archive or destination symlinks and an existing Session collision;
3. runs native import inside the fresh isolated XDG home;
4. verifies that the imported native ID and canonical message history match;
5. verifies that OpenCode rebound the Session to the canonicalized attempt
   workspace and native project;
6. starts the server and rereads the imported Session without a model turn;
7. forks an untouched eval child and verifies its history receipt;
8. prompts only that eval child.

This is `archive_native_fork`: native import restores the starter, native fork
creates the per-attempt child, and the dd-opencode receipt proves lineage that
OpenCode does not store as `parentID`. Raw database copying is forbidden.

## Subagent topology

OpenCode's Task tool creates a child Session with native `parentID`. The daemon
learns children from both `session.created` SSE events and
`GET /session/:id/children`, then recursively reconciles each known child.

Initial supported topology:

- one primary root;
- any bounded number of depth-one foreground children;
- background children only when the profile explicitly enables the
  experimental provider flag;
- no child may launch another child in the initial scored profile.

`subagent_depth` is set to `1`. Agent permissions allow only an explicit
catalog, normally `general`, `explore` and project-defined eval agents.

Tree settled means:

- root is idle;
- every recursively discovered child is idle, completed, failed or cancelled;
- no busy or retry status exists;
- no pending permission or question belongs to the tree;
- the last event batch has been flushed and HTTP reconciliation agrees.

An HTTP or SSE error during recursive discovery is not an empty child list.
The daemon retains the last known topology and `active_tree=true` until a
complete refresh succeeds. Background subagents require
`OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true` and remain a separate
capability/profile; root idle never implies that a background child settled.

## Cancellation

OpenCode exposes abort per Session. `dd-opencode session cancel-child` verifies
that the target is a descendant of the controlled root, recursively aborts the
target's own descendants deepest-first, then aborts the target. The root and
unrelated siblings continue.

`session cancel` recursively:

1. freezes new productive operations;
2. refreshes topology;
3. aborts running descendants deepest-first;
4. waits for each descendant terminal state;
5. aborts the root if running;
6. reconciles messages, status and usage;
7. records complete or partial cancellation.

Session deletion is not cancellation and is never used to hide an unsettled
tree. Deletion remains an explicit maintenance operation outside scored flow.

## Permission and interaction policy

The isolated profile uses deterministic permission rules. Commands required by
the declared flow and workspace may be allowed; external directories,
credential reads, network actions and destructive operations follow the eval
profile. A pending permission event pauses the harness operation and produces
an interaction receipt rather than timing out blindly.

The Controller may answer only from an explicit interaction fixture or direct
user input allowed by the eval case. It may not infer an approval. Permission
responses and question answers are journalled without secret content.

The daemon persists one bounded pending-interaction record containing native
request ID, physical Session, kind, sanitized prompt/options, fixture key and
expiry. It uses only the version-gated native permission/question response
endpoint. An unanswered interaction survives Controller polling and blocks
settlement; it is never converted to allow, deny or empty text by a timeout.

## Configuration isolation

Each attempt receives:

```text
<attempt>/opencode/
  config/opencode/
  data/opencode/
  state/opencode/
  cache/opencode/
  adapter/
    opencode.json
    plugins/dd-flow-adapter.ts
  control/
    daemon.json
    daemon.sock
    events.jsonl
```

Environment:

```text
XDG_CONFIG_HOME=<attempt>/opencode/config
XDG_DATA_HOME=<attempt>/opencode/data
XDG_STATE_HOME=<attempt>/opencode/state
XDG_CACHE_HOME=<attempt>/opencode/cache
OPENCODE_CONFIG_DIR=<attempt>/opencode/adapter
OPENCODE_DISABLE_PROJECT_CONFIG=1
```

The four XDG roots prevent loading user global config, data, state and cache.
`OPENCODE_DISABLE_PROJECT_CONFIG=1` prevents project `opencode.json`, local
plugins/tools/agents and upward config discovery from changing the scored
profile. Required project instructions are supplied by the normal Subject
prime and stage packets; a later profile may explicitly admit a reviewed
project instruction source.

The isolated `opencode.json` is generated from the eval profile. It declares
the exact provider/model/variant, primary and allowed subagents, depth and
permission rules, experimental flags and the single adapter plugin. If the
selected provider needs non-secret custom provider configuration, the profile
contains a reviewed overlay and checksum; the driver never copies the user's
complete global config. The profile receipt records every loaded config and
instruction origin and fails on an unexpected origin.

Do not use `--pure` for an eval daemon: it disables all external plugins,
including the controlled dd-flow adapter. Instead the isolated config loads
exactly that adapter and no other plugin.

### Auth import

The normal credential source is:

```text
~/.local/share/opencode/auth.json
```

At daemon setup, `dd-opencode` copies only this file, or an explicitly supplied
absolute auth file, to:

```text
<attempt>/opencode/data/opencode/auth.json
```

The destination directory is `0700`, the file `0600`, symbolic links are
rejected, and auth contents never enter logs or checksums exposed to Git. An
environment-token provider may instead receive the declared provider variable.
The driver never copies the whole user OpenCode data directory.

## Controlled adapter plugin

The adapter is a small local OpenCode plugin, not a general plugin package. It
subscribes to:

- `tool.execute.before`;
- `tool.execute.after`;
- Session creation/status/error events when available;
- permission/question events needed for pause evidence.

For tool hooks it forwards a bounded JSON envelope to an absolute `dd-flow`
binary with the attempt's `DD_FLOW_HOME` and stable project root. It must not
mutate tool input or result. A hook failure blocks the tool operation rather
than allowing an unbound lifecycle mutation.

The subprocess is spawned directly with an argv array, JSON on stdin, an
allowlisted environment and a bounded timeout; no shell is involved. The
absolute `dd-flow` router resolves the RUN-bound immutable engine snapshot.
The plugin source is materialized from that compatible `dd-flow` release, and
`dd-opencode` verifies its checksum before server start instead of loading a
mutable feature checkout.

The pre-hook forwards Bash commands containing a possible `dd-flow` lifecycle
invocation. `dd-flow` performs exact standalone command recognition. Other
tools and unrelated Bash commands need no synchronous subprocess and are
retained only in provider evidence.

OpenCode's `tool.execute.before` exposes mutable `output.args`. For an accepted
lifecycle event, the adapter returns the same updated-command contract as the
Grok hook and the plugin assigns the returned args, inserting
`--hook-event-id`. Heredoc `stage resume` is not rewritten; its synchronous
event is consumed through the existing recent-match path. The implementation
reuses `hook_events`, lifecycle match keys and atomic single-use claims rather
than creating an OpenCode claim table.

The plugin is versioned with `dd-flow-cli`. `dd-opencode doctor` verifies its
checksum before starting scored work.

## Usage and tool measurement

OpenCode assistant messages report:

```json
{
  "cost": 0,
  "tokens": {
    "input": 0,
    "output": 0,
    "reasoning": 0,
    "cache": { "read": 0, "write": 0 }
  }
}
```

Session details report cumulative cost and tokens. `dd-opencode` uses message
facts for attribution and the Session cumulative values as reconciliation.
OpenCode normalizes AI SDK input tokens by subtracting cache read/write from
the separately reported non-cached input count; the driver preserves OpenCode's
published fields and does not subtract again.

Tool calls are measured from tool message parts:

- a stable part/tool-call ID counts once;
- completed and error states are terminal;
- failures count error terminal states;
- `by_tool` uses the native normalized tool name;
- provisional counts may grow while the tree is active;
- final counts require a settled tree and complete message reread.

The expected baseline is one `scope=physical_session` record per controlled
root and child, with RUN totals summing disjoint physical Sessions. Internal
title/summary/compaction Sessions are excluded by requiring membership in the
controlled root tree.

That scope is a conformance result, not an assumption. The live delegated test
captures root counters before a child turn, after the child turn and after a
second root turn, then compares them with the child's counters. If the root
includes child usage, OpenCode uses Grok's `execution_tree_inclusive` route and
child snapshots become attribution-only. Ambiguous or regressing counters are
`partial`, never guessed.

For every Work window, `dd-opencode` ingests a baseline and a later cumulative
snapshot. On clean stop it rereads and ingests every tracked root and child,
including children that finished before root idle. Final status additionally
requires terminal tool parts, no pending interaction, a complete message reread
and no unsettled `dd-flow` Session/Work. Tool names are verified in both normal
tool execution and OpenCode code-mode/grouped-tool paths before code-mode is
admitted to a scored profile.

## Profile

Initial profile shape:

```json
{
  "schema_version": 1,
  "id": "opencode-server-<provider>-<model>-high",
  "harness": "opencode-server",
  "runtime_family": "opencode",
  "driver": "dd-opencode",
  "control_lifetime": "execution_daemon",
  "provider": "<provider-id>",
  "model": "<model-id>",
  "reasoning": "high",
  "variant": "high",
  "agent": "dd-flow-orchestrator",
  "permission_mode": "controlled_allowlist",
  "subagent_depth": 1,
  "delegated_background": false,
  "workspace_strategy": "controller_owned_shared_workspace",
  "opencode_version": "1.18.23",
  "api_fingerprint": "<sha256>",
  "config_overlay_sha256": "<sha256>",
  "adapter_plugin_sha256": "<sha256>",
  "instruction_sources_sha256": "<sha256>",
  "usage_scope": "physical_session"
}
```

The first live experiment selects a provider/model already authenticated in
the user's OpenCode store. Model choice is a profile decision and is not baked
into the driver.

`dd-eval.profileMatches` must compare these OpenCode fields in addition to the
legacy provider/model/reasoning/mode set. Resume, import and fork each produce
a fresh observed receipt; a matching requested JSON value is not evidence
unless the provider/server/plugin origin was observed or checksummed.

## `dd-opencode` CLI contract

```text
dd-opencode doctor --opencode-bin <path> --json

dd-opencode daemon start --state-dir <dir> --cwd <workspace> \
  --opencode-bin <path> --provider <id> --model <id> --variant high \
  --agent dd-flow-orchestrator --auth-path <path> \
  --dd-flow-bin <path> --dd-flow-home <runtime> \
  --project-root <stable-project> \
  [--session-archive <private-archive-manifest>] --json

dd-opencode daemon status --state-dir <dir> --json
dd-opencode daemon stop --state-dir <dir> [--cancel-tree] --json

dd-opencode session create --state-dir <dir> --title <title> --json
dd-opencode session prompt --state-dir <dir> --session-id <id> \
  --prompt-file <path> --json
dd-opencode session inspect --state-dir <dir> --session-id <id> --json
dd-opencode session children --state-dir <dir> --session-id <id> --json
dd-opencode session fork --state-dir <dir> --session-id <id> \
  [--message-id <id>] --json
dd-opencode session export --state-dir <dir> --session-id <id> \
  --output <private-directory> --json
dd-opencode session cancel-child --state-dir <dir> \
  --session-id <root> --child-session-id <child> --json
dd-opencode session cancel --state-dir <dir> --session-id <root> --json
dd-opencode interaction inspect --state-dir <dir> --json
dd-opencode interaction answer --state-dir <dir> --request-id <id> \
  --fixture <fixture-id> --json
```

All prompt content is read from a file or stdin, never embedded into process
arguments. JSON output contains no secrets or transcript text unless an
explicit diagnostic command requests sanitized content.

Control request IDs are immutable, responses are one-line bounded JSON and
client calls have separate connect, response and productive-operation
timeouts. A productive timeout does not kill the server blindly: the client
inspects status, leaves the daemon owning the operation and requires explicit
cancel or reconciliation.

## `dd-eval` changes

Add `opencode-server` to:

- allowed harness validation;
- profile schemas and fixtures;
- Session registration and observed-profile matching;
- checkpoint primary/extension evidence;
- starter registry;
- seed-mode resolution;
- launch instructions;
- usage/scoring reconciliation;
- Controller and case-creation runbooks.

OpenCode focused-stage starters use `archive_native_fork` plus verified
`dd-opencode/session-archive@1`, import and `dd-opencode/fork-receipt@1`
evidence. The starter registry and checkpoint validator become table-driven:
they validate each harness's allowed seed modes and archive requirements
instead of special-casing only Grok. For OpenCode, `parent_session_id` is not
required or populated; `seed_source_session_id` must equal the accepted
checkpoint Session and the archive/fork history checksums must match it.

The current supported-harness allowlists, runtime-family mapping,
`checkpointForHarness`, `subjectSeedMode`, starter validation and profile
matching all require an `opencode-server` entry. Scoring keeps the existing
gates: final usage, measured tool calls and zero unsettled Sessions. OpenCode
adds API/config/plugin/archive evidence to those gates; it does not weaken
them. Canonical starter/checkpoint manifests store only private archive
locator, SHA-256 and non-secret metadata.

### Exact `dd-eval` change map

- `bin/dd-opencode.mjs`: published CLI entry;
- `lib/dd-opencode.mjs`: HTTP client, schemas, message/tool/usage
  canonicalization, native fork/export/import policy;
- `lib/dd-opencode-daemon.mjs`: private socket daemon, server child ownership,
  SSE/HTTP reconciliation, topology, interaction and cancellation state;
- a shared daemon helper only for mechanics already identical in
  `dd-zcode-daemon.mjs` and `dd-grok-daemon.mjs`;
- `lib/dd-eval.mjs`: table-driven harness/runtime/seed/archive capabilities,
  OpenCode profile evidence, starter/checkpoint validation and scoring gates;
- `package.json`: `dd-opencode` binary;
- `profiles/`: one diagnostic profile first, scored profile only after live
  provider/model verification;
- `test/dd-opencode.test.mjs` and `test/dd-opencode-daemon.test.mjs`: fake
  server/daemon contract, socket safety, crash and archive fixtures;
- `test/eval.test.mjs`: OpenCode checkpoint/starter/profile/usage cases plus
  unchanged Codex/ZCode/Grok regression cases;
- `runbooks/harness-backends.md` and `runbooks/execute-eval.md`: operator
  create/import/fork/interaction/settle/cancel commands;
- a dated private-safe live validation runbook after each conformance level.

Starter/archive verification becomes descriptor-driven only at the existing
validation sites. This does not introduce runtime plugin discovery or a
provider class hierarchy.

## Failure classification

OpenCode-specific failure codes:

- `opencode_server_start_failed`;
- `opencode_server_auth_failed`;
- `opencode_api_schema_drift`;
- `opencode_foreign_directory`;
- `opencode_foreign_session`;
- `opencode_event_stream_lost`;
- `opencode_event_reconciliation_failed`;
- `opencode_fork_unlinked`;
- `opencode_fork_history_mismatch`;
- `opencode_archive_invalid`;
- `opencode_archive_version_mismatch`;
- `opencode_import_identity_mismatch`;
- `opencode_import_history_mismatch`;
- `opencode_plugin_drift`;
- `opencode_config_overlay_drift`;
- `opencode_user_config_leak`;
- `opencode_usage_scope_unknown`;
- `opencode_interaction_fixture_missing`;
- `opencode_background_capability_disabled`.

They map to the common infrastructure-invalid taxonomy where appropriate.

## Conformance matrix

| Area | Experiment | Passing evidence |
| --- | --- | --- |
| version | doctor on 1.18.23 | version and API fingerprint match |
| isolation | start with populated user config | only eval adapter origin loaded |
| auth | copied auth file | provider visible; secret absent from logs |
| create | idle root | exact cwd/profile; zero messages |
| prompt | one harmless turn | terminal assistant and final status |
| async | prompt plus polling/SSE | same terminal result as sync path |
| resume | daemon restart on idle data root | same Session readable |
| daemon safety | socket/config/terminal/crash fixtures | ZCode/Grok safety invariants preserved |
| fork latest | fork completed turn | canonical histories match |
| fork boundary | fork earlier message | exact prefix only |
| export/import | fresh XDG root and canonicalized new cwd | ID/history preserved; directory rebound |
| archive safety | checksum/link/collision/version failures | fail closed before provider start |
| foreground child | Task call | native child `parentID` and terminal result |
| child cancel | abort running child | parent remains controllable |
| tree cancel | root with child | descendants terminal deepest-first |
| background | capability-enabled child | root return does not imply settled tree |
| hook allow | standalone lifecycle command | pre-effect trusted receipt accepted |
| hook reject | compound/mismatched command | command blocked with retry guidance |
| usage | root and child model turns | per-Session totals reconcile |
| usage scope | counters around child turn | physical or inclusive scope proven, never assumed |
| tool usage | success and failing tool | exact totals/failures/by-tool |
| interaction | permission/question | deterministic paused receipt |
| SSE loss | disconnect during turn | HTTP reconciliation proves or invalidates |
| server crash | kill while busy | invalid harness crash, no false settlement |
| checkpoint | idle target boundary | snapshot, fork receipt and final usage |
| starter | import archive, fork untouched starter | first eval prompt goes only to eval child |
| E2E | clean run through CODE-REVIEW | Judge-ready candidate and final usage |

## Delivery order

1. Freeze baseline version and live OpenAPI fixture.
2. Implement pure HTTP client and response validators.
3. Implement daemon lifecycle, socket safety, auth and XDG isolation.
4. Implement SSE journal and HTTP reconciliation.
5. Implement create/prompt/inspect/status.
6. Implement fork canonicalization and receipts.
7. Implement native export/import archive and fresh-home restore receipts.
8. Implement child topology, interactions and recursive cancellation.
9. Add `dd-flow` adapter plugin and event ingestion.
10. Add usage ingestion, scope experiment and final reconciliation.
11. Extend `dd-eval` schemas/profiles/starters.
12. Pass diagnostic and delegated conformance.
13. Run focused SPECIFY from an imported starter.
14. Build the six-stage canonical OpenCode chain.
15. Run one complete E2E attempt and independent Judge flow.

No canonical checkpoint or scored profile is published before the applicable
conformance level passes.

## Merge and release plan

Changes land dependency-first, following the proven Grok release sequence:

1. Commit the paired specifications on both feature branches.
2. Implement and fully test the `dd-flow-cli` event/usage adapter while the
   `dd-eval` driver uses a compatible development snapshot.
3. Rebase both feature branches onto the latest integration heads at an
   explicit sync point; do not modify canonical case data during the rebase.
4. Run the complete `dd-flow-cli` typecheck, lint, test and build gates, create
   the required changeset/version and merge it first.
5. Install the immutable released beta engine into a disposable runtime and
   rebuild/checksum the OpenCode adapter plugin from that release.
6. Complete `dd-eval` driver/daemon/archive implementation and run all unit,
   daemon and eval regression tests against the released engine, not a source
   checkout.
7. Pass diagnostic, delegated and fresh-home import/fork conformance; record
   the exact OpenCode, API, plugin, config and engine revisions.
8. Merge `dd-eval` into the current `beta/vnext-plan-review` integration line.
9. Create canonical OpenCode checkpoints/starters only from the merged beta
   pair, then run focused and E2E diagnostics before enabling scoring.
10. Push and delete feature branches/worktrees only after ancestry, clean
    status and post-merge smoke checks pass in both repositories.

Rollback before a scored case is profile/configuration-only. Additive database
changes remain readable by the new engine, and existing Codex/ZCode/Grok paths
must remain green throughout.

## Design-completeness audit

| Concern | Decision/evidence | State before implementation |
| --- | --- | --- |
| headless transport | official authenticated `opencode serve` HTTP/SSE | live no-turn passed |
| Controller placement | Codex Controller/Judge, OpenCode Subject only | specified |
| process lifetime | execution-scoped daemon plus owned server child | specified from ZCode/Grok rules |
| socket/state safety | exact derived socket, modes, terminal reuse, crash receipt | specified and reusable tests identified |
| user config leakage | four XDG roots, project discovery off, one plugin | leak observed; isolation live test pending |
| auth | copy only `auth.json` or declared provider env | specified; model auth test pending |
| provider config | reviewed non-secret overlay with checksum | specified |
| workspace | one canonical Controller-owned directory; no OpenCode worktree | specified; import rebind live passed |
| root identity race | create/read/register before first prompt | specified from Grok fix |
| child identity | native Task child `parentID` only | source-confirmed; live model test pending |
| fork lineage | verified history receipt, no fictional parent | live empty fork passed |
| portable starter | native export, fresh-home import, native eval fork | live no-turn passed |
| lifecycle trust | synchronous before hook, updated args, existing claim path | source-confirmed; live tool test pending |
| event loss | SSE observability plus finite HTTP reconciliation | specified; disconnect test pending |
| interaction | explicit fixture/user answer through native endpoint | specified; payload conformance pending |
| cancel child/tree | descendant verification and deepest-first abort | specified; live child test pending |
| usage tokens | cumulative baseline/final snapshots | source-confirmed; model test pending |
| usage scope | physical versus tree-inclusive measured, never assumed | delegated experiment pending |
| tool accounting | terminal message parts deduplicated by native ID | source-confirmed; live/code-mode test pending |
| checkpoint barrier | settled tree, final usage, archive/fork, RUN snapshot | specified |
| scoring | existing final usage/tool/unsettled gates plus drift evidence | specified; E2E pending |
| engine pairing | plugin from immutable released `dd-flow` snapshot | specified in merge plan |
| cleanup/retention | private raw evidence, explicit deletion, no auto-delete | specified |

No unresolved architectural question requires a different control plane. The
remaining unknowns are provider/model conformance facts. Any failed assertion
becomes an explicit unsupported capability or infrastructure error; it does
not trigger a prompt-based workaround.

## Open questions and decisions deferred to live conformance

- Select the first provider/model from authenticated local providers after a
  read-only model inventory; the driver stays provider-neutral.
- Confirm whether installed `1.18.23` exposes agent/model/metadata fields in
  `POST /session` exactly as current upstream schemas do.
- Confirm permission and question response endpoint payloads against live
  OpenAPI before implementing automatic fixtures.
- Confirm whether background child events remain complete across root idle and
  whether the experimental flag is necessary for the selected agent version.
- Promote V2 durable Session events only after they are stable in a released
  pinned binary; SSE plus finite message reconciliation is the initial source.

These questions do not block implementation of the diagnostic transport and
isolation layers.
