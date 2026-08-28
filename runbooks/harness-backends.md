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
- ordered tool/lifecycle events before the corresponding side effect;
- append-only JSONL evidence.

Session evidence always records `harness`, `runtime_family`,
`provider_session_id`, optional `adapter_session_id`, parent identity and the
observed profile. Provider IDs are interpreted only inside their harness.

## ZCode

The supported baseline is ZCode `0.16.5` with `zcode-acp` `0.13.0` plus the
dd-harness inspection extensions. `dd-zcode` starts the ACP server over stdio
for each operation and synchronously forwards `session/update` tool calls to:

```text
dd-flow zcode event handle --project-root <absolute-root> --json
```

The adapter turns root and subagent Bash calls into the existing trusted
lifecycle receipt. A child is identified by ZCode's native `childSessionId`;
its dd-flow identity is `zcode-acp:<childSessionId>` and its immutable parent is
the controlled root Session.

Typical controlled launch:

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
closed; managed background children require a future long-lived bridge daemon.
ZCode fork restores its target checkpoint in the session's current filesystem;
it does not allocate a worktree. Fork only inside a dedicated starter workspace,
and expect the shared files to be rewound to the selected checkpoint.

### Planned persistent controller

Delegated evals need a long-lived `dd-zcode` daemon because a background ZCode
subagent belongs to the live `zcode app-server` process. Closing the primary
stdio connection stops `zcode-acp` and loses the runtime handle required by
`session/cancelBackgroundTask`; persisted topology alone cannot cancel that
child. The existing `zcode-acp hub` does not solve this: it is a stateless
remote proxy and does not extend the bridge lifetime.

The daemon will be local and execution-scoped. It owns one `zcode-acp server`,
one controlled workspace and one append-only journal, and accepts `dd-zcode`
commands over a permission-restricted Unix socket. It is not a machine-wide
service and does not expose a network port.

Target operator flow (not available yet):

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

Focused-stage evals require an accepted canonical checkpoint and untouched
starter for the same harness. E2E evals start clean and do not need a starter.
Version or observed-profile drift is an infrastructure-invalid attempt, never a
substitute profile.

After create/fork, the Controller registers the native identity and the exact
`evidence.observed_profile` returned by `dd-zcode`:

```text
dd-eval session add --eval <attempt> --execution <id> --role subject \
  --harness zcode-acp --session-id <native-id> \
  --parent-session-id <native-starter-id> \
  --observed-profile-json '<observed-profile-json>'
```
