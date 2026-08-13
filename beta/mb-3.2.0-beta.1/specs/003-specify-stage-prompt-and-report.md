# 003 — SPECIFY stage packet and report

## Problem

SPECIFY currently receives only a stage-local instruction file, while its
useful priming and project grounding remain outside the packet. The worker
then repeats CLI/Git/help checks or reads arbitrary files. Its semantic input
uses a generic schema that rejects `questions`; generated reports consequently
lose the structured specification and degrade into prose.

## Decision

`stage start --bootstrap --stage specify` is the first flow command after an
optional harness Goal. It returns one rendered `worker_prompt_markdown` and
writes the identical `stage-prompt.md`/JSON source.

The packet uses the existing XML-like section boundaries with Markdown inside:

```text
<stage_identity>
<authoritative_runtime_facts>
<preflight>
<task_intake>
<applicable_instructions>
<required_context>
<work_contract>
<completion_contract>
```

It embeds bounded, stage-relevant priming: flow orientation, top-level project
indexes, task-relevant indexes, stage fragments, intake, aliases and a short
valid semantic-input example. The allowlist excludes later-stage instructions.
The worker trusts packet facts and does not repeat deterministic discovery.

Introduce `specify-stage-input@1` and make it the only worker-authored finish
payload. It contains the specification verdict, questions, gaps, grounding,
requirements/acceptance and next action. CLI computes changed files, timestamps,
Git facts, session/usage coverage and report locations. It deterministically
generates the existing `specification-stage-report@2`, Markdown, HTML and
summary; the worker does not author parallel reports.

Current writes are always `@stage`; `try-NNN` is archive-only. The command
receipt makes this boundary explicit.

## Acceptance

1. The returned prompt contains all eight required sections and enough bounded
   grounding to perform the initial priority SPECIFY task.
2. It does not ask the worker to prime separately, inspect CLI help/Git, render
   reports, register a session or choose an outcome flag.
3. Valid structured questions produce a schema-valid specification report with
   the questions preserved verbatim as structured data.
4. Invalid stage input returns all relevant schema errors in one response.
5. Tests reject a write to `@stage/try-NNN` as current work.

## Out of scope

Including the whole Memory Bank in every prompt, introducing XML as a data
format, or adding configurable report/observability levels.
