# 060 — CP188: оставшиеся дефекты и системные исправления

Дата: 2026-09-30; системный аудит, детализация, реализация и приёмка: 2026-10-01. Статус: source implementation A–H, включая §11, завершена; полные offline gates PASS. Результаты и точные commits — [implementation report](060-cp188-implementation-report.md). Ниже сохранены исходные решения и evidence планирования. Publication/hooks/new E2E не выполнялись; delivery остаётся отдельной задачей.

Последующее ревью выявило и исправило существенные gaps в capacity recovery, обязательных CODE fixes и frozen check evidence. Текущие source commits и отдельные проверки исправлений — [review report](060-cp188-review-report.md). Полные первоначальные gates в implementation report относятся к исходной приёмке, не к последующему review-tree.

CP189 выявил дополнительные native continuation/lifecycle/diagnostic gaps, не закрытые этой приёмкой. Новый подробный план, включая исправление тестовых контрактов, — [061](061-cp189-native-continuation-and-lifecycle-repair-plan.md); его реализация пока не начата.

## 1. Границы и проверенные inputs

- dd-flow: `fix/cp187-matrix-admission`, `6f441c26f9b75253e541be084abfb187667cb745`.
- dd-eval: `eval/cp188-agy-update`, `b12451a04603a853422705cc977d1c871cc37c68`.
- Исторические CP188 используют published beta.123, commit `0d75e9e7e18868fbe9eee8d51e4c4d06ab03a8cd`, а не последующие 059 review fixes.
- Luna: `EVAL-20260930124453-85fe1ce6`, home `/Users/deksden/.dd-eval/qualification/cp-188-luna`.
- ZCode: `EVAL-20260930124831-90499313`, home `/Users/deksden/.dd-eval/qualification/cp-188-zcode`.
- AGY: compatibility/capacity прошли; scored CP188 не создан из-за Codex Interaction Judge cleanup на qualification.
- Grok исключён из live работы до снятия квоты 2 октября; дата сама по себе не является доказательством доступности.

Не ремонтировать продукт вручную, не менять frozen PLAN/case/runtime старых EVAL, не resume/restart исторические Sessions. Ошибки смыслового планирования и реализации продукта оцениваются через Judge; наши исправления — flow, harness/tooling и достаточность переданного контекста. Этот документ не разрешает paid qualification, публикацию engine или новые E2E.

## 2. Зафиксированная overload policy

Пользователь согласовал отказ от lifetime-лимита «две дополнительные попытки».

1. Только доказанный terminal native `serverOverloaded` допускает короткое продолжение **той же Session и исходной задачи**, не replay исходного длинного задания.
2. Первоначальная ошибка запускает continuation, но не считается отказом продолжения.
3. Остановиться с `provider_overload_burst`, если два последовательных **различных continuation Turns** завершились terminal `serverOverloaded` с расстоянием между подтверждёнными failure timestamps **не более 120000 ms**. Ровно 120000 входит в окно.
4. Если расстояние больше окна, последний отказ становится началом новой пары; lifetime attempt counter не останавливает работу. Успешный Turn завершает цепочку и очищает burst-состояние для следующего самостоятельного задания.
5. Сохранять backoff: первая отправка через 5 s, последующие через 15 s; подтверждённый `Retry-After` может увеличить ожидание. Backoff не обновляет failure timestamp.
6. Общий уже установленный owner deadline сохраняется на всю цепочку и reattach, включая wait/inspection/dispatch; continuation не выдаёт новый бюджет. Quota/auth/permanent failure остаются terminal; quota reset сообщать только из доказанных provider metadata.
7. Сохранять cancellation, current owner/generation/lease, неизменность Judge packet, Work/Stage/HITL boundaries, native settlement и no-replay guards. Завершённый Work/Stage или принятый HITL нельзя повторно отправлять из-за overload.
8. Потеря ответа/unknown dispatch не является новым отказом и не даёт права на successor: сначала observation/reconciliation того же operation ID.
9. `provider_overload_burst` — наблюдаемый частый отказ, а не доказательство глобальной аварии провайдера.

Уточнение после аудита: normal controller задаёт `timeoutMs: null` для prompt, Final Judge/обычный Interaction Judge и capacity probe не передают общий deadline. `runtime budget` здесь не равен временному лимиту. Поэтому нельзя обещать, что везде уже есть общий timeout, или молча добавить другой lifetime-лимит. Сохранять существующие owner deadlines там, где они определены; явное отсутствие общего deadline должно оставаться видимым. Новая временная политика для таких владельцев, если понадобится, — отдельное решение, не скрытый компонент этой согласованной политики. От быстрых бесконечных повторов защищают burst и backoff; долгие отказы, разделённые более чем двумя минутами, по согласованному правилу не исчерпывают lifetime attempts.

### Durable время и безопасность

Записывать первый подтверждённый failure timestamp один раз для exact Session/Turn/operation. Повтор inspect, restart observer или прочтение cached failed receipt не создаёт новый refusal и не меняет время. При наличии надёжного native terminal timestamp использовать его; иначе first durable observation, с указанием происхождения времени. Child observation без timestamp фиксируется при первом подтверждении, не на каждом poll. Не использовать время приготовления successor (`not_before`) или нового throw как время отказа.

Окно считается по двум отказам продолжения, не по длительности запроса и не от первоначального overload. Persisted clock reversal/invalid timestamp не должен превращаться в разрешение replay: typed reconciliation failure, без нового dispatch. In-process ожидание использует monotonic elapsed time; durable UTC нужен для reattach. Ordinal — положительное safe integer и часть bound intent, но не unlimited admission authority.

## 3. Luna: причина последнего failure

Luna CP188 прошла SPECIFY/PROTOCOLIZE и остановилась на PLAN. Report: `completed_with_failures`, cleanup settled, Judge `not_run_cleanup_only`.

Все три Turns принадлежат Session `01a0f27d-2875-75a1-8a70-7d380b81538a`:

| Turn | Первый/продолжение | Terminal overload UTC |
|---|---|---|
| `01a0f27d-3d5a-7e70-bab8-e5c44d464fc1` | исходный | 13:31:30.481 |
| `01a0f283-e8a9-7ad3-aded-73169d7647e4` | continuation 1 | 13:49:40.186 |
| `01a0f294-7c05-7700-bbd4-c67fd757a7ff` | continuation 2 | 13:53:10.953 |

Два continuation отказа разделены примерно 211 s, а не <=120 s. Поэтому новая политика разрешила бы следующую безопасную continuation, если owner/settlement всё ещё подходят. Это **не доказательство**, что следующая попытка завершилась бы успешно.

Предыдущая same-Session доработка сработала: две короткие команды действительно отправлены, новые Sessions не создавались. Последний native snapshot показывает observed items, pending=false, possible_effects=true: завершённые инструменты не были причиной отказа в continuation. Остановку вызвал фиксированный предел `ordinal <= 2` в `codex-capacity.ts`, не отсутствие реализации continuation и не quota. После исчерпания helper бросает последнюю native ошибку без причины исчерпания и всей цепочки. Report `recovery_count=0` относится к отдельному RUN recovery, не доказывает отсутствия overload continuations.

### Все найденные места фиксированного предела

Пути в таблице относительны к соответствующему репозиторию.

| Место | Проблема / доработка |
|---|---|
| flow `src/services/codex-capacity.ts` | `ordinal <= 2`, suffix `[12]`, root extraction, `wait > 30000`, raw final throw; заменить lifetime cap на durable burst и typed history |
| flow `src/services/run-controller.ts` | retained-intent SQL читает только root и первый successor; читать exact связанную цепь, не wildcard authority. Native child followup отдельно ограничен `attempts < 2`; применять то же правило к child Turns |
| flow `src/services/run-controller-adapter.ts` | HITL admission распознаёт `[12]`, predecessor второго всегда capacity:1; последовательный n-1 и exact retained binding для каждого ordinal |
| flow `src/harness-runtime/lib/dd-codex-daemon.mjs` | специальный boundary guard распознаёт только capacity/followup `[12]`; ordinal 3 не должен выпадать из усиленного admission |
| flow `src/services/run-recovery-runtime.ts` | `[1,2].includes`, predecessor `prior[0]`, отдельный retained recovery contract; n-1, timestamp/policy identity, accepted ACK по-прежнему запрещает successor |
| flow `src/services/run-controller-recovery.ts` | передаёт retained intents, но не deadline/signal helper; не заявлять несуществующий timeout, проверить cancellation through current recovery owner |
| flow `src/services/external-work-launch.ts` | existing Work scope, 45-minute prompt deadline, receipt persistence; сохранить один origin deadline, cancellation/read-only source guards |
| flow `src/services/merge-server.ts` | 45-minute deadline и progress `.../2`; убрать lifetime presentation, сохранить dispatch owner/target/lease и исходный deadline |
| eval `lib/judge-capacity.mjs` | длина цепи/loop ограничены backoff array; `wait >30000`; timestamps отказа не являются обязательными durable полями. Сохранять existing lock и dispatch reconciliation |
| eval `lib/runner.mjs` | Final/Interaction Judge, supplemental через общий Judge path, capacity probe; единая policy, диагностические события, owner deadline без reset |
| eval `lib/operation-errors.mjs` | отдельный overload classifier уже расходится с flow; нормализовать typed native error одинаково |

Отдельно **воспроизведён** classifier drift: error `turn_interrupted`, failed, matching Session/Turn/native_turn_id, `provider_error.codexErrorInfo={code:'serverOverloaded'}` даёт flow=true, eval=false. Строка `'serverOverloaded'` даёт true у обоих. Это дополнительный дефект Judge/capacity, но CP188 Luna использовала строковую форму и не доказывает live manifestation этого drift.

### Дополнения системного аудита capacity

1. **Primary-error precedence нарушена в EVAL.** `operation-errors.mjs:30–41` ищет overload в произвольных `cause/details.error`. Read-only probe подтвердил: внешние `lifecycle_rejected`, `ownership_lost`, `hook_failed`, `operation_observation_lost` с вложенным overload дают eval=true, flow=false. Разрешать только явно допустимые adapter wrappers; потеря владельца/unknown outcome/ошибка lifecycle не становится overload и не авторизует successor.
2. **Quota normalization тоже расходится.** `providerLimitMetadata` распознаёт строковый `usageLimitExceeded`, но не `{code:'usageLimitExceeded'}`; теряются category/reset metadata. Общий normalizer нужен и reporting consumers (`runner.mjs:1731–1740`), не только continuation. Quota от этого не становится retryable; reset без точной native authority не выдумывать.
3. **Capacity probe хеширует не отправляемый prompt.** `runner.mjs:2530–2539` сохраняет literal `capacity-probe`/helper continuation, dispatch игнорирует `_text`; фактический prompt рендерится отдельно в `:2572`. Передавать actual rendered initial/continuation strings, отправлять полученный text verbatim; existing identity должна связать actual maximum, frozen profile/runtime и renderer. Reattach с изменённым prompt/контрактом — conflict до dispatch.
4. **Judge не проверяет native Turn items.** `judge-capacity.mjs:76–85` проверяет settlement, но не observed/pending items; subject helper это делает. Локальный fake dispatch с `{observed:false}`, settled=true/not_required всё равно отправил successor. Требовать доказанные items именно failed Turn: unknown/pending effects запрещают continuation, завершённые effects при pending=false разрешены. Read-only Judge не исключение из факта неизвестного outcome. Сохранять более сильную owner-specific tree/settlement проверку, не заменять её одним общим boolean.
5. **Child terminal timestamp теряется/переписывается.** `dd-codex.mjs:232–234` обновляет `terminal_observed_at` при повторном completed notification того же Turn; `controller-fanout.ts:142–145` не проецирует его. Сохранять первый подтверждённый timestamp для exact Session/Turn и проецировать его в durable chain. Новый Turn — новое время; duplicate notification/inspect — нет.
6. **Retry-After overflow.** `retryAfterMs({retryAfter:Number.MAX_VALUE})` возвращает Infinity. Удаление 30 s cap без проверки конечного delay/representable UTC оставит invalid timer/Date path. Использовать typed invalid metadata outcome; не обходить backoff. Existing finite validation flow сохранить, ожидание разбить на bounded cancellable slices.
7. **Retained chain требует проверки целиком.** `codex-capacity.ts:77–91` пропускает несвязанные записи. Для текущего root проверять exact последовательность, уникальность operation/ordinal/Turn, prompt/task/owner binding и n−1 до dispatch; не выбирать удобный prefix из conflicting chain. Unrelated roots остаются отдельными задачами, не authority текущего продолжения.

Это code/offline findings, не дополнительные live incidents. Operation filenames уже SHA256-hashed в `daemon-operations.mjs`; новый framework ограничения длины IDs не нужен. Проверить positive safe integer и существующий initial recovery bound, не придумать глобальный лимит continuation count.

### Минимальное системное исправление

- Небольшая общая pure policy/typed normalization в существующем bundled harness-runtime; TS controller и JS consumers должны использовать один контракт. Owner-specific orchestration/ledger не объединять в новый framework. dd-eval получать helper из **pinned engine runtime**, не из произвольного текущего checkout/глобального binary; adapter integrity и offline qualification должны проверять наличие/версию helper. Старые engines без нового контракта явно несовместимы с новым admission, не silently fall back на слабый guard.
- Использовать существующие operation receipts, controller state, recovery dispatch, Judge chain для durable refusals и связанного successor. Не создавать вторую БД или scheduler. Judge chain version/policy identity меняются явно; старые receipts не мигрируют задним числом. Unknown legacy chain без нужных timestamps не может заново отправить retained Turn.
- Разделять parent Turn, отправляющий `followup_task`, и native child Turn: успешная отправка родителем не является успехом ребёнка, overload родителя не удваивает child failure. Один burst state на исходную child задачу, очистка после реального child success. Любое повторное observation одного turn не новый отказ.
- Убрать искусственный 30 s максимум Retry-After: ожидать, если **установленный owner deadline** позволяет; cancellation/current boundary проверять во время ожидания и после permit acquisition. Не повышать существующие Work/MERGE deadlines.
- Failure projection сохраняет root/session, distinct failed Turns/timestamps, continuation count, stop reason, native primary и cleanup secondary. Не выставлять generic `retryable:true`, который мог бы перезапустить весь EVAL/исходную работу. `recovery_count` не переопределять: отдельные continuation facts.

## 4. ZCode: проверки исчезают между CODE и MERGE

ZCode CP188 прошёл все семь стадий и завершился `completed`, Final Judge completed. Но case acceptance `unavailable`: `matrix check has no accepted target binding: PRT-007-task-priority/CHK-PRIORITY-API`. Это завершение исполнения, не успешная продуктовая приёмка.

В frozen PLAN `CHK-PRIORITY-API` и `CHK-PRIORITY-BROWSER` остаются `availability: planned`, `run_at: work`, с provider и exact definition. CODE matrix содержит PASS RCP-010/011; после CODE-REVIEW repair — PASS RCP-021/022. MERGE receipts включают прежний SCN browser и policy quality/docs, но не эти два semantic checks. Final matrix честно показывает их unavailable.

**Первопричина:** `vnext-merge.ts:389 planChecks` берёт только `availability === 'available'`. Это PLAN-time декларация, не текущее состояние материализации. Immutable PLAN не обязан переписываться после provider Work. `effectiveCheckDeclarations(...,['work','code','readiness','merge'])` включает work checks, поэтому ошибка не в work gate как таковом. `validateMergeAcceptance` проверяет лишь AC с gate=merge; work/code obligations не предотвращают сокращённый MERGE gate.

`verification-matrix.ts` финально выбирает только receipts, связанные с target MERGE acceptance. Поэтому предыдущий CODE PASS не появляется как финальный target proof — это правильная защита, а не место для её удаления.

**Исправление:** собирать полный due каталог из принятого PLAN, включая planned, и проверять текущую materialization через existing check declaration/profile validation: provider completion, exact alias definition, terminating command, required inputs. Проверять source до productive freeze и реальный integrated target после apply/bootstrap. Исполнить полный effective target gate и получить native target receipts; failed check остаётся evidenced failure в owning MERGE Work. Missing alias/drift — typed error, не тихое исключение проверки. PLAN bytes остаются неизменными; никакого принудительного `passed` и переноса CODE receipt на иной tree.

Аудит sibling selection: `vnext-plan.ts` фильтрует available при PLAN-time executable validation, а planned валидирует отдельно — это оправдано до появления provider Work и не требует механического удаления всех фильтров. CODE/Work используют declaration/materialization guards для **исполняемых** checks, но это не покрывает все обещанные provider aliases.

**Дополнительная причина поздних materialization errors:** `vnext-plan.ts:468` передаёт все создаваемые aliases как `provides_checks`; `work-registry.ts:880–895,993–1025` не проверяет этот список при completed. Provider может закончить Work без alias с `run_at=code/readiness/merge`, в том числе не входящего в его собственные `packet.checks`. Prompts обещают проверку materialization на finish, которой здесь нет.

Исправить в общем Work completion до settlement: каждый `packet.provides_checks` проверять existing `validateCheckDeclaration`. Не запускать aggregate checks раньше назначенного gate. Existing input validation проверяет syntax/containment и допускает ещё отсутствующий безопасный путь: не добавлять новую строгость «все future inputs уже существуют». Recheck source/target declarations на owning aggregate gate сохраняется. Проверки файлов/profile выполнять **до**, не внутри SQLite writer transaction; final ownership/generation/status CAS и атомарный settlement не ослаблять.

## 5. Квалификация пропускает сокращённый final gate

`engine-admission.mjs` строит expected refs из уже опубликованных `gate.checks + gate.acceptance_refs`. Shared `validateVerificationMatrixAuthority` проверяет PLAN projection/criteria/authority и policy refs, но не требует включить все due semantic refs в target gate. Поэтому внутренне согласованный, но неполный gate способен пройти эту часть qualification.

Read-only воспроизведение на одном frozen ZCode packet: current `checkCaseAcceptance(task-priority@3)` возвращает unavailable; вызов `validateVerificationMatrixAuthority` на той же final matrix с её source proofs и MERGE report проходит. Это проверка общего guard, не утверждение, что полный CP188 packet прогонялся через всю qualification CLI.

**Исправление:** один shared validation required coverage для qualification и case acceptance. Required refs выводятся независимо из **всего принятого `PLAN.checks`**, не только AC rows или текущей матрицы: include item-only и не привязанные к criterion checks. Сверять canonical refs и exact declarations, не только размер списков. Reduced gate не определяет собственную полноту. Сохранять exact scope/tree/hash/native receipt checks. Новая qualification fixture обязана проходить весь provider planned alias → CODE → review/repair → MERGE → final consumer путь, а не только all-available пример.

Read-only in-memory negative на CP188 qualification MERGE packet: удалён `PRT-001-task-priority/CHK-MERGE` из decoded gate и `matrix.policy_checks`, обновлены source hash/fingerprint; `validateVerificationMatrixAuthority` всё ещё PASS. Исторические файлы не менялись. Это воспроизведение shared guard, не всей qualification CLI. AC-only fix оставил бы этот sibling дефект.

**Project policy authority также независима.** `verification-matrix.ts:175–177` строит final policy rows из gate, checker сравнивает их обратно с gate. В `sources` нет exact policy/profile proof, поэтому полный PLAN сам по себе не доказывает mandatory project gates. Retain исходный accepted profile/baseline и integrated target profile с existing baseline-extension/hash contract; вывести due mandatory refs из policy authority независимо от gate. Frozen consumer не читает mutable live profile. No-profile — явное accepted absence, не fallback при исчезнувшем обязательном proof. Не сохранять весь harness home.

CP188 offline fixture содержит semantic `PRT.../CHK-MERGE` в policy rows, но не настоящее `POLICY/*`; дополнить будущую qualification fixture хотя бы одной обязательной project policy и negative её согласованного удаления. Historical proof не редактировать и не переименовывать в proof нового engine.

**Failure vs missing output:** `case-acceptance.mjs:267–271` допускает failed/aborted native receipt, но требует все `required_artifacts` в `artifacts` независимо от status. Доказанный terminal failed check, который не успел создать expected output, превращается в unavailable. Разделить failed execution с gaps expected outputs и повреждение уже заявленных artifact bytes. Первый остаётся известным failed check (не автоматическим доказательством продуктового дефекта), второе — unavailable authority. Aborted/unknown без доказанного результата не объявлять product failure.

### Дополнительный edge defect: release

Matrix producer умеет `run_at: release`/`not_due`, `verifyFinalMatrix` требует target binding безусловно для всех criterion checks. Однако `vnext-plan.ts:547,579` уже **запрещает RELEASE checks/acceptance в MERGE-ending RUN**; `:584` проверяет gate ordering. Поэтому утверждение о легальном таком PLAN в текущем CP188 неверно. Это latent consumer divergence для допустимого промежуточного/release-capable контракта, не причина CP188 и не разрешение добавить RELEASE в MERGE-only RUN.

Нормализовать due семантику в одном общем consumer guard: не требовать RELEASE receipt до RELEASE, не выдавать такой criterion за пройденную приёмку. Если case требует доказать этот criterion уже на MERGE, отражать невыполненную/неподходящую proof в facts/gaps и Judge, а не объявлять неизменный packet повреждённым. Для due work/code/readiness/merge refs обязательные target bindings остаются обязательными.

## 6. Смысловое сужение требований и review/HITL

ZCode Final Judge обнаружил материальное сужение: исходные AC-004/AC-012 и canonical answer требуют priority в API списка **и детальной задачи**; PLAN-REVIEW заменил детальную задачу на list/create/update, мотивируя отсутствием исходного detail GET. Отсутствие endpoint в baseline не разрешает автоматически отменить требование. Но оно также само по себе не доказывает, что продукту необходим новый GET endpoint: detail UI мог использовать list API. Не назначать продуктовый patch вместо анализа принятого пользовательского поведения.

Нельзя считать причиной просто «нет правила в промпте»: canon `vnext/plan.md` и `vnext/plan-review.md` уже требуют semantic preservation и запрещают стирать obligation через proof limits. Model/reviewer правило нарушили либо разрешили неоднозначность без необходимого подтверждения; детерминированная структурная проверка не доказывает смысл.

Перепроверка **исправила прежний вывод об отсутствии reviewer context**: `renderWorkerPrompt:1033–1038` уже добавляет absolute SPECIFY path, общий `acceptedDecisionPrecedence` и matrix instruction для fresh PLAN/CODE reviewer. Дублировать этот блок не нужно. Canon уже требует semantic preservation; отсутствие ещё одного лозунга не установлено как root cause.

Реальный tooling gap — exact authority/read-input protection: prompt говорит «later accepted decisions», но не перечисляет точные relevant PROTOCOLIZE/effective source refs; `assertSharedReviewInput:773–842` защищает PLAN/CODE reports, plan/maps/batch и **matrix bytes**, а не весь названный matrix.sources набор. `latestRunVerificationMatrix` реконструирует retained PLAN/batch, но не перепроверяет original SPECIFY/PROTOCOLIZE bytes. Reviewer может читать source напрямую по absolute path, не входящему в sibling read-only baseline; следующая matrix publication поймает drift позднее. Это code boundary finding, не доказанная причина CP188 semantic narrowing.

Расширить existing review-input run_inputs **точными accepted sources**, которые действительно выдаются reviewer: SPECIFY, applicable PROTOCOLIZE/accepted amendment и origin non-goals; извлечь paths/hashes из existing matrix source catalog. Проверять hash до dispatch/start/finish, одинаково native/external. Existing project review-copy/root mapping оставить: RUN sources доступны по явно указанным абсолютным paths, не копировать весь RUN/home. Разрешённое изменение PLAN coordinator после settlement reviewers публикует новую accepted revision, не меняет старый sibling baseline. Effective obligations брать из existing matrix/accepted PROTOCOLIZE projection; не создавать второй semantic SSOT.

**Новый механический пробел:** `plan-review-decision@3` разрешает `decision='requires_user'` при outcome=accepted. `finishPlanReviewOwned` проверяет, что каждый finding классифицирован, но не запрещает unresolved requires_user; затем регистрирует CODE. `applyReviewResults` — no-op, downstream resolution guard здесь нет. Code audit подтверждает unsafe accepted path; отдельного live случая с этим payload не заявляется.

**Исправление:** accepted decision не может содержать unresolved requires_user. Использовать existing stage pause/resume/HITL, не новый questionnaire workflow. После ответа coordinator классифицирует finding окончательно (accepted_fix/rejected/etc.) и ссылается на existing durable answer там, где уже есть такой evidence contract. Не вводить обязательный HITL для любой разумной инженерной детали. Изменение действительно принятого требования возможно только через явную authoritatively bound поправку, не редактирование PLAN как скрытая amendment. В текущем контракте obligation amendments принадлежат PROTOCOLIZE; PLAN-REVIEW pause не надо автоматически объявлять правом переписать effective SPECIFY. Если нужен поздний change-of-requirement, оформить отдельный разрешённый contract/replan путь, а не обход.

### Дополнительные механические review defects

- **Ненужная mandatory correction.** `vnext-plan-review.ts:245–267` вычисляет `needsCorrection` из `needs_changes/blocked` reviewer verdict, до анализа coordinator dispositions. Если все findings обоснованно rejected/duplicate, всё равно требуется правка/revision; при clean reviewer и реальной coordinator correction она запрещена. Canon: findings — inputs, не votes. Решать по принятым dispositions и фактическому delta accepted artifacts, а не заставлять фиктивную правку. Accepted fix требует проверенного изменения; legitimate no-change rejection — not_required. Coordinator-only correction допускается с existing correction receipt и валидацией принятой revision, без fabricated reviewer finding. Generated batch остаётся CLI-owned.
- **PLAN duplicate/defer labels не имеют evidence binding.** Schema `plan-review-decision@3` не содержит `duplicate_of`/`def_id`; finish не проверяет duplicate chain или named DEF. Добавить поля и минимальные guards, как уже сделано в CODE-REVIEW: known distinct canonical duplicate target, no cycles, final disposition; допустимое defer — existing named durable DEF и объяснение, не скрытое снятие обязательства. Не переносить CODE P0/P1 policy на другую PLAN severity taxonomy: обязательные требования и due checks остаются обязательными независимо от disposition, допустимость смыслового defer оценивают coordinator/reviewer/Judge.
- **CODE decision не единственна.** `canonicalReviewEvidence/reviewDecisionForRepair/validateDecision` строят Map по `finding_ref`, не отклоняя повтор. Pure offline probe текущего dist, проверенный по source: один P2 одновременно fix и reject принят; `fix_ids` содержит ref, Map выбирает последний reject. Guard unique known canonical decision refs нужен **до** Map, freezing и регистрации repair, одинаково initial finish/retained re-entry. Existing CODE duplicate-target/cycle, P0/P1, DEF и causal-check guards уже есть — сохранить, не переизобретать. PLAN уникальность refs уже проверяется.

Judge должен сравнивать принятый смысл → PLAN → proof → итог, отдельно от mechanical PASS; существующий Final Judge уже поймал этот CP188 дефект. Supplemental Judge здесь не требуется ради повторения того же finding. Улучшение generated proof не гарантирует семантическую безошибочность модели; это оценивается новой scored попыткой, а не ручной починкой продукта.

## 7. AGY, shutdown и незакрытая доставка 059

AGY CP188 остановился **до scored EVAL**, в Codex Judge cleanup: clean ACK записан до physical cleanup; потом `kill EPERM` и cleanup_failed, surviving listener, поздний stop через закрытый provider pipe. Это не новый отказ доступа AGY.

059 source/review fixes закрывают ACK ordering, joined/idempotent cleanup phases, ownership/endpoint fences, verdict-vs-cleanup consumers, EPIPE/drain failures всех adapters. Они уже committed/pushed, но **не входят в frozen engine этого qualification**. Нового live подтверждения не было. Первопричина первоначального kernel EPERM остаётся неизвестной; поздний ESRCH не доказывает race. Не игнорировать EPERM и не повышать права.

Остаётся delivery gate: зелёный полный acceptance suite, publication нового source SHA, новая квалификация нового runtime. Последний full dd-eval suite: 383 total / 367 PASS / 6 FAIL / 1 cancelled / 9 SKIP. Каждый failed case позже прошёл отдельно; это не полный green. Deadline/load failures нельзя объявлять исключительно нагрузкой без доказательства и нельзя исправлять общим увеличением timeout. В отчёте 059 перечислены точные ограничения.

Q1 (whole-definition qualification key causing unrelated requalification) остаётся явно deferred: отдельная оптимизация ключа, не причина исчезновения checks или shutdown. Её нельзя silently включить в safety repair и переносить PASS между несовпадающими contract inputs.

## 8. Исполнимый план: пакеты изменений и критерии завершения

Все пункты ниже были исходным implementation scope; выполнение и проверки зафиксированы в implementation report. «План готов» само по себе не означает «реализация/qualification PASS». Пути относительны к repo из §1. Implementation order: A → B/C; D независим; E → F; G независим от capacity, но использует исправленный frozen authority из F; H после всех source gates. Уточнения §11 входят в A–H, не отдельный факультативный этап. Не публиковать промежуточный engine с новыми ordinals и старыми admission guards.

### A. Один pure capacity contract и диагностика

**Files:** flow `src/harness-runtime/lib/dd-codex.mjs`, новый небольшой sibling pure module для normalization/burst/ordinal; flow `src/services/codex-capacity.ts`; eval `lib/operation-errors.mjs`, `lib/judge-capacity.mjs`, relevant `runner.mjs` reporting consumers. Использовать existing runtime-assets packaging/loading, без новой зависимости. EVAL загружает helper только из exact pinned engine; offline unit test может напрямую импортировать этот pure module, не запускать daemon.

- Нормализовать native string/object codes; вернуть exact Session/Turn/operation, native primary error, failure timestamp/provenance и native-items evidence. Overload только serverOverloaded + доказанный terminal failed; допустимые adapter wrappers перечислены явно. Expected Session/Turn mismatch, text-only match и primary lifecycle/hook/ownership/unknown-operation ошибки не дают permit.
- Одна pure функция решения burst: original ordinal 0 excluded, последний distinct continuation refusal + предыдущий continuation refusal, окно inclusive 120000 ms. Chain root/Session/task различны — состояние не смешивать. Success закрывает цепочку; следующая самостоятельная задача не наследует отказы.
- Ordinal parsing/root extraction в одном месте: positive safe integer для successors, root ordinal 0; exact n−1, никакого `[12]`. Policy identity входит в intent binding. Finite delay/UTC, no negative/reversed failure timestamps; Retry-After не timestamp отказа.
- Typed stop reasons: `provider_overload_burst`, existing owner timeout/cancel/settlement/reconciliation codes. Diagnostic содержит root/session, continuation count, distinct Turns и времена, native primary, cleanup secondary. Не выставлять retryable для replay EVAL; `recovery_count` не менять.

**DoD/tests:** shared vectors вызываются TS subject и JS Judge/reporting consumers; string/object overload/quota, разрешённый wrapper, все четыре unsafe wrappers из §3, wrong identity, malformed metadata. Retry-After MAX_VALUE/NaN/Infinity/negative/date; >30s при достаточном owner deadline допустим. Quota/reset_at terminal. Нет произвольного retry по вложенному message.

### B. Durable Subject/child и все admissions

**Files:** flow `codex-capacity.ts`, `run-controller.ts`, `controller-fanout.ts`, `run-controller-adapter.ts`, `run-recovery-runtime.ts`, `run-controller-recovery.ts`, `external-work-launch.ts`, `merge-server.ts`, `harness-runtime/lib/dd-codex.mjs`, `dd-codex-daemon.mjs`; existing state/receipt types и schemas рядом с ними.

- Persist первый terminal failure exact Turn **до** successor. У native child сохранить first `terminal_observed_at`, перенести в controller projection/chain. Duplicate event/poll не создаёт refusal. Если timestamps отсутствуют, первая durable observation с provenance; не использовать время reattach.
- Читать всю exact root chain, валидировать sequential ordinals/predecessors/unique operation и Turn IDs/current owner/task/prompt hash. Prepared intent reconciles только exact operation; unknown dispatch — observe/reconcile, не successor. Conflicting/gapped retained records — typed conflict, не silent skip.
- Все admission paths (root/child/HITL/native daemon/recovery/external/MERGE) принимают ordinal 3/10 и проверяют n−1 + bound predecessor failure; разрешение одного regex не является достаточным fix. Accepted HITL/ACK, completed Work/advanced Stage, superseded generation/lease/cancel запрещают отправку.
- Child success ≠ parent followup dispatch success; child quota/auth не continuation. Settled descendants проверять existing owner rules. Native items unknown/pending запрещают successor, completed effects допустимы. Owner checks повторять перед/после backoff, inspect и permit acquisition.
- Persist origin deadline до первой отправки для bounded owner; existing 45-minute Work/MERGE budget не renew при продолжении/reattach. Unbounded controller/recovery owner остаётся явно unbounded по этому плану. Нельзя заменить lifetime attempt cap незаявленным lifetime timeout.

**DoD/tests:** original + success; continuations 119999/120000 → burst, 120001 → следующий; 3+ медленных отказа → успех; success reset; replay cached failure; duplicate child completed; restart между failure/intent/dispatch/ACK-loss. Каждый crash/owner-loss вариант доказывает at-most-once dispatch. No new Session, no root prompt replay, no Stage/Work repetition. Существующий initial recovery ID bound сохранить; operation filenames hashed.

### C. Judge/capacity probe и retained compatibility

**Files:** eval `judge-capacity.mjs`, `runner.mjs` Final/Interaction/Supplemental paths и `boundedCapacityContinuation/harnessCapacityCheck`; `engine-admission.mjs`; flow runtime-assets/manifest consumers. Supplemental уже идёт общим Judge path — не писать третий retry loop.

- Заменить длину backoff array как cap на A; backoff вычисляется 5s first/15s subsequent. Сохранять existing lock, chain и driver ledger; required packet/profile/runtime/owner identity неизменна.
- Capacity probe передаёт actual rendered prompts и bound max/profile/runtime; dispatch не перерендеривает и не игнорирует text. Accepted children повторно проверяются до отправки: нельзя начать вторую fanout wave как «повтор».
- Native-items guard из A применяется **даже при custom validateInspection**; owner-specific inspect/children/tree settlement только усиливает его. Test fixtures должны содержать реалистичные observed items, не заменять unknown на empty в production.
- Новый durable Judge `capacity-chain@2` фиксирует policy identity, отказ и provenance; чтение старого @1 не создаёт fresh root/dispatch. История остаётся читаемой; explicit incompatibility/reconciliation. Восстановление допустимо только из exact immutable native receipts, не из нового текущего времени.
- Установка нового helper обязательна по exact engine integrity/capability proof; несовместимый pinned engine отклоняется до native Session. Qualification для нового contract создаётся заново, не подделывается старый PASS.

**DoD/tests:** equal prompt hash ↔ actual bytes; changed renderer/max/profile/policy conflicts before sends; @1 legacy no-send, malformed chain, own operation settlement, unknown/pending native items, completed effects; cancelled during inspection/permit/backoff; deadline never renewed. Packet drift/accepted Interaction ACK запрещает continuation. Same policy для всех Codex owners, специфичен только boundary/task text.

### D. Source delivery незакрытых 059 fixes

**Scope:** уже реализованные shutdown/ACK/endpoint/cleanup-consumer fixes не писать заново. Перепроверить adapters и EVAL consumers по списку 059; воспроизвести остававшиеся full-suite failures с owner/events, не лечить их общим увеличением deadline.

**DoD:** ACK только после физического settlement; failure primary сохранён, cleanup secondary видим; duplicate cleanup idempotent, joined drain, closed pipe/EPIPE не поздний clean ACK; old/foreign listener не завершается. EPERM остаётся typed ownership/OS failure; выяснить фактический offender по PID/identity/системной диагностике при разрешённом новом проявлении, не обещать неизвестную kernel cause устранить ordering fix. Полный suite green одним прогоном — isolated PASS каждого старого failed testcase не заменяет его.

### E. Provider materialization и полный source/target MERGE gate

**Files:** flow `work-registry.ts`, `vnext-plan.ts` projection, `vnext-merge.ts`, `code-checks.ts`, existing MERGE gate/report schemas, `test/vnext-code.test.ts`, `test/code-checks.test.ts`, `test/vnext-execution-policy.test.ts`.

- Перед Work completed проверять **все** provides_checks existing validator; missing/drift/nonterminating alias — error, Work не становится completed. Aggregate не запускать рано. Файловые проверки вне SQLite writer, final CAS/atomic settlement сохраняются.
- MERGE собирает весь accepted due PLAN catalog, включая planned, work/code/readiness/merge и item-only checks. Provider completion доказан через accepted Work/batch identity; PLAN availability остаётся исходной декларацией. **Declaration/materialization validation** source до productive freeze; это не новый запуск всех MERGE checks на source. Exact integrated target исполняет gate после apply/bootstrap, до integration commit. На pre-apply target ещё может не быть новых source aliases — не требовать их раньше интеграции.
- Existing profile baseline-extension/integrity guards, causal repair registration и exact-input semantic/policy dedup сохранить. Механически удалять available-only PLAN-time validator нельзя. Target profile drift/missing providers/aliases — evidenced owning error, не исключение из каталога.
- Gate/acceptance сохраняют every required binding; actual native failed check ведёт штатный source-repair, не ручной product fix integration workspace и не forced PASS. Старые CODE receipts нельзя переносить на target tree/new epoch.

**DoD/tests:** planned alias/run_at=work/code/readiness/merge; alias не входит в own packet.checks; aggregate alias создаётся без early run; provider finish rejected; integrated target drift; negative stale repair receipts; equivalent commands dedup exact inputs без потери refs. Одинаковые short check IDs в разных PSET **уже запрещены** (`vnext-plan.ts:593–600`) — сохранить negative regression, не объявлять их разрешёнными.

### F. Frozen authority/coverage и честный acceptance

**Files:** flow `verification-matrix.ts`/schemas/publication и policy/hash helpers; eval `case-acceptance.mjs`, `engine-admission.mjs`, `bin/qualify-verification-matrix.mjs`, `schemas/verification-matrix.v1.schema.json`, `test/case-acceptance.test.mjs`, `test/engine-admission.test.mjs`; будущий новый checkpoint/qualification fixture.

- Retain exact profile/policy baseline+target proof в existing matrix.sources, связывая их с accepted stage/engine tree identity. Проверять отсутствие профиля явно, не читать mutable live workspace при оценке frozen packet. Не создавать второй catalog: полный PLAN и принятый profile — authority, matrix — projection.
- Shared coverage guard independently derives full due semantic + mandatory policy catalog и exact declaration definitions. Применить его и qualification, и case consumer **до** result projection. Same ref с чужой definition/tree/input hash/receipt — rejected, не count-only acceptance.
- Matrix@1 **сохранить**: использовать existing sources roles без изменения shape. Обязательный coverage contract `dd-flow/final-check-coverage@1` связать с **новым** qualification receipt @3, owning RUN/report marker и exact engine checksum (§11.5). Старый qualification@2 не доказывает этот новый guard. Legacy read/report явно ограничены original contract, не заменяют новый admission proof.
- Failed native execution + отсутствующий expected output даёт failed check с evidence gap; заявил bytes, но они отсутствуют/corrupt — unavailable authority. Aborted/cancel/unknown сохраняют собственный infrastructure outcome; Judge не получает invented product failure.
- Shared due semantics для допустимого not_due; release нельзя принять в MERGE-only PLAN и нельзя превратить not_due в passed. Не создавать RELEASE execution subsystem ради latent consumer divergence.

**DoD/tests:** один valid frozen packet проходит оба consumers; coordinated removal AC check, item-only check или POLICY check оба отклоняют; required alias definition drift; foreign ref/tree/hash/native receipt; missing baseline proof; accepted absence; no read of live profile. Failed check без expected output отдельно от повреждённого заявленного artifact. New offline fixture: planned provider → CODE → review/repair → MERGE with POLICY/* → final, все promised stages, negative controls. Не использовать CP188 historical packet как новый publication proof.

### G. Review authority и механическая decision coherence

**Files:** flow `work-registry.ts` `renderWorkerPrompt/assertSharedReviewInput`, `verification-matrix.ts`, `review-copy.ts` только при необходимости root mapping, `vnext-plan-review.ts`, `vnext-code-review.ts`, decision schemas/tests; canon `vnext/plan.md`, `vnext/plan-review.md`, relevant shared instructions. Не менять продукт/case requirements для удобного PASS.

- Через existing matrix/accepted source refs перечислить exact effective obligation paths/hashes; добавить действительно читаемые sources в existing sibling read-only baseline. Prompt использует existing shared precedence и canon semantic preservation, не per-harness дубли. Проверить fresh native/external reviewer packet, а не только строку coordinator prompt.
- PLAN accepted+requires_user → `stage_pause_required`/existing pause instruction до публикации CODE. После durable user answer final disposition; stale/foreign answer/незавершённый pause не разрешает acceptance. Engineering defaults не превращать в forced HITL. Поздняя amendment/replan целого требования — отдельный contract, не скрытая permission здесь.
- PLAN correction necessity = accepted decisions + actual accepted delta. Legitimate all-rejected/duplicate no-change проходит без фиктивной revision; applied correction подтверждена **per-protocol** baseline/current revision/checksum/changed paths (§11.6), не максимальной revision PSET. Coordinator-only change имеет честный receipt без invented findings. CODE batch генерируется только CLI после successful validation, no second automatic review wave.
- Для новых PLAN decision добавить schema@4 `duplicate_of`/`def_id`, exact reference/acyclic/durable DEF guards; legacy accepted receipts не переписывать и не повторно исполнять. Deferred material issue не отменяет due criterion или разрешает CODE с unresolved mandatory obligation; при отсутствии разумного решения existing pause/fail. Обновить canon/examples/schema consumers в одном patch.
- CODE: unique known decision refs до canonical Map/repair freeze; retained decision re-entry проходит тот же guard. Reuse existing duplicate resolution/P0P1/causal-check guards; **existing DEF existence guard усилить containment/type/hash proof** для PLAN/CODE (§11.7). Общую маленькую функцию выносить только при реально одинаковой логике, не строить review framework.

**DoD/tests:** accepted+requires_user no CODE Work/receipt; resolved existing pause; reviewer needs_changes but legitimate rejected/no delta; clean reviewer + valid coordinator correction; fix/no actual delta rejected; duplicate missing/foreign/self/cyclic target; deferred missing/escaping DEF; conflicting repeated CODE decisions no repair registration. Original SPECIFY/PROTOCOLIZE drift during review rejected; legal coordinator revision after reviewer settlement creates new baseline. Non-goals/accepted amendment unchanged in fresh packets. Mechanical guards не обещают распознать любое смысловое сужение — independent Judge остаётся.

### H. Проверки, фиксация и последующая доставка

Сначала targeted offline tests, затем serial full suites/release gates; не запускать concurrent build поверх shared dist. До implementation сохранить regression vectors §3–6 (in-memory fixtures, не historical modifications). Шаблоны/канон обновлять только там, где реально поменялся контракт, не запускать широкую prompt перепись.

Команды baseline/acceptance (запуск из соответствующего repo):

```sh
# dd-flow: по очереди, не параллельно с build/publication
pnpm typecheck
pnpm lint
pnpm build
pnpm exec vitest run --pool=forks --no-file-parallelism test/codex-capacity.test.ts test/run-controller-adapter.test.ts test/run-controller.test.ts test/vnext-protocolize.test.ts test/vnext-code.test.ts test/vnext-execution-policy.test.ts test/review-copy.test.ts test/code-checks.test.ts test/verification-matrix.test.ts test/stage-context.test.ts test/harness-runtime-assets.test.ts
pnpm test:integration
pnpm test:runtime-sensitive
pnpm test:release
# dd-eval: targeted, затем весь suite
node --test test/judge-capacity.test.mjs test/engine-admission.test.mjs test/case-acceptance.test.mjs test/capacity-transcript.test.mjs test/judge-cleanup.test.mjs
npm test
```

Добавленные regression для PLAN/CODE review разместить в existing stage test suites либо отдельном компактном test file, включить в targeted command и full suite. Никакой paid provider не нужен для fake clock/dispatch/qualification packet tests. При фактической реализации фиксировать totals/artifacts и разбирать каждый failure; инфраструктурные skips не выдавать за full coverage.

После авторизации реализации: commits/push нужных flow/eval/canon repos с exact SHAs; clean source и успешный release gate. **Publication/new E2E в этом запросе не разрешены.** Последующая отдельная delivery: publish exact tested SHA/canon, offline qualification нового engine/contracts, обновление managed hooks по runbook, совместимость/capacity/HITL preflight, только затем новые isolated homes Luna/ZCode/AGY. Судить по actual full stage cycle + native cleanup + case acceptance + Judge, не только launch или controller completed. Stop отдельного blocked EVAL, без ручного ремонта/возобновления исторического. Grok — лишь после явного подтверждения доступности/авторизации, не автоматически 2 октября.

## 9. Ponytail review и пределы выводов

Проверено по Ponytail full: продолжить существующие helper/ledger/Stage settlement/check runner/matrix validation, убрать зашитые ограничения, добавить только небольшой общий policy contract и недостающие guards. Без retry framework, новой БД/DSL, ручных receipts, принудительного PASS, второй semantic матрицы или дублирующих per-harness flow prompts. Детерминированно проверять то, что действительно формализовано; смысл оценивается reviewer/Judge.

Практические сокращения после review:

- Existing native error normalizer/validators усилить и переиспользовать; не создавать отдельный adapter retry для каждой упряжки. Burst относится к **этому доказанному Codex serverOverloaded**, не автоматически ко всем transient strings других providers.
- Existing `validateCheckDeclaration` достаточно для provides_checks; не писать materialization registry и не мутировать PLAN availability.
- Existing matrix.sources + accepted policy/batch достаточны для независимой полноты; исправлять shared consumers, не case-specific «дорисовку PASS».
- Existing reviewer context уже содержит SPECIFY/matrix; добавить только exact effective paths и input protection, не копировать весь RUN/home и не дублировать prompting.
- Existing CODE duplicate/repair guards сохраняются; добавить missing uniqueness и усилить DEF containment/evidence, перенести только действительно общий маленький guard.
- Ненужную mandatory correction по reviewer verdict убрать. Не создавать RELEASE subsystem, late semantic replan framework, новую timeout policy или оптимизацию Q1 ради этого incident.

### Карта системного аудита и полнота плана

| Класс | Проверенные producer/consumer families | Результат / пакет |
|---|---|---|
| Capacity/retry/error identity | Subject root, child, external Work, MERGE, HITL/recovery, native daemon admission, Final/Interaction/Supplemental Judge, capacity probe, error reporting/reset | Hardcoded bounds и sibling drifts; A/B/C |
| Durable authority/time | Native descendant notifications, fanout projection, operation receipts, retained intents, Judge lock/chain, owner budget/cancel | Immutable refusal time, full exact chain, actual prompt binding; B/C |
| Check declaration/materialization | PLAN schema/semantics, Work projection/finish, CODE aggregate, review repair, MERGE source/target | Provides checks guard + available-only final selection; E |
| Independent final coverage | Matrix source/projection, frozen case checker, qualification/admission/receipt catalog, project policy profile | Full PLAN + independent mandatory policy, not gate-self-validation; F |
| Evidence outcome | Native failed/aborted receipt, required outputs, hash/tree bindings, case result → Judge packet | Failed vs unavailable не смешивать; F |
| Semantic/review/HITL | Shared stage context, fresh Work prompt, read-only sibling baseline/copy, PLAN correction/decision schema, CODE decision fan-in, canon | Exact effective source protection, unresolved HITL, correction/disposition guards; G |
| Cleanup/release delivery | Existing 059 changes и full-suite results, runtime pin/publication, qualification evidence | Not repatch, close delivery gates; D/H |

Сканирование выполнялось `rg` по обоим repos, затем прослеживались callers и контракты от producer до settlement/consumer; два read-only subagent audit перепроверены main agent по source и offline calls. **Это системный аудит перечисленных типов, не построчное чтение каждого файла и не обещание найти любые дефекты проекта.** Grok/ZCode provider исходники не меняются: новых вопросов к их native поведению, требующих ещё одного upstream patch, эти воспроизведения не установили. Historical runs/frozen engine отделены от текущего source; ничего не считать live-fixed только потому, что код существует.

Live evidence, direct read-only reproductions и latent sibling paths разделены. На этапе планирования был изменён только этот документ; runtime/продукт/new E2E не изменялись. Plan completion: A–H с уточнениями §11 имеют source targets, regression и delivery boundary; known EPERM root/Q1/late replan остаются явно ограниченными, не молчаливыми TODO внутри обещания «всё устранено».

## 10. Проверки этого расследования

- В исходном расследовании прочитаны reports Luna/ZCode: terminal failure на PLAN у Luna; completed MERGE, unavailable acceptance и completed Judge у ZCode. В аудите 2026-10-01 новые native/live обращения не выполнялись.
- Прямой вызов обоих overload classifiers на одинаковом typed error: string → true/true; object `{code: 'serverOverloaded'}` → flow true / eval false. Native daemon/Session не запускались.
- На неизменном frozen ZCode snapshot повторно вызваны current shared authority guard и case checker: первый PASS; второй unavailable с тем же missing target binding. Checker проверил snapshot payload/authority hashes. Matrix API/BROWSER planned/work/unavailable, прежний SCN browser available/code/retained.
- PLAN-review unresolved requires_user, mandatory correction по verdict, unbound duplicate/DEF labels, source-input omission установлены по schema/callers/settlement. RELEASE вывод исправлен после проверки reachable-gate guard: это latent consumer path, не текущий legal CP188 PLAN.
- Main agent повторил classifier probes (четыре unsafe wrappers, object overload/quota), Retry-After overflow, in-memory deletion semantic item-only check из qualification MERGE packet. Все подтвердили findings; frozen файлы/daemon не менялись.
- Main agent повторил Judge fake dispatch: unknown native items + settled=true разрешили successor (2 sends, 0 provider calls, 0 files). Повторён pure CODE decision probe из текущего dist с сопоставлением source: conflicting fix/reject одного canonical finding принят.
- Source-only review подтвердил provides_checks completion gap и независимую project policy authority gap; нового live manifestation не утверждается. Эти случаи должны получить точные negatives в §8.
- `node --test test/case-acceptance.test.mjs test/judge-capacity.test.mjs`: **19/19 PASS**, 0 failed/cancelled/skipped. Это green текущих tests, которые ещё не покрывают найденные negatives, не доказательство исправленности кода и не full acceptance 059/060.
- Live replay/new paid Judge/new E2E не выполнялись. После исправления нужны regression и full gates §8, не ручная модификация historical EVAL.
- В readiness-проверке дополнительно прочитаны pre/post-apply MERGE/profile boundaries, selected-runtime loader, owner decision callbacks, per-PSET revision и DEF path guard. Read-only expression/path probes подтвердили max-revision 10/1→10/2 rejection и escaping DEF→README; multiple-child finding подтверждён точным `failed.length === 1` selection condition, не новым live replay.

## 11. Проверка готовности: обязательные уточнения перед реализацией

Повторная проверка 2026-10-01: план A–H достаточен для source implementation после включения следующих деталей. Они устраняют неоднозначности и дополняют подтверждённые sibling defects; это не новые разрешения на runtime repair или E2E.

### 11.1. Минимальный контракт продолжения и загрузка SSOT

Pure module в bundled runtime: policy `codex-overload-burst@1`, window=120000 ms, backoff first=5000/subsequent=15000; normalize native error, parse exact successor identity, validate native items, decide burst. Функция решения не читает БД/FS и не отправляет prompts. Owner-specific orchestration остаётся у существующих callers.

Existing durable intent/chain дополняется полями: policy identity; exact root operation + Session + owner/task boundary; ordinal/predecessor operation/native Turn; actual prompt hash; first failure observation и timestamp provenance; not_before; origin deadline либо explicit null. Переносить уже существующие owner/generation/packet/profile bindings не надо — включить их в existing identity/checks. Каждый отказ хранит свой exact native Turn и primary error; diagnostic может ссылаться на ledger, а не вкладывать полную историю рекурсивно в каждую ошибку.

EVAL loader следует существующему `loadDelegationInstructions(runtimeRoot)` pattern: absolute selected runtime, integrity-verified helper, проверка exports/policy **до Session.create**. Возвращать module как per-owner dependency в `judgeCapacityPrompt/boundedCapacityContinuation` и связанный reporting context; **не global «текущий engine»** и не импорт из произвольного checkout. Cache только по immutable root/artifact identity. Обновить `scripts/copy-assets.mjs`, release build verification и installed runtime integrity proof; unit/offline tests не требуют публикации.

Reporting до разрешения engine (bootstrap/config failure) обязано сохранять raw primary/cleanup evidence и работать без helper. Оно не получает retry authority и не должно загружать global engine ради красивой категории. После привязанной native ошибки category/reset выводятся тем же нормализатором; foreign/unsupported engine — raw evidence + явное отсутствие normalization authority, не исчезновение ошибки.

**Acceptance:** одновременно два EVAL с разными pinned engines не меняют classifier/policy друг друга; отсутствующий/повреждённый module отклоняется до native create. Current helper не подменяет legacy receipts. Safe ordinals допускают >2; JSON chain/SQL consumers проверяют тот же exact root/task/owner, не только число.

### 11.2. Время, backoff и crash points

Каждый подтверждённый отказ сохраняет immutable first observed UTC; надёжный native terminal UTC — отдельное optional поле. Для пары использовать native time только при доказанном общем временном основании **обоих** Turns; иначе first durable observation обоих. Не смешивать native time одного с поздним poll time другого. Provenance/basis выбранной пары сохраняется; restart не переписывает времена и не переклассифицирует уже принятое решение. Cached legacy failure без исходного времени не timestamp'ить как свежий отказ.

`not_before` фиксируется один раз относительно подтверждения отказа/backoff. В рамках процесса ожидание monotonic, при reattach — сохранённый UTC/remaining delay, не полный backoff заново. Invalid/overflow/reversed clock — typed reconciliation, no dispatch; это не provider outage и не новый refusal. Existing bounded owner deadline сохраняется в receipt **до первой отправки**, не в локальной переменной только после catch. Inspection/permit/provider timeout не выдаёт новый 45-minute бюджет. Unbounded owners остаются explicit null, не hidden cap.

Последовательность: retain terminal refusal → reconcile owner/boundary → burst decision → retain prepared successor → wait/permit → повторная exact admission/native-items check → retain dispatched → native send → retain outcome. Потеря durable write **до** send означает no dispatch; потеря ACK/write **после** send — unknown dispatch, observation exact operation, без новой Session/root. Prepared intent отправлять только при доказанном отсутствии его native operation; completed operation восстановить без повторной отправки.

**Acceptance:** crash/restart на каждой границе, два observers одного owner, cancel/lease loss во время wait/inspect/permit, exact 119999/120000/120001, clocks/date overflow, original excluded. Failed storage не скрывается как overload; recovery не сбрасывает delay/deadline/цепочку.

### 11.3. Durable boundary имеет приоритет над повтором

Во время failed Turn lifecycle tool мог успеть завершить Work/Stage или записать HITL ACK. Existing `continueCodexCapacity.decision` уже умеет completed/paused; сохранить это и определить outcome по durable owner state **до burst/следующего dispatch**. Completed не превращать в provider failure, paused/action_required передать владельцу как штатную остановку; superseded/foreign owner — typed ownership failure.

Это не «любой tool success = задача выполнена»: root Subject требует accepted Stage state; external child — exact Work; MERGE Work completed не равен принятому integration request; Interaction Judge accepted ACK не равен clean physical shutdown. Final Judge требует successful native Turn + валидный bound JSON. Cleanup/settlement остаются обязательными даже без continuation.

**Acceptance:** Stage завершился перед вторым быстрым overload → ноль successor, controller продолжает штатный цикл; Work завершился, Stage ещё нет → owner-specific handoff, не повтор Work; HITL/ACK committed → no duplicate answer; incomplete cleanup не выдаёт completed native proof.

### 11.4. Несколько отказавших native children

Дополнительная source finding: `run-controller.ts:653–657` выбирает child только при `failed.length === 1` и остальных completed. Поэтому два одновременно terminal overloaded children обходят existing continuation path. Новый burst только для root не исправил бы этот sibling.

Держать независимые child chains по exact original child Session/task/Work; отказы разных детей **не складывать** в одну пару. Eligible children выбирать existing Work graph/admission, последовательно выдавать bound `followup_task` через retained parent operation и reobserve после каждой отправки. Не создавать вторую wave/fresh children и не replay parent fanout prompt. Root/parent overload учитывается в его собственной цепи, parent successful send не считается child success. Existing capacity/lease/tree settlement остаётся ограничением, не расширять dispatch при неизвестных/активных effects.

Если tree ещё не позволяет безопасное продолжение, observe/wait его состояние: это не новый refusal и не permission interrupt quiet worker. Quota/auth/permanent child outcome остаётся terminal с точным child/Work attribution; failed/cancelled Work не возобновлять этим механизмом.

**Acceptance:** два eligible child overload → оба безопасно продолжаются без новых Sessions; быстрые отказы одного ребёнка останавливают его цепь, а не чужую; один ребёнок active → нет недоказанного send; parent ACK loss → reconcile parent operation, no second followup; completed/unbound Work не отправляется вновь. Реализовать в existing controller loop, не новый scheduler.

### 11.5. Frozen coverage: точные источники и этапы

Source до freeze: accepted PLAN/batch/Works и declarations материализованных aliases. Target **до apply**: baseline policy/profile и их invariants, не наличие новых source aliases. Target **после apply/bootstrap**: profile, exact declarations/resolved command/ports/inputs и весь due gate; только его native receipts доказывают target. Ни кодовую availability, ни accepted PLAN bytes для этого переписывать нельзя.

Profile proof: retain exact baseline и reviewed-source/target bytes через existing publication packets/hash contract; expected profile_hash и engine/stage identity должны быть bound owning receipts. `profile_hash=null` — доказанное accepted absence через owning contract, не оправдание отсутствующего profile source. Profile policies могут различаться по gate; due определяется по explicit run stop_target/gate order, не «всё всегда». Work-scoped semantic checks на final target всё равно требуют aggregate target binding по текущему MERGE contract. Existing exact-input dedup может дать один execution с несколькими bindings; нельзя терять binding при dedup.

Две функции SSOT разных областей, не один всепоглощающий helper: flow producers используют existing effective declaration/profile helpers; frozen EVAL consumers используют общий `case-acceptance.mjs` authority guard. Их equivalence проверяется shared fixtures/reference vectors. No live FS/project-policy lookup в frozen consumer, no новая policy DSL.

Version decision для данного дизайна: matrix shape **@1 сохраняется**, новые profile roles в existing sources; new receipt qualification **@3** содержит `coverage_contract=dd-flow/final-check-coverage@1` и exact engine artifact checksum. Новый RUN отмечает coverage contract в existing index/owning report; marker обязан попасть в run/snapshot/qualification packet. Обновить qualifier, admission, schemas/examples/canon и hashes вместе. Старые reports читаются как legacy, но qualification@2/markerless RUN не проходят новый admission; missing marker не включает молча weak guard.

Known failed target check не создаёт successful MERGE acceptance: текущий flow допускает acceptance только после passed gate. Изменение failed/missing-output classification применяется к реально достигнутому failure evidence/допустимым consumer packets; не разрешать forged failed final acceptance ради regression. Утраченный заявленный artifact → unavailable; expected output не создан вследствие доказанного failed execution → failed execution + gaps, Judge определяет cause. Product failure из одного exit code не выводить.

**Acceptance:** planned source alias отсутствует в baseline target, появляется после apply и исполняется; refs полного PLAN + POLICY независимо восстановлены; удаление check/profile/source/marker отвергается с точной причиной. Failed gate не публикует successful acceptance. Реальный profile absence и unaffected policy проходят без новой бессмысленной строгости.

### 11.6. PLAN correction: per-protocol identity вместо max revision

Новая code finding: `currentPlanRevision:414–418` возвращает max revision PSET. Пример A=10, B=1; корректная правка B→2 оставляет max=10, поэтому existing guard требует искусственно повысить B выше A. Это подтверждено прямой проверкой выражений старого guard; не live incident.

Baseline map `{protocol_id, plan_id, revision, sha256}` брать из accepted batch/report/source proofs, не добавлять второй каталог. Compare каждый protocol и its aspect-map separately. Изменённый PLAN требует advance **собственной** revision и новых accepted hashes; неизменный sibling не менять. Map-only correction проверяется по changed map hashes и authoritative regenerated batch, без fake PLAN byte/revision bump. Aggregate max/`previous_plan_revision` можно сохранить только как legacy diagnostic, не authority изменения. Regression также должен отвергать новый revision number без содержательной author-edited delta; generated batch никогда не считается таким delta.

`changed_paths` должны описывать реально изменённые agent-owned PLAN/aspect-map paths с accepted baseline/current hashes, без foreign/escaping path или fabricated batch edit. All-rejected без delta → not_required; принятый fix/no delta → error. Coordinator-only correction допускается с честной записью и origin requirements invariants; механика не претендует оценить правильность смысла.

**Acceptance:** PSET revisions 10/1 → 10/2 принимается, unchanged 10 не bumped; map-only fix допустим; changed PLAN без own revision, fake changed_paths, unrelated change и batch-authored change rejected. Не требовать синхронных одинаковых revisions у разных протоколов.

### 11.7. DEF identity и schema compatibility

Новая source/path finding: CODE `validateDecision:350` использует `existsSync(join(workspace,'.memory-bank','defs',def_id+'.md'))`, schema разрешает произвольную строку. Read-only path probe `def_id='../../README'` разрешился в существующий workspace README, вне defs. Это не доказанный live deferral, но existing guard нельзя считать безопасным reusable DEF proof.

Один маленький guard PLAN/CODE: def_id — идентификатор одного DEF, не arbitrary path; файл должен быть обычным readable artifact, realpath в exact project-local defs directory, сама defs directory не уходит за project через symlink. Использовать existing portable containment helpers + node fs/path; не создавать новый registry. Retain named DEF path/hash в accepted decision evidence, чтобы последующая подмена файла не превращала deferred finding в подтверждённый. DEF correctness остаётся review/Judge quality, не придуманный parser обязательных полей.

PLAN decision@4 — новый emitted/validated contract; обновить hardcoded dataSchemaId, TS types, prompt examples, stage-start/finish/report/retained read paths и тесты вместе. CODE shape@3 может остаться при усилении unique/containment guards: он уже имеет нужные поля. New engine не исполняет исторические accepted receipts заново; old pinned engine не получает schema@4 template из текущего глобального canon. New admission связывает canon/engine/contracts; несовместимый контур отклоняется до launch, не fallback к старой слабой проверке.

**Acceptance:** `../../README`, absolute path, symlink escape, directory instead of file, duplicate/foreign/cyclic finding ref, DEF replaced after binding; valid named DEF проходит. Legacy schema readable, no historical replay; schema id/package/canon mismatch выявлен до native dispatch.

### 11.8. Проверяемое завершение source implementation

DoD A–H требует не только unit pure policy: real daemon fixtures для admission ordinal>2, restart/duplicate notification и retained ownership; offline full stage cycles Luna/ZCode/AGY, shared controller/Work/MERGE, Final/Interaction/Supplemental и capacity probe. Отдельный contract test всех остальных adapters доказывает отсутствие изменения их flow/delegation semantics; Grok только offline, без оплачиваемой qualification до разрешения.

К targeted commands §8 добавить existing `test/run-controller-state.test.ts`, `test/run-controller-stages.test.ts`, `test/controller-resume-preparation.test.ts`, `test/code-review-start-preparation.test.ts`, `test/codex-daemon-concurrency.test.ts` и новые compact regression files. Packaging test должен проверить helper в установленном runtime, а не только source импорт. Добавленные fixtures создаются в test temp, cleanup только own processes/dirs, без настоящих API/домашних runtime.

Начать с red negatives и reproduce details, затем исправление, затем зелёные targeted/full suites; известные 059 timeouts исследовать по своим fixture/events. Expected skips перечислить по имени и причине, tests новых путей не могут быть skipped. Выходной implementation report: commit SHA каждого repo, tested engine/canon/runtime identity, таблица A–H→regressions/results, все оставшиеся blockers. Полный source completion не обещает successful live provider/model outcome; publication/preflight/scored E2E — отдельная авторизуемая delivery, historical failures не переписываются.

**Итог готовности на этапе планирования:** существенных неопределённых проектных решений в source scope больше не оставлено. Concrete protocol/capability/coverage/version/boundary rules изложены выше; мелкие имена exports/расположение unit tests определяются implementation без изменения контракта. EPERM первоначального OS offender, Q1 optimization, поздний semantic replan и live provider доступность остаются явно вне обещания source fix. Последующее выполнение и source acceptance описаны в implementation report.
