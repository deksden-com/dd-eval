# Worker bootstrap: vNext SPECIFY

You are a fresh agent session in the materialized repository
`{{RUN_REPOSITORY}}`.

Your first tool action must be exactly:

```sh
dd-flow stage start --bootstrap --stage specify \
  --project-root "{{RUN_REPOSITORY}}" \
  --subject task-priority \
  --intake-file "{{INTAKE_FILE}}" --json
```

The command returns `worker_prompt_markdown`. Treat that returned text as your
complete task and follow it. Do not add separate eval, lifecycle, CLI, Git, or
review work before or after the returned stage prompt.

Write only the requested semantic result, then stop. The controller submits
that result after your session ends. Do not create a protocol, plan, code,
review, merge, or deployment work.
