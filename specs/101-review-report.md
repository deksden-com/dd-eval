# 101 — ревью, исправления и интеграция

2026-10-24. Независимые ревью native и producer + повторная проверка services и
EVAL основным агентом. Ponytail/full: общие точки исправлены без новой системы
recovery/qualification, лишних live прогонов и ослабления trust-boundary guards.

## Существенные исправления

1. **Настоящий повтор cleanup был недоступен.** Shared helper возвращал shutdown
   ACK и завершал daemon_resource даже при owned_resources=false. AGY закрывал
   endpoint, хотя direct-helper test мог повторить вызов. Теперь unproven resource
   вызывает отказ **до** retirement daemon owner. Productive dispatch остаётся
   fenced, технический stop может перечитать terminal proof и завершиться.
   Regression проходит durableDaemonDispatch, а не только прямой вызов helper.
2. **Смена инкарнации task и некорректный native record.** Повтор launch того же
   task ID с другим native step теперь conflict; terminal без causal launch step
   не принимается; JSON null/primitive — явный gap, не случайный TypeError.
3. **Browser hook ошибочно получал фазу тела теста.** Generic Error из native
   beforeEach/afterEach мог получить runtime source-repair authority. Reporter
   восстанавливает фазу по native hook/fixture ancestry и нативной ошибке.
   Пользовательский test.step с названием «setup then teardown» не считается hook.
   Реальные native hook/body regressions проверяют обе стороны, без браузера/модели.
4. **Probe навязывался по наличию Detailed API.** Это необоснованно требовало
   dd-tasks entrypoint от любого structured baseline. Теперь capability requirement
   явно берётся из checkpoint, проверяются path/contract. Произвольный другой
   проект/legacy checkpoint не получает новую обязанность из-за добавления API.
   Невалидный/null manifest отклоняется с точной причиной, без случайного TypeError.
5. **launchable:false был только комментарием.** Новый кандидат нельзя выбирать
   для dispatch: общий guard проверяется перед preflight/run/canonical build/fork.
   Чтение/расследование checkpoint и исторического EVAL остаётся доступным.
6. **Stale fork double скрывал границу physical settlement.** Пять проверок
   финализации падали, потому что fixture возвращала settled без physical_stopped.
   Исправлена только fixture: независимое physical подтверждение соответствует
   её отсутствующим процессам. Production cleanup не ослаблен.

Engine services runtime proof/rehydration/callers проверены повторно: существенного
дефекта не обнаружено. Формулировка P4 согласована с намеренной реализацией:
per-check disposition + полные native failures, без ложной частичной repair authority.

## Изменения и точные refs

- Native review: 61607d02e43f6b46d12ffc5ce7a1e8556a9e8686.
- Reporter: 4ca7d5cb835f406872f00e335f5491c971ac4560 и
  32b7c5dae551c82054f390d6679bc70eea0d95f5.
- Qualification overlay: a16dec02fdd4b269fd89f39245d58ffd0ffde938,
  неизменяемый tag eval/cp250-plan101-reviewed-tooling. Бизнес-код/scored tests
  по diff с dc4ae3b не менялись. Это не merge overlay в product main.
- Engine source сохранён tag candidate/plan101-reviewed-engine.
- Engine PR124 squash merged: 12e1354936e3998626a526d89cf8effe530eb5e7.
- dd-tasks PR18 squash merged: 32d9cfe93b369b0a38598e66a27597c48734135e.
- В обоих репо git tree main после merge совпал с проверенным head побайтно
  по tree identity; незапрошенные локальные main/E5 не переключались.

Новый cp-250-plan101-reviewed-candidate с exact source/artifact, launchable=false.
CP249/CP247 не перезаписывались. Частный npm pack не заменяет опубликованный beta.149.
TGZ SHA256 2a5f424f802a064d22484aee76018c5282b5301f56be0f9a6e64fd234b4d0aea;
snapshot checksum 98641f2c618b91bb1e75af8c2ef1e00163898555b0e2dd177cf326d5809db242.
Snapshot: `/Users/deksden/.dd-eval/qualification/plan101-review-engine-snapshot/engines/@deksden-com_dd-flow-cli/0.9.0-beta.149`.

## Проверки

| Проверка | Результат |
| --- | --- |
| Engine `pnpm gate:merge` (typecheck, lint, fast, hybrid) | PASS: 770 fast + 66 hybrid; log /tmp/plan101-review-engine-merge-gate.log |
| AGY/shared daemon fixtures | 73/73 PASS; targeted3/3 PASS |
| Engine services повторное runner097/091 + typecheck | 8/8 PASS; typecheck PASS |
| dd-tasks affected tooling suite после hook fix | 20/20 PASS; log /tmp/plan101-review-tooling.log |
| Финальный hook-category/body native regression | 2/2 PASS |
| EVAL baseline/compatibility/diagnostic/engine-admission | 26 PASS, 2 installed-only tests SKIP; без отказов |
| EVAL execution-contract + fork | первоначально5 FAIL; после исправления stale double 23/23 PASS |
| Installed reviewed snapshot + actual overlay producer и actual CP247 legacy report | 2/2 PASS: пять positive cases source_repair, legacy/foreign/malformed negative cases отвергнуты |
| Build, syntax, scoped Biome, diff check | PASS |

Полный release profile не заявляется пройденным: выполнен требуемый локальный
merge-gate и затронутые контракты. Новых scored EVAL, model/provider запросов,
публикации engine, глобальной установки/хуков и GitHub CI не было.

## Очистка

После merge удаляются только clean task worktrees/ветки и заменённые исторические
tooling/release ветки с сохранением exact sources в immutable tags. Активные/чужие
E5 деревья, primary checkouts с неопубликованными main и cp247 definition tree,
нужный для сохранённых EVAL/расследования, сохраняются. Runtime homes, evidence,
процессы, БД и контейнеры не удаляются и не останавливаются этим ревью.
