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
