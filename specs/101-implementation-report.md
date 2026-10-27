# 101 — результат реализации

2026-10-24. Реализация и детерминированная приёмка завершены. Новых EVAL,
provider/model запросов, публикации npm, обновления глобальных хуков и GitHub CI нет.
Это candidate, **не release-accepted и не доказательство полного live E2E**.

## Изменения и provenance

| Область | Результат | Commit |
| --- | --- | --- |
| Engine D2/D3/D7/D9 | Error(test) с прямым causal frame, Detailed reader, bounded durable diagnostics, rehydration заново проверяет proof | 571ed7b918035c89646a30256390d2d4a223e8aa |
| Engine D4/D8/R1/P5 | AGY terminal reducer/replay protection, native-resource reconciliation, cleanup convergence, managed auto-update off | 3632efc6f14761d6fe52e51409c7cfc9f7cec1ea |
| dd-tasks main tooling | 097 интеграция, новый Error proof, реальный failure capability probe | ec180f9, 4338c17, 6791cda, 438a248 |
| dd-tasks qualification overlay | те же tooling-изменения поверх прежнего CP247 dc4ae3b, без business/test changes | 1ce1892212967470993bc3ca440517e243cfde36 |
| EVAL D1/D6/D7/D9 | admission проверяет реальный producer установленным consumer; diagnostics сохраняются в baseline и compact packets; candidate checkpoint | текущая ветка fix/plan101-evidence-lifecycle |

Overlay: `fix/plan101-qualified-tooling`. Main integration ветки всех трёх репо:
`fix/plan101-evidence-lifecycle`. В main ничего не пушится напрямую; merge/release
не выполнялись в рамках запроса commit/push. Исторические CP247 runtime/checkpoints
не изменены. Новый cp-249-plan101-candidate не выбран default и не launchable:
для будущего запуска нужны реальный выпуск и соответствующая matrix qualification.

Проверено `git diff --exit-code dc4ae3b..1ce1892 -- apps/api/src apps/web/src
apps/api/tests apps/web/tests`: без изменений. Actual Luna/ZCode candidate tests
не исправлялись оператором; regression воспроизводит их причины отдельно.

## Локальный установленный artifact, не опубликованный beta.149

- Engine source: 3632efc6f14761d6fe52e51409c7cfc9f7cec1ea.
- Package version остаётся 0.9.0-beta.149 только для частного candidate smoke;
  не подменяет опубликованный пакет этой версии.
- TGZ: `/Users/deksden/.dd-eval/qualification/plan101-package.NgRmA8/deksden-com-dd-flow-cli-0.9.0-beta.149.tgz`.
- TGZ SHA256: 8aa60187f765ede88d199e403c7f57faf1adc9c5f07e55f6c29bcd1215b8bc03.
- Snapshot checksum (с production dependencies): a2954abcd81b88e86907011b5c339c5983c1891f702c0738dff36ae3bb9021ce.
- Snapshot: `/Users/deksden/.dd-eval/qualification/plan101-engine-snapshot/engines/@deksden-com_dd-flow-cli/0.9.0-beta.149`.
- Установлен existing installPackageEngine с независимо вычисленным packageSnapshotFiles
  checksum в отдельный home. Глобальная маршрутизация engine не менялась.

## Проверки

| Команда / область | Результат |
| --- | --- |
| Engine `pnpm exec vitest run test/runner-evidence097.test.ts test/runner-observation091.test.ts test/code-checks.test.ts --maxWorkers=1` | 105/105 PASS |
| Engine `node --test test/fixtures/agy-state-boundaries.mjs test/fixtures/daemon-operations.mjs` | 73/73 PASS; финальная targeted causal/replay 2/2 PASS |
| Engine `pnpm typecheck`, `pnpm lint`, `pnpm build` | PASS |
| dd-tasks overlay `node --test --test-concurrency=1 scripts/plan097-observation.test.mjs scripts/source-diagnostic.test.mjs scripts/tool-diagnostic-runner.test.mjs scripts/browser-observation.test.mjs scripts/check-evidence-probe.test.mjs` | 19/19 PASS до финального исправления composite probe; финальный probe отдельно PASS и установленная цепь ниже PASS |
| dd-tasks scoped Biome + diff check | PASS |
| EVAL `node --test --test-concurrency=1 test/runner-compatibility101.test.mjs test/check-diagnostic086.test.mjs test/baseline-admission.test.mjs` | 19/19 PASS |
| EVAL installed-runner-compatibility101 с DD_EVAL_PROBE_ENGINE_MODULE из snapshot, DD_EVAL_PROBE_PROJECT=dd-tasks-plan101-overlay и DD_EVAL_LEGACY_REPORT_DIR из actual CP247 OpenCode RCP-012/artifacts | 2/2 PASS: все 5 producer cases source_repair; actual retained CP247 legacy report и synthetic legacy/foreign binding/malformed JSON отклонены |
| Все репо `git diff --check`; EVAL JS syntax | PASS |

Первый installed smoke честно завершился FAIL на composite: probe вызывал отсутствующий
в изолированном дереве wrapper, а manifest-only тест не обнаружил tooling failure.
Исправлены probe и его regression (438a248/main, 1ce1892/overlay), затем повторён
installed smoke на неизменном engine snapshot — PASS. Старый failing материал сохранён:
`/Users/deksden/.dd-eval/qualification/plan101-smoke.sun5i7`.

D1/D6 проверяются old→reject и real @2→source_repair; D2 — compiler TS6234/TS2349
на DOM textContent callback; D3 — bound direct test Error; D4/D8/R1 — native task
completion/cancellation, replay, partial/corrupt tails, resource cleanup retry,
owner/revision fences и отдельный preparation refusal. D7/D9 — retained diagnostics,
sidecar tamper/restore, общий code-check/retry контур. D5 quota не переводится в
overload и не получает hidden account failover.

## Сохранённые границы

Произвольный browser eval без доказанного source frame остаётся unknown;
для actual textContent дефекта решение — native compiler diagnostic. Generic Error
из dependency/setup/collection не разрешает product repair. Terminal task сам по
себе не доказывает physical cleanup или успешную обязательную работу. Native AGY
live acceptance/release и новые scored E2E не проводились и не объявляются PASS.
