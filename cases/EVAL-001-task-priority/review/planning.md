# Review prompt — planning track

Оцени результат агента только по доступным ему исходным данным и правилам проекта. Не штрафуй за несовпадение формулировок с reference answer; оценивай семантическое покрытие и доказательства.

## Оценка, 100 баллов

1. **Flow и чтение правил — 20:** priming, protocol/specify/plan order, применимые policy/design aspects, predecessor gates и trace/evidence.
2. **Gap discovery — 25:** значения/default, persistence/migration, create-vs-patch semantics, validation/no-mutation, permissions/isolation/archive, UI/accessibility, ordering/non-goals, fixtures/tests/docs.
3. **Качество вопросов — 15:** вопросы действительно problem-space, сгруппированы, объясняют impact и не перекладывают routine implementation choices на пользователя.
4. **Спецификация — 20:** после общего clarification packet формирует непротиворечивые requirements, acceptance, non-goals и traceability.
5. **План — 20:** покрывает database/API/UI/tests/Memory Bank/readiness, следует существующим границам и не добавляет ненужную архитектуру.

Для каждого раздела приведи evidence path/quote, балл и конкретный defect. Отдельно перечисли: `rules_read`, `rules_applied`, `result_quality`, `blocking_omissions`, `non_blocking_improvements`. Не раскрывай агенту hidden acceptance материалы.
