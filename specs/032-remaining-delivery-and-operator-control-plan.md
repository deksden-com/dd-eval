# 032 — Оставшаяся поставка и операторские pause / stop / resume

Дата: 2026-09-08. Статус: IN PROGRESS; полная готовность не объявляется.

Уточнение пользователя от 2026-09-09: поставляется только актуальный код и
актуальные форматы. Legacy productive paths, version-compatibility branches
и fallback на старые форматы удаляются. Нужные данные мигрируются; ненужные
старые данные разрешено удалить. Это заменяет требования ниже о сохранении
читаемости исторических форматов, но не отменяет ownership fences, проверку
неизвестных исходов и безопасную остановку живых процессов.

Запрос: завершить оставшиеся системные доработки и обеспечить командную
остановку flow вместе с его агентами/сессиями с последующим возобновлением.
После согласования плана пользователь поручил полную реализацию, включая
назначение разных моделей разным этапам. Побочные продуктовые изменения
за пределами этого плана не входят в поставку.

### Текущая реализация (2026-09-08)

Уточнение по текущему WIP (не release acceptance):

- Published beta.43 adoption (2026-09-09): CP-092 selects
  `387b5ce2c63b7e4f97ff240d0a22763f7cc38c47`, checksum
  `a61d853baf81d2d5bf575fcb95f2d9373b5e323ecf4f521f7a512005d1141832`.
  Release completed at 21:44:48 UTC after 576/576 tests, typecheck, lint/build,
  artifact/refs and isolated/global consumer verification. The installed
  artifact digest was independently recalculated by eval's admission helper.
  Source and pack remain `924ef61` and `dee7dba`; CP-091 remains immutable.
  Codex receipts now omit historical Turn payloads while preserving the
  current Turn, exact assistant answer and native history reference.
  Native default/mixed/control acceptance remains open; the failed CP-091
  PLAN output-limit run is not reclassified as a successful qualification.

- Published beta.42 adoption (2026-09-09): CP-091 selects
  `fb9736bf2af837404a43027631113232f0134b58`, checksum
  `7d0ba0ffaf22a3ce6bd65ce8e8c4f28d9cfce82802fdfc054489bc9757626a31`.
  Release completed at 19:13:17 UTC after 576/576 tests, lint/build,
  artifact/refs and isolated/global consumer verification. Source and pack
  remain `924ef61` and `dee7dba`; CP-090 remains immutable.
  CLI `3e1f87f` reuses an existing RUN control during EVAL scope drain,
  retaining its exact request/options; scope stop still escalates pause.
  The extended control/recovery gate passed 79/79 tests across nine files.
  Native default/mixed/control acceptance on this tuple remains open.

- CP-090 native follow-up (2026-09-09): both default/mixed preflights
  passed on beta.41. Default `EVAL-20260909182516-9014a32a` reached native
  SPECIFY and its interaction Judge, then exposed an observer race: the
  accepted answer Turn had resumed the Stage while the controller still
  reported `waiting_for_user`. Eval now replays accepted-answer events and
  observes the resumed Stage without duplicating the answer, including after
  reattachment. Missing unaccepted pause identities still fail closed.
  Focused tests: 14/14; full eval suite: 201 passed, 8 opt-in skipped.
  RUN stop is settled and recovery capture sealed at
  `RCV-c4055438-687e-44b5-a03a-712b53596092`; native Session is idle,
  not a claim that its retained daemon exited. Full native acceptance remains
  open; this failed run is not reused as a successful qualification.

- Published beta.41 adoption (2026-09-09): CP-090 pins release
  `a8be25a9ff2a4f772e2b006d29d23176cbd01736`, checksum
  `ae319bebf00ef8109d66fd870e84213e233b7ad6ca3116e3b865bad3377467ec`.
  Guarded release completed at 18:20:42 UTC: 576/576 tests, lint/build,
  artifact/refs and isolated/global consumers verified. Product and pack
  remain `924ef61` and `dee7dba`; earlier checkpoints remain unchanged.
  Default CP-089 run `EVAL-20260909173838-cfed7fde` exposed the generated
  hook's global PATH precedence before SPECIFY could start. CLI `c30ae89`
  now honors DD_FLOW_BIN, then the runtime shim, before global installations;
  a real-shell regression first reproduced the wrong global selection.
  The affected native Session and controller were physically stopped and
  RUN capture `RCV-ed356f2d-fc77-44d1-90e1-7530e90c6ed1` verified.
  Its EVAL dispatch fence remains in place until explicit recovery/resume;
  no resume was issued merely to finish the retained scope owner.
  Both CP-089 preflights and 37 published-CLI fixture integrations passed,
  but full native default/mixed/control acceptance remains unproven.

- Published beta.40 adoption (2026-09-09): release commit
  `652524c6f370aa17c75474de5ebb7b3b9bf0b3a2` passed 575/575 tests,
  lint and build; main/tag/artifact and isolated/global consumers verified.
  Receipt `dd-flow-cli:.tasks/release-0.9.0-beta.40.json` completed at
  17:32:43 UTC. Both consumers have engine checksum
  `42d498cfe876e1aadec3ab01a0b2079293ed176848287b38ec11c66c67bb294e`.
  CP-089 selects this artifact while retaining original product `924ef61`
  and flow-pack `dee7dba`; CP-088 is unchanged. The capture fix excludes
  managed shared Codex-home aliases and temporary entries, not owned evidence.
  Failed retry `EVAL-20260909162708-b1471fd1` is now stopped and sealed;
  its detached worker completed after recovery capture at
  `/Users/deksden/.dd-eval/conformance/capture-repair-EVAL-20260909162708-b1471fd1`.
  This cleanup does not convert the failed run into acceptance. Full native
  default/mixed/control and remaining harness acceptance are still open.

- Published-artifact E2E follow-up (2026-09-09): CP-088 and its exact test
  pins are committed/pushed at `dd-eval:7b6660a`. Default and mixed preflight
  passed baseline admission and Luna/Sol doctors with beta.39; no provider
  Sessions were created by preflight. Eval suite: 193 passed, 8 opt-in skipped;
  the separate published-CLI lifecycle integrations: 37/37, no skips.
  First full default `EVAL-20260909161904-638fbe57` failed before Subject
  creation: copied harness configuration retained retired adapter paths.
  `dd-eval:9c671c6` binds every copied adapter path to the selected isolated
  engine, preserving native executables and host configuration. Regression
  compares doctor and productive configuration; full eval suite passes again.
  Shared resource data migration archived 1041 physically dead unscoped
  registrations and attributed 3 live registrations using exact daemon
  receipts. Full recoverable backup: `~/.dd-eval/resources/runtime-before-scope-migration-20260909.sqlite`.
  The failed RUN's stop is now settled/sealed, worker completed, no pending
  reasons. Retry `EVAL-20260909162708-b1471fd1` is running on `9c671c6`;
  full default/mixed/control acceptance is still unproven.

- Coupled source/registry delivery (2026-09-09): canon 4.1.0 integrated at
  `ef349bf47cba1c987468e51d73a0dbadbd48dc1f`, annotated `v4.1.0` pushed and
  peeled SHA verified. CLI beta.39 main/tag/artifact identify
  `adabaee64d3de604908351aa1ee048208c1dd249` and that exact canon source.
  Guarded release completed at 16:10:01 UTC: 572/572 tests (52 files,
  1737.04 s), lint, strict build, tarball and refs readback, isolated/global
  consumer verification. Both installed engine checksums are
  `b868f40c7e070d0f05c9e6526660509ce89c79ef6bf057882967065289eed854`;
  compatibility is `ok`, npm `latest` remains 0.8.0, `beta` is beta.39.
  Receipt: `dd-flow-cli:.tasks/release-0.9.0-beta.39.json`.
  Eval adoption is integrated in main (`1d8d92f`); project flow pack 4.1.0
  is integrated/pushed at `dd-tasks:dee7dba1ae721ac1c2b12d8d9c5f16e0bbee0c8b`.
  CP-088 preserves original product source `924ef61` and selects this pack
  and published engine. Existing checkpoints and source tags are unchanged.
  Full native default/mixed/control E2E remains open. User reports Grok/AGY
  access blockers resolved; fresh qualification must verify that report.

- Source gates и подготовка Codex comparison (2026-09-09): CLI commit
  `803d2d0262cb6979fedd1a3e3001d7ce87cacba4` отправлен в feature-ветку;
  полный suite завершился: 572/572, 52 files, 1657.17 s. На этом commit
  отдельно пройдены полный lint (zero warnings) и typecheck.
  Eval preflight теперь создаёт unstarted logical RUN через публичный CLI
  prepare, проверяя все frozen routing profiles до doctor/provider launch
  (`d4a50773a81568add89f320e6fa2a70706ffa5e8`). Mixed Codex profile
  (`c1314d1`) сохраняет Luna coordinator и назначает external Sol только
  PLAN-REVIEW/CODE-REVIEW; comparison regression входит в 65/65 eval tests.
  Нативный Codex probe ниже не заменяет полный default/mixed RUN.
  Canon source `c762f517762b2b225af00d2d1c6403d827f75360` отправлен,
  назначение версии 4.1.0 ожидает решения пользователя. Coupled release,
  новый immutable checkpoint и published-artifact E2E остаются открыты.

- Codex active-native-child stop/resume PASS (2026-09-09), local digest
  `717aa1e58b61cfd56a1f78fad81fd7965de973a34de11b96c23f2fbd2e557870`.
  Receipt: `/Users/deksden/.dd-eval/conformance/codex-desktop-recovery-xe0NkP/receipt.json`.
  Root `01a0868b-f652-7f70-85e9-8cff63787cab` и child
  `01a0868c-9a46-7523-a423-f683f9d29e7f` наблюдались active до stop;
  physical drain подтверждён, release current, same-root prompt вернул исходный
  marker, final scope stop/replay settled. Это native Judge-owned tree probe,
  не полный RUN/default/mixed или published acceptance. Полный eval gate:
  195 passed, 8 opt-in skipped (28.22 s). Отдельно все opt-in integrations
  выполнены с текущим CLI: 37/37, 0 skipped, 84.77 s (включая RUN continuation,
  observer death, scope probe isolation и snapshot restore). Provider в lifecycle
  integrations — fixture, не native. Полный CLI gate ещё выполняется.

- Следующий Codex active probe (`codex-desktop-recovery-7dTKwg/receipt.json`)
  уже увидел active child и подтвердил cancel/settlement root+child, но drain
  остановился на `scope_provider_turn_reconciliation_required`: прерванный
  productive request имел durable failed result, исключённый из budget snapshot.
  Общий snapshot теперь включает completed/failed до свежей whole-tree observation;
  running/awaiting_provider не освобождаются. Assets+budget tests 30/30 и build PASS.
  Native повтор на исправленной сборке запущен; full acceptance остаётся открытым.

- Codex active-child probe выявил реальный inventory defect: native
  `collabAgentToolCall/spawnAgent` содержал sender/receiver Thread IDs, но bridge
  не извлекал из него parent relation. Неуспешный receipt:
  `/Users/deksden/.dd-eval/conformance/codex-desktop-recovery-MYt09N/receipt.json`.
  Общий topology observer теперь учитывает spawn receipts (не wait/send targets),
  в том числе вложенные history items; regression проверяет pendingInit и
  propagation активности child к root. Runtime assets tests 18/18 и build PASS.
  Повторный active stop/resume на новой сборке запущен; PASS пока не заявлен.

- Уточнение пользователя (2026-09-09): доводить каждую упряжку целиком,
  не подменять готовность цепочкой отдельных smoke PASS. Текущий фокус — Codex:
  полные flow/default/mixed, active native tree, stop/recovery, repeated control,
  model/usage и cleanup; затем тот же набор для остальных harnesses.
  На provider-hardened local digest
  `3d0c0cdf7339edd62cd77a7ba62c1aa64a3329ab1c2b79d2358fb8fde248b219`
  общий scope gate 38/38 (7 files, 78.31 s), OpenCode single-cycle smoke прошёл
  (`opencode-server-recovery-eSpxlQ/receipt.json` в conformance).
  Codex two-cycle pause/resume прошёл: generations 1 и 2, по одному актуальному
  native binding, оба release, same marker/Session и final stop/replay.
  Receipt: `/Users/deksden/.dd-eval/conformance/codex-desktop-recovery-UTAHHV/receipt.json`.
  Новый `--scope-active-stop` сначала требует наблюдаемого работающего child,
  затем выполняет recoverable stop/resume; Codex probe запущен, результата пока нет.

- Provider generation gate (2026-09-09): scope-stop больше не принимает
  provider по общему state directory. Daemon публикует exact provider binding,
  итоговый scope stop повторно сверяет registration signature и physical exit.
  Общая проверка используется в cooperative observation и archived settlement;
  чужой lease остаётся pending. После обновления fixtures под реальные parent
  birth/dispatch-barrier поля typecheck и focused tests прошли: 5/5, 10.57 s.
  Cooperative/archive negative tests отдельно: 11/11, 10.48 s.
  Новые native прогоны на этой усиленной сборке ещё не выполнены.

- OpenCode idle pause/resume PASS (2026-09-09): после исправления smoke
  bootstrap (doctor требует запущенный daemon), физический drain, один native
  binding, release, same-Session marker и final stop/replay прошли.
  Receipt: `/Users/deksden/.dd-eval/conformance/opencode-server-recovery-4jkILS/receipt.json`;
  Session `ses_f7987ff26ffeGb8WT9Phi9rEeQ`, тот же local digest `a44bdab8…`.
  Отдельно усилена provider generation binding в cooperative observation и
  archived settlement: exact provider ID/lease/PID и parent PID/birth.
  Предварительные focused tests 15/15, typecheck и scoped lint прошли;
  дополнительные проверки подмены provider lease запущены. Native PASS выше
  предшествует этому усилению; полный active-tree control не заявляется.

- Native Codex idle pause/resume PASS (2026-09-09): detached scope worker
  подтвердил physical drain и один актуальный native binding, release снял
  dispatch fence, третий prompt вернул прежний marker в той же Session
  `01a08673-ba24-73d2-9555-357a529d4732`; final scope stop и replay settled.
  Receipt: `/Users/deksden/.dd-eval/conformance/codex-desktop-recovery-TCJks2/receipt.json`.
  Local beta.38 digest: `a44bdab8aa2b013fad3935d7d86b71a7539ef245405b9b1fb7e3a5df54973025`.
  Owner regression suite: 10/10, 13.69 s; reordered JSON принимается,
  foreign owner и malformed JSON блокируются до остановки исходного daemon.
  Это idle Judge qualification, не активный RUN/child tree, repeated interruption,
  default/mixed до MERGE/Judge или published-artifact acceptance.

- Native pause probe (2026-09-09): physical drain и single-current-owner
  capture прошли; resume остался fenced из-за `runtime_scope_native_launch_required`.
  Причина: одинаковые runtime owner objects сравнивались как JSON strings
  с разным порядком ключей. Проверка заменена на exact structural equality;
  restart/lost-reply regressions используют обратный порядок ключей, suite 8/8.
  Scoped lint прошёл, обновлённая сборка запущена. Failed receipt:
  `/Users/deksden/.dd-eval/conformance/codex-desktop-recovery-x13PFb/receipt.json`.
  Cleanup scope stop подтвердил settled для обоих поколений; повторного
  productive prompt в failed resume не было. Live resume ещё не PASS.

- Cooperative history handling (2026-09-09): stop, scope observation,
  drain publication и resume admission используют общую проверку архивного
  daemon generation. Архивный процесс остаётся в physical settlement evidence,
  но не включается в `native_bindings` для повторного resume. Изменённый archive
  после capture блокирует resume. Focused regressions: 15/15, 3 files, 13.50 s;
  новая проверка включает physical process exit, capture и resume admission.
  Полный scope-related gate после сборки: 36/36, 7 files, 44.96 s.
  Opt-in `--scope-pause` добавлен к native smoke: detached scope worker,
  admission fence, capture только актуального owner, resume и третий prompt
  с прежним marker/Session, затем scope stop. Native Codex probe запущен;
  cooperative pause/resume на этой реализации пока не квалифицирован.

- Native Codex scope-stop повторно пройден (2026-09-09): retained-root
  restart, stop обоих зарегистрированных поколений и replay с теми же
  operation IDs. Local beta.38 digest:
  `40cae652f7a2c54db98b279db5498dd5393fc3406be5ecd9970a7eef00ba6ee5`.
  Receipt: `/Users/deksden/.dd-eval/conformance/codex-desktop-recovery-QgpUgR/receipt.json`.
  Архивное поколение требует exact owner/lease, завершённую регистрацию,
  clean-shutdown operation и отсутствие живого process tree; негативные
  проверки вошли в 4/4 scope-stop regressions. Build и scoped lint прошли;
  объединённый scope/control/worker/resume/budget/assets gate: 35/35,
  6 files, 28.30 s.
  Это idle Judge scope stop/replay, не active-tree pause/resume и не published
  qualification. Cooperative history path затем исправлен отдельно (см. выше).

- Native scope-stop probe (2026-09-09): opt-in `--scope-stop` в
  `tools/native-recovery-smoke.mjs` проверяет isolated Judge registration,
  штатный scope stop и replay после retained-root restart. Codex probe failed:
  adapter entrypoint в snapshot имеет mode 0644, а предыдущее stopped daemon
  generation ошибочно сопоставляется с новым `daemon.json`.
  Receipt: `/Users/deksden/.dd-eval/conformance/codex-desktop-recovery-JtD3xI/receipt.json`.
  CLI asset build теперь выставляет executable mode всем package bin entries;
  regression с прямым запуском без npm linking прошла 1/1. Обработка предыдущего
  поколения для scope-stop затем исправлена и проверена (см. выше).

- Model journal ownership (2026-09-09): неиспользуемый eval writer
  `observeModel` удалён. CLI тестирует canonical schema, replay deduplication
  и repair незавершённой строки (1/1); eval тестирует чтение canonical events,
  attribution и durable progress notification (2/2). Scoped lint и diff checks
  прошли. После удаления writer полный eval suite: 195 passed,
  8 opt-in skipped, 24.87 s. Объединённый CLI gate завершён: 16/16,
  2 files, 70.58 s — все 15 native-adapter fixture groups, включая
  daemon operations, managed daemon и model observations, плюс AGY boundaries.

- Managed daemon retirement (2026-09-09): lease/lifecycle/socket tests
  перенесены в CLI (3/3), с актуальным async ownership assertion.
  Eval больше не содержит managed registration/heartbeat/finish/start-cleanup
  и socket-stop helpers: реальные consumers оставили только runtime process
  transport и безопасную остановку baseline process group. Caller audit чистый,
  baseline/group regression 6/6, scoped lint и diff checks прошли.

- Полный CLI suite завершён (2026-09-09): 563 passed, 50 files,
  1629.44 s; nearby-canon failure не повторился. Новый daemon-operations
  fixture проверен отдельно: 5/5, включая overlapping stop coalescing.
  После переноса последнего caller удалён eval productive daemon dispatch;
  `daemon-operations.mjs` содержит только чтение receipts. Eval control/recovery
  regression: 23/23, scoped CLI lint прошёл. Managed lease helpers затем
  удалены (см. выше); общий release/native E2E DoD не закрыт.

- Daemon journal tests (2026-09-09): четыре at-most-once / late-reply /
  concurrent-publication scenarios перенесены к CLI implementation (4/4).
  CLI fixture создаёт реальный минимальный daemon state для актуальной
  ownership admission. Оставшиеся eval runner-recovery tests: 22/22;
  scoped lint и diff checks прошли. Последний stop-coalescing test затем
  перенесён, eval dispatch helper удалён (см. выше).

- Recovery settlement ownership (2026-09-09): native smoke загружает helper
  из собственного selected CLI runtime. Два settlement tests перенесены в
  CLI retained-daemon fixture; eval-копия `recoverySettlement` удалена вместе
  с её managed-daemon dependency. CLI fixture 3/3, eval recovery 4/4,
  scoped lint и diff checks прошли. Selected-runtime helper повторно подтвердил
  settlement сохранённых Codex/OpenCode/ZCode smoke roots без новых prompts.
  Полный eval suite после удаления: 203 passed, 8 opt-in skipped, 24.74 s.

- После ZCode pin qualification полный eval suite: 205 passed,
  8 opt-in skipped, 25.28 s (2026-09-09). Release auth precheck
  `npm whoami` вернул E401 Unauthorized; registry publication не запускалась,
  release gate требует восстановления npm-аутентификации.

- Grok 1.0.21 compatibility probe (2026-09-09) заблокирован:
  `acp_request_failed: Authentication required`. Старый profile pin не
  изменён; это auth blocker, не unsupported. Receipt:
  `/Users/deksden/.dd-eval/conformance/native-subagents/20260909130902736/grok-acp-xai-grok-4-6-high/capacity.json`.

- ZCode compatibility qualification завершена (2026-09-09): один native
  child запущен и завершён, failed/cancelled=0, cleanup stopped+clean.
  Повторный doctor подтвердил неизменный runtime; штатная команда обновила
  только ACP commit pin профиля Flash/high на
  `43f654bccdbb1aa4f4fb4617f7315c4336dbcde0`. Receipt:
  `/Users/deksden/.dd-eval/conformance/harness-compatibility/20260909130619839/zcode-acp-zai-glm-5-3-flash-high/receipt.json`.
  Это max-1 native child compatibility, не capacity-15 qualification.
  Retained-root smoke на обновлённом pin прошёл: exact READY и marker,
  same Session `sess_560e6611-399f-4310-bd8c-19d66255ee5a`, clean restart
  и final cleanup. Receipt:
  `/Users/deksden/.dd-eval/conformance/dd-zcode-recovery-ZQY1ou/receipt.json`.

- ZCode smoke admission (2026-09-09) отказал до prompt: runtime ACP 0.13.1
  имеет commit `43f654bccdbb1aa4f4fb4617f7315c4336dbcde0`, профиль закрепляет
  `3f3f09816005628c9474e641ffc6d93de478f6db`. Требуется compatibility
  qualification; старый pin не изменён. Receipt:
  `/Users/deksden/.dd-eval/conformance/dd-zcode-recovery-7BFh3S/receipt.json`.
  Codex 0.153.4 retained-root smoke с совпадающим profile pin прошёл:
  `codex-desktop-gpt-5-6-luna-xhigh-dd-flow-0-9-0-beta-11`, Session
  `01a08644-b8b8-79b2-b259-00bd4c6b0e5a`, receipt:
  `/Users/deksden/.dd-eval/conformance/codex-desktop-recovery-dwm2BE/receipt.json`.
  Doctor pin, READY, clean restart, same-ID exact marker и cleanup проверены;
  это локальный root-retention PASS, не full/published recovery E2E.

- Droid current-source smoke (2026-09-09): doctor подтвердил Droid 0.212.0 /
  factory protocol 1.201.0; оба native turns вернули reason=error,
  result.status=failed, пустой assistant_text и zero usage. Это не PASS
  retained context; причина native error пока не установлена. Cleanup clean,
  active_tree false; receipt:
  `/Users/deksden/.dd-eval/conformance/dd-droid-recovery-jWXI58/receipt.json`.
  Smoke теперь сохраняет doctor receipt и проверяет profile runtime pins
  до productive prompt. Droid/runtime contract regression: 71/71 passed.
  Добавлена проверка точного READY после первого turn: native error больше
  не приводит к ненужному restart/второму prompt; assertion сохраняет native
  outcome в диагностике. Причина ошибки провайдера в сохранённых событиях
  не раскрыта; результат не переклассифицирован в recovery failure/PASS.

- После isolated smoke setup полный eval suite прошёл: 205 passed,
  8 opt-in skipped, 27.35 s (2026-09-09). Запущен новый полный CLI suite.
  Native retained-root probe для OpenCode 1.18.25 / opencode big-pickle
  прошёл: same Session ID и exact marker после clean daemon restart;
  финальный daemon shutdown clean, active_tree false, cleanup_error отсутствует.
  Session `ses_f79c39f71ffeh6OMOrMk3lO9Pb`, receipt:
  `/Users/deksden/.dd-eval/conformance/opencode-server-recovery-GgkGko/receipt.json`.
  Локальный CLI beta.38 full-content checksum:
  `6d18469ee4759700b39d0b40985052fc9d58eaeb49376394f930f1f414fa41f2`.
  Это root retention PASS, не selective recovery и не published E2E.

- Current-source AGY retained-root probe (2026-09-09): AGY 1.1.27,
  `antigravity-cli-google-gemini-3-1-pro-high`, isolated selected CLI runtime.
  Первый prompt отклонён provider eligibility check: аккаунт недоступен
  в текущей локации, zero turns/usage. Verdict: blocked, не unsupported
  и не recovery PASS. Receipt сохранён локально:
  `/Users/deksden/.dd-eval/conformance/dd-agy-recovery-FSHnH4/receipt.json`.
  Provision regression теперь проверяет точные copied adapter bytes;
  setup/restore tests 3/3 passed за 1.14 s.

- Полный повтор `run-cli.test.ts` завершён (2026-09-09): 121/121 passed,
  1365.53 s. Nearby-canon case прошёл в порядке всего файла; причина его
  прежнего сбоя в полном multi-file suite пока не установлена.
  Native smoke setup теперь вызывает общий `provisionRuntimeEngine` в своём
  изолированном runtime и записывает выбранный engine в receipt; глобальный
  config home больше не используется как источник bundled adapters.

- Полный CLI lint после adapter/helper retirement и переноса fixtures прошёл
  (2026-09-09, `pnpm lint`, zero warnings). Длинный CLI regression ещё идёт;
  этот результат не заменяет native и published-artifact gates.

- Real-CLI opt-in recheck (2026-09-09): managed two-stage lifecycle и
  captured RUN restore прошли (33.65 / 23.80 s). Background EVAL resume
  встретил fixture launcher `EACCES`: symlink без расширения указывал на
  локальный non-executable `dist/cli.js`. Тест теперь создаёт собственный
  executable Node launcher, не меняя права CLI artifact; повтор прошёл
  (1/1 за 53.96 s), включая сохранение controller identity, recovery ACK,
  двух stage packets и остановку единственного background observer.
  Это fixture-provider integration, не native/published qualification.
  В initial-queue opt-in fixture исправлен второй прямой spawn локального
  JS entrypoint: скрипты запускаются через Node. Оба initial-queue варианта
  прошли адресный повтор (2/2 за 14.00 s). Общий runner-control opt-in прогон
  завершился 33 passed / 1 failed (старый initial-queue launcher); normal,
  killed, observer-killed и соседний EVAL stop scenarios прошли. Полный
  повтор файла с исправленным launcher прошёл: 34/34, 93.65 s, без skips.

- Retained restart helper retirement (2026-09-09): проверка identity/profile
  fences и архивирования clean receipt перенесена в CLI fixture (1/1 прошла),
  неиспользуемая eval-копия `authorizeRetainedDaemonResume` удалена.
  Оставшиеся recovery-safety tests: 6/6; scoped CLI lint прошёл.
  Полный eval suite после удаления: 204 passed, 8 opt-in skipped, 29.76 s.
  `recoverySettlement` пока сохраняется: кроме tests его вызывает
  `tools/native-recovery-smoke.mjs`; перенос этого потребителя ещё необходим.

- Shared helper retirement (2026-09-09): пять settlement scenarios из eval
  control/recovery tests перенесены в CLI fixture (5/5 за 0.42 s), scoped lint
  прошёл. После проверки отсутствия production/test callers удалены eval
  `dispatch-fence.mjs` и `session-settlement.mjs` (42 строки); retirement guard
  расширен. Остальные helpers всё ещё имеют реальные runner/baseline callers
  и не удаляются без переноса их обязанностей. Полный eval suite:
  205 passed, 8 opt-in skipped, 36.85 s.
  Nearby-canon case прошёл и в повторе всего `run-cli.test.ts`; сам файл ещё
  выполняется. Причина предыдущего intermittent failure остаётся недоказанной.

- ZCode retirement (2026-09-09): adapter/daemon tests перенесены в CLI,
  17/17 за 12.84 s; scoped lint прошёл. Удалены последние eval adapter
  implementation copies: ZCode bin/lib/daemon (1078 строк), отсутствие всех
  шести implementations проверяет retirement guard. Все шесть native adapters
  теперь находятся только в CLI runtime; общий helper audit ещё не завершён.
  В перенесённом тесте исправлен scope переменной journal для error diagnostics.
  Полный eval suite после удаления: 210 passed, 8 opt-in skipped, 40.60 s;
  полный CLI typecheck прошёл. Объединённый CLI adapter regression прошёл:
  11 wrapper cases в двух файлах, 89.61 s, все перенесённые fixtures включены.
  Это source-level cutover, не published-artifact acceptance.

  Полный CLI rerun завершён: 550 passed, 1 failed из 551 за 1994.91 s.
  Единственный failure — nearby-canon resolution; прежние controller failures
  не повторились. Изолированные/group повторы canon проходят, причина ещё
  не установлена. Запущен весь `run-cli.test.ts` с диагностикой ответа.

- Grok retirement (2026-09-09): daemon tests перенесены в CLI fixture;
  3/3 за 7.04 s. Два native sibling-cancel tests из eval control-plane
  перенесены в CLI Grok group; группа 8/8 за 3.85 s, scoped lint прошёл.
  После caller audit удалены eval Grok bin/adapter/daemon (478 строк).
  Retirement guard теперь перечисляет имена удалённых harness implementations.
  Полный eval suite после удаления: 227 passed, 8 opt-in skipped, 40.10 s. Из шести native adapter
  implementations в eval остаётся только ZCode; общие helper-копии ещё
  требуют отдельного caller audit.

- AGY retirement (2026-09-09): оставшиеся десять native adapter tests
  перенесены в CLI fixture; daemon entrypoint и module imports направлены
  на CLI runtime. Прямой прогон 10/10 за 12.38 s, scoped lint прошёл.
  После caller audit удалены eval `bin/dd-agy.mjs`, `lib/dd-agy.mjs`,
  `lib/dd-agy-daemon.mjs` (514 строк), расширена проверка отсутствия копий.
  Полный eval suite после удаления: 232 passed, 8 opt-in skipped, 38.36 s. Оставшиеся adapter
  implementations в eval: ZCode и Grok; control/release/native qualification
  остаются отдельными открытыми gates.

- OpenCode retirement (2026-09-09): source-contract проверка lifecycle
  routing перенесена из eval к CLI OpenCode fixture; 5/5 за 4.25 s.
  Сравнение AGY boundary tests подтвердило полное покрытие существующим CLI
  fixture (плюс дополнительный process-group сценарий); wrapper прошёл
  за 11.22 s. Удалены дублирующий eval test (308 строк) и OpenCode
  `bin/dd-opencode.mjs`, `lib/dd-opencode.mjs`, `lib/dd-opencode-daemon.mjs`
  (277 строк), расширен retirement guard. Полный eval suite после удаления:
  242 passed, 8 opt-in skipped, 56.69 s; scoped CLI lint прошёл.
  Остались AGY, ZCode и Grok implementations.

- Codex retirement (2026-09-09): adapter tests, pre-dispatch cancellation
  test и terminal-systemError test перенесены в CLI fixtures. Последние
  проверяют CLI adapter/daemon, не eval implementation. Прямой прогон:
  26/26 за 6.94 s; общий wrapper шести групп: 6/6 за 28.31 s (до переноса
  дополнительного terminal-systemError case). После caller audit удалены
  eval `bin/dd-codex.mjs`, `lib/dd-codex.mjs`, `lib/dd-codex-daemon.mjs`
  (509 строк). Проверка отсутствия retired implementation расширена.
  Полный eval suite после удаления: 254 passed, 8 opt-in skipped, 32.68 s;
  scoped CLI lint прошёл. CLI production не менялся;
  текущий полный CLI gate не включает добавленный позже wrapper. Остались
  четыре adapter implementation: AGY, ZCode, Grok, OpenCode.

- Droid retirement (2026-09-09): adapter/daemon tests и их native fixture
  перенесены в CLI и проверяют `src/harness-runtime` без eval checkout.
  После проверки всех callers удалены eval `bin/dd-droid.mjs`,
  `lib/dd-droid.mjs`, `lib/dd-droid-daemon.mjs` (589 строк); тест запрещает
  возвращение этих копий. Четыре CLI fixture-группы OpenCode/Grok/Droid
  проходят за 19.16 s; scoped lint и полный typecheck прошли.
  Полный eval suite после удаления: 281 passed, 8 opt-in skipped, 43.27 s.
  Снижение числа eval tests отражает перенос coverage, не удаление сценариев.
  Проверка `droid-observation` reader также перенесена в CLI; оставшаяся
  идентичная копия helper удалена из eval (ещё 66 строк). Consumer test EVAL
  проверяет progress/deduplication на model events без native log parser.
  CLI Droid group: 14/14, eval consumer: 2/2; scoped lint прошёл.
  После удаления helper полный eval suite: 280 passed, 8 opt-in skipped,
  36.02 s; перенесённый parser test учтён в CLI group.
  Остальные пять adapter implementations ещё требуют retirement.
  Групповой canon regression прошёл 15/15, но intermittent failure полного
  CLI прогона пока не объяснён. Полный прогон остаётся активным.

- Retirement adapter tests WIP (2026-09-09): четыре OpenCode и шесть Grok
  проверок перенесены из eval в CLI `test/fixtures/*-adapter.mjs` и запускаются
  существующим Node-test/Vitest подходом через `native-adapter-contracts.test.ts`.
  Imports направлены на CLI `src/harness-runtime`, без eval checkout. Обе группы
  прошли (8.04 s), scoped lint прошёл. Eval-owned копии adapter implementation
  ещё нужны другим неперенесённым проверкам; этот шаг не закрывает R05/R08.
  Полный eval suite после OpenCode-переноса прошёл 306 tests / 8 opt-in skipped;
  после Grok-переноса — 300 passed / 8 opt-in skipped за 45.06 s. Текущий полный CLI
  прогон был начат до добавления wrapper и не доказывает его включение в gate.
  В нём наблюдался новый failure nearby-canon resolution; два отдельных повтора
  прошли, групповая проверка canon запущена. Причина ещё не установлена.

- Полный CLI gate (2026-09-09) завершился за 1724.42 s: 549 passed,
  2 failed из 551, 48/49 test files passed. Обе ошибки — старые ожидания
  `run-controller.test.ts`: отсутствие controller-exit receipt и ровно один
  SIGTERM для повторного pending local stop. Текущий контракт сохраняет
  доказательство physical exit и допускает повтор exact PID/birth/lease stop
  после окна intent-before-signal; provider operation при этом не replay.
  Ожидания обновлены; controller/admission regression прошёл 38/38 за 63.75 s.
  Полный `pnpm lint` прошёл. Этот результат не объявляется зелёным full gate;
  повтор полного suite запущен и ещё выполняется.

- Изолированный EVAL control runtime WIP (2026-09-09): первоначальный
  `executeEval` устанавливает engine в `control-runtime` до публикации manifest
  под общим lifecycle lock. Manifest сохраняет локальный executable, а не
  изменяемый глобальный CLI. Используется существующий installer/shim;
  control-only установка не требует конфигурации provider. Проверка с реальным
  source-built CLI заменяет временный ambient launcher после создания EVAL и
  проверяет сохранённый `version` и доступность `runner control status` через
  локальную копию. Это не published-artifact evidence и не проверка защиты
  от изменения самого retained runtime. Полный EVAL suite после изменения:
  310 passed, 7 opt-in skipped (50.29 s); дополнительный real-CLI вариант
  проверяется отдельно. Полный CLI suite всё ещё выполняется.

- EVAL observer registry WIP (2026-09-09): CLI принимает локальную роль
  `eval-observer` без Subject RUN/Work/Session. Общая проверка требует EVAL owner,
  scope и стабильный operation ID; `check-admission` учитывает scope fence,
  не расходуя provider capacity. Регистрация одной операции атомарно исключает
  второго активного наблюдателя. `register --kind eval-observer` требует PID
  живого наблюдателя и атомарно подтверждает его birth identity в той же
  транзакции. Реальный выход клиента после INSERT или подтверждения до commit
  не оставляет частичной регистрации. Pause закрывает допуск, stop/cancel завершают
  его собственный процесс; соседний EVAL не затрагивается. Scope release
  учитывает только прекращение локальных записей, а неизвестный Judge/другие
  операции продолжают блокировать release через проверку журнала.
  Build, typecheck и scoped lint прошли; 44/44 теста пяти runtime-модулей прошли
  за 34.98 s, включая конкурирующие публичные CLI регистрации.

- Фоновое продолжение EVAL WIP (2026-09-09): публичный `control resume`
  сохраняет intent отдельно от captured journal и запускает detached observer.
  До release он не регистрирует productive scope resource; после release
  получает атомарную регистрацию, проверяет допуск и вызывает общий
  `runner resume` с точным request ID и digest исходного manifest.
  Status показывает отдельно сохранённое состояние continuation и ошибки.
  Три real-process проверки прошли: нормальный выход клиента, убийство клиента
  и убийство зарегистрированного observer перед продолжением. Повторный запрос
  заменяет только доказанно мёртвого владельца; очередь начинает ровно одну
  operation и сохраняет предыдущие файлы. Проверка намеренно заканчивается на
  fixture-защите до provider preparation — это не native productive qualification.
  Чужая регистрация отклоняется без finish/stop. Полный аудит остальных crash
  windows, уже исполняющегося managed RUN и native/published gates остаётся открыт.
  Потеря наблюдения managed RUN (общая классификация observation loss) и
  таймаут ожидания lifecycle owner больше не завершают observer: он сохраняет
  регистрацию и повторяет общий `runner resume` после проверки допуска.
  Два subprocess-теста подтверждают повторное чтение retained RUN binding,
  одну регистрацию, отсутствие нового launch/stop и прекращение попыток при
  несовпадении engine или новом stop. CLI в этих тестах — fixture; успешное
  native-продолжение и поведение опубликованного runtime ещё не квалифицированы.
  Полный suite: 310 PASS, 6 opt-in SKIP, 34.310 s; обе новые проверки отдельно
  повторно прошли после упрощения fixture CLI (7.648 s).

- Сквозной background EVAL → retained RUN WIP (2026-09-09): новый opt-in
  `test/eval-resume.integration.test.mjs` использует настоящий CLI, installed
  engine, registry, scope pause/release и штатное восстановление native Session.
  Публичный EVAL `control resume` переживает выход клиента, получает один
  observer и завершает `protocolize` после уже завершённого `specify`.
  RUN/controller и контексты сохраняются, первый snapshot не меняется,
  каждый этап вызывается один раз; модели меняются `model-first` → `model-second`.
  Recovery ACK относится к исходной Session. Адаптер провайдера остаётся fixture:
  это проверка реального runtime, но не native-provider/published qualification.
  В процессе найдено реальное зависание boundary capture: каждое открытие
  SQLite пересоздавало актуальный merge-index и writer triggers. Инициализация
  теперь преобразует только прежний UNIQUE index; повторное открытие текущей
  схемы не меняет schema/data_version. Обе регрессии воспроизводили ошибку до
  исправления; 22 storage/capture проверки, build, typecheck и scoped lint прошли.
  Новый EVAL тест прошёл за 40.766 s; затем три opt-in интеграции (background
  resume с ACK, direct lifecycle и restore) вместе прошли за 106.521 s.
  Полный EVAL suite: 310 PASS, 7 opt-in SKIP, 68.265 s при параллельных gates.
  Полный CLI suite после этого storage fix запущен; итог пока не подтверждён.

- Первоначальный EVAL и continuation теперь используют один lifecycle lock:
  общий путь `eval run` и qualification удерживает его до итоговой проекции,
  начиная до публикации manifest. После ожидания повторно проверяется operator
  control. Две регрессии проверяют запрет публикации очереди при новом stop
  и конкурентный `runner resume` после публикации manifest: он ждёт исходного
  владельца и не запускает вторую operation. Это локальные проверки с защитой
  до provider preparation, не квалификация активного native RUN.
  Полный suite после изменения: 308 PASS, 6 opt-in SKIP, 28.482 s, exit 0.

- Scope resume WIP (2026-09-09): detached CLI worker готовит RUN и native
  Sessions, затем публикует сохранённый допуск под блокировкой общего registry
  и всех участвующих RUN. Повторный запрос не запускает второго worker;
  новый stop делает предыдущий допуск неактуальным. Проверены реальные
  процессы controller/worker с fixture-адаптером, включая два runtime-home:
  удержание writer второго RUN не допускает продолжение первого; после
  снятия блокировки оба получают ровно одно подтверждение восстановления,
  завершённая Work сохраняется. Это не qualification реальных провайдеров.
  EVAL применяет допуск отдельным идемпотентным событием журнала. Обычный
  `runner resume` использует общий путь запуска для ещё не начатой очереди,
  а для начатых операций — существующий путь наблюдения/восстановления.
  Продолжение сериализовано с recovery и применением release общим lifecycle
  lock; после ожидания заново проверяются stop/cancel и, если задан, текущий
  resume request ID. Два одновременных resume не повторяют запуск очереди.
  `runner control resume --wait-ms 0..60000` ограничивает наблюдение, включая
  зависший CLI, lifecycle/journal lock и очередь записи. По умолчанию — один
  приём локального запроса без ожидания release; transport ceiling — 60 s.
  Истечение срока возвращает pending и тот же request handle. `accepted` теперь
  обозначает сохранение EVAL intent, `runtime_accepted: null` — отсутствие
  подтверждения runtime; если не доказан и локальный приём, `accepted: null`.
  Запись, отменённая до начала commit, позже не
  применяется; повтор после таймаута повторно проверяет текущий release.
  Неверный wait budget возвращает exit 2, accepted/pending — exit 0.
  Полный EVAL suite: 306 PASS, 6 opt-in SKIP, 31.999 s; scope-control opt-in
  проверки ранее отдельно прошли с собранным CLI. Resume opt-in повторно прошёл
  через публичный bounded-wait CLI; новый фоновый маршрут проверен выше
  тремя opt-in сценариями за 77.138 s.
  Неизвестные исходы прерванной подготовки до RUN,
  native/published qualification и остальные delivery gates остаются открыты.

- Storage WIP: новые `db.sqlite` и `runtime.sqlite` атомарно получают writer
  contract; добавляемые runtime-таблицы получают те же fences. Команда
  `storage migrate-writer --database … --backup … --offline` сохраняет WAL-safe
  backup и подтверждение в транзакции изменения контракта. Повтор после
  потерянного ответа проверяет исходный путь и digest backup; чужая база,
  изменённая копия, неизвестный или NULL owner status не принимаются.
  Подтверждение миграции исключается из переносимого RUN snapshot.
  Проверены 7 migration tests и 2 scoped snapshot variants. Это ещё не
  автоматическая координация внешних owners: `--offline` требует их остановки
  оператором; прерванный до commit backup сохраняется, повтор требует нового пути.
- Eval gate после scope-control и удаления legacy productive paths (2026-09-09):
  полный suite — 279 PASS, 2 opt-in skipped, 36.844 s, exit 0.
  2 opt-in integration tests ранее отдельно включены и прошли с локальным собранным
  CLI. Проверены двухстадийный managed lifecycle с disconnect/reattach и
  восстановление RUN перед provisioning pinned engine. Lifecycle использует
  fixture adapter: это не native provider и не published-artifact qualification.
  Полный CLI suite на согласованных исходниках и сборке завершился 2026-09-09:
  509/509 PASS, 46 файлов, 2878.87 s, exit 0. В прогон включены migration receipts,
  конкурентные launch/stop/resume и ожидание блокировки при открытии SQLite.
  Это локальный source/build gate, не published-artifact acceptance.

- C09 WIP: `runtime scope fence|status|stop` использует общий registry;
  eval-wide cancel закрывает admission, останавливает Subject через RUN control
  и запрашивает native shutdown остальных зарегистрированных ресурсов.
  Подтверждены отдельные физические daemon/provider процессы, сохранение живого
  соседнего EVAL и повторное чтение clean-stop receipt без replay — с fixture
  adapter, не с реальными провайдерами. Cancel intent/observation сохраняются
  в журнале; поздний ответ старого клиента не изменяет новое состояние.
  Resource home сохраняется в manifest и передаётся cancel/Judge/managed resume.
  Последний полный eval suite: 279 PASS, 2 opt-in skipped, 36.844 s; обе opt-in проверки
  ранее отдельно прошли за 20.08 s с локальным CLI. Frozen control executable,
  полный probe ownership, native qualification и eval pause/resume остаются
  открытыми; C09 и общая поставка не считаются завершёнными.

- Доступен read-only `runner control status --eval <path> [--execution <id>]`:
  retained RUN receipts читаются через CLI, общий EVAL inventory — через
  `runtime scope status`. Недоступные bindings остаются явно unknown; раздельные
  read snapshots не выдаются за aggregate settlement. Проверка не загружает
  case/profile, не стартует Judge и не меняет experiment journal. Mutating
  `runner control pause|stop --eval <path> --request-id <id>` теперь сохраняет
  intent и запускает CLI scope owner; ordinary `runner resume` не снимает этот
  запрет. Новые execution и Final Judge не dispatch при operator intent.
  Execution-scoped mutation, operator resume, cooperative notification и общий
  доказанный settlement ещё не подключены; этот маршрут не закрывает R07.
  Наблюдение `control_requested` оставляет execution operation незавершённой
  (`operation.suspended`), не переводит pause в cancel/failure и не запускает
  assessment. Поздний reconciled result завершает ту же operation без replay.
  Это проверка клиентского пути с fixture CLI, не native pause/resume qualification.

- Удалены eval-owned fallback snapshot/capture helpers и unmanaged terminal
  reconciliation. Recovery читает sealed capture только из RUN control receipt;
  отсутствие managed binding требует миграции, а не запуска старого пути.
  Старые данные этим изменением не удаляются; retirement остальных legacy
  adapter/helper путей и полный R08 остаются открытыми.
  Resolver adapter теперь требует bundle выбранного runtime: fallback на
  configured adapter или `dd-eval/bin` удалён. Capacity/compatibility qualification
  используют изолированный engine runtime в config-only режиме; дочерний процесс
  не наследует ambient Flow ownership. Native qualification этого пути ещё нужна.
  `package.json` eval теперь экспортирует только `dd-eval`, не шесть CLI-owned
  adapter-команд. Сами локальные adapter fixtures/исходники ещё удерживаются
  прямыми тестовыми import и подлежат переносу/удалению; это не закрывает R05/R08.

- В CLI реализованы detached managed controller, capture границ и control
  worker; в eval добавлен `managed-flow-client` для наблюдения CLI controller.
  Это уже существующий исходный код, но retirement старых productive paths,
  eval-wide control и native/published qualification ещё не завершены.
- Control worker сам регистрирует свой физический процесс после атомарного
  claim. Проверены повторные падения владельца, окна claim/register/link,
  handed-off child и два конкурентных клиента: 12/12 на свежей локальной
  сборке. CODE/recovery/MERGE regressions: 42/42. Полный suite для этого
  source/build tuple ещё выполняется; предыдущий прогон со старым dist
  имел 18 failures и не считается final gate.
- R09: clean baseline `924ef61752b642f06c2c326b444ed7a3239f20ff`
  прошёл same-tree/cross-tree isolation, quality и 6 browser tests;
  независимый DB readback подтвердил cleanup всех шести invocation.
  Native keyboard qualification остаётся `qualified: false` / skipped,
  main integration открыта. Подробности:
  [test-world qualification](../runbooks/test-world-qualification-2026-09-08.md).

  Delivery update: инфраструктурные изменения интегрированы fast-forward и
  опубликованы в `dd-tasks main` как
  `69ebee20485b8bc6b221d5ef561f96df5df8b2c9` с remote readback.
  Foundation и оба source-package preview сценария прошли, включая
  retained-volume restart. Post-merge quality, 8 browser tests, docs и
  isolation прошли; cleanup БД/containers/volumes проверен отдельно.
  Исходный baseline и immutable tags не изменены; native keyboard limitation
  остаётся явным, это не полная e2e/runtime acceptance.

Ниже сохранён исходный implementation-срез; формулировки «ещё не подключён»
и «открыт controller» в нём не отменяют текущего WIP выше и не служат
свидетельством готовности поставки.

- R01/R02: eval commit `2b21424` отправлен в
  `fix/cross-harness-recovery-and-fallback`; полный eval suite — 261/261.
  Это доставка в topic branch, не интеграция в main и не новый CLI release.
- CLI implementation: `feature/operator-control-completion`, основана на
  `e1d723e` (beta.38). AGY hook-фильтр перенесён в bundled runtime;
  adapter regressions — 12/12. Исходный WIP integration checkout сохранён.
- R06 WIP: RUN сохраняет значения всех заявленных agent profiles; external
  Work и server MERGE используют frozen значения. Work override выбирает
  работника, не координатора. External launch проверяет RUN stage и recovery
  generation между подготовкой и productive dispatch.
- Продолжение RUN теперь проецирует требуемый профиль и session mode следующей
  стадии; same-session MERGE проверяется до старта. Это ещё не подключённый
  сквозной managed controller. Полный CLI suite продолжается; финальный gate
  нужно повторить для окончательного source/build tuple.
- Открыты: общий long-lived controller и eval cutover; физическое stage
  handoff; qualified native overrides и late-bound Work profiles;
  pause/stop/resume всего owned tree; non-Work ownership; baseline integration;
  совместимые releases и published-artifact E2E/control/recovery qualification.

Шесть adapters уже включены в CLI beta.38. R05 означает завершение переноса
controller и retirement eval copies, а не повторный перенос готовых adapters.

## 1. Место в существующих планах

Это актуальный порядок оставшихся работ, а не новый независимый runtime.
Выполненные исправления из 031 не реализуются повторно. Технические владельцы:

- [026](026-interrupted-eval-recovery.md): recovery, immutable inputs,
  interrupted segments, reconciliation и selective continuation.
- [029](029-cross-harness-defects-and-observable-fallback.md): fallback,
  control/terminal, baseline и изоляция проверок.
- [030 lifecycle](030-native-child-lifecycle-integrity.md): physical identity,
  native children, dispatch и settlement.
- [030 adoption](030-shared-runtime-adoption-and-mixed-execution.md): граница
  CLI/eval, mixed execution, роль Judge и общий контроллер.
- `dd-flow-cli:.memory-bank/plans/shared-harness-runtime-and-mixed-execution.md`:
  WP-00–11 и V-01–42; настоящий план уточняет, в частности, WP-06.
- `dd-memorybank:.memory-bank/spec/engineering/SPC-013-shared-harness-runtime-and-execution-policy.md`:
  канонический контракт. Изменения контракта синхронизируются там.

## 2. Исходный срез и незакрытые результаты

Срез предыдущего status-аудита, а не вечные сведения о ветках/версиях:

| Область | Что уже есть | Что остаётся |
| --- | --- | --- |
| Recovery | Durable evidence, frozen identity, protection от duplicate dispatch; два live восстановления с продвижением до CODE | Полный controlled recovery E2E до MERGE и Judge; матрица отказов/повторных прерываний |
| Cancel | `runner cancel`, ранний fence и owned-tree cancellation | Это terminal cancel, не recoverable operator pause/stop |
| Статус eval | Execution/report/Judge evidence доступны | После повторного failed recovery верхний status ошибочно остаётся `awaiting_provider` |
| Шесть упряжек | Native root/restart/cleanup evidence и контрактные проверки | Stop/resume всех owned children, selective capability и полный release-artifact acceptance |
| Droid | Native transport/hooks/Work binding и clean same-ID resume smoke | Full scored E2E; forced close не доказывает same-ID resumability; selective child control отдельно |
| AGY | Lifecycle/ownership исправления и наблюдаемая topology | Завершить текущий фильтр control notifications, regressions и доставку; unknown model/usage не объявлять observed |
| Shared runtime | План, canonical direction и context-envelope foundation | Перенос adapters/controller из eval, mixed execution, pause/stop и adoption |
| Интеграция | CLI beta.38 — наблюдавшийся artifact; части canon уже в main | Eval topic changes ещё не равны main; canon main не равен новому release tag; проверить baseline branch |
| Качество Subject | Normal cp-079 дошёл до MERGE/Judge; более поздний recovery-run дал неполный outcome | Разделить runtime acceptance и продуктовые findings; не заявлять успешный продукт по clean cleanup |

При подготовке этого файла `dd-eval` находился на
`fix/cross-harness-recovery-and-fallback`, HEAD `7e11914`; dirty:
`lib/dd-agy-daemon.mjs`, `test/agy-state-boundaries.test.mjs`, `test/dd-agy.test.mjs`.
Это не разрешение включить их в docs commit. Перед реализацией снять свежий
inventory всех четырёх repo, worktrees, upstream и staged/unstaged ownership.
Количество файлов и commits из старых отчётов не использовать вместо проверки.

### Доказанная ошибка верхнего статуса

`lib/runner.mjs:appendRunEventOnce` дедуплицирует событие по type/data за всю
историю. `finalizeFromResults` повторно получает одинаковый terminal payload
после нового recovery segment; новое completion событие отбрасывается как
старое. Recovery-start уже перевёл reducer в `awaiting_provider`.

Исправить ключ идемпотентности на идентичность актуального segment/generation
и принятой result revision. Не отключать дедупликацию глобально и не править
`state.json` вручную. Проверить всех callers, reducer, report/status/Judge
paths и reconciliation исторического журнала без переписывания evidence.

## 3. Операторский контракт

### 3.1 Семантика

| Действие | Поведение | Возобновление |
| --- | --- | --- |
| Pause | Сразу закрыть новый dispatch; попросить owned agents закончить текущую работу на безопасной границе и завершить turn | После доказанного quiescence; сохранить сессии, где это возможно |
| Stop | Сразу закрыть dispatch и инициировать native interrupt всего owned tree; при необходимости явно разрешённая эскалация | Тот же logical RUN/Work через reconciliation, native continuation либо разрешённый replacement |
| Resume | Снять операторскую остановку только после проверки ownership, settlement и recovery readiness | Не новый эксперимент, не повтор completed Work, не обход HITL |
| Cancel | Существующая окончательная отмена | Resume не воскрешает cancelled RUN |

Pause по умолчанию кооперативная: timeout оставляет честный pending и список
неостановленных nodes. Автоматическая эскалация разрешена лишь явно выбранной
политикой. Stop означает recoverable interruption, но не обещает сохранение
RAM, native history или отмену уже отправленного внешнего действия.

### 3.2 CLI surface — проектируемая, ещё не доступная

Предлагаемое семейство, окончательно закрепляемое в shared WP-01:

```text
dd-flow run control pause  --run <RUN> [--grace-ms <n>] [--escalate interrupt]
dd-flow run control stop   --run <RUN> [--force]
dd-flow run control resume --run <RUN> [--from <control-id>]
dd-flow run control status --run <RUN> --json

dd-eval runner control pause|stop|resume|status --eval <path> [--execution <id>]
```

Это один controller/API, eval — scope resolver и experiment bookkeeping.
Существующий `runner resume` сохраняет reconciliation-семантику;
`runner recover --from <interruption-id>` сохраняет аварийное восстановление.
Общая внутренняя resume/recovery логика не дублируется. Короткие aliases
добавлять только после проверки конфликтов help/CLI и единого routing.

Для мутаций предусмотреть idempotency request ID, bounded wait и JSON receipt.
Receipt содержит request/control ID, scope, generation, requested/applied mode,
per-node status, unsettled reasons и resumability. Timeout возвращает operation
handle и pending, не ложный успех; повтор команды наблюдает ту же операцию.
Численные deadlines/exit codes закрепить в WP-01 и проверить CLI tests.

### 3.3 Scope «все сессии»

Flow command охватывает root, native children всех уровней, external worker
roots, active checks и зарегистрированные mutating subprocesses выбранного
RUN, включая детей, обнаруженных во время drain. Не все сессии аккаунта/хоста.

Eval command с execution ID охватывает только этот execution. Без него —
все исполнения выбранного EVAL, принадлежащие ему Judges/probes и admission
новых repetitions/assessment. Каждый ресурс сохраняет свой owner/role;
Judge не получает Subject Work binding. Status показывает resolved scope.
Чужие процессы, shared services и unrelated browser tabs не останавливать.
Для ресурсов, которыми нельзя безопасно управлять, указывать pending/unknown.

## 4. Протокол физической остановки

1. Сохранить durable control intent и закрыть admission в общем ownership/
   generation arbiter до profile probes, сетевого наблюдения и agent message.
2. Снять inventory из authoritative bindings и native topology; учесть late
   launch и незавершённые durable operations. RAM dispatch fence переиспользовать
   как дополнительную защиту, не выдавать его за crash-safe storage barrier.
3. При pause доставить steer/control notification или trusted safe-point request
   всем адресуемым исполнителям. Упряжка без steer не получает выдуманный ACK:
   использовать подтверждённый hook/turn-boundary путь либо pending.
4. Agent ACK означает только получение/готовность. После ACK агент завершает
   turn, не ждёт resume в sleep loop и не начинает новую Work.
5. При stop использовать native interrupt/cancel operation. Если parent command
   доказанно останавливает subtree, не дублировать native вызовы каждому child,
   но settlement доказать для каждого node.
6. `--force` допускает native close и затем termination точно принадлежащего
   runtime process tree при поддержке платформы. Проверить PID/start identity,
   owner и scope. Нельзя `killall`, stop всех homes или SIGSTOP как основу pause.
   Локальный kill не доказывает прекращение удалённого provider job.
7. Подтвердить idle/stopped и отсутствие mutating checks по всем owned nodes.
   Живой idle daemon допустим для pause при доказанном dispatch barrier.
   Неизвестный remote side effect остаётся отдельно unresolved.
8. Сохранить stop receipt и recovery evidence существующим capture механизмом.
   Capture после quiescence либо с явными consistency limitations; ошибка capture
   не мешает emergency stop, но блокирует недоказуемое resume.

Control plane остаётся доступным при provider quota/auth/network failure,
malformed observe и недоступном profile. Ошибка одного node не отменяет попытки
остановить остальные. Не запускать provider session ради stop/status.

## 5. Состояния, гонки и возобновление

Расширение существующей control projection, не новая независимая БД:

```text
running -> pause_requested -> paused -> resuming -> running
running/pause_requested/paused -> stop_requested -> stopped -> resuming
```

`paused/stopped` — не terminal outcome Work. Пока settlement неизвестен,
сохраняется requested с per-node pending. Сбой resume оставляет fence и
понятный interrupted/control state; не теряет предыдущий receipt.

- Повтор request идемпотентен; concurrent pause/stop/resume используют один arbiter.
  Stop может усилить pause; старый resume не отменяет новый stop.
- Resume до settlement запрещён. Terminal cancel/fatal не воскрешается;
  при complete-first вернуть terminal/no-op. Late evidence допускается без
  изменения уже принятого candidate/outcome старой generation.
- Во время drain доступны status, usage, ACK и допустимый finish уже начатой
  Work. Следующая Work/стадия/MERGE не dispatch. Проверить guards после await
  и непосредственно перед native productive call во всех entrypoints.
- HITL остаётся отдельным: ответ можно сохранить, но не применить как повод
  продолжать paused RUN. Operator resume не отвечает на HITL и не снимает blocker.
- Paused time исключается из productive liveness/time budget; drain имеет
  собственный deadline. Usage остановки учитывается, не исчезает из отчёта.
- Crash после native interrupt до persist и после persist до отправки сообщения
  восстанавливается по durable intent/receipt. Lease expiry не разрешает
  takeover без проверки старого owner. Выход CLI-клиента не отменяет request.

Resume сначала reconciles dispatch/finish/check/MERGE receipts, затем выбирает
только незавершённые Work по DAG. Same-session — лишь при доказанной capability.
После forced close replacement должен быть явно разрешён policy и отражён новой
physical identity/segment, сохраняя logical RUN/Work, исходный packet и hashes.
Если policy отсутствует, вернуть `recovery_required`, не начать replay молча.
Completed Work переиспользуется; parent не respawn уже продолженного child.

Потеря ответа после внешней мутации — unknown outcome: сначала reconcile,
никакого blind retry. Hard stop во время git/check/DB операции не обещает
rollback. До productive resume проверить repository/locks/transactions и
сохранить uncertain operations. Credential refresh не подменяет frozen model,
engine, input или account policy. Секреты не входят в capture/prompt.

## 6. Очерёдность оставшихся пакетов

| Пакет | Содержание и владелец | Зависимость / критерий выхода |
| --- | --- | --- |
| R00 | Inventory четырёх repo, evidence ledger, ownership текущего WIP | Зафиксированы реальные SHA/artifacts и открытые gates, без массового reset/add |
| R01 | Eval: исправить generation-aware terminal projection | Регрессия failure → recover → тот же failure дважды; status/report/journal согласованы, Judge не дублируется |
| R02 | Eval/AGY: завершить control-notification фильтр и sibling-path аудит | Не теряются legitimate child messages/results; focused и полный suite, scoped commit/push |
| R03 | Текущий recovery: закрыть незавершённые 026/029/030 lifecycle regressions | Unknown outcome/no replay, repeat recovery, preserved Work/inputs; live gaps явно перечислены |
| R04 | Shared WP-00/01: зафиксировать API, capabilities, migration/retirement map | Утверждён один control arbiter, storage и CLI; согласованные canon/eval contracts |
| R05 | Shared WP-02/03: перенести шесть adapters и managed controller/MERGE в CLI | CLI package запускает flow без eval checkout; старые пути имеют removal gate |
| R06 | Shared WP-04/05: mixed strategy, profiles, context, ownership, usage | Default/native и explicit external не смешаны; model/usage unknown честно отражены |
| R07 | Shared WP-06: реализовать §§3–5 pause/stop/resume | Durable admission, cooperative и force paths, all-owned settlement и safe resume |
| R08 | Shared WP-07/08: canon, eval adoption, schemas/migration, docs/help | Нет второго productive drive loop; historical artifacts читаются, immutable inputs не изменены |
| R09 | dd-tasks baseline: завершить ранее scoped test-world/keyboard qualification | Изоляция двух invocation/checkout; source branch интегрирована по policy; новый baseline при необходимости |
| R10 | Интеграция, candidate tests и согласованные releases | WP-09/10, проверенные remote main SHA, tags, registry artifacts и compatibility tuple |
| R11 | Published-artifact qualification и delivery evidence | WP-11: full default/mixed/recovery/control E2E, readback, curated manifest и итоговые verdicts |

Основная цепочка: R00 → R01/R02/R03 → R04 → R05 → R06 → R07 → R08 → R10 → R11.
R09 идёт отдельным scoped пакетом и блокирует зависящие от baseline acceptance.
Документы/contract tests для R07 допустимо готовить после R04; production control
не дублировать временно внутри eval. При необходимости срочного R01/R02 release
выпустить узкий corrective tuple, явно не объявляя shared/control delivery готовым.

R03 проверяет готовые foundations до переноса; R11 повторяет критичные проверки
после cutover на published artifact. Это разные gates, не двойная реализация.

## 7. Проверки и честная capability matrix

Для Codex, ZCode, Grok, OpenCode, AGY, Droid завести evidence-строку с exact
version/digest/OS/config и verdict по каждой capability: steer, safe-point ACK,
root interrupt, full tree stop, external root stop, selective child stop,
same-ID resume после cooperative pause, resume после interrupt, forced-close
replacement, restart reconciliation, model identity и usage coverage.

PASS только с соответствующим evidence. `unsupported`, `unknown`, `blocked`
не взаимозаменяемы; отсутствие auth/quota не доказывает unsupported.
Root smoke не доказывает selective child resume; Droid clean-close same-ID
smoke не доказывает forced-close resume. Provider ограничения объяснить вместе
с безопасным доступным маршрутом, не имитировать capability prompt-ом.

Обязательные сценарии сверх existing V-01–42 и H-T matrix:

| ID | Сценарий | Проверяемый результат |
| --- | --- | --- |
| C01 | Pause: root + native grandchild + external Work + active check | Нет нового dispatch; ACK отдельно; paused только после полного safe point |
| C02 | Unresponsive/steer-unsupported child | Bounded pending; explicit stop/escalation; не ложный paused |
| C03 | Stop/force при quota, auth, socket timeout, malformed inspect | Fence сохраняется; остальные nodes остановлены; unknown remote job виден |
| C04 | Pause/stop против launch, late hook, Work finish и MERGE | Нет duplicate worker/следующего writer; допустимый результат сохранён |
| C05 | Два CLI-клиента: duplicate request и stop против resume | Один owner, request replay безопасен; stale generation не запускает turn |
| C06 | Crash на каждом intent/send/ACK/settlement/capture шаге | Reconcile без нового дерева и без потери stop intent |
| C07 | Same-session и replacement-only resume; второе прерывание | Logical Work/input сохранены, completed не повторены, lineage полная |
| C08 | Pause поверх HITL; ответ во время pause; pause при MERGE | Нет повторного ответа/снятия blocker; git state проверен до resume |
| C09 | Eval-wide stop с Judge/probe и второй соседний EVAL | Все выбранные роли остановлены, сосед не затронут, role isolation сохранена |
| C10 | Одинаковый terminal payload после двух recoveries | Новый segment финализирован; status/report согласованы; один Judge на принятую revision |
| C11 | Stop unknown-side-effect tool call; потерянный ACK | Нет автоматического replay; resume blocked до reconciliation/явного решения |
| C12 | Fresh published CLI install без eval sources, CLI client exit | Обычный flow и control работают; controller остаётся владельцем |

Сначала deterministic adapter tests и настоящие двухпроцессные race tests,
затем bounded live smoke и full E2E. Не исчерпывать реальные квоты и не усыплять
хост: quota/network/sleep boundaries инъектировать безопасно. Native live
подтверждение не заменять mocks. Полные repo gates — по 031 и project policy.

R11 включает: normal до MERGE/Judge; controlled interruption с selective
recovery до MERGE/Judge; cooperative pause/resume; forced stop/recovery; repeated
interruption; default и mixed из одного semantic entry pack. Результаты runtime
и качества Subject публикуются отдельно. Findings по архивному UI, atomic guard,
feature evidence и PLAN handoff из прежнего Judge не закрываются control tests;
продуктовое исправление требует отдельного scoped решения, если не входит в R09.

## 8. Доставка и Definition of Done

Порядок coupled release сохраняется из 031: final canon source commit → strict
CLI candidate build с exact canon SHA → candidate gates → publish/readback CLI →
compatible canon tag/release → eval integration/adoption → fresh installed
artifact и новый immutable checkpoint → qualification/evidence.

Не менять существующие immutable runs/tags и не пересобирать ту же version с
другим digest. Не продвигать beta в latest/stable автоматически. Private eval
поставляется проверенным pushed main revision; искусственный npm release не нужен.
Миграция общей DB требует writer compatibility/drain и корректного backup с WAL;
старый pinned engine сам по себе не разрешает запись в новую schema.

Для каждого R-пакета вести: owner repo, source/integration SHA, tests/evidence,
remote delivery, открытый blocker. Общий delivery manifest связывает CLI/canon/
eval/baseline/harness identities, registry integrity, installed readback,
checkpoint, E2E/control/recovery IDs и capability verdicts. Не требуется новый
dashboard или параллельная система учёта: достаточно существующего ledger.

- [ ] Верхний status корректен после повторных recovery; текущий WIP доставлен.
- [ ] Все заявленные control команды работают из обычной установки CLI и eval.
- [ ] Stop охватывает всё owned дерево; partial/unknown никогда не показывается success.
- [ ] Pause и hard stop имеют проверенные маршруты resume без duplicate Work.
- [ ] Общий runtime действительно в CLI, eval не содержит второй controller.
- [ ] Mixed/default, model/usage provenance, role isolation и migration gates пройдены.
- [ ] Controlled recovery и operator-control E2E имеют published-artifact evidence.
- [ ] Нужные commits/push/main integration/releases/readback завершены.
- [ ] Исторические результаты сохранены; runtime и product-quality verdicts разделены.
- [ ] Ограничения каждой упряжки и реальные blockers перечислены в итоговом отчёте.

До выполнения этих пунктов статус всего пакета — partial, даже при зелёных
unit tests, опубликованной beta или одном успешном normal E2E.
