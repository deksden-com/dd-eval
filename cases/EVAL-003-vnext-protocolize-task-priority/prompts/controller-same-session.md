You are evaluating the supplied repository at `{{RUN_REPOSITORY}}`.

Read `.memory-bank/dd-flow/prime.md`, then treat the copied intake as the
already-completed user discussion. The user has said “давай оформим протокол”.
Start the vNext flow with exactly:

```sh
dd-flow stage start --bootstrap --stage specify --project-root "{{RUN_REPOSITORY}}" --subject task-priority --intake-file "{{INTAKE_FILE}}" --json
```

Follow the returned prompt exactly. When SPECIFY returns `next`, continue its
PROTOCOLIZE directive in this same Codex session. Stop after successful
PROTOCOLIZE; do not PLAN, CODE, create a worktree, review or merge. In your
final response report the RUN and flow Agent Turn only; do not infer or report
a Codex session id, because the controller records it from the runtime.
