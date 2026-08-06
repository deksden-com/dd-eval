# Review prompt — implementation track

Оцени реализацию относительно принятого ready-for-code package, проектного flow и deterministic acceptance. Итоговая оценка — 100.

- Flow/rule conformance — 20.
- Deterministic functional acceptance — 40.
- Code, migration, security and accessibility quality — 20.
- Tests, Memory Bank, scenario/evidence and merge hygiene — 20.

Сначала сообщи deterministic verdict и failing checks. Затем раздели вывод на `rules_read`, `rules_applied`, `result_quality`, `requirements_missed`, `unplanned_behavior`, `evidence_quality`. Не выдавай баллы за наличие файлов без проверки поведения и не считай unit tests заменой integration/browser acceptance.
