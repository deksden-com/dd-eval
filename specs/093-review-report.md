# 093 — Implementation review

Дата: 2026-10-20. Полнота P1–P5 и качество реализации проверены; существенные
находки исправлены, полный offline gate повторён и зелёный.
План: [093](093-cp237-codex-history-readiness-plan.md).
Исходная реализация: [отчёт](093-implementation-report.md).
Engine follow-up: [PR98](https://github.com/deksden-com/dd-flow-cli/pull/98).

## Исправленные существенные дефекты

1. Cancel принимал metadata-only историю за отсутствие active Turn. Missing
   turns, невалидный ID/status теперь дают `operation_observation_lost`, без
   произвольного interrupt. Валидные empty/terminal и exact active ID сохраняются.
2. Final admission считал RPC success достаточным доказательством полноты.
   Теперь требуется exact current Turn item evidence; иначе retained output/items
   и observed profile обязательны. Known completed сохраняется отдельно от
   observation failure (`settled:false`), без нового productive запроса.
3. Stale snapshot того же Turn затмевал native completed text. Authoritative
   completed output теперь имеет приоритет; snapshot остаётся fallback.
4. Tree settlement принимал terminal без ID, а null/false/0 терялись при
   нормализации и ложно доказывали empty history. Записи проверяются до
   нормализации; terminal требует валидный ID. Malformed остаётся unknown,
   кроме независимо retained exact terminal evidence. Paged/hydrated fallback
   и валидные empty/terminal пути покрыты регрессией.
5. Полный gate выявил AGY startup/cleanup смешение: ранний account refusal
   после успешного чтения/journal бросался как stream error. `drainingError`
   повторно выдавался как cleanup failure; caller ждал 120s и возвращал readiness
   timeout вместо primary. Drain теперь отклоняет readiness исходной ошибкой,
   но не отклоняет успешно прочитанный поток. Реальные journal/read/physical
   cleanup failures остаются фатальными. Исходный fixture проходит за ~2.2s.

Все находки воспроизведены, RED сохранены. Targeted: Codex64/64,
runtime-assets/native-observation92/92, AGY adapter/state-boundaries47/47.
AGY deterministic boundary также проверяет negative journal case. Старые mocks
дополнены обязательными native identity/items, assertions не ослаблены.

Проверены общие history/read/inspect/cancel/tree consumers, final admission,
retained outcome/journal, EVAL observation-loss и matrix decoder, runbooks и tests.
Trace: P1 D01/A04/A07/A08; P2 D02/A01; P3 A02/A03/A07;
P4 D03/A05/A06; P5 D04/A09. EVAL runtime доработок не потребовал.
Ponytail: общие helpers, без новых framework/dependencies/schema, таймаутов,
productive retries, native или продуктовых patches.

## Точный кандидат и полная приёмка

- Engine `a8ab2f54455f31938d2eed90fd8338eb1d6e8adf`, tree `91eb52520d7984dfdb2beeb8b491e3dccb58b261`.
- Paired EVAL `432a0c212ffd9e4bf0e84563bd6e929f763c18d7`; последующая delta review — только `specs/`.
- Canon `a1cfe8b06329c691c314064b6ea6a3da6628cceb`, 4.1.2; Node26.8.2 / pnpm10.23.0, one worker.
- Source SHA256 `312c20321c29fd72b6dacb1670f4a47978a6cc49ef7e471116894019a16de686`.
- Dist SHA256 `b2864ab889a524ac1a6c8e4ced6a6ab249ece21e3c2f04f5365857ce22a87825`.
- Private tarball SHA256 `3c523d9f3833ec0a542e2c35797733a90045a16efd9fb358de24dfaf52485fd6`.

Root `/Users/deksden/Documents/_Projects/_artifacts/plan093-review.AZQsvf`:
`final-gate.sh`, `final-gate.log`, `final/` receipts. Exit0,
`PLAN093_REVIEW_GATE_PASS 2026-10-19T22:44:28Z`.
Source/dist hashes до и после совпадают, tracked tree чист.
Private beta.142 — локальный кандидат, не повторная registry публикация.

| Набор | Результат |
| --- | --- |
| Typecheck/lint/strict-canon build/private pack-install | PASS |
| Hybrid / hybrid canon | 66 / 51 PASS |
| E2 / installed E2 | 133 PASS, 1 optional skip / 2 PASS |
| E3 / canon | 473 PASS, 1 optional skip / 15 PASS |
| Release-build verifier / release | 2 / 8 PASS |
| Full integration | 174 files, 2919 PASS, 0 FAIL, 0 SKIP |
| Full runtime-sensitive | 2 files, 48 PASS, 0 FAIL, 0 SKIP |
| Full paired EVAL | 945 PASS, 0 FAIL, 5 optional SKIP |

Unfiltered inventories повторно verified exit0: release1/8, integration174/2919,
native2/48. Optional gaps: fish отсутствует; retained completed-correction fixture
не предоставлен; пять EVAL cases требуют private/installed/authenticated fixtures.
Они не названы пройденной live qualification.

Первая попытка74b552eb завершилась exit1: integration2919PASS, native47PASS/1FAIL
(AGY refusal). `gate.log`, `native/` и RED сохранены. Финальная попытка после AGY
fix повторила все группы целиком, не выборочный retry и не перенос старых PASS.

## Границы

Унаследованный project pack engine2.18.0 против canon4.1.2 по-прежнему даёт
drift/`flow_contract_invalid` (`/specifications`): отдельный branch/project-flow
readiness DEF, не green status. Owner — E4/Memory Bank upgrade (`dd-memorybank-7`),
next gate — штатный project-pack upgrade/readiness; исходное evidence в
implementation report. Обязательные package/runtime группы этим DEF не пропущены.

Работающие/исторические EVAL и их процессы/DB/артефакты не менялись. Новых scored
EVAL и model calls нет. Global homes/hooks, pins, release и чужие unpublished
main changes не менялись. Интеграция через squash PR; смежной E4 передаётся actual
main SHA для новой combined acceptance, а не для переноса этих receipts.
