# 102 — Реализация и проверка

Дата: 2026-10-25. Новые EVAL, модельные запросы, GitHub CI и полный release-gate не запускались. Работающие EVAL и их definition/snapshot не изменялись.

## Сквозной путь исправления упряжки

1. Engine выбирает изменённую native-зону, её fixture и тонкие общие consumers. Исправление AGY не запускает ZCode/Grok/OpenCode и полные E3/E4. Изменение общей зависимости выбирает её действительных consumers; неизвестный owner требует классификации, а не полного fallback.
2. Проверки сохраняют входы и исходные отчёты. Merge, смена SHA, версии или README не повторяют поведенческие проверки. FAIL/unknown не подменяются старым PASS; повтор требует явного основания. Проверяется полнота реальных результатов, а не только exit 0.
3. Build/pack фиксируют поставляемые байты. Acceptance использует scoped receipt. Publisher сверяет registry tar и разрешение зависимостей, не повторяет installed behavioral suite для adapter-only изменения. Legacy reader сохранён только для старых receipts.
4. Matrix component исключает native implementation/SDK/schema, не участвующие в техническом producer/consumer. Полная целостность engine остаётся отдельной проверкой. Legacy matrix можно переиспользовать только после сравнения действительных component bytes: supplement сохраняет оригинальный RUN и доказательства, не вызывает модели и fixtures.
5. Baseline@3 отдельно кэширует quality/browser/isolation по их входам. Shared compatibility probe имеет самостоятельный ключ и не повторяется для каждой группы/упряжки. Каждый новый world всё равно получает собственную установку, DB/schema/seed, write/read и подтверждённый cleanup. Fork обновляет readiness, не оценивает изменённый продукт как исходный baseline.
6. Judge уже имел независимую semantic identity: Subject adapter/version не являются основанием новой квалификации. Oracle сначала перепроверяет сохранённые ответы. Продуктовые CODE/repair/review и final Judge не ослаблены.

Дополнительный сквозной аудит нашёл старое требование полного набора в changelog-policy; оно удалено вместе с blanket release workflow и default commands. Активные runbooks/check profiles согласованы с новым правилом.

## Проверки

- Engine: 35 проверок в пяти выбранных файлах (policy, build metadata, dispatch-fence, publisher и полнота receipt). Все PASS. TypeScript compile и ESLint изменённых файлов PASS; build component inventory PASS.
- Повтор engine verification: все пять результатов reused, дочерние тесты не запускались. Receipt: `/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-flow-scoped-w6cW7H/verification.json`.
- EVAL: 76 проверок в 13 выбранных файлах; 73 PASS, 3 явно обозначенных optional SKIP (нет отдельной installed/pinned-fixture конфигурации). Эти SKIP не выданы за новую квалификацию. Повтор: executed=0, reused=13. Receipt: `/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/T/dd-eval-scoped-lSnxBc/receipt.json`.
- Отдельная физическая readiness-проба через существующий test-world: собственная случайная БД, seed/write/read и cleanup подтверждены; общие контейнеры и БД EVAL не останавливались.
- Изолированная artifact-проба: native-only изменение сохраняет component fingerprint, producer-изменение меняет его; проверка полной целостности отвергает изменённый snapshot.
- Legacy matrix equivalence на копиях реальных артефактов PASS с нулём fixture/model calls. Реальный producer/installed-consumer compatibility probe выполнен один раз, повтор переиспользован.
- Регрессии охватывают docs/version-only, rename/deletion/untracked/unknown ownership, executable mode/symlinks, SDK/transitive lock scope, тонкий consumer вне diff, прерывание/ошибку дочернего процесса, неполные receipts, отдельные world и per-command assessment, singleflight и сохранение FAIL.

## Полезные ограничения

Совпадение имён версий не заменяет совпадение actual dependency bytes. Обнаруженное различие shell-quote/smol-toml/yaml между pnpm workspace и опубликованным npm snapshot действительно меняет технический компонент; оно намеренно не скрыто. Холодный кэш или изменение соответствующего контракта требует только его проверки. Результат этого изменения — инфраструктурная готовность, не утверждение о прохождении пяти новых E2E.
