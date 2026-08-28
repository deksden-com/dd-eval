# Harness backends

`dd-eval` treats a harness as an evidence-producing session control plane, not
as part of the evaluated flow. The Controller remains a Codex task; the Subject
may use another harness when its profile declares one.

Every backend must provide these operations with stable provider Session IDs:

- doctor/version gate;
- create, resume, prompt and inspect;
- explicit checkpoint/latest fork;
- tree-aware cancellation;
- observed provider/model/reasoning/mode receipt;
- ordered tool/lifecycle events with a bounded synchronization contract;
- append-only JSONL evidence.

Session evidence always records `harness`, `runtime_family`,
`provider_session_id`, optional `adapter_session_id`, parent identity and the
observed profile. Provider IDs are interpreted only inside their harness.

## ZCode

The supported baseline is ZCode `0.16.5` with `zcode-acp` `0.13.1` at pinned
dd-harness commit `bf21f38dcbb85b8f98cd7ab3062aa050d1b5777c`. For delegated evals, `dd-zcode` keeps the ACP
server alive for the whole execution and synchronously forwards
`session/update` tool calls to:

```text
dd-flow zcode event handle --project-root <absolute-root> --json
```

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
  --provider builtin:zai-coding-plan --model GLM-5.3 --reasoning high --mode yolo \
  --prompt-file <first-message.md> --json
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
  --reasoning high --mode yolo --prompt-file <first-message.md> --json

dd-zcode session prompt --state-dir <attempt>/zcode \
  --session-id <native-id> --adapter-session-id <adapter-id> \
  --permission allow --prompt-file <packet.md> --json

dd-zcode session inspect --state-dir <attempt>/zcode \
  --session-id <native-id> --adapter-session-id <adapter-id> --json
dd-zcode session cancel --state-dir <attempt>/zcode \
  --session-id <native-id> --adapter-session-id <adapter-id> --json

dd-zcode daemon stop --state-dir <attempt>/zcode --cancel-tree --json
```

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

Focused-stage evals require an accepted canonical checkpoint and untouched
starter for the same harness. Build the Codex canonical revision first, then
capture and accept the ZCode entry for every stage with the same revision; this
extends `subject_by_harness.zcode-acp`. Fork each accepted ZCode checkpoint
once and register it with `dd-eval starter set --harness zcode-acp`. E2E evals
start clean and do not need a starter.
Version or observed-profile drift is an infrastructure-invalid attempt, never a
substitute profile.

After create/fork, the Controller registers the native identity and the exact
`evidence.observed_profile` returned by `dd-zcode`:

```text
dd-eval session add --eval <attempt> --execution <id> --role subject \
  --harness zcode-acp --session-id <native-id> \
  --adapter-session-id <adapter-id> --daemon-id <daemon-id> \
  --parent-session-id <native-starter-id> \
  --observed-profile-json '<observed-profile-json>'
```
