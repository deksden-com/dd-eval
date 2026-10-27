# 109 — Ревью, scoped-приёмка и интеграция

Дата: 2026-10-27. Объект: dd-eval `25986a09cf0af26069f758c8a575f0d1777b94c0`
и canon `de550694d7a68060a40af8f123022f770077db6b`.

## Результат ревью

Повторно проверены P1–P6 и дополнения §6 плана. Три независимых read-only ревью
(runtime/evidence; policy/profiles/corpus; canon/handoff) перепроверены основным
агентом по коду и целевым тестам. Новых существенных дефектов не подтверждено;
runtime-код ради косметики или дополнительных барьеров не менялся.

Подтверждено:

- Native compact, JEV и оба Decision plugins получают одну sufficient-answer
  policy; atom-контракт остался явным legacy diagnostic режимом.
- Canonical delegation не разрешает молча выбирать существенное продуктовое
  поведение; точные labels/default/роли/архив/UI/API/open-closed сохранены.
- Все 34 operational-профиля явные; active definition/pins не редактировались.
- Языковые отрицательные кейсы имеют независимые принятые ограничения. Вопрос
  без них покрывается canonical отказом. Oracle не подменяет модельный результат.
- Оба managed/reference caller проверяют packet/receipt/scope/verdict до
  covered/rejected развилки. Rejected evidence не имеет разрешённого ответа.
- Allowed packet path не выводится по одному receipt locator/coverage_filter.
  Accepted replay сохраняет точные bytes и pause/scope/round bindings.
- Status/report не переклассифицирует старый v3; missing/corrupt proof даёт
  unknown/unavailable, а не PASS. Merge retained evidence различает scope/round.
- Финальный Judge не получает невручённый canonical ответ как принятый scope.
  Аудит semantic consequences выполняется в том же финальном вызове по rubric,
  без нового prelaunch Judge и без повторного mechanical matching.
- Общие SPECIFY/PROTOCOLIZE/PLAN и SPC-008 согласованы. Legacy общие инструкции
  также уже отделяют baseline/accepted/open и не требуют technical design от
  пользователя; дополнительных противоречащих указаний не найдено.

## Приёмка без лишних прогонов

В этом ревью заново прошёл 61 offline тест:

1. `node --test --test-concurrency=2 test/hitl-contract.test.mjs
   test/hitl-coverage-report-review.test.mjs test/hitl-retained.test.mjs
   test/evidence-schema.test.mjs test/plan109-fixtures.test.mjs` — 51 PASS.
2. `node --test --test-name-pattern='HITL qualification|Interaction Judge prompt|HITL verdicts|HITL recovery|unplanned HITL|canonical recovery|run profiles.*HITL|Final Judge'
   test/eval.test.mjs` — 10 PASS; остальной общий suite не запускался.

Тесты используют временные fixtures и read-only process snapshots, не живые
EVAL/модели/БД продукта. Предыдущие 143 уникальных scoped PASS реализации сохранены
как отдельное evidence; повторные исполнения не выдаются за дополнительные тесты.
Общий canon prompt-presence contract и `git diff --check` прошли повторно.
Лимит прежнего mb-lint (dd-flow ignored) остаётся явно указанным в completion.

Нет полного engine/release gate, GitHub CI, installed matrix, новых paid/native
model calls, новых EVAL или ручного продолжения существующих запусков.

## Интеграция и безопасная очистка

Канон интегрирован squash PR
[dd-memorybank #12](https://github.com/deksden/dd-memorybank/pull/12),
опубликованный main `5a6fba9639d6dc488aaac0be47395fe9b778bcd7`.
Публичный readback перед защищённой операцией подтвердил `deksden`, точный repo
и ADMIN authority. Авторизация не менялась. Для dd-eval — review receipt в этом
коммите и отдельный squash PR в опубликованный main; GitHub CI не запрашивается.

Локальный main канона содержит чужие неопубликованные E5-наработки и расходится
с origin/main. Он не сбрасывался, не публиковался и не использовался как база PR.
После подтверждения merge удаляются только собственные plan109 branches/worktree
с чистым статусом и доказанным совпадением integrated tree. Не удаляются CP258
definition checkout, CP257 canonical source и квалификационные/release snapshots,
используемые текущими EVAL; чужие активные и непубликованные E5-деревья сохранены.

Deployment нового curated flow-pack остаётся отдельным выпуском: исходный canon
смёржен, но действующий EVAL не переводится на него задним числом. Некоторые
исторические failed результаты с recovery_id могут оставаться unassessable при
повторном аудите; это не новая выдача и не ретроспективный PASS. Живая семантическая
регрессия изменённого prompt в рамках этого ревью не выполнялась.
