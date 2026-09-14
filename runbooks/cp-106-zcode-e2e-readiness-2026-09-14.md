# cp-106: подготовка ZCode E2E на beta.62

Статус: готово к новому ZCode E2E. Живой E2E и `runner eval preflight` не
запускались: следующий `runner eval run` должен создать единственный новый
EVAL.

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
