# 113 — Ревью, исправления и интеграция

Дата: 2026-10-29. Статус: reviewed, scoped acceptance passed, engine merged.
План: [113](113-successor-resolution-and-semantic-progress-plan.md).
Первичная реализация: [receipt](113-implementation-completion.md).

Engine review head: `b4590a11da89c66a9695a6d3a426e028c7b374cc`.
Squash merge: `aaba35207928e6e57fba924a1aac1216309f84bd`,
[PR166](https://github.com/deksden-com/dd-flow-cli/pull/166).
Проверенное и интегрированное Git tree совпадают:
`b145c1e2c02346bc5d2d8f92abe9fa1a41713565`.

## Полнота и существенные замечания

Проверены P1 selection/replay/claim, P2 semantic checkpoint/pause и P3
current failure applicability, их callers и регрессии. Два независимых
read-only аудита перепроверены по исходникам; исправления сделаны в общих
механизмах, без новых зависимостей, таблиц, classifiers или per-harness bypass.

1. **Native call мог сменить назначение.** Resolver находил известную identity
   A, но использовал её только для обнаружения противоречащих IDs. При другой
   публичной команде того же call A исчезала из matching, и выбиралась issued B
   с другим fingerprint. Теперь known native binding ограничивает candidate:
   изменённая команда/scope того же call получает локальный no_effect отказ
   до записи receipt. Это действует и после expiry A: identity остаётся в
   истории, но expired A не возвращается в executable candidates. Новый
   отдельный call по-прежнему может принять B. Добавлены settled/expired
   регрессии для CLI lookup и native observation.
2. **Старый repair мог скрыть новый отказ.** Durable registration не доказывала,
   что repair относится к текущему attempt/cycle. Перед actionable suppression
   теперь проверяется существующая current stage Work membership через
   `stageWorkIds`. Исторический `isRegisteredRepair` не изменён. Четыре новых
   регрессии покрывают previous attempt/cycle и created/completed repair,
   включая случай issued successor.
3. **Позитивная тестовая фикстура не доказывала текущий repair.** Старый тест
   вручную создавал receipt с attempt A1 и без stage membership. Его ожидание
   стало неверным после исправления №2. Использована штатная `ensureRepairIntent`,
   которая атомарно регистрирует актуальную membership. Runtime guard не ослаблен.

Остальные решения плана сохранены: общий committed successor resolver,
неповторяемость unknown/executing effects, semantic progress без UUID-reset,
memory phase/wave, terminal-stage reread, bounded technical pause и сохранение
конкретного диагноза. Новых существенных незакрытых дефектов в проверенном
контуре не осталось; это не утверждение об отсутствии любых ошибок в проекте.

## Адресная приёмка ревью

- `pnpm build` — PASS после runtime fixes.
- `pnpm typecheck` — PASS на итоговом дереве с исправленной фикстурой.
- ESLint трёх изменённых source/test файлов, `--max-warnings=0` — PASS.
- `git diff --check` — PASS.
- Полные два **затронутых файла** `lifecycle-invocations` и
  `repair-continuation`: 228 PASS / 1 FAIL из 229. Единственный FAIL —
  описанная выше невалидная позитивная фикстура; после исправления её
  адресный повтор PASS 1/1. Таким образом покрыты все 200 lifecycle и
  29 repair cases; исходный failed run не переименован в PASS.
- `controller-fanout` и `hook-cold-path` — 6/6 PASS. Проверены semantic progress,
  current receipt inputs, legacy checkpoint без replay pending finish,
  memory phase/wave, диагностическая projection и отсутствие тяжёлых eager imports.
- Предыдущие составные offline CODE repair/verification и bounded-pause
  проверки сохранены как исходная приёмка. Их рабочие сценарии/fixtures не
  менялись при ревью; новые guards отдельно проверены на запрет неверных
  bindings/scopes и сохранение допустимых новых calls/current repairs.

Это адресная приёмка, не полный engine/release gate. GitHub CI, новые EVAL,
native model probes и qualification не запускались. Работающие EVAL и
установленные hooks не менялись. Main содержит исправления, но новый engine
в рамках ревью не публиковался.

## Cleanup

- Удалены чистые исторические worktrees `dd-flow-cp262-release` и `dd-eval-cp262`.
  CP262 EVAL терминальны; активных managed process references к этим деревьям
  не найдено при read-only проверке resource registry.
- Удалены local/remote уже интегрированные `fix/cp263-canon-proof-inputs` (PR160)
  и `release/cp263-beta158` (PR159).
- Удалена retired local/remote `eval/cp262-plan111`. Её три уникальных коммита
  сохранены локально и в origin annotated tag
  `archive/eval-cp262-plan111-20261029` →
  `aa4fc8093f773d556dc03cb01f6f1ef8c43747dc`. Старые pins не вливались в main.
- Engine task branch удалена после squash merge и tree comparison. Ветка
  этого документа удаляется после его собственного squash merge.
- Сохранена `fix/agy-p3-terminal-sample`: PR157 открыт, четыре строки полезного
  probe fix не интегрированы. Это не ненужная merged branch; её изменения не
  включались в план 113 и не удалялись под видом очистки.
- Общий dependency cache не удалён: удалялся worktree с symlink, не его target.
  Remote branch deletions защищены expected-HEAD leases.

Engine source integration завершена. Документация интегрируется отдельным
coherent PR в dd-eval, без повторения неизменённых runtime проверок.
