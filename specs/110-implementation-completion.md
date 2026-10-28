# 110 — реализация, приёмка и интеграция

Дата: 2026-10-28. План: [110](110-continuation-admission-and-recovery-plan.md).
Статус: реализация завершена, scoped offline-проверки PASS; новые EVAL не запускались.

## Изменения

| Дефекты | Реализация |
| --- | --- |
| D1,D13 | Actual generated OpenCode plugin переносит runtime_owner/noFlow в shell overlay; retained verification сообщает дедуплицированный typed diagnostic без secrets и без сброса liveness. |
| D2,D3 | Exact replay сохраняется, unique committed successor разрешается и до observer delivery как rendezvous, и после observed/executing. Stage authority pending не порождает второй productive finish. |
| D4 | Safe pause использует physical owner guard и повторный generation/controller fence в intent transaction, не требует исчезновения retained productive error. |
| D5,D6 | Descriptive deviations принимаются, настоящие blockers остаются actionable Work refusal. Один durable same-child repair episode на Work/RUN. Независимые ready Work не блокируются известным missing-result blocker. |
| D7 | Убран второй fixed recovery RPC timeout. Новые проверенные native ledger cursors продлевают окно; status replies/диагностика не продлевают. Restart/gap не обнуляет остаток. |
| D8–D10,D14 | Ready sealed capture важнее старого blocked worker. Capture/interaction/report/cleanup причины разделены. Основной observer не ждёт resource cleanup для оценки, а при недоступном evidence завершает technical report без ложного verdict. Multi-execution очередь не завершается из-за одного failed capture. |
| D11 | Unknown attribution не превращается в mismatch и не запрещает diagnostic Judge. Доказанный mismatch остаётся невалидным экспериментом; strict launch и comparison exclusions сохранены. |
| D12 | Narrow PID observation, успешный selfIdentity cache вместо rejected Promise, bounded повтор unknown read без unsafe reclaim. Admission отделяет blocking exclusive overlap от advisory historical cleanup. |

После выхода scored observer automatic cleanup может ingest/project поздний
capture, но не запускает новый Judge. Новая assessment требует явной existing
авторизованной финализации, не нового Subject. Candidate revisions/idempotency
и неизменность старых verdicts сохранены.

## Уточнения по результатам review

- Проверена гонка issued successor до поступления native callback: это выбор
  rendezvous, не обход await/CAS/native authority.
- Проверка изоляции учитывает actual admin endpoint, explicit API/Web ports,
  canonical workspace aliases и валидные endpoint tuples. DATABASE_URL без
  admin binding, connection overrides, malformed/remote unknown facts не
  доказывают изоляцию. Не вводился DNS resolver или новый resource registry.
- Отсутствие close ACK при settled execution не аннулирует Work. Возможный
  unsettled writer ограждает только зависимую запись, не весь flow.
- Empty/malformed ps при живом/неизвестном PID не считается доказательством
  отсутствия владельца. Только OS ESRCH/валидная identity допускает reclaim.
- Ошибка advisory notification после принятия launch reservation больше не
  отменяет acknowledgement уже совершённого действия.
- Обновлены только затронутые test-double ожидания и ownership карты проверок;
  продуктовые assertions/fixtures результата продукта не ослаблялись.

## Scoped-приёмка

Engine:

- `pnpm exec vitest run test/lifecycle-invocations.test.ts --reporter=dot`:
  185 PASS; после последнего изменения rendezvous/цепочки истории повторены
  7 соответствующих successor/replay/scope cases — PASS.
- Финальная группа `controller-child-repair110`, `delegation-instructions`,
  `native-work-bootstrap108`, `retained-native-hook108`: 59 PASS.
- Дополнительная приёмка C/D: реальные pause cases 2, CODE Work/check fixture 1,
  technical-resume 4, fanout-storage 18 — PASS. Эти числа не складываются с
  предыдущими повторными запусками как с независимыми новыми проверками.
- Verification policy 32 PASS первоначально; единственный случай с запретом ps
  в sandbox прошёл без изменения assertion при нужном OS-доступе — итого 33 cases.
- Build, TypeScript, affected-file ESLint и diff checks — PASS.

EVAL:

- `node --test test/plan110-recovery.test.mjs test/plan110-admission.test.mjs
  test/cleanup-observation.test.mjs test/recovery-finalization105.test.mjs
  test/runner-execution-contract.test.mjs test/process-json.test.mjs
  test/technical-notes107.test.mjs test/specify-comparison.test.mjs`:
  финальная связка до последних admission-only уточнений — 135 PASS.
- Финальные admission/PID/retirement cases после уточнений:
  `plan110-admission`, `process-retirement`, `retirement-proof-reuse`,
  `eval-retirement090` — 27 PASS (с перекрытием части предыдущей группы).
- `test/verification-policy102.test.mjs` — PASS; новая recovery helper получила
  явное ownership вместо fallback на полный набор.
- Syntax и diff checks — PASS.

Временные логи этой задачи: `/tmp/plan110-*.log`. Первоначальные sandbox отказы
ps/socket и исправленный test-double отказ не выдаются за PASS: исправленные
точечные cases повторены с итогом PASS. Останавливались только подтверждённые
собственные тестовые процессы/fixtures, не процессы EVAL.

Полный release-gate, GitHub CI, реальные model/native qualification calls,
публикация npm, обновление installed hooks/pins и новые EVAL не выполнялись.

## Интеграция и границы

- Engine implementation commit: `32f09f453d8eb2068a60a21f7c0d1ebdae0e2432`.
- Engine PR: [dd-flow-cli#149](https://github.com/deksden-com/dd-flow-cli/pull/149).
- Engine main squash commit: `b59c32bf531e7fe8be698f8a2aa0fcfb99050ace`.
- EVAL PR: [dd-eval#177](https://github.com/deksden-com/dd-eval/pull/177),
  main squash `245d47d0f51c2469915c8b93373099cbc3bfc2b9`.
- Последующее ревью и исправления: [110 — implementation review](110-implementation-review.md).
- Changeset engine описывает будущий patch release; package version/published
  artifact не менялись. Canon и bridge не изменялись.

AGY и текущий ZCode provider-only continuation contract не получают выдуманный
Work-repair resume. При отсутствии подходящей native capability остаётся
локальная reconciliation/affected pause; остальные разрешённые Work сохраняются.
Это предусмотренная граница плана110, не доказательство полного нового E2E PASS.
Историческая внутренняя причина последнего Luna capture-read не дописывалась
задним числом; устранены доказанные системные ветви и потеря диагностики.
