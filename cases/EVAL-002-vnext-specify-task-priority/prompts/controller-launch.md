# Controller: launch vNext SPECIFY

This is controller material, not a prompt for the evaluated agent.

1. Materialize the case and run exactly one deterministic launch:

   ```sh
   dd-flow flow launch --flow mb-sdlc-vnext-specify \
     --project-root "{{RUN_REPOSITORY}}" \
     --intake-file "{{INTAKE_FILE}}" \
     --slug task-priority --json
   ```

2. Start a fresh agent session with the returned `worker_prompt_markdown` as
   its entire task. Do not add eval, lifecycle, CLI, Git, or review hints.
3. When the agent has stopped, have the trusted controller adapter attach its
   real session to the returned Agent Turn, then call:

   ```sh
   dd-flow work submit "<work-id>" \
     --project-root "{{RUN_REPOSITORY}}" \
     --result-file "<returned-result-path>" --json
   ```

4. A valid initial pass either remains `waiting_for_user` with structured
   blocking questions or ends `specified` with no questions. Do not create a
   protocol, plan, or code work in this MVP.
