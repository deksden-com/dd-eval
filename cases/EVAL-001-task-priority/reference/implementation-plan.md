# Канонический план реализации — Task priority

1. Добавить тип/ограничение priority в Drizzle schema и одну forward-only migration с `NOT NULL DEFAULT 'none'`; обновить deterministic fixtures и migration checks.
2. В одном общем валидаторе разобрать optional priority. Расширить task read models, create и patch так, чтобы create defaulted to `none`, patch omission сохранял значение, а invalid input завершался до mutation.
3. Протащить поле через существующие Hono routes и web API type/client без нового endpoint или state layer.
4. Добавить native labelled select в create/detail и текстовую priority label в task list; сохранить archived, dirty, error, keyboard и responsive behavior.
5. Расширить unit/integration/browser проверки и canonical scenario: все enum values, default, omission, invalid no-mutation, fixtures, archived guard и workspace isolation.
6. Обновить применимые product/system/engineering/scenario документы Memory Bank, затем выполнить project quality, browser, readiness и обычный merge flow.

План намеренно не вводит sorting/filtering, shared package, UI library abstraction, background work или отдельную priority service.
