# Реализация исправлений native continuation и lifecycle admission

План 061 реализован в FLOW и EVAL, обязательная offline приёмка прошла полностью. Исправляются только flow, упряжки и tooling; продукт и исторические EVAL не изменяются. Этот отчёт не утверждает, что опубликованный engine обновлён или новые scored E2E успешно прошли.

## Изменения

Native child normalization вынесена из существующего FLOW reducer в общий модуль `native-children@1`. FLOW использует TS facade; productive EVAL owners загружают контракт из проверенного pinned engine, без source или ambient fallback. Passive Codex items используют существующий общий classifier. Доказательство завершения инструмента связывается с точными Session, Turn и item, восстанавливается из owned journal и не заимствуется из другого Turn.

Terminal overload продолжает ту же Session только после проверки точного failed Turn, effects, owner boundary и settlement. При доказанно живых owned children сохраняется intent и выполняется ожидание без отмены siblings. Controller атомарно сохраняет refusal, intent, resume reference и event под writer transaction с проверкой owner/generation. Retained successor наблюдается, а не отправляется повторно. Mixed-child fanout не превращает eligible overload в преждевременный failed Work. Quota, authentication и неизвестный dispatch не получают автоматического retry; правило двух continuation refusals за две минуты сохранено.

Shell uncertainty отделена от lifecycle participation. Обычная динамическая команда без распознанного lifecycle leaf не открывает storage и не отравляет Session. Known unsupported lifecycle execution остаётся fail-closed. Auxiliary `work repair add` и `stage block` проходят общий parser во всех ingress, не получают lifecycle capability. Correctable ACP refusal требует issued identity и persisted CLI barrier; произвольный `error.details` не является доказательством. Assigned cwd связывается общим resolver, а actual CLI подтверждает physical directory; prompt cwd не выдаётся за native observation.

Native outcome сохраняется отдельно от обязательного observation failure. Общие bounded serializers сохраняют typed reason, cause, explicit false retryability и cleanup. AGY terminal classification едина для native, pre-init и direct fallback; frozen quota time и identity сохраняются при repeated reads/restart. Relative reset duration отображается как оценка от исходного события, а не от времени очередного poll. EVAL хранит полную recovery диагностику, передаёт Judge компактную очищенную projection, включает material facts в revision и валидирует actual producer errors строгой schema. Mandatory observation failure классифицируется как tooling infrastructure failure, а не valid run.

## Дополнения после ревью

- Закрыто crash window между standalone refusal и atomic controller intent: normal preparation теперь имеет один atomic write; terminal burst/deadline всё ещё сохраняют refusal.
- Creation-looking Codex activity из неизвестного метода не назначает parent. Self-parent отклоняется и для spawn, и для supported creation activity. Communication не перепривязывает managed root.
- `structuredClone(Error)` больше не удаляет AGY metadata: ledger сохраняет structured error record.
- Mandatory phase journal failure не предоставляет capacity authority даже после native overload.
- Ошибка публикации EVAL client ledger после dispatch сохраняет known native receipt и typed observation failure без replay; identity mismatch сохраняет исходный identity code вместе с observed receipt.
- Пустой native receipt до создания Session не маскирует исходную provider error; installed contract проверяет null receipt и AGY pre-init quota вместе.
- Полный integration выявил соседнюю observation-context asymmetry: fanout wait отправлял сокращённый `session inspect` без cwd, project root и model. Mixed-child цикл воспроизвёл `invocation_receipt_timeout` и issued invocation без event. Controller теперь использует общий `sessionArguments` и для этого inspect; тест проверяет launch context каждого poll, без увеличения таймаутов или обхода admission.
- Raw error на входе report/evidence/revision теперь проходит существующий bounded serializer: oversized, non-string и cyclic значения не выходят через дублирующиеся поля сообщения и кода.
- Обновлены устаревшие fixture contracts: correction сообщает существующий assigned cwd; compound auxiliary распознаётся без lifecycle authority; восстановление Codex ancestry использует подтверждённый pending `thread/read`, сохраняя отрицательные проверки arbitrary objects и unsolicited replies.
- Supplemental Judge fixture теперь включает exact built native contracts до checksum. Старое source-regex ожидание прямого parent заменено runnable проверкой: чужой parent сохраняется как provenance, но не увеличивает direct-child capacity; model text не создаёт child.
- Повторный полный FLOW gate выявил лишний cwd guard для неизвестного CLI target: stable project identity fallback был принят за assigned execution route. Общий resolver теперь возвращает отсутствие assignment для неизвестного Work/RUN, а cwd validation применяется к доказанной assignment. Native launch-root qualification controlled platforms сохранена отдельно. Regression проверяет unknown Work и RUN из feature cwd; assigned-route fixtures создают настоящий Work/RUN и сохраняют отрицательные проверки.

## Карта регрессий

Проверки находятся в существующих suites, без нового test framework. Столбец «старый дефект» описывает подтверждённый механизм; отдельно ниже перечислены действительно выполненные old-HEAD controls, чтобы не выдавать source audit за запуск старого полного suite.

| План | Старый дефект | Сохраняемая проверка |
| --- | --- | --- |
| R01 | Passive и interrupted items давали ложное pending | Codex fixture: `CP189 passive items and exact completion phases do not invent pending tools`; exact owned journal restore |
| R02 | Live owned children блокировали continuation без durable intent | `codex-capacity`: retains root refusal before two live children; retained running successor without redispatch; controller-state atomic rollback/stale owner/generation |
| R03 | Overloaded child преждевременно failWork при live sibling | `run-controller-stages`: complete cycle `mixed`; `vnext-fanout-storage`: mixed overload и ordinary failure |
| R04 | Communication и arbitrary parent-looking objects меняли ancestry | Codex fixture: interaction cannot reparent root; late trusted spawn; unknown notification; creation/spawn self-parent |
| R05 | EVAL idle и foreign/conflicting children расходились с FLOW | Installed native contracts; capacity transcript native leaf/foreign/terminal Turn conflicts |
| R06 | Zero-leaf shell uncertainty считалась lifecycle failure | `hooks-shell`: uncertainty versus executable participation; `native-hook-ingress`: ordinary unresolved shell across ingress; Codex ordinary command no storage |
| R07 | ACP auxiliary игнорировался при native participation | Auxiliary native/ACP refusal fixtures и `native-hook-ingress` auxiliary rows |
| R08 | Correctable no-effect refusal poisoned ACP | `zcode-invocation-observer`: trusted persisted issued-command refusal versus forged details |
| R09 | Droid PreToolUse терял no_effect | Droid native fixture: pre-tool no-effect и unknown post-tool negative control |
| R10 | Assigned route связывался не во всех ingress | `lifecycle-invocations`: assigned physical route, foreign literal cd, actual CLI physical aliases, immutable/relative malformed route |
| R11 | Native completion и primary observation reason терялись | Codex/ZCode/Grok native completion observation fixtures; mandatory phase journal failure |
| R12 | Quota timestamp изменялся при read/restart, fallback классифицировал иначе | AGY native classifier и repeated ERROR/restart/new failure; OpenCode frozen identity; EVAL reset estimate invalid-duration controls |
| R13 | JSONL/recovery теряли cause и false retryability | FLOW `harness-adapter`: full JSONL error; EVAL `process-json`: JSONL/exit-zero typed errors и bounded cycles |
| R14 | Judge projection/revision теряли decisive diagnostics | EVAL execution/failure producer projection, material diagnostic revision и redaction tests |
| R15 | Judge error report нарушал strict schema | `evidence-schema`: actual Judge error report strict quota projection |
| R16 | Observation-loss codes расходились | All-harness installed contract parity; controller capacity lost observation без replay |
| R17 | Mandatory observation failure считался valid run | Actual report producer infrastructure validity и primary tooling versus secondary provider cause |

Выполнены old-HEAD controls: passive item pending и parent authority unknown notification (2/2); прежний serializer отдавал alias к mutable details, новый возвращает detached record с сохранёнными cause и false retryability; subagent capacity probe old owner не сохранял intent при живых children. Mixed-child observation-context defect дважды воспроизведён до исправления: в полном suite и isolated cycle. Остальные прежние дефекты установлены CP189 evidence, source audit и offline probes плана; новые runnable regressions проверяются итоговыми gates. Полный старый suite для каждого R отдельно не запускался.

## Приёмка

Рабочие ветки: FLOW `fix/cp187-matrix-admission`, EVAL `eval/cp188-agy-update`. Base commits и protected checkouts перечислены в плане. Canon 4.1.2, commit `2e57b987ec91b7c3b0fa97f6169047802a1233fb`; package version не меняется (`0.9.0-beta.124`).

Подтверждённые gates на свежей strict-canon сборке:

- `pnpm typecheck`, `pnpm lint`, strict-canon `pnpm build`: PASS.
- `pnpm test:runtime-sensitive --reporter=dot`: финальный повтор 30/30 PASS, 2 files, 132.83 s. Промежуточный повтор под параллельной нагрузкой дал 29 PASS и Droid wrapper timeout; timeout не увеличивался.
- `pnpm test:release`: 2 Node checks и 8 Vitest checks PASS, включая исполнение copied assets вне source tree.
- Полный EVAL `node --test --test-concurrency=1` с тремя bound env из плана на последней strict-canon сборке: 407/407 PASS, 0 FAIL, 0 SKIP, 0 cancelled, 0 todo; 529688.158042 ms. Предыдущий успешный повтор занял 273821.9465 ms.
- Финальный полный FLOW `pnpm test:integration --reporter=dot`: 110/110 files, 1933/1933 PASS, без FAIL/SKIP; 2710.90 s. Повтор с 1931 PASS и 2 FAIL обнаружил лишний cwd guard для unassigned Work. Следующий повтор: 1932 PASS и 1 FAIL — metadata-prefix fixture ожидала assigned cwd без реального Work. Fixture теперь создаёт настоящий Work/RUN; весь lifecycle suite отдельно прошёл 112/112. Состав gate и таймауты не ослаблялись.

Implementation commits: FLOW `2839fa0287fc75bea65c8421056c14c46df87723`, EVAL `7df09aade3f489dfa1a1bfbcdae5bab3fcdfe366`. После FLOW commit повторная strict-canon сборка PASS; version остаётся `0.9.0-beta.124`. Документация и итоговые receipts фиксируются отдельным EVAL commit.

На committed FLOW HEAD повторный `pnpm test:release`: 2/2 Node checks и 8/8 Vitest checks PASS. Локальный `pnpm pack` завершился без публикации; tarball `/tmp/dd-flow-plan061-package.snHoYK/deksden-com-dd-flow-cli-0.9.0-beta.124.tgz`, SHA-256 `d07e52a574d2be71f4ce6033c6c5b0edce041769df720847f3d11907209b58d4`. Этот checksum относится только к данным локальным bytes, не к опубликованному релизу.

Первый полный FLOW прогон: 1924 PASS, 9 FAIL; он выявил observation-context defect, устаревшие fixture contracts и прочитал предыдущую сборку для поздних regressions. Первый полный EVAL прогон: 401 PASS, 6 FAIL; выявил неполные test engines и устаревший source-regex. Эти прогоны не считаются успешной приёмкой; fixes и проверки перечислены выше. Предыдущие partial suites и остановленные прогоны также не считаются полной приёмкой.

## Повторное ревью реализации

Повторное ревью проведено от FLOW `2839fa0` и EVAL `2a53324`, отдельно от исходной приёмки выше. Пакеты A/B, C и D проверены тремя субагентами; основной агент перепроверил изменения, отрицательные контроли и runnable probes. Все R01–R17 имеют реализацию и регрессии; следующие существенные пробелы в соседних границах найдены и исправлены.

1. **Потеря ответа после continuation dispatch.** `continueCodexCapacity` обрабатывал observation loss при inspection, но не при отправке successor и native inspection внутри owner `decision()`. Wrapped `harness_adapter_failed → rpc_timeout` мог выйти сырым wrapper и вызвать controller fatal stop потенциально живой Session. Общий узкий handler теперь применяется к prompt, decision и retained reads; диагностика указывает exact successor operation, а predecessor остаётся secondary. Повторная отправка, отмена или новый retry policy не добавлены. Hook/ownership/quota остаются conclusive failures.
2. **Неполный общий observation-loss classifier.** Adapter timeout, output limit и invalid JSON означают потерю результата observer, а не доказательство failed native Turn. Эти три transport codes добавлены в общий FLOW контракт и EVAL bootstrap parity; controller использует этот же classifier вместо собственного списка. Aborted, generic adapter failure и hook failure не получают uncertainty authority.
3. **Гонка receipt/cwd между проверкой и claim.** После чтения `observed` invocation другой trusted observer мог заменить `event_key`/`identity_json`. Старый CAS проверял лишь status и мог принять уже другой receipt с непроверенным cwd. Теперь CAS связывает claim с проверенными event и identity; при проигрыше выполняются reread и повторная validation. Две регрессии проверяют допустимую замену и отказ для foreign cwd.
4. **Диагностический serializer мог скрыть первичную ошибку.** Budget учитывал не все primitive branches и не всё cause/cleanup дерево; nested arrays давали мегабайты JSON. `String(Object.create(null))` и throwing getters сами выбрасывали ошибку. Существующие serializers теперь имеют общий бюджет текста/узлов на весь record, безопасное чтение полей, cycle/depth limits. Typed codes резервируются до больших сообщений и details; explicit `retryable:false` сохраняется. TS/controller facades также не перечитывают throwing `code` без защиты.
5. **EVAL category теряла cause.** `executionEvidence` пересобирал wrapper без top-level cause перед classification. Для actual producer `driver_failed → agy_provider_quota_exhausted` category расходилась с retained diagnostic и provider limit. Classifier теперь получает полный structured result; регрессия проверяет согласованность всех трёх полей без замены primary reason.
6. **Pinned checksum игнорировал symlink assets.** Оба digest walkers пропускали symlink, хотя module loader мог исполнить его target вне snapshot. Offline probe подтвердил неизменный digest при исполнении foreign module. Общие digest boundaries теперь отклоняют symlink files/directories внутри snapshot, не следуя target. Внешний runtime-home/root alias остаётся допустимым; обычные frozen snapshot hashes не меняются. Native и capacity imports проверяются через эти boundaries. Local in-process development manifest сохраняет прежний source-content checksum: source checkout с canon/package-manager aliases не является материализованным pinned snapshot. Публичная snapshot verification не получает opt-out.

Old-code controls действительно воспроизвели successor wrapper uncertainty, receipt replacement race, oversized/unreadable serialization, producer cause/category loss и un-hashed foreign import. Symlink FLOW regression была RED до guard и GREEN после; transport classifier regressions также проверены RED/GREEN. Гипотеза про terminal rank против нового running Turn на реальных producers не подтверждена и не объявляется дефектом.

Дополнительные выборочные gates: capacity 50/50; lifecycle/parser/ZCode observer/native ingress 266/266; serializer FLOW 12/12 и EVAL 13/13; engine admission EVAL 4/4. Новые регрессии остаются в существующих suites. Typecheck, lint, strict-canon build PASS. После последней сборки повторный runtime-sensitive: 30/30 PASS, 2 files, 180.93 s; release: 2 Node + 8 Vitest PASS. Выборочные результаты не подменяют полные gates ниже.

Первый полный повтор EVAL: 387/412 PASS, 25 FAIL, без SKIP. Он обнаружил две регрессии самого review patch: слишком широкий symlink guard отклонял legitimate development canon alias; изменение unary serializer signature ломало существующий `errors.map(errorRecord)` в capacity history. Обе причины исправлены: development checksum отделён от strict snapshot validation; EVAL public serializer снова unary, depth/seen остаются private. Добавлены положительная local-development selection regression и прямой array-map compatibility контроль с typed causes. FLOW прогон с известной первой причиной остановлен (exit 130), приёмкой не считается. После новой strict-canon сборки повторные полные suites запущены заново.

Финальный повтор EVAL после обеих поправок: **412/412 PASS**, 0 FAIL, 0 SKIP, 0 cancelled, 0 todo; 263301.378042 ms. Использованы все три bound test env из плана и свежий strict-canon FLOW dist. Финальный полный FLOW integration: **110/110 files, 1948/1948 PASS**, без FAIL/SKIP, 2665.97 s. Cold packaged concurrent ZCode receipt probe в этом gate: 15 samples, max 2477 ms при прежнем бюджете 15000 ms.

Review implementation commits: FLOW `30f1d824613b204f03dc009749f1d2c937a54806`, EVAL `230607bffdf801d669a26b5b836317717ef1e70d`. Полные suites проверили замороженный итоговый source перед этими коммитами; последующее обновление build metadata не меняет implementation inputs. Исходная приёмка и tarball checksum выше относятся к прежним implementation bytes, не к этому review artifact.

На committed FLOW HEAD повторные strict-canon build и release gate также PASS (2 Node + 8 Vitest). Version остаётся beta.124; публикация и package installation не выполнялись. По ponytail исправления внесены в существующие общие boundaries и suites, без нового framework, сторонней зависимости или harness-specific обходов.

## Последующая доставка

Публикация, qualification, installed hook refresh и новые E2E здесь не выполняются. При следующей delivery нужен exact candidate с checksum, обновлённые hooks и квалификация current harness. Старые frozen engine/EVAL не получают исправления от изменения source. Judge и harness profiles остаются неизменными; Grok не возвращается в live scope только по календарю.
