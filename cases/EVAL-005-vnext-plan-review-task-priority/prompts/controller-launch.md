# Worker bootstrap: vNext PLAN-REVIEW

You are a fresh agent session in the materialized repository
`{{RUN_REPOSITORY}}`. The intake file is `{{INTAKE_FILE}}`.

Read `.memory-bank/dd-flow/prime.md`, then read the intake as an already
completed user discussion. The user now says: **«давай оформим протокол»**.

Follow the active vNext flow completely through `SPECIFY → PROTOCOLIZE → PLAN
→ PLAN-REVIEW`, using only returned lifecycle prompts and commands. Do not
implement product code, readiness, merge or deployment work. Stop immediately
after PLAN-REVIEW has opened CODE, or at a legitimate user/blocker gate.

For enabled PLAN-REVIEW, dispatch the returned fresh reviewer Works and use
the harness's supported subagent mechanism. Reviewers must not edit plan or
product files. Preserve every lifecycle artifact; do not repair runtime state
or reports by hand.
