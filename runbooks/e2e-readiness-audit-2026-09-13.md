# Готовность Luna / ZCode к новому E2E — 2026-09-13

Согласованный предзапусковой объём закрыт. Новый scored E2E не запускался.
Готовность означает проверенную подготовку и квалифицированный runtime,
а не доказательство успешного прохождения будущего продуктового сценария.

## Пакет и checkpoint

- Публичный `@deksden-com/dd-flow-cli@0.9.0-beta.53`, commit
  `db14065f43f320bc69dacbec425cd04eac8236ae`; release tag указывает туда же.
- [Release gate](https://github.com/deksden-com/dd-flow-cli/actions/runs/34734083263):
  typecheck, lint, build, 632 теста в 55 файлах, публикация OIDC и consumer smoke PASS.
  Предыдущие два неуспешных job сохранены в хронологии, не считаются PASS.
- Отдельная установка из npm и проверка build/canon/full-content digest PASS.
  Canon `4.1.0`, commit `ef349bf47cba1c987468e51d73a0dbadbd48dc1f`.
- Engine SHA-256: `16dad1459a0ec0e5a81e5583b3e5de391609cb0603a290e10b257219ff22305f`.
- [cp-101](../checkpoints/cp-101-task-priority-shared-runtime-flow-4-1-0-engine-0-9-0-beta-53.json)
  закреплён в case по SHA-256
  `42d021087843bce06ba4eb463830fd887c51673caeafcd53ecfc2429f8f7a50d`.
  Source `924ef61752b642f06c2c326b444ed7a3239f20ff` / `eval/cp-074-source-final`
  и flow pack `dee7dba1ae721ac1c2b12d8d9c5f16e0bbee0c8b` не менялись.
  Продуктовая feature заранее не перенесена в baseline; cp-100 сохранён.

Локальный receipt публичного пакета:
`/Users/deksden/.dd-eval/qualification/cp-101-luna-zcode/published-package-verification.json`.

## Сверка исходного плана

| Объём | Реализация и доказательство |
| --- | --- |
| I-01/I-02/I-03, C-02 | Общий lifecycle parser: help до mutation, standalone heredoc, сохранение argv/stdin при добавлении точного ID, отказ compound/multiple calls. `hooks-shell`, `runtime-cutover`, `run-cli` regressions вошли в полный gate. |
| I-08/I-09 | Durable invocation → native identity → receipt → один CLI claim; generation/control/ownership перепроверяются после ожидания вне write transaction. Duplicate/replay/timeout/conflict/unknown/retry покрыты настоящей DB в `lifecycle-invocations.test.ts`. Второй writer исключён, lifecycle notifications отделены от secondary evidence. |
| I-04 | Existing detached observer для run/resume, retained runner-attempts/logs/owner PID + start identity, неизвестная причина исчезновения не подменяется догадкой. Поведенческие tests owner/lock/status и пять real-CLI integrations: caller exit/kill, observer loss/takeover, отмена с сохранением соседнего EVAL. |
| I-05/I-07 | Общая классификация conclusive failure / observation loss / pause, сохранение первоначальной ошибки, definition guard до productive reattach, включая untracked case inputs. `e2e-reliability` и `runner-control` tests. |
| I-06 | Общий resolver опубликованных root/child/successor journals для model/tool/Judge evidence; missing source явно unavailable, inclusive usage не удваивается. `model-observations` tests. |
| C-01 | Grok hook сохраняет полный native response, включая updatedInput/deny; ACP mirror больше не создаёт второй admission receipt. Native adapter/transport regressions в release gate. |
| C-03 | Partial ZCode Session updates сохраняют immutable ancestry, конфликт отклоняется. Regression и native parent readback. |
| Recovery и смежный класс | Scope из persisted daemon/RUN, mixed-harness очистка, разрешённый retry только после conclusive outcome, executing/unknown без replay; recovery overlay не меняет original prompt; snapshot переносит authority в lineage. DB/controller/capture/recovery regressions. Legacy recent lookup разрешён только явной allowlist codex-desktop/antigravity-cli. |

dd-eval: 122 профильных PASS и 5 optional real-CLI checks, затем отдельно
5/5 real-CLI PASS — итого 127 разных проверок. Это не заявление о полном
наборе всех тестов dd-eval. Provider Sessions эти интеграции не создавали.
Код после этих проверок не менялся: далее только checkpoint/case pin и runbooks.

Native ZCode 0.16.5 + ACP 0.13.1 / `43f654bccdbb1aa4f4fb4617f7315c4336dbcde0`:
production root + два concurrent child + continuation того же child PASS на
настоящих Work/start/finish/receipts. Отдельный session/resume и чтение settled
outcome другим observer PASS; таблицы эффектов до/после совпали.
Копии evidence: `/Users/deksden/.dd-eval/conformance/lifecycle-invocations-2026-09-13/`.

Ограничения: native nested children отсутствуют; ни плоское дерево, ни
SendMessage не выдаются за nested qualification. Native reattach/read не
доказывает полный продуктивный RUN recovery. Полная матрица шести harnesses
и всех stop/recovery сценариев не входит в этот предзапусковой этап.
ZCode.app и zcode-acp не патчились; новая native сборка не требуется.

## Preflight и устранённые настройки окружения

Оба финальных receipt: `ok:true`, совпадающие cp-101/engine digest,
baseline admission `passed`, подготовлен незапущенный RUN, Subject/Judge doctor
PASS, `provider_sessions_created:0`.

- Luna xhigh: `preflight-luna-xhigh-retry.json`, definition `65f42ca`.
- ZCode GLM-5.3-Flash max: `preflight-zcode-final.json`, definition `9b235f8`.
- Оба файла находятся в `/Users/deksden/.dd-eval/qualification/cp-101-luna-zcode/`.
  Поле `root` ведёт к полным receipt, launcher и baseline logs.
- Между указанными definition commits менялся только runbook; после финального
  preflight добавлен этот отчёт и обновлены статусы планов. Runtime, profiles,
  case и checkpoint не изменены. Docs-only изменения не требуют нового gate.

Первый preflight обоих профилей остановился на `ECONNREFUSED 127.0.0.1:55433`.
Запущен Docker Desktop и существующий `dd-tasks-postgres-1`; подтверждены
project-owned volume/loopback binding. Другие контейнеры и данные не менялись,
reset/drop общего volume не выполнялся. БД оставлена работающей для будущего E2E.
После этого quality, browser и isolation baseline checks прошли.

ZCode дополнительно выявил отсутствие локального Flow agent-profile.
Добавлен `/Users/deksden/.dd-flow/agent-profiles/zcode-acp-zai-glm-5-3-flash-max.json`
по схеме `dd-flow/agent-profile@1`: harness=zcode, provider=builtin:zai-coding-plan,
model=GLM-5.3-Flash, reasoning=max, mode=yolo, permission=allow.
Загрузчик публичного CLI и сравнение с committed eval profile PASS.
Это отдельная установка конфигурации, не изменение eval-профиля или frozen RUN.
Неуспешные preflight receipts сохранены. Оба требования добавлены в execute-eval.

## Следующий запуск — только по отдельному запросу

Использовать существующие committed run profiles `e2e-inline-merge-luna-xhigh.json`
и `e2e-inline-merge-zcode-glm-5-3-flash-max.json`; Judge/Interaction Judge — Sol high.
Не продолжать preflight RUN: обычный `runner eval run --profile …` создаёт свежий EVAL.
Оставить PostgreSQL доступным и использовать тот же публичный entrypoint:

```sh
export DD_EVAL_HOME=/Users/deksden/.dd-eval/qualification/cp-101-luna-zcode
export DD_FLOW_BIN=/Users/deksden/.dd-eval/qualification/cp-101-luna-zcode/published-engine.4WEzfg/node_modules/@deksden-com/dd-flow-cli/dist/cli.js
```

Каталог установленного пакета сохранять до завершения запусков. Не подменять
его global CLI/source dist. Исполнение и наблюдение — по [execute-eval](execute-eval.md).
