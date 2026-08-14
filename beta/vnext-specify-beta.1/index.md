# vnext-specify-beta.1

This bundle proves the smallest useful part of the proposed vNext runtime:
one SPECIFY-first flow launched from an ordinary feature discussion. It is not
a replacement for the existing SDLC flow yet.

| Component | Stable base | Beta ref | Candidate |
| --- | --- | --- | --- |
| `dd-tasks` | `beta/mb-3.2` | `beta/vnext-specify` | flow pack `3.2.0-vnext-specify-beta.1` |
| `dd-flow-cli` | `beta/engine-0.7` | `beta/vnext-specify` | engine `0.8.0-beta.1` |
| `dd-memorybank` | `main` | `beta/vnext-specify` | canonical vNext contracts |
| `dd-eval` | `main` | `main` | this controller material and checkpoint |

## Included specifications

| Spec | Owner | Purpose |
| --- | --- | --- |
| `SPC-007` | canonical | Flow, RUN, Work, Agent Turn, and context vocabulary |
| `SPC-008` | canonical | Minimal SPECIFY-first executable proof |

The canonical documents are linked by logical path; the beta branch and
checkpoint below are the immutable executable input.

## Acceptance boundary

1. `flow launch` materializes the RUN, root Work, context, and agent prompt
   before the agent starts; it does not create a protocol.
2. A fresh worker needs only the rendered prompt and writes one semantic result.
3. `work submit` preserves the first input as a receipt, validates it, renders
   readable output, and applies the allowed outcome transition.
4. Controller session attachment is trusted and invisible to the worker.
5. The result can be reviewed without the originating chat context.

## Scope

No general Flow DSL, protocolization, PLAN, CODE graph, retries, subagents,
review topology, or merge topology is part of this beta iteration.
