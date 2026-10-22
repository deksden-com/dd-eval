# 098 — Review and integration receipt

Дата: 2026-10-23. Scope: review implementation `047a48c5` / `78ed1a7`,
исправление существенных дефектов, affected local acceptance и candidate merge.
Новые EVAL, release, npm publication, обновление pins/hooks не выполняются.

## Результат проверки полноты

P0/P1/P2/P4–P8 реализованы, но первоначальная реализация содержала перечисленные
ниже дефекты. P3 **не является завершённой положительной native qualification**.
Безопасный отрицательный deliverable плана сохранён: AGY productive admission
закрыт без matching qualification. Merge кандидата не выдаёт release acceptance.
Зависимость 097 включается в интеграцию явно, не теряется при squash.

## Найдено и исправлено

1. AGY публиковал in-memory proof/child settlement до обязательных journal/state
   writes. Параллельный inspect мог получить readiness, даже если запись потом
   падала. Теперь candidate локальный; mandatory writes завершаются до публикации,
   owner/connection/generation/revision/cancel/clock проверяются после каждого
   await. На диске до grant сохраняется консервативный active_tree=true.
   Регрессия удерживает journal и persist, проверяет отсутствие раннего grant,
   затем вносит activity во время каждой записи для terminal и fresh admission.
2. AGY qualification принимала произвольный hashed JSON плюс вручную заданные
   PASS booleans. Теперь checks выводятся из структурированных identity-bound
   native observations, а не из неподтверждённых флагов. Хеш остаётся проверкой
   целостности, не доказательством подлинности локального операторского capture.
3. P3 probe принципиально не мог завершить приёмку: создавал только часть
   состояний и не имел finalizer. Добавлен отдельный no-model finalizer полного
   retained evidence; incomplete/unsupported не дают receipt. Он не запускает
   provider, не дописывает выдуманные наблюдения и не перезаписывает старый файл.
4. Shared normalizer мог потерять pending в duplicate unknown/terminal records.
   Теперь explicit pending против terminal/settled отклоняется независимо от
   порядка, включая nested child; неизвестность не исчезает при dedup.
5. Shared nativeShutdownConfirmed не учитывал native_settlement.confirmed=false.
   Общий guard исправлен для всех controller/recovery/capacity/scope consumers.
6. OpenCode cancel fallback строил retained child без cwd и падал в retainSession
   до root abort. Теперь retained cwd сохраняется, ошибки наблюдения/retain
   учитываются, известные owned nodes получают best-effort abort. Явная свежая
   смена ancestry по-прежнему запрещает действие над чужой сессией.
7. EVAL строковые details.violations обходили общий secret redactor. Ветка
   переведена на существующий redactor, добавлена regression для credentials.

Также исправлена тестовая native-capacity fixture: она возвращала child, но не
включала его в tree_session_ids. Production coverage guard не ослаблялся.

## Почему P3 пока не PASS

Существующие реальные пробы подтверждают owned metadata/auth/bootstrap и idle
после завершившейся работы, но не все обязательные live-tree/message сценарии.
Прежний prompt просил root завершиться до child; native scheduler в наблюдённой
пробе дождался child/background. Повтор такого prompt не доказывает недостающее
состояние. Часть timeout/error/cancel fences уже проверяется детерминированно,
но это не выдаётся за native whole-tree semantics. Persistent/timer и completion
delivery остаются неподтверждёнными. Grandchild hook scope пока явно restricted
direct-child, поэтому приёмка RPC сама по себе не означает поддержку любых hooks.

Upstream [1044](https://github.com/google-antigravity/antigravity-cli/issues/1044)
описывает SUCCESS при ещё работающем command; публичный runtime source отсутствует.
Наличие RPC/SDK wait не доказывает полноту его области. Нет оснований ни объявлять
RPC неисправным, ни принимать отсутствие live evidence за PASS. Новые платные
пробы/EVAL в этом review не запускались; capability blocker не снят.

Для завершения P3 нужен новый reviewed native capture недостающих достижимых
состояний на exact binary/client policy. Unsupported capabilities требуют явного
пересмотра области гарантии, не фиктивных PASS booleans.

Финализация без запуска модели:

```sh
node scripts/qualify-agy-native-inspection.mjs /absolute/agy \
  --finalize /absolute/native-evidence.json /absolute/new-qualification.json
```

## Локальная проверка

Frozen engine candidate: `7b9f6daf` (reviewed source, не release-accepted).

- `pnpm gate:merge` — PASS: typecheck, lint, 770 fast tests, hybrid contracts.
- `pnpm build` и `node --test scripts/verify-release-build.test.mjs` — PASS,
  installed asset regressions 2/2.
- Vitest codex-capacity, native-tree-adapters-098, agy-state-boundaries,
  vnext-fanout-storage, recovery-observation-budget, controller-child-capacity,
  memory-init-native-capacity, runtime-scope-stop — 142/142 PASS, без skips.
- Node fixtures provider-overload-adapters, operation-observation, droid-adapter,
  agy-adapter — 55/55 PASS, без skips. Ordinary AGY wrapper теперь включает
  native qualification fixture; native+qualification отдельно 14/14 PASS.
- EVAL affected suites (113) плюс dependency097 baseline-admission/case-acceptance:
  134/134 PASS, без skips; pinned engine interop также проверен.
- Exact built package установлен через npm с явным prefix в новый
  `/tmp/dd-flow098-review.i6DAOf/installed`, без source/node_modules symlink.
  AGY client/schema/Runtime imports и CLI `--version` — PASS.
  Client policy SHA256:
  `a1b4cc842686c0d28475303e6b77e18a0aaa4cab9567bbdcc75d3da013777769`.
- Whitespace и локальные document links — проверяются перед commit.

Полный release profile/GitHub CI и scored EVAL не запускались. Первичный RED
native-capacity fixture (child отсутствовал в её tree IDs) не скрывается: после
исправления тестовых данных затронутый файл повторно полностью PASS.

## Интеграция

Engine [PR113](https://github.com/deksden-com/dd-flow-cli/pull/113) squash-merged:
`a5461c99262f3d21252b9cef1c62213b1a52d94d`. Tracked tree совпадает с проверенным
`7b9f6daf`; зависимости 097 включены. EVAL integration:
[PR137](https://github.com/deksden-com/dd-eval/pull/137), reviewed runtime diff
`33b2f12` плюс этот документационный integration receipt.

## Очистка

Удаляются только собственные завершённые task/campaign checkout и branch refs.
Неинтегрированные release/campaign кандидаты сначала сохраняются immutable
archive tags. Чужие E5 ветки/деревья, включая незакоммиченные файлы, сохраняются.
Runtime DB/artifacts/processes и установленные пакеты не меняются.

Выполнено: удалены clean engine release146/retry147 и EVAL CP241–244 worktrees,
их local/remote branches; obsolete PR111/112 engine и PR136 EVAL закрыты.
Точные кандидаты восстановимы из `archive/098-review/engine-beta146`,
`archive/098-review/provider-overload-third-retry`, `archive/098-review/cp241`–`cp244`.
После merge удаляются task097/098 refs и их собственные worktrees; reviewed
source сохраняется в `archive/098-review/engine-reviewed` и `eval-reviewed`.
