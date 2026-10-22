# 097 — реализация и проверка

Дата: 2026-10-22. Это implementation receipt, не release acceptance и не результат
нового scored E2E. Исторические CP243/244, runtime DB и продукт не изменялись.

## Реализовано

- P1/P2: trusted repair классифицируется до сериализации, затем проверяется
  неизменность bound SQL receipts/authority при атомарном settlement. Successor
  nonterminal finish фиксируется вместе с исходом predecessor. Controller/hook
  берут текущую выданную команду, включая изменившийся `--retry-check`, а не
  команду старого пакета. JSON-категория сама по себе repair authority не даёт.
- Дополнительная installed-CLI регрессия выявила потерю successor в hook overlay:
  `/var` и `/private/var` сравнивались как разные проекты. Использована штатная
  канонизация пути и публичных `@project`/`@run` команд. Неоднозначность и чужая
  scope по-прежнему запрещены.
- P3: один структурированный HITL packet содержит принятый файл, SHA256, pause,
  Work, stage, generation и приватную invocation identity. Initial/retry получают
  одинаковый полный conditional prompt. После committed resume восстанавливаются
  исходный input, answer, resume JSON и Markdown delivery; второй resume не нужен.
- P4: exact native TypeError/ReferenceError из candidate test/setup/collection
  получает repair только при совпадающих top frame, executing file, hash и native
  artifact. Чужие/неоднозначные frames, teardown и произвольный stderr не подходят.
  Native tsc и quality compiler API теперь включают API/browser test configs.
- P5: browser inactivity относится к текущему target/window epoch, gap можно
  закрыть лишь свежим полным наблюдением; auxiliary page/context не портит новый
  target. Поздний async probe не переносится в другое окно. Уникальный native
  action start продлевает окно один раз. Unsupported timeout adapter — явная
  ошибка, не тихий fixed-timeout fallback. Buffered progress читается до lag verdict.
- P6: одинаковые child failures сопоставляются по occurrences. Контракт `@2`
  сохраняет bounded partial projection, native counters и child artifact locators.
  Partial/legacy browser diagnostics не превращаются в PASS, repair или ложное
  ожидание native settlement. Retained baseline запрещает partial projection,
  в том числе при поддельных `completed=true`, нулевом failed и верном receipt hash.
- P7: AGY различает physical stop и native settlement, сохраняет исходный outcome,
  требует current-generation positive root idle proof; SUCCESS, пропущенный Stop,
  stale Stop и duplicate replay не являются proof. Новая activity инвалидирует
  прежний proof. `ACTIVE` нормализуется локально для AGY tool status.
- Сохранён уже запрошенный третий overload retry из beta.147: одна shared policy,
  основной запрос плюс три continuation; тесты обновлены под четыре отказа.

## Проверка

Проверки локальные, targeted по policy095; GitHub CI, полный release profile,
новые EVAL, публикация engine и изменение pins/hooks не запускались.

- Engine: TypeScript, ESLint, build и `git diff --check` — PASS.
- Общая affected engine regression: 8 файлов, 289/289 PASS (включая lifecycle,
  source repair, evidence, capacity, delegation и prompt delivery).
- Installed CLI/hook: четыре setup-error → same-session correction → Work finish,
  включая реальный native-proof, сериализацию, публичный `@run` result file и
  macOS alias проекта; 4/4 PASS.
- AGY native fixtures: `agy-adapter`, `agy-state-boundaries`, `tool-observations`:
  67/67 PASS. Две старые synthetic Stop fixtures получили уникальные native
  step/execution identities; production stale/duplicate guards не ослаблены.
- EVAL acceptance/diagnostics/baseline: 27/27 PASS.
- Source tooling focused: 34 PASS; producer→engine interop: 5 PASS; фактические
  native Playwright/Vitest runtime-error proofs приняты engine.
- Native health-backed Playwright proof и gap/aux-target recovery: 2/2 PASS.
  Отдельный временный PostgreSQL `dd-plan097-native-tests` остановлен и auto-removed;
  чужие контейнеры и EVAL процессы не трогались.
- Перенос tooling на актуальный source main: 24/24 focused PASS; product history
  старого scored checkout в main-ветку не переносилась.
- Повтор native browser regression обнаружил ошибку области самого теста: 1.6s
  окно начиналось до page startup и под нагрузкой истекало до намеренного gap.
  Test-only reproduction теперь зависит от готовой page и использует 4s body
  budget с 1.2s gap (выше cap 1s); production timeout/proof не менялись. Этот
  сценарий дважды PASS отдельно, затем вся группа снова 24/24 PASS.
- Controller HITL overload before/after commit: 2/2 PASS; after-case удаляет
  committed resume JSON, answer и original input, затем проверяет восстановление,
  единственный stage-resumed event и доставку в прежнюю Session.

- Семистадийный fake-native controller cycle `Luna repair`: 1/1 PASS; проверены
  repair, повторное review, MERGE, семь captures и остановка owned processes.
  Memory selective-review/correction routing: 9/9 PASS. Неприменимый старый stub
  исходной finish-команды обновлён на текущую SQL-backed authority; реальные
  issuance/settlement гарантии проверяются общей lifecycle группой.

Предварительные неуспешные прогоны не объявляются зелёными: installed native-proof
выявил macOS alias defect, AGY fixtures повторяли неидентифицируемые Stop, а старый
memory-routing stub ожидал команду исходного пакета. Эти причины устранены и
соответствующие проверки повторены. Полный release profile этим не квалифицирован.

## Не закрыто ложным PASS

1. AGY 1.4.5 не предоставляет проверенную non-generative полную native-tree
   inspection для actual цепочки root Stop false → child Stop true → SUCCESS.
   Без нового current root idle proof она честно остаётся unknown. P7 в этой части
   ограничен native capability; все пять E2E успешными не объявляются.
2. Расширение typecheck выявляет существующие ошибки в продуктовых API tests
   (`Response.json(): unknown`, union `databaseUrl`) и browser global setup
   (`string | undefined` URL/index). Их не скрывали исключениями и не исправляли
   вручную: это candidate source diagnostics для штатного repair, не tooling PASS.

## Git / provenance

- Engine: `6aa020e8`, branch `fix/097-continuation-repair` от `a8d1318a`.
- EVAL: branch `docs/097-post-baseline-recovery-plan`.
- Scored-source tooling: `d7d5f49` + test-only follow-up `f744b4c`, branch `fix/097-runner-observations`, база
  `dc4ae3b`.
- Тот же tooling, clean cherry-pick на `origin/main=51aec3f`: `56a9fbe` + test-only follow-up `632777a`, branch
  `fix/097-runner-observations-main`. Обе source branches опубликованы.

Merge/release/new checkpoint — отдельный следующий шаг по git/release runbooks;
текущий запрос заканчивается commit и push реализации.
