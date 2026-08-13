# mb-3.2.0-beta.1

Первый beta bundle для повторного planning eval `EVAL-001-task-priority`.
Цель — устранить механические причины невалидного SPECIFY run, не меняя
продуктовый checkpoint `cp-002` и не публикуя новый канонический релиз до
обкатки.

## База и ветки

| Component | Stable base | Beta branch | Intended beta version |
| --- | --- | --- | --- |
| `dd-tasks` | `252f6c8b112a88327cf8c8e22c606679f85bb0ff` | `beta/mb-3.2` | flow pack `3.2.0-beta.1` |
| `dd-flow-cli` | `a09f6b663231d3179bea64b2fd9bb4ffa30096c2` | `beta/engine-0.7` | engine `0.7.1-beta.1` |
| `dd-eval` | `87f4c2d8c09736723144a7f013f8025bf0f8aa8e` | `main` | beta specs, controller and checkpoint |

`dd-eval/main` хранит описание beta bundle и результаты. Отдельная beta-ветка
для него не нужна: продуктовый и engine код меняются только в двух указанных
ветках, а commits/tags в них являются immutable input eval.

## Bundle specs

| Spec | Owner | Result |
| --- | --- | --- |
| [001](specs/001-lifecycle-state-machine.md) | `dd-flow-cli`, `dd-tasks` | Один reducer состояния для protocol, RUN и stage finish. |
| [002](specs/002-codex-hook-session-binding.md) | `dd-flow-cli` | Trusted Codex session binding без agent-authored ID. |
| [003](specs/003-specify-stage-prompt-and-report.md) | `dd-flow-cli`, `dd-tasks` | Один stage prompt, grounding и структурированный SPECIFY report. |
| [004](specs/004-eval-launch-and-review.md) | `dd-eval` | Детерминированный intake, beta controller prompt и post-run review. |

## Status

`prepared` — ветки/worktrees и документация подготовлены; реализации и
immutable beta tags ещё нет. Полный порядок работ — в [runbook.md](runbook.md).

## Acceptance boundary

Beta принимается для повторного SPECIFY только если одновременно выполнено:

1. bootstrap связывает фактическую Codex session с RUN;
2. `stage finish` может честно перевести SPECIFY в `waiting_for_user`;
3. report содержит структурированные вопросы, а не prose-заглушку;
4. worker начинает с `stage start`, получает полный stage prompt и не делает
   отдельный priming/help/Git preflight;
5. механический и семантический review проходят без ручного ремонта SQLite,
   RUN или generated artifacts.

При любом нарушении run сохраняется как debugging evidence и не сравнивается
как результат модели.
