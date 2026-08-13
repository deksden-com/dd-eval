# 003 — Session-binding gate and bounded packet

## Evidence

The beta.2 worker had no hook event, so the RUN had no real Codex session.
The hook matcher is already `Bash`, which matches the local Codex source; the
missing event must therefore be caught at eval bootstrap rather than guessed
away. The same run received a 52 KB prompt and then reread the same six files.

## Decision

`stage start --require-session-binding` fails closed unless the PreToolUse hook
supplies a trusted binding. Only the eval controller uses this switch; ordinary
project flows retain their normal behavior. A real Codex task smoke remains a
required harness check because unit tests cannot prove Desktop hook delivery.

SPECIFY uses one compact project-owned packet that contains the necessary
priming, grounding and completion contract. The packet says its embedded
instructions are already read; the worker opens another source only for new,
specific semantic evidence. `stage start` also creates the only valid semantic
input template, so the worker does not discover schemas or invent fields.

## Acceptance

- unit tests reject a required start with no trusted binding;
- controller passes `--require-session-binding` on its first command;
- rendered SPECIFY prompt has one source fragment, a valid input path and no
  instruction to reread embedded files;
- real pre-eval smoke records a hook event and bound session before launch.
