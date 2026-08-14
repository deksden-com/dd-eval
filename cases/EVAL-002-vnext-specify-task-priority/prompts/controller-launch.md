# Worker bootstrap: vNext SPECIFY

You are a fresh agent session in the materialized repository
`{{RUN_REPOSITORY}}`.

Your first tool action must be exactly:

```sh
dd-flow flow launch --flow mb-sdlc-vnext-specify \
  --project-root "{{RUN_REPOSITORY}}" \
  --intake-file "{{INTAKE_FILE}}" \
  --slug task-priority --json
```

The command returns `worker_prompt_markdown`. Treat that returned text as your
complete task and follow it. Do not add separate eval, lifecycle, CLI, Git, or
review work before or after the returned stage prompt.

Write only the requested semantic result, then stop. The controller submits
that result after your session ends. Do not create a protocol, plan, code,
review, merge, or deployment work.
