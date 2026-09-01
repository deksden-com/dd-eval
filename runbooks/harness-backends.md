# Harness backends

`dd-eval` treats a harness as an evidence-producing session control plane, not
as part of the evaluated flow. The Controller remains a Codex task; the Subject
may use another harness when its profile declares one.

For every routine focused, segment and E2E evaluation, the active contract is
[specification 017](../specs/017-deterministic-eval-runner-and-portable-stage-entry.md):
the runner restores a portable stage entry and creates an empty Subject
Session. Native forks and historical starter archives below are diagnostics
only; they must not be selected as an ordinary eval input or fallback.

Every backend must provide these operations with stable provider Session IDs:

- doctor/version gate;
- create, resume, prompt and inspect;
- tree-aware cancellation;
- observed provider/model/reasoning/mode receipt;
- ordered tool/lifecycle events with a bounded synchronization contract;
- append-only JSONL evidence.

Session evidence always records `harness`, `runtime_family`,
`provider_session_id`, optional `adapter_session_id`, optional parent identity
and the observed profile. Provider IDs are interpreted only inside their
harness. Routine focused evals use a new empty Session for every harness;
native fork capability is optional diagnostic functionality, never a required
baseline or fallback.

## Codex Desktop

`dd-codex` owns an isolated app-server daemon for one eval execution.  Its
append-only JSONL journal keeps provider item notifications as the transcript;
routine `thread/read` polls are compact status receipts so the same full
history is not copied on every poll.  `session cancel` accepts a Session ID:
when no Turn ID is supplied it reads the active provider turn once and
interrupts that turn.  If a compact poll reports an idle Session without turn
details, the adapter performs one full read to reconcile the terminal turn.

The runner therefore waits for the provider terminal event or a registered
`dd-flow` lifecycle receipt; silence alone is never a cancellation condition.

## Antigravity CLI

`dd-agy` controls the official Antigravity CLI `1.1.22` headless streaming
protocol. One execution-scoped daemon owns one long-lived conversation, a
`0600` Unix socket, private journal, and private Gemini customization/runtime
tree. It keeps the normal process `HOME` so macOS Keychain authentication
continues to work, while `--gemini_dir` and `--app_data_dir=runtime` prevent
user agents, skills, plugins, MCP and settings from entering the eval.

```text
dd-agy doctor --agy-bin <agy> --model gemini-3.1-pro-high --json
dd-agy daemon start --state-dir <attempt>/agy --cwd <workspace> \
  --project-root <project> --dd-flow-bin <dd-flow> \
  --dd-flow-home <runtime-home> --agy-bin <agy> \
  --provider google --model gemini-3.1-pro-high --reasoning high \
  --mode accept-edits --json
dd-agy session create --state-dir <attempt>/agy --prompt-file <prime.md> --json
dd-agy session prompt --state-dir <attempt>/agy --session-id <conversation-id> \
  --prompt-file <packet.md> --json
dd-agy session inspect --state-dir <attempt>/agy --json
dd-agy session cancel --state-dir <attempt>/agy --tree --json
dd-agy daemon stop --state-dir <attempt>/agy --cancel-tree --json
```

The daemon forwards `PreToolUse` and `PostToolUse` hooks to `dd-flow agy event
handle`, and cumulative result counters to `dd-flow agy usage ingest`. The
provider conversation ID is the physical Session identity. An unclean provider
exit during a turn leaves `active_tree=true` and is an invalid harness crash.

Headless stream input rejects `/fork`; the native interactive command cannot
be a reliable control-plane operation. This is not a limitation for routine
evals: the runner restores the portable fixture and creates a fresh
conversation. Interactive fork remains an explicitly separate diagnostic.

## Grok Build

`dd-grok` controls Grok Build directly through its native ACP stdio endpoint;
it does not use a leader process or a second proxy. The verified baseline is
Grok Build `1.0.16`, ACP protocol `1`, `grok-4.6` and an explicit reasoning
effort. `dd-grok doctor` rejects version or observed-profile drift.

The execution-scoped daemon owns one direct `grok agent --no-leader` process,
an isolated `GROK_HOME` and child-process `HOME`, its global `PreToolUse` hook,
append-only journal and a `0600` Unix socket. Before startup it generates a
minimal config (auto-update and external compatibility disabled) and verifies
that `grok inspect --json` sees no foreign config, skills, hooks, plugins, MCP
or permission sources. The hook resolves the Session through the daemon, then
submits the event to `dd-flow grok event handle`. Grok hooks can allow or deny
but cannot rewrite terminal input; `dd-flow` therefore claims one fresh event
by its immutable lifecycle match key.

```text
dd-grok doctor --grok-bin <grok> --json
dd-grok daemon start --state-dir <attempt>/grok --cwd <workspace> \
  --journal <attempt>/grok/events.jsonl --grok-bin <grok> \
  --model grok-4.6 --reasoning high --dd-flow-bin <dd-flow> \
  --dd-flow-home <runtime-home> --project-root <project> --json
dd-grok session create --state-dir <attempt>/grok --prompt-file <prime.md> --json
dd-grok session prompt --state-dir <attempt>/grok --session-id <native-id> \
  --prompt-file <packet.md> --json
dd-grok session fork --state-dir <attempt>/grok --session-id <native-id> \
  --target-json '{"newCwd":"/absolute/workspace"}' --json
dd-grok session cancel --state-dir <attempt>/grok --session-id <native-id> --json
dd-grok daemon stop --state-dir <attempt>/grok --cancel-tree --json
```

At daemon creation `dd-grok` copies the default `~/.grok/auth.json` (or an
explicit absolute `--auth-path`) into the private execution `GROK_HOME` with
mode `0600`; its contents never enter state or the journal. `XAI_API_KEY` is
also inherited when supplied. Root usage uses `usage_scope=execution_tree_inclusive`, child usage
uses `physical_session`; reports retain child facts for attribution without
double counting the root total. `dd-eval` records `harness=grok-acp`,
`runtime_family=grok` and native Grok IDs. The runner stores this evidence in
the execution journal and manifest, not in a shared Session starter registry.

## ZCode

The supported baseline is ZCode `0.16.5` with `zcode-acp` `0.13.1` at pinned
dd-harness commit `bf21f38dcbb85b8f98cd7ab3062aa050d1b5777c`. For delegated evals, `dd-zcode` keeps the ACP
server alive for the whole execution and synchronously forwards
`session/update` tool calls to:

```text
dd-flow zcode event handle --project-root <absolute-root> --json
```

`--dd-flow-home` and `--project-root` are a pair. With that pair, the daemon
uses `dd-flow` from the worker's `PATH` unless `--dd-flow-bin` pins an absolute
executable; the latter is preferable when the eval requires a particular CLI
build.

The adapter turns root and subagent Bash calls into the existing trusted
lifecycle receipt. A child is identified by ZCode's native `childSessionId`;
its dd-flow identity is `zcode-acp:<childSessionId>` and its immutable parent is
the controlled root Session. ZCode publishes a nested-agent Bash notification
concurrently with command startup, so `dd-flow` gives the matching immutable
receipt up to 250 ms to reach SQLite before failing closed. The observed live
delay was about 1 ms; an absent or mismatched event is still rejected.

Before and after every productive daemon operation, `dd-zcode` forwards the
provider's cumulative token counters plus cumulative ACP tool-call counters.
For ZCode `0.16.5`, the compact provider projection can omit cache detail, so
`zcode-acp` also aggregates the native per-request token facts. The exact
fields are `requestInputTokens`, `requestCacheCreationTokens`,
`requestCacheReadTokens`, `requestOutputTokens`, `requestReasoningTokens`,
`requestTotalTokens` and `requestCount`; `requestUsageStatus=measured` tells
the ingester to prefer them. `dd-flow stat usage` computes the Work/RUN delta
and labels the source `zcode_session_usage_v1`; tool totals, failures and
`by_tool` are therefore comparable with Codex transcript-derived evidence.

The one-shot form below remains useful for foreground diagnostics:

```text
dd-zcode doctor --zcode-acp-bin <bin> --json
dd-zcode session create --cwd <project> --journal <journal.jsonl> \
  --provider builtin:zai-coding-plan --model GLM-5.3 --reasoning high --mode yolo --json
dd-zcode session prompt --session-id <native-id> --adapter-session-id <adapter-id> \
  --cwd <project> \
  --journal <journal.jsonl> --permission allow --dd-flow-bin <dd-flow> \
  --dd-flow-home <runtime-home> --project-root <project> \
  --provider builtin:zai-coding-plan --model GLM-5.3 --reasoning high --mode yolo \
  --prompt-file <packet.md> --json
```

The Controller retains both IDs from `session create`: the native ID is the
eval identity, while the adapter ID is the durable control locator that keeps
the session's trusted workspace across short-lived `dd-zcode` processes.
The one-shot CLI supports foreground subagents. If a turn returns while a
background child is still running, `dd-zcode` cancels that live tree and fails
closed. Delegated/scored profiles use the daemon flow below.
ZCode fork restores its target checkpoint in the session's current filesystem;
it does not allocate a worktree. Fork only inside a dedicated starter workspace,
and expect the shared files to be rewound to the selected checkpoint.

### Execution-scoped daemon

Delegated evals use a long-lived `dd-zcode` daemon because a background ZCode
subagent belongs to the live `zcode app-server` process. Closing the primary
stdio connection stops `zcode-acp` and loses the runtime handle required by
`session/cancelBackgroundTask`; persisted topology alone cannot cancel that
child. The existing `zcode-acp hub` does not solve this: it is a stateless
remote proxy and does not extend the bridge lifetime.

The daemon is local and execution-scoped. It owns one `zcode-acp server`,
one controlled workspace and one append-only journal, and accepts `dd-zcode`
commands over a permission-restricted Unix socket. It is not a machine-wide
service and does not expose a network port.

Operator flow:

```text
dd-zcode daemon start --state-dir <attempt>/zcode --cwd <workspace> \
  --journal <attempt>/zcode/events.jsonl --zcode-acp-bin <bin> \
  --dd-flow-bin <dd-flow> --dd-flow-home <runtime-home> \
  --project-root <project> --json

dd-zcode session create --state-dir <attempt>/zcode \
  --provider builtin:zai-coding-plan --model GLM-5.3 \
  --reasoning high --mode yolo --json

dd-zcode session prompt --state-dir <attempt>/zcode \
  --session-id <native-id> --adapter-session-id <adapter-id> \
  --permission allow --prompt-file <packet.md> --json

dd-zcode session inspect --state-dir <attempt>/zcode \
  --session-id <native-id> --adapter-session-id <adapter-id> --json
dd-zcode session cancel-child --state-dir <attempt>/zcode \
  --session-id <native-id> --adapter-session-id <adapter-id> \
  --child-session-id <native-child-id> --json
dd-zcode session cancel --state-dir <attempt>/zcode \
  --session-id <native-id> --adapter-session-id <adapter-id> --json

dd-zcode daemon stop --state-dir <attempt>/zcode --cancel-tree --json
```

Use `cancel-child` to recover one failed worker while its parent orchestrator
must continue: it cancels only that child and keeps the parent's ACP listener
and trusted lifecycle forwarding alive. `session cancel` and `daemon stop
--cancel-tree` are terminal tree operations; they cancel the parent too and
must not be used as a worker retry mechanism.

`daemon stop` must prove an empty running tree. An unclean daemon death while a
descendant was running makes the scored attempt `invalid_harness_crash`; a new
process may read persisted history, but it must not claim that the lost runtime
was cancelled or settled. The detailed delivery plan is in
`runbooks/dd-zcode-daemon-plan.md`.

`daemon start` is idempotent only for the exact same configuration. `status`
performs a live socket handshake and returns the daemon PID, identity, pinned
versions, controlled cwd, active operation and tracked Sessions. Productive
`create`, `prompt` and `fork` operations are serialized; `inspect` and `cancel`
remain available while a prompt is running. State directory and socket modes
are `0700` and `0600`. For a state path longer than the macOS Unix-socket
limit, `daemon.json` records a deterministic short socket path under `/tmp`.
A successful `daemon stop` makes that state directory terminal. Use a fresh
`--state-dir` for the next execution; cold reuse is rejected as
`daemon_state_terminal` because persisted ZCode background topology is not a
live runtime handle.

Use `stop` without `--cancel-tree` first when a clean topology is expected. A
`tree_not_settled` response is evidence, not a prompt to kill the daemon. Inspect
the tree and cancel it explicitly, or use `stop --cancel-tree` for deliberate
cleanup. `invalid_harness_crash` and `partial_cancellation` make the attempt
`invalid_infrastructure_flow`; apply the controller override described in
`runbooks/beta-contour.md` and do not checkpoint or score it.

Focused-stage evals require the same accepted portable entry pack for every
harness. A cross-model comparison therefore needs no native Session lineage:
the runner restores the project/RUN snapshot, creates a clean ZCode Session and
sends the common launcher. Do not mix project/runtime snapshots from different
flow/engine pairs. ZCode's native fork remains available for a separate
session-continuity diagnostic, but never alters scored focused or E2E input.
Version or observed-profile drift is an infrastructure-invalid attempt, never a
substitute profile.

After creation, the runner records the native identity and exact
`evidence.observed_profile` returned by `dd-zcode` in its append-only journal:

```text
dd-eval runner eval run --profile <profile.json>
```
