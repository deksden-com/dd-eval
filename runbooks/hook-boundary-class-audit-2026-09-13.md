# Аудит класса: потеря контракта на границах hook / adapter / Session

Статус: read-only аудит production-кода; новые findings не исправлены. Выполнен `node tools/probe-hook-boundary-audit.mjs`: три воспроизведения на настоящих телах функций. Никаких model/native вызовов, изменений старых EVAL или настроек пользователя. Helper commandWithHookEvent проверен из текущего dist и сопоставлен с src; daemon/wrapper — из src с изолированными входами.

## C-01. Grok отбрасывает результат native hook и дублирует admission через ACP

`dd-flow-cli/src/harness-runtime/bin/dd-grok.mjs:hook`: subprocess `grok event handle` запускается со stdout=ignore, затем wrapper возвращает только `{decision:"allow"}`. Между тем `src/services/hooks.ts:handleGrokEvent` возвращает hookSpecificOutput.updatedInput. Результат общего обработчика не доходит до native исполнителя. Локальное воспроизведение передало исправленный input из subprocess и подтвердило его отсутствие в ответе wrapper.

Одновременно `dd-grok-daemon.mjs:observeAcpToolCall` превращает session/update в ещё один PreToolUse и вызывает тот же обработчик. Native и ACP используют разные способы event identity; для payload без native event_id fallback в handleGrokEvent зависит от session/command/turn, тогда как ACP строит session/toolCallId. При несовпадающих ключах это разные observed receipts, а не idempotent duplicate. Не утверждается, что на каждом реальном вызове ключи различаются; дефект архитектуры двух независимых admission-путей подтверждён кодом.

Последствие: Grok также остаётся зависим от recent-match fallback, может получить ambiguity или поздний отказ notifications. Shared AcpBridge переносит на Grok и notificationError/flush поведение ZCode. Это не доказательство сбоя живого Grok запуска — в этом аудите он не запускался.

Фикс: wrapper передаёт native hook protocol response без потери updatedInput/deny; обязательная schema validation, один авторитетный native admission path. ACP только коррелирует evidence, не создаёт второй receipt. Возврат exit 2 при ошибке wrapper уже есть — сохранить. Regression: amended input проходит всю цепочку; deny/error не превращаются в allow; один native вызов + его ACP mirror дают ровно один admission receipt.

## C-02. Общий rewrite helper не поддерживает разрешённый heredoc

`src/services/hooks.ts:commandWithHookEvent` возвращает исходный command при rewriteSafe=false. На настоящем parser work finish --result-stdin и stage pause --question-stdin с прямым heredoc имеют kind=standalone, но rewriteSafe=false. Значит, разрешённая форма команды не получает точный --hook-event-id. Нельзя объяснять это только compound parsing: воспроизведение показывает standalone.

Helper используется Codex Desktop, Grok и controlled-tool hooks; OpenCode plugin затем применяет полученный updatedInput. Поэтому это общий дефект границы parse/allow/rewrite, а не отдельная проблема ZCode. Сейчас его может маскировать recent-match fallback; после введения обязательного точного ID он гарантированно блокирует соответствующие generated commands.

Фикс: единый разбор безопасной формы с позицией вставки аргумента в командную часть ДО heredoc, с сохранением stdin body и delimiter побайтно. Не дописывать ID после closing delimiter, не переписывать неизвестную shell-грамматику. Allow и rewrite используют один контракт; если participating command нельзя безопасно изменить, явный отказ вместо успешного unchanged input. Regression: выполнить generated work finish и HITL pause/resume в shell fixture, проверить фактический argv и неизменный stdin; command substitution/второй вызов/посторонний хвост по-прежнему запрещены.

## C-03. ZCode track стирает ancestry после fork

`src/harness-runtime/lib/dd-zcode-daemon.mjs:Runtime.track` читает existing, но сохраняет parent_provider_session_id как `result.parent_provider_session_id ?? null`. Fork receipt содержит parent, обычные prompt/inspect receipts из dd-zcode.mjs — нет. Следующий track превращает известный parent в null. Воспроизведение: forked→parent, затем частичный prompt receipt → forked→null.

Это доказанная потеря durable lineage metadata. Неправильное завершение native процессов из этого факта само по себе не следует и не заявляется. Но новый hook binding и evidence resolver нельзя строить на метаданных, которые такой update стирает.

Соседний Grok Runtime.track сохраняет `session?.parent_provider_session_id`, то есть нужный шаблон уже существует. Фикс: immutable identity/ancestry сохраняется при отсутствии поля в delta; конфликтующее родство отвергается/диагностируется. Полные mutable topology snapshots обрабатываются отдельно — не сохранять устаревшую liveness только ради общего merge. Tests: fork→inspect→prompt→persist/reload; parent не исчезает, конфликт не перепривязывает Session.

## Общая поверхность exact receipt — расширение I-08, не новая отдельная ошибка

Recent-match используется не только work start: hooks.ts claimWorkLifecycleHookEvent (finish/fail), claimStageLifecycleHookEvent (finish/pause), stage-pause.ts resume, run-recovery.ts accept. Поэтому обязательность точного receipt нужно централизовать и применять ко всем продуктивным входам нового harness-контракта. Отдельный guard только в startWork оставит siblings на старом протоколе. Bootstrap/session registration проверить отдельно на законный explicit receipt путь; наличие объявленного helper не считать доказательством активного caller.

Совместимость старых harnesses задавать подтверждённой capability, не общим удалением fallback: у разных native hosts разные гарантии updatedInput. Безусловное переписывание agent-supplied ID также не решение — валидировать receipt against actual identity/operation/generation.

## Где аналогичный дефект не подтверждён

- OpenCode generated plugin действительно await-ит tool.execute.before и применяет updatedInput в output.args. В его собственном bridge нет показанного Grok stdout discard; общий heredoc helper остаётся затронутым.
- Grok native hook wrapper на своей ошибке уже возвращает deny/exit 2: не приписывать ему ZCode exit-1 проблему без основания.
- ZCode daemon options(params) переносит state.config, daemonId и dispatch guard через общий helper. Не обнаружено пропуска всей конфигурации в этом helper; потеря native child hooks находится в другом, явно собираемом native constructor.
- Grok track сохраняет известного parent при частичном receipt; аналогичная потеря здесь не подтверждена.
- Старые dd-eval I-04…I-07 остаются в основном плане; в этом проходе не получено нового доказанного дефекта eval сверх них.

## Границы и приоритет

Перед новым строгим ZCode admission обязательно закрыть C-02/C-03; C-01 исправлять в общей hook-boundary работе, не объявлять все harnesses квалифицированными по одному ZCode тесту. Проверки wrapper/rewriter/track дешёвые и локальные. Live root/child/reattach — на соответствующей окончательной сборке. Не повторять полный release gate для каждого отдельного finding.

Это целевой аудит общих hooks, ACP adapters и daemon Session updates, не полный аудит всех исходников всех native harnesses. Отдельная live-квалификация Grok/OpenCode, plugin hook inheritance и background/resumed native child ещё не выполнены.
