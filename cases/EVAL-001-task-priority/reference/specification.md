# Каноническая спецификация — Task priority

## Цель

Пользователь workspace может назначить задаче один из пяти приоритетов при создании или редактировании и распознать этот приоритет в списке без изменения существующего порядка задач.

## Контракт

- `TaskPriority = none | low | medium | high | urgent`.
- `tasks.priority` — `NOT NULL`, default `none`; migration безопасно заполняет существующие строки.
- Create принимает необязательный `priority`; default `none`.
- Patch принимает необязательный `priority`; omission сохраняет значение.
- Неизвестное или нетекстовое значение — `400 VALIDATION_ERROR`, без частичной записи.
- Task responses всегда содержат `priority`.
- Обычные members и owners сохраняют текущие task permissions; workspace isolation и archived-project guard применяются без исключений.

## UI

- Create и detail используют подписанный native `select` со всеми значениями.
- Task list показывает текстовую метку; значение не сообщается только цветом.
- Detail сохраняет priority вместе с редактируемыми полями и корректно отражает dirty/saved/error state.
- Архивный проект блокирует control так же, как остальные task fields.
- Существующий responsive и keyboard contour сохраняется.

## Данные и совместимость

- `task-alpha-one=high`, `task-beta-one=none`.
- Повторный seed создаёт тот же логический мир.
- Порядок list query не меняется; sorting/filtering по priority отсутствуют.
- Новых зависимостей, фоновой работы и внешних сервисов нет.

## Приёмка

Migration/schema, deterministic seed, API create/default/update/omission/invalid, archived guard, actor isolation, UI create/edit/list, accessible label, narrow viewport, Memory Bank consistency и существующие root quality/browser gates проходят.
