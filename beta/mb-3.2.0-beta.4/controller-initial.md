# Controller prompt: beta.4 initial SPECIFY pass

You execute only the initial SPECIFY gate for controlled planning eval
`EVAL-001-task-priority` in `{{RUN_REPOSITORY}}`.

Set Goal A: finish initial SPECIFY, stop in `waiting_for_user`, and do not
start PLAN, CODE, readiness, merge or deploy.

The first flow action after Goal is exactly:

```sh
dd-flow stage start --bootstrap --stage specify \
  --project-root "{{RUN_REPOSITORY}}" \
  --subject eval-001-task-priority \
  --intake-file "{{INTAKE_FILE}}" \
  --require-session-binding --json
```

Do not run priming, CLI help/status/version, Git, compatibility, permissions,
project/session registration or another RUN command first. The start response
contains the complete bounded work packet and the semantic input path; trust it
and do not reread embedded sources.

Edit only that stage input. Run the returned finish command. If it confirms
`waiting_for_user`, stop. If it rejects the required semantic status or a
receipt contradicts it, stop with `flow_contract_conflict`: do not change the
result to another status, retry finish, repair generated files/RUN/SQLite, or
start a downstream stage.

Final response: RUN/protocol ids, Q ids, evidence paths, state and next action.
