# Fix 033: cp-102 — доказательства, команды повторения и завершение RUN

Дата: 2026-09-13. Статус: реализация прошла ревью и адресные проверки; release gate и два preflight фиксируются в cp-103 readiness.
Область: dd-flow-cli, его semantic package и dd-eval. Продуктовые ошибки Subject остаются результатами эвала.
Исходные EVAL, snapshots, receipts и их hashes не менять; автоматически не возобновлять.

## 1. Что произошло и что уточнено

### Luna: ошибку внесла коррекция PLAN-REVIEW

EVAL `EVAL-20260913130300-8078419d`, RUN `RUN-001-eval-subject`.
Корень evidence: `/Users/deksden/.dd-eval/qualification/cp-102-luna-zcode/runs/EVAL-20260913130300-8078419d/executions/e2e/`.

1. SPECIFY сформировал seeds для responsive layout, keyboard/focus и browser/visual evidence. Требование проверить эти свойства обосновано; это не требование установить программу manual-review.
2. PROTOCOLIZE записал в `workspace/.memory-bank/protocol/PRT-007-task-priority/summary.md:55` ручную проверку текста, порядка, responsive layout и keyboard focus дополнительно к автоматизированной проверке.
3. Исходный PLAN revision 1 содержал только CHK-API-INTEGRATION, CHK-WEB-UNIT и CHK-BROWSER. В snapshot `boundaries/plan-8d3ab25852f7a34fedd33e9910f16b01fc5b312fb3670ea033792ae263ee15d3/` manual-review отсутствует.
4. Ревьюер `WRK-007-prt-007-task-priority-rg-004`, FIND-003: протокол обещает ручную проверку, но нет gate, owner и evidence artifact; предложено описать её либо уточнить proof claim. Он НЕ требовал shell-команду manual-review. Источник: `dd-flow-home/projects/PRJ-001-project/runs/RUN-001-eval-subject/works/WRK-007-prt-007-task-priority-rg-004/result.json`.
5. Координатор принял finding и добавил в revision 2 `CHK-MANUAL-UI-REVIEW`, `command: manual-review`, `run_at: readiness`, `availability: available`. Это зафиксировано в `04-plan-review/decision.json`; первоначальное объяснение «неисполнимую команду внёс исходный PLAN» неточно.
6. Общая валидация повторно проверила исправленный PLAN, но пропустила фиктивную raw command. CODE выполнил её как shell. RCP-019 в repair Work WRK-010: exit 127, `/bin/sh: manual-review: command not found`. Repair унаследовал неисполняемую декларацию; координатор затем объявил environment blocker.

Предпосылки на нашей стороне:

Происхождение разрешения установлено по git history: semantic aspect с manual gates пришёл в `abf8ab2` (2026-08-10, docs: upgrade memory bank canonical layer); явное external/manual proof в runtime PLAN prompt — `9c8ac94` (2026-08-27, feat(vnext): materialize planned verification aliases). Это ранее внесённая общая методология, не возможность, которую пользователь запросил в этом E2E. Новое решение ниже удаляет её из поддерживаемого execution contract.

- Prompt разрешает external/manual proof, но требует от каждого check поле command и не показывает рабочий пример ручного evidence на текущем acceptance gate.
- `run_at` совмещает стадию выполнения и специальный external-механизм. Ручная проверка «на readiness» естественно, но неправильно попала в shell-путь.
- `available means executable now` — требование к модели, не подтверждённая CLI гарантия. `validateCodeCheckCommands` проверяет aliases и guarded prefixes, но произвольную неизвестную команду возвращает неизменённой.
- После correction есть повторная механическая валидация; проблема не в её отсутствии, а в неполноте проверяемого контракта. Ещё один круг LLM-review не является системным решением.
- Review потребовал устранить разрыв доказательств, не дополнительный полный прогон. Не следует лечить отказ удалением проверки UI/accessibility или ослаблением критериев.

### ZCode: незавершённую команду связали с authority

EVAL `EVAL-20260913130300-ca229fef`; аналогичный execution root.
RCP-022 (`pnpm quality`) failed; source repair WRK-012 завершился с passed RCP-023.
Flow выдал retry command с invocation `3c91237a-4cb2-41f5-b34a-cc2a48b3f23b`, затем добавил `--retry-check` и `--reason`. Ledger хранит команду без этих опций. Native transcript содержит именно такую выданную строку; агент первоначально ей следовал. Отказ fingerprint корректен.

Подтверждённые sibling-дефекты: `vnext-code.ts:240`, `vnext-code-review.ts:168`, `vnext-merge.ts:175`. Общий helper `lifecycle-invocations.ts` связывает окончательные operation/argv/scope, поэтому смысловые параметры нельзя дописывать после него.
Дополнительный разрыв: repair исходников меняет check epoch, но replay прежней lifecycle attempt возвращает старый outcome. Подсказка `retry_after_workspace_change` без доступной актуальной authority недостаточна; environment retry не должен подменять source-repair continuation.

### Подтверждённые дополнительные дефекты и границы выводов

- Локальное воспроизведение `verificationProjection`: один AC с AUTO + EXTERNAL check и evidence-ссылкой на исходник получает `confirmed_with_external_evidence` без отдельного ручного результата. Даже текущий AUTO receipt попадает в общий evidenceRefs и способен косвенно подтвердить EXTERNAL. Причина — `hasEvidence(criterionId)` вместо доказательства конкретного check. Это дефект проекции; степень влияния на каждый terminal gate проверять отдельно, не объявлять все gates автоматически обходящимися.
- Локальное воспроизведение `resolveCodeCheckCommands('/tmp', ..., ['@check/missing'])` при отсутствии profile: TypeError чтения aliases вместо доменной ошибки. Общий валидатор рано возвращает commands при отсутствии profile.
- ZCode: cancel отправлен в 14:58:38.380 UTC, после него наблюдались ещё 40 native tool_call events; последняя инспекция idle — 15:12:49.204. Stop settled — 15:13:01.463. Это не просто задержка отрисовки отчёта. Закрытие новых prompt не остановило активный turn. Причина неэффективности конкретного native cancel внутри провайдера ещё не доказана.
- После первичного отказа журнал содержит 472 результата с projection; routine inspect читает полный transcript, inbound journal сохраняет его до сокращения publicEvidence. Итоговый adapter journal — 699628769 байт. Это установленная амплификация данных, не доказательство, что именно она объясняет все 14 минут.
- dd-eval уже сравнивает JSON до/после enrichment, но в период cleanup повторялись execution.failed. Проверить какие изменяемые поля нарушают содержательную идемпотентность; не удалять сравнение и не подавлять реальные изменения.

## 2. Целевое решение: автономная проверка, без ручных gates

Решение пользователя после обсуждения: ручные доказательства и human approval gates не поддерживаются. HITL существует только для предусмотренного ответа на вопросы; не добавлять его в verification/review/readiness/merge. Прежнее предложение развить external/manual evidence отменено. Осмотр интерфейса агентом через tools и анализ полученных им артефактов не являются участием человека.

### F1. Исполняемые checks и ручные/external evidence

Минимальный путь — удалить неподдержанный manual/external bypass из нового исполняемого контракта, а не достраивать его. Gates закрываются автономно исполняемыми проверками и их актуальными receipts; семантические review остаются агентными Works в существующем lifecycle.

- Новая executable schema не принимает run_at: external и не предусматривает manual approval. Не разрешать переименование manual в external как обход. Сохраняются command и available/planned с реальным provider.
- В примерах показать существующий executable alias, planned alias с provider и агентный осмотр UI с сохранёнными browser artifacts. Если требуемую проверку невозможно выполнить автономно, возвращать явную неподдержанную зависимость/blocker, а не ждать человека и не считать gate passed.
- Исправить источник: удалить разрешение external/manual proof из PLAN prompt и инструкции про обязательный manual gate из semantic aspects, PROTOCOLIZE/PLAN/REVIEW/readiness templates. Проверяемые свойства UI/accessibility сохранить. Не менять канонический ответ на продуктовый вопрос ради инфраструктурной ошибки.
- Исправить shared types, schema, materialized examples и semantic sources согласованно. Проверить `vnext-protocol-plan`, code-work packet/batch, Work result, verification projection и downstream review/merge consumers. Schema version/compatibility объявить явно; исторические документы не мигрировать на месте.
- Исторические external документы доступны read-only; новый запуск/resume несовместимого контракта требует явного replan/migration, не автоматического исполнения placeholder или пересчёта старого отчёта. Новый writer не создаёт manual:// или manual-review как substitute проверки.

### F2. Evidence принадлежит конкретному check, а не любому AC

- Удалить shortcut hasEvidence(criterionId) → external passed из текущей проекции. Не добавлять новый manual receipt/type/API. Старый external не становится passed от произвольной ссылки и не допускается к новому execution.
- Общий валидатор и gate связывают исполняемый check с актуальным receipt, PLAN revision/verification epoch и его обязательными artifacts, используя существующие path/hash механизмы.
- Evidence из Work result дополняет семантический отчёт, но не заменяет required executable receipt. Исходник, чужой check, предыдущая revision/чужой RUN не закрывают gate.
- Семантическая оценка остаётся задачей агента/reviewer; наличие файла не выдаётся за доказанную корректность его содержания.
- На всех Work/aggregate/repair/review/merge путях несовместимый external отклоняется общей validation до dispatch, не превращается в shell и не создаёт ожидание человека.

### F3. Ранний отказ для непригодных executable declarations

- Исправить общий `code-checks.ts`: @check без profile и неизвестный alias всегда дают стабильную доменную ошибку с check/profile provenance.
- Добавить непроизводящий эффект preflight очевидных прямых команд: существующий shell-quote, отделение literal env assignments, executable lookup в той же execution environment/cwd, проверка прямого пути. Не исполнять сам check при PLAN acceptance и не запускать package manager, способный скачивать зависимости.
- Важная граница: shell-quote не полноценный shell AST. Для динамических/составных команд не делать ложных выводов по первому слову. Сохранять их поддержку и честно помечать предел preflight; review обязан обосновать launch path. Не запрещать весь shell ради одного sentinel и не вводить blacklist manual-review.
- Повторять общую validation для исходного PLAN и correction перед публикацией batch. Planned output проверять после provider, не требовать его существования до реализации.
- При фактическом exit 127 сохранить receipt и декларацию/provider/profile provenance. Не автоматически объявлять любую такую ошибку «внешним окружением»: это может быть дефект поставщика или принятого плана. Если immutable PLAN неверен, не плодить одинаковые repair Works; вернуть точный плановый blocker и штатный путь коррекции/replan. Не менять принятый план скрыто из CODE.

## 3. F4. Окончательная команда → authority → фактический вызов

- В трёх finishCommand helpers принимать retry options до вызова managedLifecycleCommand. Сначала построить все семантические argv, затем один раз bind. Сохранить идентичность reason как поздно подаваемого текста по существующему контракту; наличие самой опции учитывается.
- Общий helper при получении команды с invocation ID должен проверять её соответствие, а не безусловно возвращать строку. Не выдавать новый ID в обход mismatch.
- Обследовать все producers/transformations: stage start/finish/pause/resume, Work start/finish/fail, merge-server, recovery overlay, stdin/redirection, response-file. Presentation/input transport можно рендерить заново только в пределах существующих правил; operation/target/stage/retry identity неизменяемы.
- После source repair выдавать актуальную попытку finish через существующий successor ledger с доказанным terminal outcome и завершённой repair, привязанной к исходному failed receipt. Не превращать unknown/executing в повтор. Повтор получения continuation идемпотентен; старый invocation навсегда replay его старого результата.
- Разделить выдаваемые инструкции source repair и восстановленного environment. Агент не должен выбирать случайный UUID или использовать environment retry только потому, что это единственная строка с новым ID.
- Fresh continuation доводит до следующей стадии обычный controller, не второй независимый orchestrator.

## 4. F5. Fatal failure должен останавливать активное исполнение

Эксперимент выполнен 2026-09-13: см. `runbooks/zcode-stop-experiment-2026-09-13.md`. ACP cancel и прямой native stop не остановили bounded tool; ACP даже вернул cancelled после последующего tool call. Native session/close после stop завершил resident и физические shell/Node процессы до естественного окончания. Механизм к реализации: stop → ограниченное подтверждение quiescence → session-scoped close при продолжающейся работе → physical-tree verification; targeted daemon stop остаётся резервом по force-policy. Не путать close resident с удалением истории. Дополнительно проверить закрытие с живыми subagents и наличие forensic capture до объявления полной готовности.

Изолированный ZCode probe выполнен: ACP cancel и native stop не прекратили bounded tool; `session/close` после stop прекратил resident и наблюдаемые shell/Node processes. В implementation добавлен узкий `zcode/session/close`; cancel сохраняет последний pre-close status, а closed receipt — terminal evidence. Это диагностика adapter, не новый продуктовый E2E.

- Общий контракт: cancel requested/accepted, native quiescence и физическое завершение — разные факты. Не считать пустой running-subagents список доказательством остановки root.
- Fatal закрывает новый productive admission, но дополнительно инициирует остановку уже активного turn через существующего владельца RUN control. Permission responses после fatal не должны разрешать новую продуктивную работу; служебные действия stop/drain остаются доступны.
- Исправление cancel выбрать по probe: правильная root/turn адресация либо поддержанный native stop; bounded retry допустим только для идемпотентного cancel нужной identity. Не пересоздавать и не перепромпчивать Subject.
- Если native stop не подтверждается, фиксировать `cancellation_not_effective` и точный unresolved root/tool/process. Завершать принадлежащий этому RUN daemon/process tree только штатным scoped stop и согласно явной force-policy. Не сигналить общий provider host и не ослаблять PID/birth/generation guards. Таймаут не означает stopped; при невозможности безопасного stop — needs_attention с сохранённым наблюдением и без нового writer.
- Проверить shared `native-session-control.ts`, `run-control.ts`, adapter error path, non-Work eval/Judge owners и sibling harness implementations по тому же контракту. Это аудит общей семантики, не утверждение, что каждый harness воспроизводит ZCode bug.

## 5. F6. Компактное наблюдение без потери доказательств

- `dd-zcode.mjs:inspect` не должен на каждом poll копировать полный transcript. Использовать подтверждённую capability status/projection endpoint; если её нет — сохранять полный ответ по hash один раз и journal reference + компактную projection при повторе. Сырой уникальный ответ и новые события не терять. Не использовать усечение как «lossless» решение.
- Сопоставление response с method/request/session делать до записи inbound; native notifications и lifecycle evidence сохранять в исходном порядке. Для full transcript artifacts сохранять hash/size/path и ошибки неполной записи, читать их потоково.
- CLI/status должны показывать первичную ошибку отдельно от cleanup, запрос cancel и последнее подтверждённое состояние/время, продолжающиеся после cancel tool calls, причину pending. Размер истории не должен менять смысл остановки.
- В dd-eval сравнивать смысловой failure/evidence revision, исключив heartbeat/время очередной инспекции. Одна первичная execution.failed; новые события только при изменившемся evidence/control результате. Candidate замораживать один раз после settled capture или явного terminal capture failure.
- Метрики регрессии: N одинаковых больших inspections → O(размер уникального transcript + N компактных записей), не O(N × transcript). Отдельно проверить непрерывно растущий transcript: сохранять новые данные без повторного копирования общего префикса либо использовать компактную native projection capability; snapshot-per-hash сам по себе рост не решает.

## 6. Пошаговая целевая трассировка

1. SPECIFY сохраняет свойства и acceptance; способ доказательства не превращается в несуществующий executable.
2. PROTOCOLIZE переносит требования и осмысленные proof boundaries; PLAN назначает автономный check/provider, без ручного gate.
3. PLAN finish проверяет declarations/provider graph/доступные launch paths без запуска gate.
4. PLAN-REVIEW устраняет пробел в доказательствах доступной автономной проверкой; correction проходит тот же validator. Нет нового обязательного круга LLM-review.
5. CODE provider materializes planned alias; только после него consumer использует alias. Manual/external declaration отклоняется до CODE.
6. Work result несёт check-scoped artifacts. Текущий gate не проходит без своего доказательства; чужой AUTO receipt его не заменяет.
7. Failed executable check сохраняет receipt. Source repair и environment recovery имеют разные, корректно авторизованные continuation.
8. Повтор актуального finish выполняет допустимую попытку; replay старого ID ничего заново не запускает. Успех приводит в следующую стадию.
9. При fatal mismatch writer admission закрыт, active turn действительно отменён либо явно остаётся unresolved под контролем. Не выдаётся преждевременный capture.
10. После подтверждённого stop собирается consistent snapshot и единый terminal report; исходная причина не теряется в cleanup ошибках.

## 7. Проверки, порядок и критерий завершения

Порядок: F1–F3 вместе (иначе external shortcut создаёт ложный passed); F4; F5 с отдельным provider probe; F6; совместная локальная проверка; релизная подготовка. Реализация не должна молча менять fixtures или результаты старых эвалов.

Обязательные регрессии в существующих suites:

- Luna-shaped correction: v1 → reviewer finding → v2 с автономным check/provider → schema/batch/Work result/gate. Manual/external correction отклоняется; UI/focus/responsive coverage сохраняется без участия человека.
- Raw unavailable command, missing profile alias, planned alias до/после provider; допустимые existing raw/alias и dynamic-shell paths сохраняются. Не запускать полный check при validation.
- Два checks одного AC: receipt одного/исходник не закрывает другой; legacy EXTERNAL не получает нового passed; wrong check/revision/run, missing/tampered artifact, stale evidence. Вопросный HITL сохраняется, verification HITL не появляется.
- Табличный тест реально сгенерированных CODE/CODE-REVIEW/MERGE retry_command через parser + ledger admission, не вручную написанного «правильного» аналога. Changed source repair → свежая finish attempt → next stage; same ID replay не повторяет эффект; unknown остаётся unknown.
- Active root после cancel при нуле детей; поздний tool call; неверный receipt/session; delayed terminal; stop-policy escalation/refusal; соседний RUN не затронут. Проверить physical tree, не только mocked cancelled flag.
- Повтор inspection большого transcript и fail enrichment; один primary failure, meaningful evidence revision, capture/Judge запускаются однократно. Ошибка журнала/получения статуса остаётся видимой.

Реализовано: schemas/types/validation и projection F1–F3; финальная command-before-authority и authority revalidation F4; stop→bounded observation→session close F5; deduplicated transcript artifact journal и semantic failure revision F6. Добавлены адресные регрессии на unavailable direct command, legacy external non-pass, mismatched invocation, close escalation, compact transcript journal и failure revision. Полный общий gate ниже остаётся единственной повторной широкой проверкой.

Проверки пропорционально изменению: focused suites по ходу, затем один полный release gate на окончательном release-кандидате. Последующие узкие исправления — адресные регрессии; не повторять всю цепочку автоматически. Релиз только штатным runbook; package smoke/pins после него. Живые Luna/ZCode E2E — отдельный следующий шаг, не часть принятия этого плана.

Definition of done: закрыты F1–F6 с evidence, schema/semantic/runtime versions согласованы, обе локальные end-to-end регрессии проходят, native cancel probe либо подтвердил механизм, либо явно блокирует готовность. В докладе разделены реализовано/проверено/не проверено. Нет заявления «все возможные ошибки устранены» на основании поиска строк.

## 8. Ревью реализации: существенные дополнения

1. F1–F3: исправлены не только vendored инструкции CLI, но и канонический dd-memorybank. Канон 4.1.1 требует beta.55; проектный flow-pack синхронизирован без смены продуктового baseline. Runtime validation отвергает legacy external до dispatch. Проверка executable использует execution cwd/env, shell-quote и literal PATH assignments; quoted local paths работают, сам check при PLAN validation не выполняется. Dynamic shell остаётся поддержанным, без ложного статического диагноза.
2. F4: добавлены тесты настоящих finishCommand producers CODE / CODE-REVIEW / MERGE через ledger admission и native observation, а не только искусственной правильной строки. Смысловые retry arguments связываются с authority до выдачи команды.
3. F5: stop ограничен общим deadline, а не таймаутом на каждую повторную попытку. Native close ACK не считается доказательством: новый read-only resident extension проверяет root и известные children без скрытого resume. Closed receipt удерживается daemon, inspect/cancel/stop не открывают Session заново, prompt/fork/resume закрытой Session запрещены. Ошибка проверки сохраняет pending, а не выдаёт ложный stopped. Живой child-tool experiment и ACP wire smoke подтверждены в stop runbook.
4. F6: snapshot-per-hash заменён manifest + content-addressed 64 KiB message chunks: растущий transcript не копирует неизменный текстовый префикс. Читатель проверяет chunk и исходный ответ по hash/size; tampering ловится тестом. Не сохраняются секреты в отдельный отчёт; forensic transcript остаётся в изолированном runtime evidence.
5. dd-eval: failure revision учитывает code+message для изменившегося capture/evidence отказа, исключает только наблюдательные timestamps. Успешный повтор evidence collection удаляет устаревший evidence_error.
6. Qualification: обнаружен устаревший жёсткий bridge commit. Релиз остановлен до публикации; узкий production-invocations probe повторён и прошёл на e0600fe. Runtime pin и профили обновлены по реальному evidence, не по предположению о совместимости.
7. Повторная трассировка прямого daemon.stop выявила ещё один путь read после неподтверждённого close. Он исправлен: close receipt сохраняется и при прямом shutdown, обычный inspect после close исключён, повторный stop остаётся pending без resurrection. Адресная регрессия проверяет первый stop, повторный stop, cancel и запрет resume; 21 тест адаптера PASS.

Локально: zcode-acp 801/801; dd-eval полный node --test PASS; адресные dd-flow suites для command validation, lifecycle, ZCode adapter/daemon PASS. Канонические compatibility/release-impact прошли schema validation; markdown lint canonical files был skipped политикой ignore и не засчитан как проверка содержимого. Один полный release gate — на окончательном кандидате. Scored Luna/ZCode E2E в этой работе не запускаются.
