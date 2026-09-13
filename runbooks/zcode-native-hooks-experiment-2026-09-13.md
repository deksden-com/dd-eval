# ZCode native PreToolUse: эксперимент и выбранный механизм

Статус: механизм доказан в ограниченном живом эксперименте; production-интеграция НЕ реализована. Все тестовые turns завершились, topology running=[], bridge закрыты. Временный пользовательский config удалён после проверки неизменности; установленный ZCode не изменён.

## Среда и границы

- Native ZCode 0.16.5, `/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs`.
- SHA256 до/после: `e9f1868c0fdb863537ed910ee3828b9be96b8c2fd805473f63b439e1113266b8`.
- Настоящий zcode-acp → app-server, mode yolo, новые Sessions, пустые mkdtemp workspace.
- Native hook fixture записывает диагностический receipt с fsync и возвращает полную копию tool_input с добавленным `--hook-event-id`. Это проверка native протокола, не проверка production SQL claim и не полный E2E dd-flow.
- Root и один foreground child выполняют по три отдельных вызова: rewrite с задержкой hook 1 s, deny через exit 2, обычная ошибка через exit 1. Скрипт утверждениями проверяет receipt, порядок, разные session IDs и отсутствие исполнения denied-команды.

Документация: https://zcode.z.ai/en/docs/hooks. Она описывает PreToolUse/updatedInput, синхронный process executor и различие exit 2/обычной ошибки. Фактические возможности ниже проверялись на установленном runtime, а не выводились только из документации.

## Конфигурационные проверки

`--settings` присутствует в help 0.16.5, но реальный parser отвергает его и до, и после app-server. Два запуска завершились до native Session; это не отрицательный результат hooks. Не использовать этот флаг в production launcher без новой проверки версии.

Пользовательского `/Users/deksden/.zcode/cli/config.json` до опыта не было. Временно создан конфиг из `tools/probe-zcode-native-settings.json`, с process hook для Bash. Скрипт действует только при унаследованном `DD_ZCODE_HOOK_PROBE_DIR` с префиксом dd-native-hook- и точном cwd теста; остальные вызовы возвращают пустой результат. Никакие legacy hooks не импортировались. После опыта config удалён; fixture сохранена в репозитории для воспроизводимости. Повтор требует явной безопасной установки fixture/слияния с существующим конфигом и последующего восстановления, runner сам пользовательские настройки не меняет.

## Результаты

| Runtime | Root rewrite | Child rewrite | Deny exit 2 | Обычный exit 1 |
| --- | --- | --- | --- | --- |
| Stock 0.16.5, hook timeout 30 s | Работает | Hook не вызывается | Блокирует root, не child | Root продолжает команду |
| Тот же runtime + экспериментальное наследование hooks | Работает | Работает | Блокирует root и child | Оба продолжают команду |

Первый stock-опыт с timeout 5 s потерял первый root rewrite: native log содержит `hook.run.failed`, durationMs=5269; исходная команда исполнилась без receipt. Увеличение таймаута позволило проверить rewrite, но НЕ устраняет fail-open семантику hook failures.

### Stock baseline

- Каталог `.../T/dd-native-hook-CjPHgM/` под `/var/folders/3d/083xyfws1x57r5mm5t1_rxqm0000gp/`.
- ACP `f4e0458b-691c-45e3-82a8-9d68644f6ecc`.
- Root `sess_bd59731d-92f0-4348-be22-bf1ac961e6a7`.
- Child `sess_subagent_agent_42338dc5-b161-46d6-ae8a-7d51c0bb7de8`.
- Root получил receipt `8fc75c2b-269e-4eee-9127-e9e468c794cd`; child выполнил все три marker-команды без вызова hook, в том числе deny. Автоматическая проверка корректно завершилась ошибкой на child identity.

### Первопричина отсутствия child hooks

В поставляемом bundle конструктор child runtime (`new Fh(t.sessionId, … taskType:"subagent_child" …)`) собирает конфигурацию явно, но не передаёт `hooks`. Фабрика hook runner (`R0i`) создаёт runner при `config.hooks.enabled` и наличии executionPort. ExecutionPort передаётся, hooks — нет. Поэтому наличие hooks у root не означает их наличие у child.

### Контролируемая проверка минимального исправления

`tools/probe-zcode-inherit-hooks.cjs` делает ровно одну проверяемую подстановку **в памяти тестового процесса**: добавляет `hooks:this.config.hooks` в child config. Исходный файл не записывается, hash фиксируется. Это диагностический loader, НЕ способ production-доставки исправления.

- Каталог `.../T/dd-native-hook-XB6B8k/`, там `adapter.events.jsonl`, `native-hook.jsonl`, `probe-patch.jsonl`.
- ACP `39b02516-ee58-4b0a-bfd9-7960fd6a619c`.
- Root `sess_7557f4d1-e9fe-4956-9403-bdf9489d7cf9`.
- Child `sess_subagent_agent_e6ae8184-6d48-4ded-a38f-ab4da557018b`.
- Root receipt `a6956c6a-e628-4fcc-b27f-d46fa5986b9d`: saved 1789254706544, executed 1789254710129 ms epoch.
- Child receipt `145188dd-028f-4bfc-826b-80cb62ca25d7`: saved 1789254723711, executed 1789254723868 ms epoch.
- У обоих передан native tool_use_id; receipt IDs совпали с аргументами реально исполненных команд. Denied commands не исполнились. Обычные ошибки hook позволили исполнение без receipt.
- Проверка завершилась PASS. Runtime вернул end_turn, running=[], child success; затем выполнены cancel и закрытие bridge.

Повтор после безопасной установки scoped fixture:

```sh
node tools/probe-zcode-native-hooks.mjs
node tools/probe-zcode-native-hooks.mjs --inherit-hooks
```

Первый запуск на указанной stock-сборке ожидаемо проваливает child assertions; второй должен пройти. Не запускать оба одновременно. Loader сверяет единственное место подстановки и сохраняет hash исходного bundle. После опыта восстановить пользовательский конфиг, сохранив любые чужие изменения. Native hook journal — основной источник assertions; текст ответа модели не используется как доказательство.

## Выбранное решение

Native PreToolUse → существующий обработчик/БД dd-flow → commit receipt → updatedInput с точным --hook-event-id → CLI claim и lifecycle mutation. Существующий commandWithHookEvent и общий parser переиспользуются; все остальные поля tool_input сохраняются. Сохранение полного набора сведений в argv не нужно.

Обязательное условие: поставить исправленный и закреплённый native runtime с наследованием hooks дочерними runtime. Stock 0.16.5 не квалифицирован для этого пути. В zcode-acp нет исходника этого native constructor, поэтому одной правки ACP-forwarder недостаточно. Получение исправленной сборки — отдельная зависимость релиза; исследовательский loader не включать в штатный launcher.

Защита CLI обязательна независимо от hook: для нового ZCode binding-контракта lifecycle mutation без точного trusted receipt запрещена; fallback по 60-секундному окну отключён. Hook errors преобразуются в явный deny/exit 2 с исходной диагностикой, но crash/timeout могут всё равно выпустить исходный CLI — он должен fail closed. Pending receipt не должен допускаться после неуспешного rewrite/повторного использования; существующие claim/replay/identity checks сохраняются.

ACP notifications остаются evidence, но больше не создают второй admission receipt и не дополняют критический путь своим subprocess. Идентификатор native hook tool_use_id отличается от ACP child-prefixed toolCallId: корреляцию хранить явно, не создавать разные receipts для одной команды.

В проверенном hook input нет явного parent_session_id, agent_id или daemon_id. Собственный session_id достоверен. Daemon/root ownership брать из контролируемого adapter context, а непосредственного parent — из подтверждённой native topology либо явно добавленного native поля. Не объявлять любой не-root Session прямым child и не восстанавливать ancestry по строковому префиксу. Это обязательный integration check до production qualification.

## Что эксперимент не доказал

Не выполнены production SQL integration, параллельный fan-out на окончательной сборке, replay/recovery, lineage integration, общий release gate и полноценный E2E. Эти проверки остаются в плане. Доказаны native sync rewrite и deny при исправленном наследовании, а также необходимость fail-closed CLI при отказах самого hook.
