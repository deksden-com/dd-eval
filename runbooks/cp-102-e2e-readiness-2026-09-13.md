# cp-102: готовность новых Luna / ZCode E2E

Предзапусковая подготовка завершена 2026-09-13. Scored E2E не запускались,
provider Sessions не создавались. Это готовность к эксперименту, не обещание
успешного продуктового результата или квалификация всех stop/recovery сценариев.
Заменяет beta.53 readiness для следующих запусков; старые EVAL и checkpoint сохранены.

## Проверенный пакет

- `@deksden-com/dd-flow-cli@0.9.0-beta.54`, commit
  `eb2cb9746a9ee386d40f63791f5dbe0847bf5017`; remote annotated release tag совпадает.
- [Release workflow](https://github.com/deksden-com/dd-flow-cli/actions/runs/34757196878):
  PASS за 12m56s, один полный gate: typecheck, lint, build, **643 tests / 55 files**;
  OIDC publication, artifact readback, isolated/global consumer smoke PASS.
- Изолированная установка публичного npm-пакета и независимый full-content digest PASS.
  Engine SHA-256 `9c44906599ef2cdb22692150e623e0f7751b36d81e9eb6264b70f729235ee624`.
  Canon 4.1.0 / `ef349bf47cba1c987468e51d73a0dbadbd48dc1f`.
- Локальный receipt:
  `/Users/deksden/.dd-eval/qualification/cp-102-luna-zcode/published-package-verification.json`.
- [Новый checkpoint](../checkpoints/cp-102-task-priority-shared-runtime-flow-4-1-0-engine-0-9-0-beta-54.json)
  закреплён в case SHA-256 `0641c41356f9218ed94264bfcb9e8c92dd9bc6705032b2058d42a3ce7ece1221`.
  Source `924ef61752b642f06c2c326b444ed7a3239f20ff` / `eval/cp-074-source-final`
  и project flow pack `dee7dba1ae721ac1c2b12d8d9c5f16e0bbee0c8b` не изменены.
  Продуктовая feature заранее не перенесена в baseline.

## dd-eval и регрессии

Полный `node --test --test-reporter=dot` PASS после commit `67bb195`:
218 passed, 8 optional integrations skipped. Первый полный запуск выявил одно
устаревшее ожидание теста отмены: `runner status` теперь выполняет дополнительный
read-only `runtime scope status`. Проверка заменена на точную последовательность
`fence, stop, fence, stop, status`, а не ослаблена до произвольного числа вызовов.
Целевой тест отмены также PASS (4/4). После обновления checkpoint отдельно
прошёл `case pins`; runtime после полного теста не менялся.

Канонический ответ уже включает UI/API semantics. Ранбук исправлен: forbidden /
exhausted HITL — `unexpected_hitl`, unmatched — классифицированная ошибка,
а не бессрочный human wait. Ошибка, cleanup и capture сохраняются раздельно.

## Два preflight

Оба выполнены на чистом committed definition
`bb438d00ca232af4a21658d5b5522b8e6fc5ada5` и публичном beta.54.
Результат каждого: `ok:true`, baseline admission `passed`, подготовлен незапущенный
RUN, Subject/Judge doctor PASS, `provider_sessions_created:0`.
Baseline: install, quality, browser (6 tests), isolation — PASS.

Полные receipts и логи:

- Luna: `/Users/deksden/.dd-eval/qualification/cp-102-luna-zcode/conformance/e2e-preflight/1789303493346-3f3cf114/e2e-inline-merge-luna-xhigh/receipt.json`.
- ZCode: `/Users/deksden/.dd-eval/qualification/cp-102-luna-zcode/conformance/e2e-preflight/1789303493396-39915579/e2e-inline-merge-zcode-glm-5-3-flash-max/receipt.json`.

Luna xhigh и Sol high: Codex CLI 0.154.0, app-server available.
ZCode 0.16.5 + ACP 0.13.1 / `43f654bccdbb1aa4f4fb4617f7315c4336dbcde0`:
`compatible:true`, lifecycle `cli-invocation@1` qualified для root,
concurrent children и child continuation; native nested children не поддержаны.
Native runtime и измеренная capacity не менялись, повторный платный smoke не нужен.
PostgreSQL `dd-tasks-postgres-1` healthy на `127.0.0.1:55433`; оставлен работающим.

После этих preflight менялась только документация; новый gate из-за отчёта не нужен.

## Следующий шаг — отдельный запрос на запуск

Не продолжать preflight RUN. Каждый обычный `runner eval run` создаёт новый EVAL.
Сохранять установленный пакет до завершения кампании; не заменять global/source CLI.

```sh
export DD_EVAL_HOME=/Users/deksden/.dd-eval/qualification/cp-102-luna-zcode
export DD_FLOW_BIN=/Users/deksden/.dd-eval/qualification/cp-102-luna-zcode/published-engine/node_modules/@deksden-com/dd-flow-cli/dist/cli.js
```

Из `/Users/deksden/Documents/_Projects/dd-eval`:

```sh
node bin/dd-eval.mjs runner eval run --profile /Users/deksden/Documents/_Projects/dd-eval/cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-luna-xhigh.json
node bin/dd-eval.mjs runner eval run --profile /Users/deksden/Documents/_Projects/dd-eval/cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-zcode-glm-5-3-flash-max.json
```

Оба запуска используют общий `$DD_EVAL_HOME/resources`. Initial reply означает
принятие запроса, не итог. Сопровождение и фиксация отклонений — по
[execute-eval](execute-eval.md). Определение после запуска не изменять.
