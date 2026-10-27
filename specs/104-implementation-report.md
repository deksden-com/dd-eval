# План 104 — реализация

Дата: 2026-10-25. Выполнено в отдельных checkout engine, EVAL и bridge.
Работающие CP253 EVAL и их frozen sources не изменялись.

Engine commit: `a2ec242e`, branch `fix/plan104-contract-verification`.
Bridge commit: `6266f67`, branch `fix/plan104-scoped-delivery`.
EVAL branch: `plan/104-lean-release-preparation`, base `b8fe164f90c43a87966bab82dea147e198477b0c`.
Общий helper SHA-256:
`e8106b7816b4271bbf7c58071c5a20ee7ae142562e5c294b29e534dd1c2d3ff8`.
Ветки подготовлены к отдельному review/merge; эта команда пользователя требует
commit/push и остановку, выпуск или новые EVAL не выполняются.

## Изменения

- Engine selection/receipts@2: небольшие controller-контракты, точные native
  fixtures, meaningful execution keys отдельно от validation keys. Ключ не
  зависит от соседних fixtures, упаковки или commit. Relevant imports разбираются
  установленным TypeScript; dependency closure сохраняет pnpm aliases, peer
  snapshots и integrity. Compiled consumers учитывают свои source/build inputs.
- Release boundary принимает ancestor tag или доказанный identical-tree squash;
  foreign tag не обнуляет требования. Исправлен пустой initial-tree bootstrap.
  На текущем кандидате dry selection: 7 файлов / 8 контрактов вместо ошибочных
  104 / 114 из-за потерянной после squash границы beta.151.
- Общий `tools/verification-jobs.mjs`: максимум два cooperating jobs, отдельные
  mutable homes, exclusive drain, проверенный inherited slot и nested budget=1.
  Удаляются provider credentials без явного allowlist. Claim/index атомарны;
  exact attempt join не создаёт второго producer; rerun сохраняет историю.
  Смерть coordinator не освобождает lease при живом/неизвестном detached group.
  Сигналы отмены и ошибки cleanup не превращаются в PASS.
- Engine/EVAL сохраняют executed/reused/revalidated producer references, отчёты,
  actual inventory и длительности; завершённые независимые отчёты сохраняются и
  при ошибке координатора. Native event-validator fingerprint отдельный:
  непереигрываемое изменение правил требует только конкретную fixture.
- EVAL prepare-only не выполняет retirement. Direct/worker/resume делают fresh
  barrier перед productive dispatch. Reservation не заменяет этот barrier.
  Существующие batching/proof reuse сохранены. Admission wait сдвигается новым
  completed-work evidence, не heartbeat; cancellation и stalled diagnostics явны.
- Bridge получает reviewed downstream path: точные contracts, один build,
  hook-free archive/install и installed contract/commit readback. Output outside
  source, symlink aliases и перезапись непустой попытки запрещены. Native runtime
  и upstream package version не менялись.
- Операционные инструкции обновлены без нового scheduler/daemon/framework.

## Точечная приёмка

Логи: `/Users/deksden/.dd-eval/qualification/plan104-*.log`.
Первоначальные FAIL сохранены, не заменены новыми PASS.

| Область | Проверка | Результат |
| --- | --- | --- |
| Engine policy/actual runner | `scripts/verification-policy.test.mjs` | 23 PASS; реальный execute → reuse после README/version, без build |
| Shared jobs | `scripts/verification-jobs.test.mjs` | 9 PASS; actual overlap, SIGKILL coordinator, живой owned group, join/cancel/изоляция |
| Engine inventory/receipts | `test/test-group-selection.test.ts` | 9 PASS |
| Engine publish consumer | `test/publish-release.test.ts` | 13 PASS; offline fixtures, не публикация |
| Engine delivery inputs | generate-verification-components + verify-release-build | 3 PASS |
| Native wrapper | self-tests и отдельная dispatch-fence fixture | 2 + 1 PASS; без модели/нативной сессии |
| EVAL identity/actual runner | `test/verification104.test.mjs` | 5 PASS; actual execute/reuse, corrupt/missing/TODO rejection |
| EVAL admission/retirement | admission104, retirement-proof-reuse, eval-retirement090, legacy-retirement-discovery | 23 PASS |
| EVAL control | `test/runner-control.test.mjs` | 36 PASS; 5 явно optional installed-engine сценариев не запускались |
| EVAL retained recovery | `test/managed-resume.test.mjs` | 3 PASS |
| Bridge | `tests/downstream-release.test.ts` | 5 PASS; реальный offline npm pack/install, lifecycle markers отсутствуют |

Один engine build прошёл для затронутого installed-delivery consumer; targeted
ESLint, Node syntax и diff-whitespace проверки выполнены. Общий helper в трёх
репозиториях сравнен побайтово. Полные suites, release-gate, GitHub CI, registry
publish, глобальные установки, model probes и новые EVAL не запускались.

## Исправления по результатам собственной проверки

- Разорвана косвенная зависимость adapter behavior key от release instrumentation.
- Убран whole-dist fingerprint несвязанных adapter outputs.
- Исправлена потерянная release boundary после squash и pnpm alias/peer closure.
- Убран inherited `NODE_TEST_CONTEXT`, подавлявший standalone TAP nested runner.
- Исправлена устаревшая managed-resume fixture: `settled` без
  `physical_stopped` не является sealed recovery evidence. Добавлен negative case;
  production cleanup checks не ослаблялись.
- Уточнены cancellation, partial-result harvesting, credential allowlist и
  canonical empty output boundary bridge.

## Границы

Это targeted implementation acceptance, не release-accepted пакет и не E2E PASS.
Общий бюджет действует только на cooperating entrypoints; внешние тесты он не
останавливает. `controller-shared` остаётся явно консервативным контрактом для
действительно общих модулей. Старые недоказуемые grouped receipts не получают
выдуманные per-fixture proofs. Отдельный инфраструктурный сервис не добавлялся.

## Повторное review реализации

Основной агент перепроверил три независимых ревью по коду и воспроизводимым
сценариям. Существенные исправления:

1. Engine @2 reader теперь повторно применяет существующий
   `verifyReceiptProvenance`: правильный hash/key не оправдывает filtered argv,
   чужой scope или некорректную duration. Добавлен positive/negative receipt case.
2. Pnpm alias исправлен не только в ключе, но и при выборе affected consumers
   lock-only diff: обе операции используют одно разрешение snapshot key.
3. Nested бюджет был локален вызову; sibling callers могли умножить пул.
   Проверяемые slot-wide subleases сериализуют siblings, не блокируя рекурсию.
   Реальная регрессия включает несколько процессов и глубину dispatch.
4. Direct child exit отделён от закрытия stdio. Живой descendant с pipe больше
   не подвешивает отмену; неизвестный cleanup оставляет fence. Fast exit без
   startup identity освобождает slot только после actual exit и свежего
   подтверждения отсутствия точного PGID. Полный pipe tail сохраняется.
5. Отмена во время validation не публикует PASS и не инвалидирует PASS чужого
   producer. Перед dispatch повторно проверяется отмена ожидающего capacity.
6. Устранены пробелы EVAL catalog для control/managed-resume; явно добавлены
   их runtime helpers и baseline consumer runtime shim. Неизвестный source
   impact по-прежнему блокирует mapping. Пять optional installed-engine skips
   разрешены только для точного файла/названия и без заданного installed engine.
7. Bridge recomputes consumed inputs перед reuse/dispatch/публикацией PASS:
   parent FAIL больше не может оставить ложно атрибутированный cached PASS.
   Clean owned dist внутри exclusive build не оставляет удалённый JS в архиве.
8. Исправлены synthetic fixtures managed-запуска: private coordinators снимают
   оба inherited slot context; npm install fixture использует существующую
   production-нормализацию pnpm allow-scripts в private npmrc; tag создаётся до
   capture release boundary. Runtime проверки не ослаблялись.

Приёмка review: штатный `pnpm test` выбрал **7 файлов / 8 контрактов**, а не полный
gate. Финальный report `plan104-review-engine-managed-r2/verification.json` —
PASS: 4 executed, 4 reused; 60 executed и 6 reused верхнеуровневых cases;
1 reused nested native case учитывается отдельно. Helper — 13 cases, policy —
25, publish — 13, inventory — 9; остальные retained contracts перепроверены
reader. Первая попытка managed-r1 с двумя fixture failures сохранена как FAIL.
EVAL: review policy/admission — 9 PASS; final verification104 — 6 PASS.
Bridge downstream — 7 PASS, включая offline archive/install. Targeted ESLint,
Node syntax, whitespace и byte-identical vendoring проверены отдельно.
Helper после review: SHA-256
`b649a6c74ce891f7779c92005f14bbdedd0a12c9bb0157a3646851faf63beccf`.
Новых EVAL, model probes, полного gate, CI или публикации не было.

Интеграция выполняется review PR в remote main трёх репозиториев. Primary local
main с отдельной неопубликованной E5-историей и dirty старый bridge checkout
не сбрасываются и не подменяются. Cleanup допускается только для проверенно
завершённых/интегрированных refs, без active campaign sources или чужих изменений.
