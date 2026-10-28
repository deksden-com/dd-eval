# 112 — Implementation receipt

Дата: 2026-10-28. Scope: engine, canon, EVAL reporting. Продукт и исторические
RUN/EVAL не изменены. Ветки: `fix/plan112-work-failure` в трёх репозиториях.
Engine commit: `a0f68559`; canon commit: `462a644`.
Согласованная capacity metadata сохранена отдельным commit `eccc0ae6`.

## Реализовано

- Общий контракт PLAN/PLAN-REVIEW/CODE/worker: текущая реализация — baseline,
  а не цель; модельные stop_conditions не отменяют принятые требования.
  Пустой список stop_conditions допустим; обязательные границы сохранены.
- Доказанный lifecycle `work_fail` возвращается координатору для решения
  retry/block/pause/fail. Native/provider/unknown outcomes не переименовываются
  в семантические отказы. Полная исходная причина и ссылки сохранены.
- Отдельная obligation проверяет сдачу решения, не готовность Stage. Выходной
  файл заранее создан. Решение связано с Work/session/Stage attempt/cycle.
- Одна автоматическая corrective attempt на Work, включая смену поколения
  контроллера. Новая attempt получает коррекцию. Lost-ack не запускает её повторно.
- Block/pause адресуются живому coordinator Work, не failed child. Независимая
  ready-ветвь может завершиться до Stage-wide block. Чужой block/HITL не скрывается.
- External retry сохраняет старый launch в ATT-NNN и создаёт новую operation,
  только после подтверждения отсутствия прежнего writer. Старые файлы не удаляются.
- EVAL различает explicit Work failure и native failure; принятый следующий
  этап убирает устаревшую текущую ошибку, сохраняя её историю. Нативная активность
  child отображается отдельно от polling/heartbeat.
- Новые controller/retry контракты зарегистрированы в scoped verification policy.

## Проверки

- Engine: 77/77 в шести затронутых файлах: controller-work-failure112,
  controller-result-authority, controller-child-repair110, work-retry112,
  plan-stop-conditions112, delegation-instructions.
- External launch: отдельная регрессия fresh operation after archived failure — PASS.
- EVAL: 19/19 в work-failure112, console-observation, observation-summary,
  native-failure083. Запуск с доступом к process observation; sandbox запрещал ps.
- TypeScript typecheck и scoped ESLint — PASS. Canon/schema copies проверены
  адресными тестами и сопоставлением; diff whitespace checks — PASS.
- Build TypeScript — PASS; verification-policy 33/33 — PASS. Дополнительная
  адресная проверка регистрации новых controller/retry контрактов — PASS.

Ни полного release-gate, ни GitHub CI, ни новых model/native probes или E2E.
Это implementation acceptance, не утверждение о прохождении нового живого E2E.
Ранее согласованные capacity профилей (Luna 3, остальные 15) сохранены отдельно.
