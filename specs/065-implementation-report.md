# 065 — implementation report

Дата: 2026-10-05. Статус: **T01–T33 реализованы, offline G1–G5 PASS**.
Это не receipt живой qualification/E2E; live acceptance **NOT RUN**.

Исторические EVAL/native artifacts и их frozen definitions не менялись;
продукт и semantic corpus/Judge требования не исправлялись. В исходной case
definition для будущих запусков обновлены только baseline policy@2 и её hash
pin, как требует план; старые receipts/checkpoints сохраняют прежние bytes.
Новые E2E/qualification, paid provider calls, npm publish и глобальная
установка candidate не выполнялись. Дополнительная разрешённая задача —
восстановление уже установленного Codex hook — описана отдельно ниже.

## Реализация T01–T33

План: `specs/065-operation-progress-and-inactivity-plan.md`.
Исходные commits: FLOW `776112522e59fab5c977d43b0c0c1cd5b54940eb`, EVAL
`58a5fc2fa589a38ff890efd865b5c20104224ff8`. Runtime candidate: beta.125.
Изменения находятся в ветках `fix/064-managed-lease-renewal` и
`fix/064-managed-lease-eval`; canonical repository не изменён.

| Пункт | Исправление и executable regression |
|---|---|
| T01 | Qualification и capacity chain без общего elapsed-work cap; EVAL judge-capacity/capacity-policy |
| T02 | External reviewer/worker/MERGE productive awaits без caller lifetime cap; FLOW external-work-launch/merge-server |
| T03 | Explicit null проходит wrappers; FLOW harness-adapter, EVAL process-json |
| T04 | ZCode standalone quiet policy; actual adapter-progress fixture |
| T05 | Codex current Turn, early-before-ACK projection; actual adapter-progress |
| T06 | Fresh progress/terminal reread до quiet verdict; operation-observation/adapter-progress |
| T07 | ACP quiet probe singleflight и rearm; actual adapter-progress |
| T08 | Проверенные children и текущая generation; actual adapter-progress |
| T09 | Productive allowlist и thought chunks, без cosmetic progress; actual native fixtures |
| T10 | AGY daemon-owned operation clock и semantic dedup; actual AGY fixture |
| T11 | AGY print-timeout=0; native argv/progress fixture |
| T12 | Droid/OpenCode semantic progress, без history replay; actual adapter-progress |
| T13 | Clock gaps/restart не дают бесконечных grants; paired observation-clock tests |
| T14 | Atomic cursor/timestamp, задержанный polling не даёт второе окно; paired clocks/operation observation |
| T15 | Check inactivity/startup отдельно от lease; command-progress/code-checks |
| T16 | Startup/baseline@2 sliding и сохранение @1; runtime-service/baseline-admission |
| T17 | Utility/RPC/recovery phases отдельно; operation observation/process-json/recovery budget |
| T18 | Все шесть bundled entrypoints, обычные suites и installed/cold checks |
| T19 | Exact original-operation reconciliation; unknown не повторяет dispatch; EVAL operation-errors/runner-recovery |
| T20 | EVAL utilities конечны, phase progress и owned cleanup; process-json/managed-flow-client |
| T21 | Portable native utility helper, env tombstones до spawn; operation observation/driver fixtures |
| T22 | MERGE lease failure aborts transport с сохранением primary; merge-server |
| T23 | Service startup→serving; quiet ready service допустим; runtime-service/code-checks |
| T24 | Generation/terminal/fresh progress после await; runtime-scope-worker/Droid/ACP fixtures |
| T25 | Duration bounds и clock skew/stale semantics; paired clocks/flags/command-progress |
| T26 | Baseline renewal перед admission, loss aborts command, closing/drain; baseline-admission/runtime-maintenance |
| T27 | Persisted settlement-inactivity@1, legacy и exact late terminal; runner-recovery/run-control-worker/recovery-budget |
| T28 | Semantic cache отдельно от runtime ABI/installed identity; release/candidate/EVAL identity tests |
| T29 | Unavailable process probe → unknown, не missing; engine-installation/command-progress |
| T30 | native-operation-wait@1 во всех adapters; ACK отдельно от productive await; actual native fixtures |
| T31 | Smoke cancellation по native_dispatch barrier, не sleep; EVAL native-dispatch-barrier; live smoke НЕ запускалась |
| T32 | Quiet/output/transport loss не provider terminal; unknown fence/exact late result; operation-errors/daemon/native contracts |
| T33 | Backpressure/bounded reply, diagnostic tail и typed summary, physical close; harness-adapter/process-json/native fixtures |

Базовые fix commits для T01/T19/T20/T26/T27/T28/T31 — EVAL `9c8c7b3`;
для остальных shared FLOW paths и adapter projections — FLOW `9ca6bb3`.
T03/T13/T14/T25/T30/T32/T33 затрагивают оба commits. Последующие уточнения:
T19/T32 — FLOW `aa7e11e`, `b57858e`, EVAL `a6e5f6a`, `d7321c4`, `54cfddf`;
T20/T21/T33 — FLOW `c4aa76c`, `fb6819f`, `37fd6f6`, `80f45fc`, EVAL
`b69a0b9`, `a5a95f1`, `b7bbf8b`; T24/T27 — FLOW `978f428`, `37cc9e0`,
EVAL `8db3581`; T26 — FLOW `d62b7d8`, `96a48b8`, `80f45fc`, `fc159b4`,
`6dcfa73`, `8555768`, EVAL `b7bedb2`, `cdb81f8`.

Named regressions (имена находятся в обычных targets выше, а не только в
standalone acceptance probes):

- Clock: `delayed observation does not grant a second full inactivity window`,
  `repeated gaps cannot replenish an uncertain operation`, `equal timestamps
  with distinct scoped cursors are valid activity`.
- Actual adapters: `ACP admits only current work and rolls genuine checked
  child chunks to the parent`, `Codex binds early current events before ACK
  without old Turn or usage replay grants`, `AGY foreign terminal and replayed
  same-step snapshots do not renew`, `OpenCode snapshot replay, old assistant
  edits and new user content do not renew model work`; all-six invalid flags,
  whole replies/control readers и native stream backpressure в том же fixture.
- Utility/Judge: `operational helpers renew quiet windows from output, not
  total elapsed work`, `Judge prompt has native inactivity ownership, not a
  competing caller work cap`, `local quiet/output loss is not a provider
  terminal; paired runtime agrees`, `invalid native transport JSON reconciles
  the exact completed ledger without another dispatch`.
- Baseline/ownership: `baseline policy@2 is sliding and rejects mixed legacy
  policy fields`, `baseline owner loss exits despite continuing output and
  failed physical cleanup`, `baseline custody@1/@2 uses one monitored grant
  before its command`, `rearms an early maintenance queue timer without
  renewing the original deadline`.
- Recovery/cancel: `settlement inactivity renews only new physical proof and
  preserves legacy policy`, `automatic reconstruction cannot replenish
  uncertainty or resurrect exhausted recovery`, `cancel qualification requires
  the exact native dispatch, not another Session or requested intent`.

Статус каждого T ID: offline regression PASS на принятом третьем frozen
round; live/native qualification NOT RUN. Source receipt — final frozen tuple
ниже; packed/installed receipt не заменяет provider-specific live qualification.

Lease/authority/native-hook deadlines, bounded cleanup, lock waits, продуктовые
SLA и UX waits не становятся продуктивным progress. Изначальные native attempt
5 s и uncertainty 30 s не увеличены. Бесконечное productive ожидание возможно
только с конечным native inactivity outcome и сохранённым owner/fence.

## Дополнительные дефекты, закрытые при реализации и ревью

- Env overlay возвращал удалённые identity/credential keys: tombstones
  доходят до spawn, checked binding отделён от ambient identity.
- Typed error исчезал после эвикции stderr tail: bounded typed summary
  сохранён отдельно, successful stdout не отвергается по stale diagnostic.
- Первый успешный renewal обходил uncertainty budget; episode начинается
  до RPC, late ACK и future expiry не дают новый grant. Baseline обеих
  версий использует один monitored admission, без второго unchecked RPC.
- Dead control owner оставлял stale running/capture-pending: blocker
  публикуется только по exact death и generation/token/snapshot CAS.
  EVAL consumer учитывает failed-worker snapshot; fresh reconcile не blocked
  старым snapshot. Исходная provider error сохраняется.
- Observer cleanup отменял unknown Judge Turn: normal/final/supplemental
  и Interaction Judge сохраняют reconciliation fence при observation loss;
  known invalid result по-прежнему инициирует owned cancellation.
- Maintenance проверял installed inventory/probes вместо выполняемого
  engine: in-process engine проверяет свой build manifest без router scan.
  Normal routing и mandatory snapshot integrity проверки не ослаблены.
- CLI argv parsing eagerly загружал native shell AST: shared lazy parser
  загружается только при shell parse, кешируется только после успешной
  инициализации. Cold fixture включена в обычный Vitest, не только standalone.
- Pending registry row считалась физическим stop authority: fixture drain
  ждёт PID/birth confirmation и сохраняет root при неизвестном settlement.
  Ошибки одной cleanup не пропускают другие callbacks; own child всегда joined,
  primary failure не перекрывается ошибкой cleanup/finally.
- Confirmation возвращал ACK и running с неполной process/owner birth:
  fresh legacy+UTC observation обязательна до write; typed no-effect failure
  допускает только exact-id/token retry внутри прежних budgets.
  Observer guard выполняется до создания registry. Initial confirmation
  наблюдает зарегистрированного владельца даже без optional ownerPid override.
  Running incomplete identities не переписываются, не получают ACK и не retry;
  compatible legacy-only identities остаются совместимыми.
- Queue timer мог проснуться до monotonic deadline и выдать ложный timeout:
  повторно проверяем оставшееся время и rearm только остаток прежнего окна,
  без grace period. Deterministic early-wakeup regression сначала падает на
  прежнем коде; исходный physical-flight fence при истечении сохраняется.
- EVAL initial observer registration/direct baseline confirmation обходили
  selected retry policy для временной недоступности PID birth. Observer получает
  explicit ID один раз; повтор допустим только для exact typed pre-write
  physical-identity refusal с теми же ID/options/token. Unknown COMMIT, cleanup
  uncertainty и ownership fences не повторяются. Late ACK/budget exhaustion
  не допускаются через status-adoption fallback; bounded diagnostics сохраняют
  exact action/process ID и committed/no-effect факт без credentials.
- Orphan-check fixture подтверждала child с вымышленным мёртвым owner:
  fixture теперь создаёт реального launcher, подтверждает child при живом
  owner, затем завершает и join launcher. Production identity guard не ослаблен.
- Node автоматически исполнял module-mocked helper из `test/` без требуемого
  флага: helper перенесён в `scripts/fixtures`, обычный regression wrapper
  по-прежнему запускает все три native-outcome случая с нужным флагом.
  Это исправление discovery, не exclusion/skip regression.

Ponytail: использованы существующие clocks, receipts, retry policy и ownership
guards; новый scheduler/retry framework/dependency и receipt migration не вводились.

## Codex hook: два home

Установленный dd-flow beta.124 сохранён. Причины прежних failures: отсутствующий
Node в PATH hook subprocess (exit127) и не подготовленное default hook storage.
Owned dd-flow PreToolUse получил явный Homebrew PATH; default store подготовлен
штатным installed CLI. `~/.codex-cpa/hooks.json` остаётся symlink на
`~/.codex/hooks.json`; cx/CODEX_HOME, auth/config и другие handlers не менялись.
Runbook `runbooks/update-harnesses.md` документирует оба home, explicit
preparation и обновление hooks. Это не автоматическая SessionStart migration.

После перезагрузки обе конфигурации проверены с PATH=/usr/bin:/bin:
nonparticipating ambient payload, exit0/{}; symlink сохранён, provider calls0.
Это проверка запуска hook, не доказательство interactive trust/reload или
authenticated managed-hook admission во всех сценариях.

## Verification и честные ограничения

Первый persistent evidence root (неуспешный round, сохранён отдельно):
`/Users/deksden/Documents/_Projects/_worktrees/dd-plan065-verification.pVc8uN`.
Каждый normal full round фиксирует FLOW/EVAL/canon hashes и clean worktrees;
pack и installed проверяют frozen tuple и bytes. Late-ACK installed probe
подменяет только maintenance wire; cold installed CLI проверяется реально.

Focused actual-source identity/late-ACK: 43/43 PASS,0skip. Cleanup/parser:
2/2 выбранных PASS,160filtered; это НЕ замена full integration.
Typecheck PASS; первый lint FAIL4 в новых fixture globals/finally исправлен,
повторные typecheck/lint/strict build PASS.

До перезагрузки были failed/interrupted normal rounds; их нельзя считать
приёмкой этой revision. Предыдущие receipts были в /tmp и исчезли после
перезагрузки; результаты сохранены в истории задачи, но final gates
запускаются заново и сохраняются вне /tmp. Неуспехи не relabelled PASS.
Ранние подтверждённые отдельные fixes: source selector, Judge unknown cleanup,
pending registry race и initial confirmation identity; затем owner sibling path.

Retained pre-store failure без store_open не доказывает SQLite cause и не
различает loader/scheduling/pre-store admission. Grok startup failure имел
незаконченное обязательное engine snapshot materialization до INSERT RUN;
не доказан provider dispatch. Lazy AST не объявляется лекарством от всех
5-секундных failures. Unrelated processes/VM не закрывались.

Первый новый frozen round FLOW fc159b4/EVAL54cfddf закрыт:
typecheck/lint/build/release/pack/installed PASS; runtime41/42PASS,1FAIL;
integration2195/2197PASS,2FAIL; EVAL521/522PASS,1FAIL,0skip;
installed late-ACK probe FAIL на early queue wakeup. Это не G5 PASS.
Причины: queue объявляла expiry с remaining_ms1, orphan fixture подтверждала
несуществующего owner, Node discovery исполнял helper без module-mocks flag.
Холодный installed CLI, все61 runtime files и три ABI contract checks PASS.
Ни один failure не выдан за успешную приёмку.

После исправлений main-agent actual-checkout проверки: maintenance30/30 PASS;
orphan+newqueue selected8PASS,74filtered (не full acceptance);
EVAL baseline/maintenance/launch45/45PASS0skip; worker2/2PASS0skip.
Первый typecheck сообщил отсутствие существующего runtimeProcess export в
declaration; добавлена точная signature, повторные typecheck/lint PASS.

Второй новый frozen round запущен на FLOW c3a8b3b / EVAL01f7650 / canon2e57b987
в `/Users/deksden/Documents/_Projects/_worktrees/dd-plan065-final.b1wTxn`.
Этот round закрыт: integration2203/2203PASS, EVAL542/542PASS0skip,
typecheck/lint/build/release/pack/installed и18installedlateACK checks PASS.
Runtime41/42PASS,1FAIL: новая early budget validation выходила раньше common
diagnostic handler. Validation перенесена в existing guarded path; invalid
clock values дают remaining_ms0, no-effect proof и credential-free context.
Focused actual managed-daemon fixture24/24 и late-ACK unit30/30 PASS;
typecheck/lint PASS. В третий frozen round входит это исправление, не waiver.

Третий frozen round: FLOW `855576800c5b08bfd2135ad62459c234543c0558`,
EVAL `01f76509114208bdc98367950efc1036a984658c`, canon
`2e57b987ec91b7c3b0fa97f6169047802a1233fb`;
`/Users/deksden/Documents/_Projects/_worktrees/dd-plan065-round3.aJpW4t`.
Этот round терминально завершён с exit0. Verifier и его owned children
закрыты; FLOW/EVAL worktrees были clean, все три HEAD совпали с frozen tuple.
Только после этого обновлены plan/report. Итоговые docs-only изменения EVAL
не объявляются частью ранее выполненного code acceptance tuple: executable
code, case definition, тесты и helpers по сравнению с `01f7650` не менялись.
Новый definition commit всё равно требует fresh qualification перед E2E.

| Gate | Итог |
|---|---|
| typecheck | PASS |
| lint | PASS |
| strict canonical build | PASS |
| release | 2/2 node:test + 8/8 Vitest PASS |
| runtime-sensitive | 42/42 PASS;2 файла;135.15s |
| integration | 2203/2203 PASS;126 файлов;1623.83s |
| EVAL, normal serial suite с exact paired source | 542/542 PASS;0 fail/cancel/skip/todo;259791.574291ms |
| local candidate pack | PASS |
| real installed/cold CLI + maintenance + hook transport | PASS;61 runtime files byte-equal;6 adapter entrypoints;3 contracts |
| installed late-ACK/queue checks | 18/18 PASS;подменён только maintenance wire;native provider calls0 |

`gates.tsv`, `full-*.log`, `installed-reviewed065-receipt.json` и проверочные
scripts сохранены в third-round evidence root. Cold installed CLI проверен
с выключенным compile cache. Contracts: `operation-progress@1`,
`operation-errors@2`, `native-operation-wait@1`.

Candidate SHA256:
`293e32fb6265743fe91f0c06811c1d075ecbe48bf9a3e24629fd9452a8c71beb`.
Installed engine snapshot SHA256:
`fbbc1e249aac8e1e626990ae16fe77f3aacdf8dac65ff9a30df13085c1a835a9`.
Повторный `codex-hook-final.log` в этом evidence root подтвердил оба home.

Реализация завершена. Никаких новых E2E/paid qualification/публикации или
глобального переключения на beta.125 в этой задаче не выполнялось. Предыдущие
failures сохранены как failures; этот PASS относится только к указанному tuple.
