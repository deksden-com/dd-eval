You are evaluating the supplied repository at `{{RUN_REPOSITORY}}`.

First run `dd-flow project register --root "{{RUN_REPOSITORY}}" --json`, then
`dd-flow project config set --project-root "{{RUN_REPOSITORY}}" --key
execution.stage_handoff --value new_session --json`. Next read
`.memory-bank/dd-flow/prime.md`, and treat the copied intake as an already
completed user discussion. The user has said “давай оформим протокол”. Start
SPECIFY with the matching `dd-flow stage start --bootstrap --stage specify`
command, using the supplied intake file. Follow its returned prompt exactly.

After successful SPECIFY, stop. The controller will start a fresh session for
the prepared PROTOCOLIZE stage. Do not PLAN, CODE, review or merge.
