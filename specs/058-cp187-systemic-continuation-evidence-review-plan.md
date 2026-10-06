# 058 — CP187: продолжение Session, полнота evidence и доставка критериев review

Дата: 2026-09-30. Статус: **P0–P7 реализованы и прошли независимое ревью; существенные находки исправлены, локальные/offline gates завершены**. Проверен по ponytail (full). Реализация, находки ревью и итоговые проверки: [058-implementation-report.md](058-implementation-report.md).

Область текущего поручения ограничена реализацией: P8 (release, подготовка и запуск новых E2E) и платный supplemental Judge не выполняются. Исходные readiness-разделы ниже сохранены как история требований; итоговый статус и результаты реализации перечислены в implementation report.

Повторная проверка готовности: 2026-09-30. Уточнены dispatch decisions, привязка budget к predecessor, исторические batch sources, порядок restore, frozen assessment для supplemental Judge и захват native evidence до cleanup. Подробности и gates — §14. Готовность плана не означает, что новые regression уже проходят или live E2E подтверждены.

Продолжает 055 и 057, уточняет их границы после трёх CP187 E2E. Это не разрешение менять исторические EVAL, продукт или действующий runtime. Исправляем dd-flow / adapters / dd-eval / канонические инструкции; продукт исправляет только Subject в новом Flow. Качество PLAN/CODE/review оценивает Judge, а не механический факт зелёных checks.

## 1. Цель и фиксированный исходный срез

Цель: три новых E2E Luna/AGY/ZCode проходят SPECIFY → PROTOCOLIZE → PLAN → PLAN-REVIEW → CODE → CODE-REVIEW → MERGE, имеют проверяемую case-acceptance, valid Final Judge и подтверждённый cleanup. Техническое завершение и качество продукта показываются отдельно. Внешняя квота/eligibility может не позволить подтвердить цель; её нельзя замаскировать PASS.

Исходные репозитории:

- dd-flow: `_worktrees/dd-flow-051-implementation`, `aa9de5233bab8a506d4219ccd00fb761c68fd42b`; CP187 установленный beta.122 построен из `b03c699ac77fa596e684408c8e46e8710edbe9f6`, digest `7c3ce2e8407319d931f5e0598662c0ab322f2ef89aa2c8b28d49f77c0b1c4d19`.
- dd-eval: `_worktrees/dd-eval-cp186-report`, `c4cdba4706354f511114cb83b592346d811c0f7d`.
- Canon: `dd-memorybank`, `0cf38231406614cfeb0a96001ba0201de2316e47` / 4.1.2.
- Flow-pack: `_worktrees/dd-tasks-cp187-flow-pack`, `d1b8d9eb44cffbeff8734a8eff5793db6c342f4e`. Не менять продуктовую часть ради прохождения EVAL.

| Harness / EVAL | Наблюдавшийся итог | Причина / качество |
| --- | --- | --- |
| Luna `EVAL-20260930024246-4a9ffd0c` | `completed_with_failures`, SPECIFY | Native `serverOverloaded` после успешного bootstrap; continuation заблокирован любым tool effect |
| AGY `EVAL-20260930024412-c20c2bfe` | Полный цикл и MERGE | Case-acceptance unavailable; Judge заметил узкие migration proofs; новый конкретный reset finding — вывод по источникам |
| ZCode `EVAL-20260930024601-44b0d676` | Полный цикл и MERGE | Case-acceptance unavailable; 30 model transitions оказались двумя обозначениями одной модели |

Homes: `/Users/deksden/.dd-eval/qualification/cp-187-{luna,agy,zcode}`. Grok исключён из live-матрицы до подтверждения восстановления лимита после 2 октября; общие изменения проверяются для его путей offline. Heartbeat выключен. Старые EVAL не resume/restart/rejudge in place.

## 2. Реестр установленных проблем и границы аудита

Аудит охватывает все найденные caller paths указанных классов в dd-flow/dd-eval и соответствующий Canon: Session prompt/child followup/recovery/HITL/MERGE, matrix publication/qualification/acceptance/restore, review task/context/copy, native model/tool decode → aggregation → report/Judge. Это не утверждение об отсутствии иных дефектов во всей системе.

| ID | Установленный дефект | Основание | Исправление |
| --- | --- | --- | --- |
| C1 | Overload continuation допускает только `possible_effects=false` | CP187 Luna; `codex-capacity.ts:33`, `dd-codex.mjs:542`; offline exact-runtime replay отказал до inspection/prompt | P1 |
| C2 | Sibling owners дополнительно требуют created Work / dispatching MERGE / непринятый ACK; child path отдельно повторяет effect-free guard | `run-controller.ts`, `external-work-launch.ts`, `merge-server.ts`, `run-controller-recovery.ts` | P1 |
| C3 | Remaining ordinal не читается из chain; external/MERGE одиночный receipt перезаписывает intent/history | `codex-capacity.ts:21`, external/MERGE writer; не доказательство бесконечного retry, но crash continuation неполон | P1 |
| C4 | HITL admission не enforce retained not_before; Subject/child delay не имеет полноценного cancellation/deadline/Retry-After | `run-controller-adapter.ts:22`, helper/child; recoveryRuntimeAdmission уже имеет нужный пример | P1 |
| C5 | Judge не узнаёт capitalized Retry-After и не re-inspect после backoff/permit | Offline root repro: Retry-After 31 s → второе dispatch через 5 s | P1 |
| C6 | Capacity qualifier — отдельный loop, повторяет исходный prompt и проверяет children только до backoff | Offline root repro: child появился в backoff → probes=2, childChecks=1 | P1 |
| M1 | Matrix producer не каталогизирует `03-plan/code-work-batch.json`, consumer требует SHA | Оба замороженных final snapshots; физические байты есть и другие mandatory sources совпадают | P2 |
| M2 | Qualification копирует только объявленные producer sources; admission проверяет самосогласованность, а не mandatory closure | `qualify-verification-matrix.mjs`, `engine-admission.mjs`; реальный CP187 checkpoint проходит без batch | P2 |
| M3 | Qualifier приписывает supplied engine digest, не сверяя engine-binding доказательного RUN | Код CLI qualifier; wrapper CP187 передавал правильный binding, смешанный engine в CP187 не наблюдался | P2 |
| M4 | Restore меняет operational RUN root, но matrix/report/packet resolver продолжает использовать historical absolute paths | `eval-snapshots.ts:523`, `verification-matrix.ts:246`, `stage-report-renderer.ts:121`; code-backed, не CP187 failure | P3 |
| M5 | Marked matrix preparation допускает missing expected predecessor и live fallback; qualification не полностью проверяет projection | `verification-matrix.ts:117,133`, admission vs V3 verifier; code-backed, не объявлять CP187 trace причиной | P2 |
| M6 | Recovery relocation metadata создаётся после первого status/reconciliation | `eval-snapshots.ts`: порядок import → `getFlowRunStatus` → relocation write; readiness code audit, не CP187 trace failure | P3 |
| R1 | Fresh PLAN/CODE reviewers получают aspect IDs, но не exact assigned criterion files | Общие composers + фактический RG1 prompt/native reads: criteria не прочитаны | P4 |
| R2 | Read-only copy не объявляет criteria/orientation explicit inputs; ignored mandatory files могут отсутствовать | `reviewSourceInputs`, `reviewSourcePaths`, external Work copy; риск handoff подтверждён устройством кода | P4 |
| R3 | PLAN объявил testing/evidence аспекты N/A вопреки их области; proof проверял fresh world, не существующие данные/reset lifecycle | AGY PLAN/aspect-map, runner/test sources; модель/review quality, не ложный receipt | P4/P5 |
| R4 | CODE-review coordinator prompt объявляет CODE «already semantically verified» вместе с green checks | `vnext-code-review.ts` orchestrator trusted context; зелёный gate не доказывает полноту семантики | P4 |
| J1 | Обычный eval judge возвращает сохранённый результат для candidate; нет отдельной identity нового supplemental evidence | `evalJudge:3081`, `finalJudge:2045`; повтор команды/смена profile не добавляет сведения | P5 |
| J2 | Existing judge entry читает current case и пишет projection старого EVAL; его нельзя напрямую использовать для независимого addendum | `evalJudge`: `loadCase` и два `finalizeRunProjection`; readiness audit будущего supplemental пути | P5 |
| O1 | ZCode bare model и encoded selector сравниваются как разные model identities | 30 CP187 transitions; `dd-zcode.mjs`, model writer/reducers | P6 |
| O2 | AGY optional hook omission помечается asserting unavailable и загрязняет known configured roots | `dd-agy-daemon.mjs:441`; model aggregation | P6 |
| O3 | Сохранённые AGY child transcripts не декодируются/не учитываются | 9 из 9 locators доступны, 265 tool calls, 87 truncation markers; report tools 7/16 Sessions | P7 |
| O4 | Tool reducer теряет идентифицированный call, если decoder одновременно дал reason | `ToolObservations.add:16`; offline unknown Codex status → total=0, pending=0 | P7 |
| O5 | Model dedup учитывает channel/attempt, но не полностью scope/turn/non_asserting semantics | `model-observations.mjs:39–44`; новый code-backed край при typed evidence, последствие CP187 не заявлено | P6 |

Для каждой реализации обновить этот реестр точными commits/tests/evidence. Не выдавать кодовый вывод или риск за воспроизведённый live failure.

## 3. P0 — закрепить regression inputs перед изменением

1. Проверить текущие branches/dirty state/инструкции репозиториев. Чужие изменения сохранять. Не редактировать pinned CP187 runtime.
2. В существующие suites перенести минимальные очищенные regression vectors из CP187: terminal overload после bootstrap; matrix с physically retained batch вне catalog; AGY narrow proof/reviewer packet; ZCode bare/encoded model; child transcript с truncation; identified tool с unknown status. Сохранить EVAL/Session/Turn/source provenance, не переносить auth/env dumps.
3. Для каждого vector предъявить red assertion. Уже зелёные legacy tests не заменяют новый red test.
4. Дополнительные restore/engine mismatch проверки выполняются только на disposable fixture, не на historical DB.

Done P0: воспроизводим именно дефект контракта, а не ошибку вручную построенного mock. Нет paid calls и мутаций Subject/product.

## 4. P1 — закончить bounded same-Session overload continuation

### Контракт

Подтверждённый terminal `serverOverloaded` — повод продолжить прежнюю Session коротким новым turn. Это **не** replay первоначального Stage/Work prompt, shell-команды, accepted answer или merge apply. Completed tool/file effects допустимы; сам факт `commandExecution` больше не запрещает продолжение и не переименовывается в no-effect.

1. Оставить узкое структурированное распознавание exact native failed Session/Turn и terminal overload. `willRetry=false` не запрещает новый turn. Transport timeout/unknown delivery/текст «overloaded»/quota не превращать в этот класс.
2. До failure sealing владелец читает существующие RUN/Work/HITL/MERGE continuation и native settlement. Уже завершённую задачу обрабатывает штатно без prompt; новый pause — штатный HITL; незавершённую задачу — continuation в прежней Session с новым operation ID.
3. Передавать минимальное описание **текущего** задания и его границы: проверить durable состояние, не повторять завершённые команды, пользоваться только актуальным issued successor. Не возвращать в prompt старую `stage start`, если bootstrap уже зафиксирован. Формулировку HITL «before any tool call» удалить для случаев известных эффектов.
4. Использовать existing native item / invocation / check / Work / MERGE receipts. Completed обычный tool/редактирование допустимы без нового бюрократического файла. Для незавершённого tool выяснить результат/handle существующей reconciliation; не replay shell. Неясное состояние операции, которую нельзя согласовать, остаётся отдельным reconciliation blocker, а не blanket отказом после всех tools.
5. Сохранить exact owner/lease/generation/cancellation и assignment bindings. После backoff вновь сверить boundary и native состояние, а не только прежний boolean. Не посылать параллельный prompt активной Session/child tree. Уже settled historical descendants допустимы при полном native tree proof: root-only guard после работы детей необоснован. Освободить predecessor budget только существующим settlement-контрактом, без искусственной отметки success.
6. Использовать существующие максимум два дополнительных turn, backoff 5/15 s; структурированный Retry-After распознавать независимо от регистра header. Не ждать дольше 30 s/оставшегося caller deadline; не обещать reset quota по Retry-After. Delay отменяемый, без productive dispatch после отмены. Provider-turn/total budget не сбрасывать. Intent и ordinal долговечны до dispatch: crash не возвращает счётчик в 0 и не создаёт второй continuation. Нельзя просто начать новый цикл helper с новым root ID ради повторных двух попыток. Existing recovery capacity_intents/CAS/not_before — образец; external/MERGE chain не перезаписывается единственным последним receipt. HITL admission тоже проверяет retained not_before.
7. Исключить перегрузку из немедленного irreversible Work failure до решения о continuation. После исчерпания лимита — существующий failure/cleanup с сохранённой исходной причиной и полной цепочкой попыток. Quota — terminal, известное время сброса показывать отдельно; Retry-After не считать доказательством quota reset.
8. Durable intent связывает root/predecessor operation, exact Session/Turn, owner/generation, continuation prompt SHA, ordinal/not_before. Одинаковый уже существующий intent reuse; иной payload — conflict; unknown dispatch inspect/observe вместо второго dispatch. После crash завершённый результат переиспользуется, pending not_before дожидается в оставшемся budget; chain не начинается с нового root.

Root chain — исходная productive prompt operation, завершившаяся overload, а не каждый вызов helper. Два дополнительных turn считаются суммарно по её descendants. Успешный terminal turn закрывает эту retry chain; только независимо выданное следующее задание/обычный следующий prompt может начать новую. Продолжение после второго overload и process restart не новая chain. Общий Session/EVAL budget при этом не обнуляется. Settlement должен относиться именно к predecessor operation/reservation: generic `settled` другой операции недостаточен. Если provider не может подтвердить остановку прежнего turn или освобождение нужного reservation, dispatch не производится; это конкретный reconciliation blocker, не запрет completed effects.

Owner decision должен быть явным в existing caller contract: `completed` → штатное принятие результата; `paused` → штатный HITL; `continue` → тот же Session/child с новым turn; `reconciliation_blocked` → diagnostic без dispatch; `exhausted` → failure/cleanup. Это не новая машина состояний или общая retry framework. Нельзя интерпретировать отсутствие continuation receipt как обязательный failure, если Work/Stage уже завершён. Decisions повторно вычисляются после wait/permit; вновь завершённый Work или новый pause отменяет подготовленный productive dispatch.

Retry-After: поддержать стандартные секунды и HTTP-date, используя existing header/date utilities или standard library; delay — не меньше выбранного backoff и валидного provider delay. Прошедшая дата не создаёт отрицательный delay; malformed header не меняет структурную классификацию overload. Если требуемый delay превышает 30 s или оставшийся deadline, не обрезать его до раннего dispatch: закончить bounded attempt с точной причиной. Тестировать границы 0/30/>30, date, неверный header и cancel непосредственно перед dispatch.

### Все продуктивные пути

| Owner | Что меняется / не повторяется |
| --- | --- |
| `run-controller.ts` / adapter | Stage entry, running Stage, обычный prompt, Stage finish already committed; продолжение до stopAfterFailure |
| Accepted HITL prompt | Если resume/answer уже committed — reconcile; если тот же pause ещё current — тот же accepted answer binding; новый pause не обходить |
| `external-work-launch.ts` | Running external Work после успешного Work start продолжает ту же Session; не новый launch/claim; read-only copy/input identity сохранена |
| `merge-server.ts` | Active MERGE продолжает текущую работу; завершённый apply/check не выполняется второй раз; finished request reconcile |
| `run-controller-recovery.ts` | Продолжение текущего recovery turn; committed ACK не переиздаётся; sealed old RUN сам по себе не получает unfenced productive prompt |
| Native child / fanout | Через поддержанный родительский `followup_task` с прежним child ID, не direct child turn/start и не spawn; проверить новый native Turn/WorkSession и completed→new-attempt topology |
| dd-eval Final/Interaction Judge | Same packet, Session, admission, valid JSON, один verdict/один HITL answer; не копировать Subject-guards механически |
| Harness capacity qualification | Не повторять начатый fanout и не складывать последовательные волны в parallel capacity; continuation только в прежней допустимой границе |

Judge и capacity qualifier используют тот же bounded semantic contract с собственными ограничениями: re-inspect tree/children после backoff и после ожидания permit, непосредственно до dispatch; capacity closure действительно меняет original prompt на короткий continuation по ordinal. No-accepted-child guard qualification сохраняется. Существующие operation journals/admission/CAS не обходить. Отдельно тестировать сохранённую chain и unknown dispatch после crash для каждого owner.

Небольшое расширение существующего helper/owner reconciliation вместо retry framework, registry или другой recovery-системы. Adapter отвечает за native facts, owner — за текущую flow-границу. Common semantic contract одинаков; native transport остаётся специфичным.

### Regression / done

- Bootstrap completed → overload → same Session/new Turn, один Stage start, Work остаётся прежним.
- Completed обычный command/file change → overload → продолжение без запрета лишь по типу item.
- Running external Work / active MERGE → overload: нет повторного start/apply; completion accepted once.
- Finish/ACK/accepted answer committed перед overload → reconcile без replay; новый HITL обычным путём.
- Child overload после Work start: прежний child ID, новый Turn, ordinal/budget сохранены; parent не выполняет child Work.
- Unknown delivery, незавершённый tool, active child, stale owner/generation, cancellation/deadline во время backoff: нет duplicate productive dispatch.
- Overload два раза, третий failure, crash до/после intent/dispatch, response loss: bounded и idempotent, ошибка cleanup не затирает первичную.
- Quota и неоднозначный 429 не auto-continue; failure содержит доказанное reset time только если оно известно.
- Upper/lowercase Retry-After, tree/child появился во время wait/permit, HITL dispatch раньше not_before, сохранённый ordinal=2/исчерпание; original capacityPrompt не replay и не вторая волна.

Runnable coverage: `test/codex-capacity.test.ts`, `test/run-control-admission.test.ts`, существующие controller/external/MERGE integration, `test/vnext-fanout-storage.test.ts` и native fixtures; dd-eval `test/judge-capacity.test.mjs`, `test/eval.test.mjs`. Инвентаризацию fixture имен сверить перед реализацией, не создавать parallel framework.

## 5. P2 — полная authority цепочка матрицы и настоящая qualification

1. Добавить `run:03-plan/code-work-batch.json` в shared generator для non-skeleton PLAN output и следующих стадий. PLAN input без ещё не созданного batch законен.
2. Привязать bytes к принятой публикации batch/PLAN revision, не просто hash произвольного физического файла. PLAN-REVIEW corrected batch заменяет прежний accepted hash. Поскольку canonical `03-plan/code-work-batch.json` перезаписывается, exact batch bytes каждой matrix publication удержать через существующий content-addressed Stage packet механизм (как PLAN sources). Исторические PLAN output/review input проверяются по своей retained принятой редакции, не по текущим bytes canonical файла. Финальная матрица по-прежнему включает обязательный актуальный canonical batch для V3. Qualifier удерживает нужные source proofs каждой проверяемой публикации, а не только final; shared closure различает historical revision и final canonical authority.
3. В shared технической проверке dd-eval переиспользовать существующий V3 technical verifier: mandatory source closure и корректность requirements/criteria/PLAN/ownership projection по stage/role/completeness, затем gate/acceptance/native receipts. Qualification и acceptance используют один технический набор; case-specific scenarios и независимая семантическая оценка остаются отдельными. Не копировать второй набор проверок вручную.
4. Не принимать несколько конфликтующих aliases одного `root:path`, stale foreign Stage/attempt/owner и пересчитанную fingerprint неполного catalog. Использовать существующие containment/realpath/SHA utilities. В diagnostic назвать недостающий source и expected/actual SHA.
5. Qualifier сверяет `RUN/engine-binding.json` с exact supplied engine artifact и его built_with_canon; retain binding bytes/hash в qualification, admission проверяет ту же связь. Совпадения semver недостаточно. Проверить существующие fixture wrapper callers, но не полагаться на их «правильный аргумент».
6. Qualifier пишет passed только после полной валидации. Failure не оставляет внешний qualification receipt со status passed. Использовать существующий validate/atomic publication pattern, не строить новый artifact store.
7. Реальная installed producer → owning Stage reports → qualifier → admission → case-acceptance проверка обязательна. Handcrafted positive sourceNames не является единственным доказательством.
8. Marked RUN не заменяет потерянный обязательный predecessor output live reread: точная недостающая publication — diagnostic. Учесть законный skipped review с опубликованным output и legacy unmarked RUN. Не требовать optional semantic_assessment caller file после принятого decision; если нужен display, использовать уже принятое значение. Не добавлять MERGE report как собственный source матрицы (циклический hash), не делать authoritative DB dump Work IDs и не переизобретать fingerprint.

Конкретный source contract без новой matrix schema: каждой non-skeleton publication после формирования batch добавить source `{role: "code_work_batch", root: "run", path: "<stage-directory>/verification/sources/<batch-sha>/code-work-batch.json", sha256: "<batch-sha>"}`. Использовать existing retain-source pattern для PLAN, не отдельное хранилище. SHA сверяется с accepted batch checksum соответствующей Stage/report revision; на correction учитывать `final_batch_checksum`, не старый initial checksum. Финальная publication дополнительно содержит `run:03-plan/code-work-batch.json` с тем же актуальным SHA. Исторический packet проверяет свою retained редакцию, не текущий canonical файл. Qualifier читает эти реальные retained paths и сохраняет их proofs. Нельзя просто добавить название source в fixture и объявить проблему исправленной.

Regression: удалить каждый mandatory catalog entry при сохранённых физических bytes и пересчитанной fingerprint; искажённая projection с целыми receipts; stale final batch после correction; old/new retained batch редакции остаются доступны и валидны для своих Stage packets; absent/corrupt source; conflicting root:path hashes; genuine PLAN input; correction/current attempt; skipped review mode с допустимой reason и output; marked missing predecessor против legacy; accepted decision без optional caller file; чужой engine при shape-compatible RUN; partial output/failure publication. Положительный final packet проходит все consumers без schema/capture исключений.

## 6. P3 — portability retained Stage packets/report после restore

1. `rebaseRuntime` сохраняет historical `audit_events` bytes; это правильно для evidence, но их `file/root` нельзя использовать как текущий operational destination.
2. В existing stage-report-renderer resolution добавить одну portable destination policy по exact project/RUN/stage/attempt и RUN-relative locator. Поддержать обычный `snapshot-runtime-lineage@1` и recovery `recovery-relocation@1/path_mapping`, включая повторные A→B→C перенесения. Переиспользовать trusted mappings для legacy absolute locators; не гадать путь по basename, не искать старый home и не делать глобальный строковый replace архивных evidence.
3. Её используют `publishStagePacket`, `publishStageReport`, `reconcileRunStageReports`, `latestRunVerificationMatrix` (JSON+Markdown+PLAN sources), resume и Work prompt consumption. Только matrix safePath правка недостаточна.
4. SHA/base64/report body/source bytes не меняются. Отдельно разделить old evidence locator и new operational path. При наличии новых относительных metadata считать их authority; legacy сопоставление обязано подтверждать old root → new root lineage.
5. Сохранить current attempt, packet hash, symlink containment, source equality и duplicate conflict guards. Нельзя писать в старый home или чужой RUN, даже если он ещё существует.

Restore ordering тоже входит в исправление: сейчас recovery relocation создаётся после `getFlowRunStatus`, который уже может вызвать reconciliation. Trusted mapping из validated import manifest должен быть доступен resolver **до первого status/reconcile/publication** в новом runtime; import остаётся fenced до успешного завершения. Не открывать productive admission раньше ради чтения и не требовать обращения к старому home. Проверить normal и recovery restore отдельно, включая сбой между подготовкой mapping и completion: частичный import не становится admitted RUN. Existing import/lineage metadata переиспользуются, без глобального registry путей.

Regression: реальный capture → restore/fork в другой home → Stage admission/reconcile → matrix resume/Work prompt; recovery relocation → republish, A→B→C; удалить только disposable projection и восстановить её из retained bytes; source home отсутствует и отдельно существует; obsolete attempt, foreign old root, malformed relative path/symlink escape отказаны. Source archive hashes unchanged. SQLite writer остаётся коротким: filesystem resolution/preparation вне writer, SQL-only authority внутри, публикация после commit.

## 7. P4 — единый self-contained reviewer context, не новая формальность

1. Общий composer PLAN/CODE-review читает exact назначенные Canon criteria и выдаёт их полные разрешённые пути, роль файла и обязательное чтение. IDs — ссылки на каталог, не замена инструкциям. Canon остаётся SSOT; не копировать разные версии criteria в prompts упряжек.
2. Reviewer получает accepted obligations/актуальную PLAN revision, matrix, ограниченную релевантную engineering orientation и конкретные migration/test/fixture inputs. Общая precedence-инструкция в work-registry уже есть — не создавать её второй раз. Orientation сохраняет существующую optional/required классификацию: отсутствие необязательного документа не создаёт искусственный blocker.
3. В existing reviewer payload/`reviewSourceInputs` включить выбранные mandatory criterion/orientation inputs; external read-only copy содержит их, даже если они gitignored. Пути project inputs разрешаются в copy; retained RUN sources — в правильном RUN. Не копировать весь harness home, `.git`, `node_modules` и service files ради контекста.
4. Выбранные authoritative criteria/orientation аддитивно расширяют existing product source baseline hashing/copy, не сужают нынешнюю защиту до файлов, перечисленных в prompt. Read-only source/copy protections не ослабляются. Common preparation/dispatch проверяет assigned files до paid native/external launch, Work start повторно сверяет связанные bytes/identity. Недоступный assigned criterion — точный setup diagnostic, не silent пустой prompt.
5. Applicable / N/A решение проверяется по смыслу канонических областей. Testing/evidence аспекты нельзя отбросить только потому, что изменение «маленькое». Никаких механических требований все аспекты/все тесты/обязательный fanout для каждого PLAN.
6. Canon migration/testing/evidence критерии явно различают fresh install, upgrade существующих данных, reset/cleanup жизненный цикл schema objects, negative DB proof и границы проверок. Это общий подход, не SQL hardcode для task_priority. PLAN owner указывает нужные исходники/ожидаемое доказательство/cleanup; reviewer проверяет адекватность, Judge оценивает качество.
7. Общий Flow core и native delegation blocks остаются разделены. Проверить native/external reviewer и коррекции/repair у Luna/AGY/ZCode, offline sibling Grok/OpenCode/Droid. Продукт не исправлять автором этого плана.
8. Исправить общую ложную предпосылку CODE-review coordinator «CODE is already semantically verified»: passed declared checks доказывают свои contours, а независимый review ещё проверяет семантическую достаточность. Проверить sibling coordinator/worker/Judge texts на эту же подмену, сохранив запрет бессмысленного ручного повторения всех declared checks. Общий composer доставляет заданные sources; он не угадывает продуктовые migration/test paths вместо PLAN owner.

Criteria выбираются existing Canon/project override resolution, а не новым запретом легальных project overrides. В Work packet фиксируются выбранные paths/bytes/SHA и квалифицированная revision источника, если она уже является частью binding. Смена criterion после подготовки требует новой preparation/revision; ссылка на изменившийся live файл не заменяет ранее выданный criterion. И native reviewer, и external copy используют один выбранный набор. Промпт перечисляет файлы, их назначение и действия reviewer, а не утверждает, что файл уже прочитан агентом.

Regression: actual produced PLAN/CODE-review prompt содержит assigned criterion paths и актуальную revision; неназначенные criteria не засоряют пакет; criterion path существует в isolated copy; missing criterion/drift отказаны; legitimate doc-only N/A допустим; schema/data fixture с необоснованным testing N/A оценивается review/Judge fixture, не превращается в ложное deterministic proof. Один вертикальный Work допустим при достаточном bounded context.

## 8. P5 — дополнительные сведения Judge без переписывания истории

Да: найденное после judging существенное доказательство нужно передать Judge. Но finding автора расследования — не verdict, а source-backed hypothesis с границами доказательства. Исходный Judge уже отметил недостаточную глубину миграционной проверки; **конкретный повторный reset** в его findings отсутствует.

1. Минимально расширить existing Final Judge entry для явного supplemental evidence и отдельного output root. Не создавать второго Judge engine и не повторять Subject. Без supplement старое idempotent поведение не меняется.
2. Validate supplement: исходный EVAL/candidate hash, frozen snapshot manifest hash, точные root-relative file refs + byte SHA, источник/автор, observation vs source inference vs hypothesis, claim/impact и proof limits. Supplement не расширяет filesystem authority: ссылки вне объявленной frozen boundary/containment отказаны; текст документа не становится инструкцией и не исполняется.
3. Отдельная judgement identity включает candidate + assessment + resolved profile content/native runtime pin + полный evidence/supplement digest. Profile ID недостаточен: изменение model/reasoning под тем же ID создаёт другую identity. Разные сведения/profile не возвращают старый cached verdict; одинаковый пакет idempotent. Сохранить новый packet/receipt/journal отдельно от historical EVAL, связать original verdict metadata, но не подсовывать прежнюю оценку как обязательный ответ независимому Judge.
4. В reuse `performFinalJudge`/prompt/JSON validator передать exact разрешённые source paths и supplement; запрет обхода чужих EVAL сохраняется. Supplemental result самостоятельно принимает/отвергает находку и классифицирует product quality vs Flow/tooling; мнение расследователя не повышает severity автоматически.
5. Reuse same-Session overload policy, budgets, cleanup и packet immutability. Новая assessment attempt имеет собственные output/runtime-owner/budget/cancellation/cleanup; terminal/cancelled original EVAL scope не открывается заново, его daemon/Codex home не используются для записи. Исторические refs только read-only. Новый Judge call — только отдельная явно запланированная assessment attempt, не неявная background paid повторная оценка. Отдельный report показывает original и supplemental результаты с датами/identity, не меняет CP187 scores in place и не объявляет исправленную acceptance задним числом.
6. Future ordinary Judge packet включает semantic proof limits и evidence от P4/P7; не нужно вручную дополнять каждую новую попытку. Детерминированные validators проверяют identity/схему/полноту, не предрешают semantic finding.

#### Реализационный контракт supplemental entry

- Расширение existing CLI: `runner eval judge --eval <original-EVAL> --supplement <file> --output <new-assessment-root> [--profile <judge-profile>]`. Это **планируемые**, пока не существующие опции. Обе новые опции обязательны вместе; output не внутри original EVAL/runtime и не перезаписывает чужую assessment. Existing lock/atomic-write utilities защищают concurrent identical dispatch; иной packet в занятом output — conflict.
- Supplemental branch отделяется **до** `finalizeRunProjection` и ordinary candidate cache lookup. Она не пишет original report/events/result и не использует admission/cancellation старого EVAL для новой работы. Собственный assessment journal/owner/operation identity обеспечивает budget, restart reconciliation и cleanup. Внешний cancellation прекращает только новую assessment.
- Рубрика по умолчанию — retained original `judge/assessment.json` соответствующей candidate revision, а не `loadCase(manifest.case_id)` из нынешнего checkout. Исходные candidate/evidence/assessment проверяются по retained identity и доступны до paid launch. Если frozen assessment отсутствует — точный setup blocker; не silent fallback. Явно изменённая рубрика требует отдельного маркированного assessment identity и не называется сопоставимой исходной оценкой.
- Минимальная supplement schema содержит schema/version, original EVAL/candidate/boundary/manifest SHA, source refs+SHA, claim, evidence kind, author/source и proof limits. Подготовленный AGY материал выше переводится в эту schema. Original verdict сохраняется как provenance, не как предписанный Judge ответ.
- Selected frozen evidence копируется existing read-only evidence preparation в принадлежащий новой assessment пакет; разрешённые Judge paths указывают на эту copy. Не выдавать writable old runtime/home как рабочую область. Полнота исходного evidence не сужается до четырёх удобных файлов: supplement аддитивен. Provenance сохраняет original refs и hashes; никаких миграций продукта или генерации нового Subject результата.
- Packet identity включает байты frozen assessment, candidate, полного evidence, supplement и resolved profile/runtime. Проверяются не только три верхних JSON, но и все связанные declared source bytes: до dispatch, после backoff/permit и перед принятием результата. Изменение copy даёт evidence-drift failure; original hashes должны остаться прежними. Результат/receipt/cleanup принадлежат новой identity, cached result другого пакета не принимается.

Дополнительные regression: текущий case/rubric изменён после original EVAL; cancelled original EVAL при разрешённой независимой assessment; concurrent identical/different packet; source drift только во вложенном файле; missing frozen assessment; crash после paid dispatch/до result receipt; новое output уже занято; изменение profile под прежним ID. Все это проверяется offline до supplemental paid call.

### Подготовленное source-backed дополнение AGY

- EVAL: `EVAL-20260930024412-c20c2bfe`; candidate `f10643a729b3e47912a7d8dd24736d77216c91d5d145d82e9a8e22523f2030f7`.
- Frozen boundary: `merge-ef5c165e2036c8753f1937ce1971a23fb801de318e825ddd143df218bf56e503`; snapshot manifest SHA `2f5db6ab14ce7b237cd1ca0ccb301aee05b69950594c43e77f31a9dcbf3e5797`.
- Base: `<home>/runs/<EVAL>/executions/e2e/boundaries/<boundary>/workspace/`; пути ниже относительно этой замороженной границы, не рабочего source checkout.

| Source | SHA256 | Доказанный факт |
| --- | --- | --- |
| `apps/api/drizzle/0002_task_priority.sql` | `1a78307e1fc6703bd8567b8df95bdab99984f6b0236b83de7bcf57b48148885a` | Безусловный CREATE TYPE task_priority |
| `apps/api/src/db/migrations.ts` | `4c2ab24b652c7dae5bba0f7c68dc3d750be9d515818fa37a16a9dfd384971b10` | reset удаляет старые таблицы/membership_role, не новый task_priority |
| `apps/api/scripts/test-world.ts` | `11f30b1a17ab6eab0944974f32252c1bc07936950751de53f7cfceaf434556c5` | Новый isolated DB world для проверки |
| `apps/api/tests/global-setup.ts` | `06eda4c9350bdad740c5cae01102bd4755bb19ed89962e696f6345a170c052b9` | Однократный reset fresh world |

Inference: повторный reset/migrate **в той же DB** встретит оставшийся enum. Runtime reproduction не выполнялось. Зелёные receipts не доказывают этот сценарий; они не поддельные. Judge должен определить существенность/относимость по принятым требованиям и роли reset helper. Не утверждать, что он обязан поставить конкретный балл или что найденный продуктовый дефект уже исправлен. Этот раздел — подготовленный материал для supplement, **не уже отправленный Judge пакет**.

Regression P5: mismatch candidate/SHA/root escape/changed bytes; supplement alteration во время overload; same packet cached; changed evidence/profile → separate judgement; invalid JSON/overload/quota/cleanup failure; no Subject dispatch/mutation; original candidate/result/report bytes unchanged; source inference не обозначается observed runtime failure.

## 9. P6 — честная model attribution, без ложных switches

1. Нормализовать **известный ZCode selector** на native boundary, разделив model ID, requested selector и native provider/account routing. Сохранить raw value/method/source/Session/Turn. Устройство qualified bridge source сверять с установленным commit; upstream сам по себе не доказательство installed behavior.
2. Не удалять произвольные prefix/suffix globally. Malformed selector/unknown mapping остаётся explicit unknown. Реальная смена provider/routing не исчезает из отчёта при одинаковом имени модели.
3. Shared model writer и обе report projections сравнивают сопоставимые typed identities/evidence scopes. Убрать рассогласование duplicated policy в dd-flow/dd-eval минимальным shared contract/export либо small parity tests; не завозить новое telemetry SDK.
4. AGY `native.hook` omission для контрактно optional current model — non-asserting observation. Отсутствие обязательного scope доказательства остаётся gap. Configured model не равно server response/per-model usage. Child с неизвестной моделью остаётся unknown, root model не наследуется.
5. Все callers `observeModel` проверить на scope/evidence/source: native init/config/session read/response/hook/child. Не исправлять CP187 journals; новый report отделяет aliases, real transitions и coverage.
6. Dedup сравнивает channel/scope/attempt_id/turn_id/non_asserting и stable native event identity: одинаковый profile из другого scope не стирается предыдущим snapshot. Две существующие aggregator реализации сейчас совпадают; предпочесть общий parity corpus существующему code layout, не отдельный package только ради физического SSOT. Grok optional session-info omission сохраняется; Droid missing/partial inspection или observer failure не становятся optional просто ради completeness.

Regression: CP187 alternating bare/encoded → 0 ложных switches; реальная модель/provider change сохранена; hook omission не стирает known root configured scope; отсутствие response scope не подменено configured; malformed selectors/unknown child не PASS; mode/permission integrity неизменны; dd-flow/dd-eval projections согласованы.

## 10. P7 — tool evidence не теряется и не становится фиктивным success

1. Использовать exact retained AGY child `log_uri`, подтверждённый native ancestry/physical identity. Reader поддерживает фактический transcript формат, а не только live step_update. Не сканировать home целиком и не угадывать child по последнему root.
2. Decode/normalize в shared tool-observations boundary; dedup по доказанной native Session + epoch/step/tool identity, не по command/name/time. Transcript step/index не считается автоматически тем же invocation ID, что live call; если join недоказан, выбрать явную source precedence и сохранить partial/correlation gap, не суммировать две неизвестно пересекающиеся выборки. Live journal и transcript snapshot не складывать дважды; сохранить source locator/hash/range и truncation/partial-tail/unsupported shape gaps. Наличие одного journal tool у child не отменяет чтение более полного retained transcript: existing fallback «Session уже covered» проверяет полноту, не просто факт первого события.
3. `ToolObservations.add`: reason сохраняет gap, но не выбрасывает одновременно идентифицированный call. Unknown status сохраняется unknown/pending, не completed. Reason-only event остаётся только gap. Conflicting terminal facts видимы.
4. Unsupported transcript shape не даёт пустое total=0/completeness=complete; различать evidence-backed no tools и нераспознанный native stream. Проверить sibling ACP/Codex/Droid/OpenCode paths и existing usage/accounting consumers.
5. Native pending `invoke_subagent`, Work success и `settled_by_root` — три разных факта; не синтезировать native success из graph settlement. Tokens/model не выводятся из tools. Tool failure исправленный агентом не превращается автоматически в runtime failure всего RUN.
6. Отчёт и Judge packet показывают coverage по physical Sessions, partial источники и исходы отдельно. Capture переносит только выбранные нужные evidence с hash; stale locators после cleanup не ведут в mutable home, missing bytes отмечаются как gap.

Место capture — adapter/native inspection ingestion существующей управляемой Session, пока exact `log_uri` доступен, и финальный drain до cleanup. Не переносить внешнее чтение/запись в `runObservations` или status: их managed-home containment сохраняется. Native locator — ссылка на конкретный файл, не разрешение сканировать `.zcode`/AGY/Grok home. Проверить supported URI, regular file/no symlink escape и native Session/ancestry привязку; одного текста произвольного `log_uri` из prompt недостаточно. Owned journal/source metadata удерживают нормализованные нужные records, hash прочитанного byte range и provenance; secrets/посторонние служебные файлы не копируются.

Растущий transcript читать по стабильному record prefix с ограничением размера; неполный последний record не считать terminal failure/complete и дочитать при последующем inspect. Truncation уже завершённого source сохраняется gap. Если подтверждённая Session отсутствует в captured evidence, report остаётся partial, а не подставляет tools родителя. Restore читает только retained owned evidence; missing capture после cleanup — диагностируемый gap, не попытка вновь открыть старый harness home.

Regression: CP187-format child transcript + live snapshot dedup; partial stream с одним child tool + richer transcript с остальными; недоказанный join без guessed IDs; truncation/unsupported/tail; foreign Session/locator/symlink отказ; identified unknown status counted once и pending; running→completed/failed replay; conflicting terminal; no inference model/usage/Work success; cleanup source unavailable не маскируется complete. Отдельно проверить отсутствие двойного учёта parent-inclusive events.

## 11. Порядок реализации и gates

1. P0 red inputs; P1–P3 и P4–P7 можно разделить по непересекающимся файлам, root интегрирует и проверяет результаты.
2. Сначала P2/P3 + P1 технические blockers; P4/P5 закрывают semantic handoff/evidence; P6/P7 observation. Все входят в завершение плана, не откладываются молча как cosmetic.
3. Существующие dd-flow typecheck/build/runtime-sensitive/integration suites; dd-eval `node --test`. Минимальные focused tests расширяют уже существующие suites, не новая test framework. Canon validate/build/sync согласно текущим runbooks. Для publish дождаться success CI **exact release commit**, не ссылаться на beta.122 CI как доказательство новых изменений.
4. Проверить exact installed native protocol fixture, packaged restore/publication/capacity/model/tool probes. Затем immutable release artifact/Canon/flow-pack/checkpoint + настоящая matrix qualification. Меняются только flow instructions/pack metadata, продуктовый baseline остаётся исходным.
5. Отдельная supplemental AGY assessment по P5 (без Subject) после готовности validator; результат приложить как самостоятельный addendum. Если provider unavailable — сохранить подготовленный packet и точную причину, не выдумывать verdict.
6. Новые homes и EVAL IDs для Luna/AGY/ZCode; не reuse CP187. Preflight, baseline, hook/native root-child/HITL qualification PASS перед scored launch. Codex через `cx`/CPA; Luna `gpt-6-luna/xhigh`, все Judges `gpt-6-sol/high`; текущие qualified AGY и ZCode binaries, не obsolete paths.
7. Перед launch explicit DD_EVAL_HOME/DD_FLOW_BIN/DD_FLOW_CONFIG_HOME/DD_FLOW_RESOURCE_HOME; freeze definition/runtime/fixtures. Во время run не меняем их. Monitoring по `runbooks/e2e-monitoring.md`: actual Stage по RUN/controller/Work, не manifest entry-stage.
8. Overload обрабатывает штатный bounded continuation до failure; quota/eligibility/неустранимый blocker останавливает только соответствующий EVAL штатно. Другие продолжаются. Runtime failure расследуется read-only; no manual repair/resume historical. Heartbeat сам не включать.

### Итоговый done

- Для каждого C/M/R/J/O выполнена указанная regression, нет необъяснённого skip; перечислены commits/CI/installed hashes.
- На Luna доказана native same-Session continuation после completed effect, без duplicate lifecycle; живой E2E не обязан случайно получить overload — этот край подтверждает deterministic native fixture.
- Все три новые EVAL достигли MERGE, terminal cleanup и valid Final Judge; case-acceptance не unavailable из-за catalog/restore ошибки.
- Для полного положительного результата case-acceptance должна быть `passed`, а не просто иметь статус отличный от unavailable. Legitimate failed acceptance/product quality findings показываются отдельно от успешного полного технического цикла; их нельзя исправлять ручной правкой продукта или переопределением рубрики.
- Product quality Judge findings и accepted proof limits не скрыты техническим completed. При недостаточном качестве продукта цель считается неполной по соответствующему критерию, не оправдывается зелёными checks.
- Original CP187 candidate/snapshots/verdict/journals не изменены; supplement связан с ними, но не переписал историю.

## 12. Проверка ponytail / что намеренно не строим

- Переиспользуем existing capacity helper, operation journal, lineage, packet publisher, reviewer composer, native decoder, Judge runner/validator.
- Не строим retry framework, proof registry, telemetry SDK, универсальный prompt engine или новый artifact store.
- Не ослабляем owner/identity/containment/unknown-delivery guards и не объявляем committed effect no-effect. Убираем необоснованную строгость «любой tool запрещает continuation», а не реальные safeguards.
- Не требуем бессмысленной документации, всех аспектов/тестов, mandatory Work split или immutable всего harness home.
- Не ремонтируем продукт/исторический EVAL ради PASS, не меняем fixture смысл под результат и не делаем inference обязательным Judge verdict.
- Нетривиальная ветка обязательно имеет runnable check в existing suite. Повторное использование guard допускается только после проверки всех sibling callers.

## 13. Изменения относительно первоначальных предложений CP187

Добавлены: running Work/active MERGE/committed ACK/HITL/child continuation; durable ordinal/chain/not_before и cancellation/Retry-After/backoff/permit reinspection; настоящий producer→consumer qualification с projection; exact RUN engine binding; missing predecessor vs legitimate optional sources; portable Stage packet/report destinations после restore; assigned criterion transport в ignored-file review copy; отдельная supplemental judgement identity; typed model scopes и dedup parity; child transcript decoding/dedup/truncation; сохранение unknown identified tool calls. Первоначальное утверждение «matrix source потерян при snapshot» заменено точной причиной — source отсутствует в catalog. Ранее заявленная общая переносимость restore ограничена: portable matrix body недостаточен при historical absolute SQL locators.

## 14. Повторная readiness-проверка и обязательные gates

### Что доисследовано и уточнено

| Недостаточная определённость прежнего плана | Установленное основание | Добавление |
| --- | --- | --- |
| Нет точного retained batch locator/revision rule | Matrix source уже поддерживает arbitrary role и run-relative path; canonical batch перезаписывается correction | P2: existing content-addressed source path, historical/final authority разделены |
| Mapping есть, но неизвестно когда resolver его увидит | `eval-snapshots.ts`: `getFlowRunStatus` раньше recovery relocation | P3: mapping до первого reconciliation, fenced partial import |
| Непонятно, по какой рубрике судить старый candidate | `evalJudge` читает текущий `loadCase`, дважды вызывает projection finalize | P5: ранняя независимая ветка, original frozen assessment, без записи в старый EVAL |
| Top-level packet SHA не защищает связанные source bytes | `judgeCapacityPrompt` контролирует верхние JSON, supplemental source files пока не часть контракта | P5: full declared evidence hashes на wait/dispatch/result boundaries |
| Внешний native transcript недоступен managed reader после cleanup | `runObservations` читает только owned home и пропускает fallback после первого covered tool | P7: ingestion capture до cleanup, owned portable evidence; coverage проверяется по полноте |
| Settlement/receipt отсутствие может неверно закончить уже выполненную задачу | Shared helper возвращает receipt/null; caller lifecycle guards различаются | P1: явное owner решение, predecessor-specific budget, без повторного lifecycle |

Это code-backed дополнения, не новые заявления о наблюдённых CP187 failures. Existing test PASS сам по себе не доказывает эти новые ветки.

### Условия передачи в реализацию

1. P0 фиксирует red cases и expected outcome для каждого ID. В implementation журнале указывать путь теста/команду/результат и affected callers; assertion про absence of duplicate dispatch обязательна для всех retry owner paths. Empty fixture, skipped review или mock с вручную дописанным catalog не закрывает end-to-end producer defect.
2. Сначала portable resolver/import ordering и batch retention, затем общий technical verifier/real qualification; иначе qualifier может закрепить неправильную source authority. P1 завершается по всем owners, включая child/Judge/capacity, не только по Luna controller. P4/P7 feed будущий Judge evidence; P5 требует их корректного provenance, но отдельный supplemental path тестируется независимо.
3. Additive metadata/schema изменения сохраняют чтение старых unmarked artifacts. Новые marked RUN получают строгий новый контракт, старым EVAL не дописываются sources/intents. Version bump/checkpoint требуется при изменении qualification payload; stale checkpoint от beta.122 не admission для новой реализации.
4. Before scored launch проверить actual packaged generated PLAN/CODE reviewer payload в выбранном стандартном режиме, где reviewers действительно запускаются. Review-off fixture полезна только как отдельная compatibility проверка. Criteria существуют в native/external рабочей области; новые instructions не подменяют независимую оценку утверждением «семантика уже проверена».
5. Native deterministic fixtures закрывают rare overload/restore/race edges без ожидания случайного live сбоя. Live три E2E проверяют полный lifecycle, acceptance, Judge, cleanup; отсутствие overload в них не отменяет regression test и не доказывает retry самостоятельно. Все ошибки setup/eligibility/quota фиксируются как blocker конкретной упряжки, не как успешно выполненная цель.
6. Implementation может менять internals minimal образом, но не перечисленные contracts/gates. Нельзя снимать guard только ради прохождения теста, вводить общий retry при transport ambiguity или подменять source evidence synthetic success. По ponytail нужны небольшие изменения существующих компонентов и runnable проверки, а не отдельные retry/artifact/telemetry frameworks.

### Проверки самого readiness-аудита

- Повторно прочитаны producer/consumer source schema, qualifier, restore ordering, managed evidence reader и Final Judge entry/packet preparation. CLI `--profile` согласован с существующей командой; `--supplement/--output` ещё должны быть добавлены в parser allowlist, help, runner entry и CLI tests вместе, не только в функцию.
- `node --test test/judge-capacity.test.mjs test/engine-admission.test.mjs test/case-acceptance.test.mjs test/model-observations.test.mjs`: 19/19 PASS, без skip. Это baseline существующего кода, **не** подтверждение исправления C/M/R/J/O.
- Документ не требует нового retry framework/schema матрицы/artifact store и не расширяет filesystem authority на весь home упряжки. В реализации нужны новые red→green assertions и packaged/live gates из §11/§14; сегодня они не выполнены.

План готов к реализации после этих уточнений. Paid supplemental Judge и три E2E входят в его последующие validation steps, но в readiness-аудите не запускаются. Внешний доступ/квота и качество решения модели остаются проверяемыми ограничениями, а не гарантией, которую даёт документ.
