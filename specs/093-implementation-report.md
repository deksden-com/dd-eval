# 093 — Implementation and verification

Дата: 2026-10-19. Реализация и обязательная offline-приёмка завершены.
План: [093](093-cp237-codex-history-readiness-plan.md).
Интеграционные PR: [engine #97](https://github.com/deksden-com/dd-flow-cli/pull/97),
[EVAL #118](https://github.com/deksden-com/dd-eval/pull/118).

## Проверенный кандидат

- Engine: `f449e64664c9178675042185416c16405010b14a`, tree `23675b1e670938c86c63dc0569b928de604b2239`.
- EVAL: `80a23cc1c96362a9a6c4a49645b44a25f2426c89`. Последующие изменения этого отчёта/статуса плана — только документация, не новый runtime.
- Frozen canon: `a1cfe8b06329c691c314064b6ea6a3da6628cceb`, версия 4.1.2.
- Node 26.8.2, pnpm 10.23.0; integration/native maxWorkers=1, E3 test-concurrency=1, без test filters/retries.
- Source SHA256: `d2efee46d7831f0c8dd9fef1913c309b8035fc1f727a572091a85a18e138f934`.
- Dist SHA256: `599778707737383e375e188b408a3b85f16b878166b6b4a4baa45b4fc37bcf08`.
- Private tarball SHA256: `13821060e6e39675f033629cf135b84105a64ed8992969385332cd9b65e685cd`.

Артефакт имеет private package version `0.9.0-beta.142`, но это не переиздание
registry beta.142: источник и checksum указаны выше; публикации не было.

## Закрытие плана

| Пакет / найденные места | Реализовано |
| --- | --- |
| P1, A01/A07/A08 | Общий `readCodexHistory` различает unavailable и доступную пустую историю. Нет permanent capability cache. Paged → hydrated fallback работает и при stale active. Узкий empty-rollout metadata retry использует прежние три read attempts/backoff/owner budget только до native Turn/hook evidence. |
| P2, A02 | Native completed и exact retained Turn/items сохраняются независимо от истории. При fallback обязательны текущий output, item evidence и наблюдённый профиль. Неполный результат — typed observation failure с известным native outcome, не пустой success. Известные child failure/ancestry не исчезают. |
| P3, A03/A04/A07 | Cancel сохраняет exact Turn ID; unavailable без ID не становится turn_not_active. Interrupt ACK не равен settlement. notLoaded/systemError/idle не скрывают известный принятый незавершённый Turn; реально пустая история допускается только при фактическом массиве turns. |
| P4, A05/A06 | Compact journal сокращает только успешные reads, сохраняет RPC error. EVAL классифицирует operation_observation_lost как инфраструктуру и не запускает Judge cancel-tree/replay из-за этого envelope. Matrix producer/consumer используют общий text-source decoder при прежних authority/hash/JSON guards. |
| P5, A09 | Регрессии, non-generative packaged probe, краткие runbooks и doctor scope. Найденная при полном gate 1000ms гонка реального child startup заменена управляемыми spawn/streams/fake Date/performance/timers, без увеличения runtime timeout или ослабления assertions. |

Identity/schema/hook/journal/profile-storage ошибки остаются фатальными.
Unavailable polling не считается productive progress. Не добавлены productive
повторы, новый framework, зависимости, migrations или глобальная RPC allowlist.
Использованы существующие ObservationClock, errorRecord и read/settlement policy.

## Приёмка

Root: `/Users/deksden/Documents/_Projects/_artifacts/plan093-green.4YoHfn`.
`prep.sh`/`prep.log` завершились 0 с `PLAN093_PREP_PASS`; затем по согласованной
ресурсной очереди `remaining.sh`/`remaining.log` завершились 0 с
`PLAN093_GATE_PASS 2026-10-19T16:19:36Z`. Между частями не менялись source/dist;
их точные хеши проверены до и после оставшихся наборов. Пересборки между ними нет.

| Набор | Результат |
| --- | --- |
| Typecheck / lint / strict-canon build / private pack-install | PASS |
| Hybrid / hybrid canon | 66 / 51 PASS |
| E2 / installed E2 | 133 PASS, 1 optional skip / 2 PASS |
| E3 / E3 canon | 473 PASS, 1 optional skip / 15 PASS |
| Release-build verifier / release | 2 / 8 PASS |
| Full integration | 174 files, 2919 PASS, 0 FAIL, 0 SKIP |
| Full runtime-sensitive | 2 files, 48 PASS, 0 FAIL, 0 SKIP |
| Full paired EVAL | 945 PASS, 0 FAIL, 5 optional SKIP |

`verify-test-inventory.mjs` повторно подтвердил unfiltered discovery/completeness:
release 1 file/8 cases; integration 174/2919; native 2/48. У всех exit0.
Дополнительно Codex fixture содержит 60 regression cases; targeted 60/60 и
общий native-wrapper прошли. Command-progress 3/3 прошёл и адресно, и внутри
полного integration; sliding-window case занял 6ms, не зависит от startup Mac.

Optional skips не скрываются: fish отсутствует; retained completed-correction
fixture не предоставлен; пять EVAL сценариев требуют отдельных private/installed
или authenticated fixtures (materialized settings, native owner, pinned zero
checkpoint, authenticated semantic selection, installed Console observation).
Они не обозначены как пройденная живая квалификация.

Non-generative probe packaged `406bc924` (тот же runtime: delta до f449 — только
command-progress test) сохранён в
`_artifacts/plan093-acceptance.0ICSlJ/installed-native-probe.json`.
Чистый disposable home, без auth/операторских DB и без turn/start/inject/steer:
compact read доступен; history возвращает точные -32600/-32601 как unavailable;
собственный app-server закрыт. Это не полноценная model/E2E qualification.

## Неуспешные попытки и границы

- `plan093-implementation.5DLf12` и `plan093-final.2mAPNU` отменены после найденных
  A07/A08; их partial результаты не выдаются за полную приёмку.
- `plan093-acceptance.0ICSlJ` terminal1: integration 2918 PASS/1 FAIL, только
  command-progress startup/output race. Actual: aborted=true, exitCode=null,
  «Owned command has no confirmed progress within its inactivity window».
  Лог/failed receipt сохранены; A09 исправлен отдельным test-only коммитом.
  Новая полная попытка выше, а не повтор одного теста, закрыла приёмку.
- Отдельный EVAL precheck на прежнем installed runtime: 945 PASS/0 FAIL/5 SKIP;
  финальный paired gate повторён на точном новом установленном кандидате.

DEF project-flow readiness: унаследованная `.memory-bank` engine-репозитория 2.18.0
и старый flow pack дают drift/`flow_contract_invalid` (`/specifications`) против
canon4.1.2. Это отдельная project-status/branch-flow диагностика, не PASS.
Источник: `plan093-implementation.5DLf12/branch-status.json`; эти MB-файлы не имеют
delta от main41c019e9. Владелец — параллельная E4/Memory Bank upgrade задача
(`dd-memorybank-7`); next gate — её штатный MB upgrade/project-flow readiness.
Обязательные package/runtime наборы 093 этим DEF не пропущены и не подменены.

Действующие/исторические scored EVAL, их runtime DB/артефакты и процессы не
изменялись; новых scored EVAL и платных model calls не запускали. Native Codex,
продукт, global homes/hooks, release/pins не менялись. Primary main checkouts с
чужими неопубликованными изменениями не сбрасывались и не обновлялись.
