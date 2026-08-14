# vnext-specify-beta.6

This iteration removes beta-only lifecycle verbs from the worker path. A
normal conversation still enters SPECIFY through the primed `vnext/start.md`,
but the flow now uses the ordinary stage lifecycle end-to-end.

| Component | Exact candidate |
| --- | --- |
| `dd-tasks` | flow pack `3.2.0-vnext-specify-beta.6`, tag `eval-mb-3.2.0-vnext-specify-beta.6` |
| `dd-flow-cli` | engine `0.8.0-beta.5`, tag `eval-engine-0.8.0-beta.5` |

## Included specifications

1. [001-standard-stage-lifecycle.md](specs/001-standard-stage-lifecycle.md)
