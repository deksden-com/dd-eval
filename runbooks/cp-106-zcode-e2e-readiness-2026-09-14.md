# cp-106: подготовка ZCode E2E на beta.62

Статус: готовность опровергнута запуском `EVAL-20260914094108-1d25fff4`.
Baseline прошёл, но beta.62 отклонила bridge `60af0d3`: в допуске остался
commit `e0600fe3`. Сессия Subject не создавалась. Остановка завершилась
`recovery_blocked`, поскольку не учитывала отказ до создания ресурсов.
Этот документ сохраняет исторические входы, а не разрешение повторить запуск.
После выпуска исправления нужен новый checkpoint и проверка фактической связки
по [execute-eval](execute-eval.md); старый runtime нельзя исправлять на месте.

Исправление в исходниках проверено 2026-09-14: non-generative doctor с локальным
bridge `/Users/deksden/Library/pnpm/zcode-acp` вернул `compatible: true`,
`lifecycle_qualification.status: qualified`, ZCode `0.16.5`, bridge `0.13.1`,
commit `60af0d31e13076a313d9770f10aa70f7c94742cf`, contract `dd-zcode-harness@1`.
Это проверка исходников; установленный пакет beta.62 остаётся прежним.

## Зафиксированные входы

- Source: `924ef61752b642f06c2c326b444ed7a3239f20ff` / `eval/cp-074-source-final`.
- Flow pack: `9b121e24f94ac56c2a076cd95e84f427eeea8c6d`, Memory Bank `4.1.1`.
- CLI: `@deksden-com/dd-flow-cli@0.9.0-beta.62`, commit
  `a496c8a3b9781cd1808bd4a49fe314f0ef17c52c`, engine checksum
  `367e4f0ff47f4865235fb02e4e7ec6e3ebb6871959385db146b0d77dc8908ad8`.
- Checkpoint: [cp-106](../checkpoints/cp-106-task-priority-zcode-settlement-flow-4-1-1-engine-0-9-0-beta-62.json).
- ZCode bridge: commit `60af0d31e13076a313d9770f10aa70f7c94742cf`.

Полный release gate, npm tarball, annotated tag и isolated/global consumer
checks прошли для этого tuple. Пакет сохранён в
`/Users/deksden/.dd-eval/qualification/cp-106-zcode/published-engine`; его
isolated engine snapshot прошёл install и resolve against Memory Bank 4.1.1.

## Запуск — только отдельным запросом

```sh
export DD_EVAL_HOME=/Users/deksden/.dd-eval/qualification/cp-106-zcode
export DD_FLOW_BIN=/Users/deksden/.dd-eval/qualification/cp-106-zcode/published-engine/node_modules/@deksden-com/dd-flow-cli/dist/cli.js
node bin/dd-eval.mjs runner eval run --profile /Users/deksden/Documents/_Projects/dd-eval/cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-zcode-glm-5-3-flash-max.json
```

Не заменять `DD_FLOW_BIN` global или source CLI до завершения кампании.
