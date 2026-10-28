# 110 — ревью реализации

Дата: 2026-10-28. Базы: engine `b59c32bf`, EVAL `245d47d0`.
Проверены D1–D14 плана, callers и границы ownership/replay/capture/cleanup;
независимые engine/EVAL-аудиты перепроверены основным агентом.
Ponytail: использованы существующие native wait и общий finalization validator,
без нового scheduler, таймера, classifier или зависимости.

## Существенные находки и исправления

1. Scored recovery при исчерпании окна делал `technicalOnly` из результата
   физической cleanup-recognition. Поздний sealed capture при pending cleanup
   не допускал Judge. Ещё одна ветвь доверяла ранее увиденному unknown capture.
   Обе теперь вызывают существующий `runnerFinalizeSettled`, который заново
   проверяет evidence перед Judge. Cleanup-only owner по-прежнему не может
   запускать отсутствующий Judge; unready capture не даёт assessment authority.
2. Work-repair follow-up не требовал ждать новую работу child: enqueue ACK мог
   закончить родительский Turn раньше нового native Turn. Добавлены общий
   `renderWaitInstructions` и запрет считать прежний terminal/ACK завершением,
   повторять отправку ради polling или создавать replacement. Это использует
   существующее sliding-наблюдение адаптера. Если агент игнорирует инструкцию,
   остаётся безопасная локальная reconciliation, не ложный успех/resend.
3. Regression активного ledger имела единственный сигнал и предполагала, что
   cold Node завершится до следующего окна тишины. Под нагрузкой тест законно
   истекал. Fixture теперь моделирует новые ledger cursors на протяжении работы;
   отдельные негативные cases сохраняют проверку, что одинаковый cursor и poll
   не являются activity. Runtime timeout и assertions не ослаблены.

Других доказанных существенных дефектов в просмотренных selector/CAS/fanout,
one-episode reservation, retained hook и admission/process-retirement не найдено.
Нативные ограничения AGY/ZCode, описанные планом, не заменены фиктивным resume.

## Проверки

- Engine: финальные `controller-child-repair110` — 15/15 PASS, включая actual
  prompts Codex/OpenCode/Droid/Grok. TypeScript `tsc --noEmit` — PASS.
- EVAL: `plan110-recovery`, `recovery-finalization105`, `cleanup-observation` —
  22/23 PASS первоначально; единственный timing fixture исправлен, затем все
  6 `plan110-recovery` — PASS. Остальные 17 cases переиспользованы без изменений.
- Реальная finalization regression: unready capture не запускает Judge;
  ready capture при pending physical cleanup допускает Judge без Subject replay.
  Fixture использует отсутствующий Judge profile, не делает provider call.
  Полный detached-worker budget-exhaustion сценарий не исполнялся: проверены
  обе ветви вызова по коду и реальная общая finalization boundary тестом.
- Diff checks — PASS. Полный gate, GitHub CI, native/model qualification,
  публикация пакетов и новые EVAL не запускались; живые EVAL не изменялись.

## Очистка

Удалены 6 чистых неиспользуемых worktree, 24 старые локальные и 17 удалённых
веток. Удаляемые ветки сверены с точными SHA merged PR. Два уникальных CP258
коммита сохранены локально и удалённо тегом `archive/cp258-four-e2e` (`ea0c18c5`).
Два ignored `.env` и два operational-скрипта сохранены в
`/Users/deksden/Documents/_Projects/_worktree-archives/plan110-cleanup`
(каталоги 0700, файлы 0600), содержимое не раскрывалось.
Используемый живыми AGY-процессами и symlink-зависимостями checkout
`dd-flow-cli.release-plan108-beta153`, основные checkout и review-деревья
сохранены. Исторические pins не переносились в main ради очистки.
