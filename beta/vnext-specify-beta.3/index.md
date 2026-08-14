# vnext-specify-beta.3

This repair iteration fixes only vNext RUN observability.

| Component | Exact candidate |
| --- | --- |
| `dd-tasks` | flow pack `3.2.0-vnext-specify-beta.3`, tag `eval-mb-3.2.0-vnext-specify-beta.3` |
| `dd-flow-cli` | engine `0.8.0-beta.3`, tag `eval-engine-0.8.0-beta.3` |

## Change

The generic `run status` projection applied protocol-first `mb_sdlc` guidance
to a vNext SPECIFY RUN with no protocol. The RUN itself was correct, but the
operator view claimed a protocol predecessor existed. Status now renders
directly from the vNext run state: `specify`, `await_user_answer`,
`start_protocolize`, or terminal `none`.

No prompt, semantic result schema, product code, or transition changed.

## Acceptance

1. `run status` for a `waiting_for_user` vNext RUN identifies flow
   `mb_sdlc_vnext_specify`, stage `specify`, and next action
   `await_user_answer`.
2. It never claims an existing protocol or emits legacy protocol guards.
3. Launch still succeeds against the existing shared runtime database.
