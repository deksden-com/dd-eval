# 001 — Bound schema and truthful SPECIFY outcome

## Evidence

beta.2 `stage finish` chose the project-local `stage-finish-input` schema
because semantic input has no `run_id`. That stale schema rejected
`waiting_for_user` and `questions`, even though the RUN-bound engine supported
them. The worker then changed a real clarification result to `done`.

## Decision

`stage finish` passes the known RUN id and dd-flow home to schema resolution.
When a RUN has an immutable engine binding, its schema is authoritative; the
project copy is not a fallback. The project pack ships the matching schema.

SPECIFY additionally enforces the meaningful invariant: `waiting_for_user`
has at least one structured question; `done` has none. Git changed files stay
CLI-derived and are not required worker input.

## Acceptance

- regression test puts a stale local schema beside a bound RUN and successfully
  finishes a structured `waiting_for_user` input;
- contradictory `done + questions` is rejected;
- package and project pack use matching schema bytes before beta freeze.
