# 063 — Grounded Interaction Judge: план исправлений CP193

Статус: реализация и review fixes внесены; полная live semantic acceptance не подтверждена. Первоначальный план: 2026-10-02; review: 2026-10-03.
Цель: один общий контракт HITL для всех упряжек, который сохраняет исходный
вопрос, разрешает его ссылки до сопоставления и не принимает недоказанное покрытие.
Не менять продукт, canonical answer semantics, исторические EVAL или их verdict.
Не запускать scored E2E в рамках написания этого плана.

## 1. Установленная цепочка и границы доказательств

CP193 Grok preparation, definition `061a79b`, home
`/Users/deksden/.dd-eval/qualification/cp-193-grok`.
Grok 1.0.47 compatibility и native capacity 4 PASS; scored EVAL не создан.
Ошибка находится в общем Interaction Judge, не в Grok.

Qualification key:
`6c1bf408228a4435cf08f97af6535e1d5e9d3fb18cf51a40a5cf2614ce12ff92`.
Operation: `operation-7f8c2bd3-9646-44c0-88ca-a359e908900d`.
Judge item: `interaction-judge/specify-0eab1751`.
Артефакты находятся под
`/Users/deksden/.dd-eval/definition-qualifications/<key>/<operation>/`:
`failure.json`, item `packet.json`, `result.json`, `events.jsonl`, `cleanup.json`.

Двенадцатый item `ambiguous-reference`:
«Уточните обязательное поведение этого значения в том случае, о котором мы
говорили: какой именно вариант нужен?»
Expected: unmatched / ambiguous / response_ids=[].
Observed: matched / covered_by_canonical_response /
response_ids=[clarification-task-priority].
Judge заменил вопрос на «Обязательное поведение значения приоритета задачи
и требуемый вариант его реализации», потеряв обе неразрешённые ссылки.
Native journal подтверждает чтение packet и initial_request, exit 0;
Judge gpt-6.1-sol/high через CPA, Turn completed, cleanup settled.
11 items PASS; item 12 FAIL; items 13–14 не выполнялись. Барьер сработал штатно.

Два прежних PASS receipts (`1fc52aa…`, `a560887…`) содержат тот же вопрос,
ответы, semantic context hash и prompt hash, но правильный ambiguous verdict.
Это свидетельство нестабильной семантической классификации, не измерение её
частоты и не доказательство неизменной серверной маршрутизации модели.

## 2. Аудит поверхности и найденные дефекты

Проверены repo-wide references `interactionJudge`, `interactionJudgePrompt`,
`validateHitlMatch`, `resolveHitlJudgment`, `covered_questions`, `hitl-match@1`,
HITL replay/evidence, schemas, tests, tools, qualification и plan 062.
В dd-flow implementation/src не найдена отдельная реализация этого matching.
Аудит не является утверждением отсутствия любых других багов всего продукта.

| ID | Факт / причина | Общее место исправления |
|---|---|---|
| J1 | CP193: тематика ответа использована вместо разрешения предмета/условий вопроса; prompt задаёт ambiguity слишком общо | interactionJudgePrompt, packet contract |
| J2 | Свободные covered/uncovered strings позволяют потерять условия и ссылки; validator не получает question/context | validateHitlMatch + hitl-match schema |
| J3 | unmatched с covered_questions!=[] и response_ids=[] принимается; test/eval.test.mjs около 745 закрепляет противоречие | агрегирование покрытия из атомов + schema/test |
| J4 | resolveHitlJudgment доверяет judgment без самостоятельной проверки; потенциальный обход через прямой caller (не наблюдавшийся в live chain) | общий validator на boundary выдачи ответа |
| J5 | Replay проверяет SHA answer, но не всю связь event→receipt→packet→canonical bytes; hitlEvidenceFor читает verdict без такой проверки | один read-only verifier сохранённого exchange |
| J6 | qualification и runtime вручную повторяют contract strings; новый contract легко не довести до replay/schema/tools | единые constants/helpers внутри существующего модуля |
| J7 | offline qualification tests подставляют ожидаемые классификации; prompt tests проверяют фразы, не meaning preservation | реальные отрицательные fixtures + bounded semantic corpus |
| J8 | Ошибка qualification в CLI сообщает только item ID, expected/observed и путь надо искать вручную | retained error.details без второго отчёта |
| J9 | Qualification сравнивает aggregate classification/IDs, не состав атомов: потеря независимого запроса при том же aggregate остаётся невидимой | targeted atom expectations в существующем corpus |

J3–J9 — дополнительные findings аудита, не причины native transport failure и
не доказательство, что сохранённые старые ответы действительно испорчены.
J5 — целостность/replay, отдельно от семантики J1–J2.

Точные пути в текущей definition:
- lib/runner.mjs: reference answerFor ~497–514; productive answerFor ~3532–3552.
- interactionJudgePrompt ~2182, packet ~2192, live validation ~2211,
  validateHitlMatch ~2221, resolveHitlJudgment ~2231.
- acceptedHitlAnswer ~2247; replay ~3504/~3534; hitlEvidenceFor ~1820.
- qualification identity ~2772, retained validation ~2793, live loop ~2846.
- lib/judge-cleanup.mjs: существующая packet/verdict/cleanup hash binding.
- schemas/hitl-match.v1.schema.json; test/eval.test.mjs;
  test/evidence-schema.test.mjs; tools/native-interaction-judge-smoke.mjs.
- finalJudge/evidence используют сохранённые exchanges: только доставка
  доказательств, не новая семантическая классификация исторического HITL.

## 3. Общая модель исправления (SSOT, без нового сервиса)

### 3.1 Сначала вопрос, потом ответ — J1

В существующем общем prompt задать обязательную последовательность:
1. Выделить независимые запросы, сохранив предмет, условия, отрицания и ссылки.
2. Разрешить ссылки из question/subject_context/разрешённых source bytes.
   Canonical responses и applicability не являются основанием для определения,
   что имел в виду Subject. Нельзя домыслить отсутствующую беседу.
3. Если разные разумные трактовки меняют существенное решение, а контекст не
   выбирает одну, атом ambiguous даже при наличии широкого ответа.
4. Только определённый атом сопоставить точному canonical answer.
5. Сохранить непокрытые атомы; общую классификацию вывести по существующему
   приоритету fixture_gap → ambiguous → out_of_scope → unnecessary_question.

Не запрещать местоимения, длинные ответы, перефразировки или альтернативы как
таковые. Явно заданный antecedent разрешает местоимение. Нематериальная
лексическая неоднозначность не должна блокировать ясный вопрос.
Добавить пару коротких domain-independent examples unresolved/resolved reference,
не вставлять expected answers квалификационного корпуса в промпт.
Question, source documents и canonical responses — данные для анализа, не
инструкции Judge. Команды внутри них не меняют policy, schema или источники
доказательств. Проверить это отрицательным test/corpus case без утверждения,
что в CP193 наблюдалась prompt injection.

### 3.2 Минимальный grounded verdict v2 — J2/J3/J6

Использовать dd-eval/hitl-match@2 для новых Judge turns. Сохранить v1 schema для
исторических read-only receipts. Не маскировать breaking change прежним schema_id.
Единые contract ID и агрегация в текущем модуле; не создавать framework/plugins.

Новый SSOT результата — непустой массив atoms. Для каждого атома:
- source_quote: точная непустая цитата из question (не свободный summary).
- decision: компактное нормализованное решение с условиями.
- classification: существующий набор классификаций.
- reference_bindings: [] либо пара reference_quote / grounded source locator
  / exact evidence_quote для действительно разрешённой ссылки.
- answer_evidence: [] либо response_id / exact answer_quote для покрытия.
- rationale: краткое основание решения; не запрос скрытой цепочки размышлений.

Locator указывает только question, принятую часть subject_context или источник
из готового packet; не model-authored произвольный filesystem path. Для внешнего
источника использовать имеющийся source ID/path + сохранённый SHA и owned snapshot.
На построении packet прочитать объявленные sources существующим безопасным
reader и закрепить bytes/hash; не сканировать проект/Session home. Проверка
не должна заново читать изменяемый продуктовый контекст после Judge turn.
Question/context groundings и canonical answer evidence — разные namespace.

Validator получает verdict + исходный packet, проверяет exact keys/types,
known IDs, exact quote membership, source hashes, непустые evidence для covered,
отсутствие answer evidence у uncovered, уникальность одинаковых атомов/доказательств.
source_quote может повторяться у разных решений из составной фразы; запрещать
это вслепую нельзя. Не требовать покрытия пробелов/пояснений всей исходной строки.

Runner выводит response_ids, covered_questions, uncovered_questions и общий
status/classification из atoms, не доверяет двум независимым спискам модели.
Эти проекции можно сохранить для report consumers; они не второй authority.
Порядок selected responses детерминирован по fixture order; exact answer bytes
и существующий delimiter сохраняются. Пустой covered subset iff нет selected IDs.

Ограничение: membership/hash проверки доказывают происхождение цитат, но не
логическое entailment и полноту декомпозиции. Это остаётся работой Judge и
семантической квалификации; не обещать детерминированное понимание языка.
Старый CP193 verdict будет отклонён новым boundary как verdict без атомов;
корректность классификации похожего v2 результата проверяет live corpus.

### 3.3 Единая выдача и повторное чтение — J4/J5

Все reference, focused/E2E и qualification пути используют один packet builder,
validator и projection. resolveHitlJudgment проверяет verdict с packet перед
созданием answer, включая вопрос/stage/fixture identity. Не только call-site guard.

Добавить минимальный verifier retained exchange, переиспользующий hashJson,
validateHitlMatch и существующую packet/cleanup verification, а не второй ledger.
Проверять receipt hash, packet hash, stage, question, pause/execution identity,
Judge profile/Session, response IDs и exact joined answer bytes против event.
Новые matched events сохраняют необходимые packet/receipt hashes и contract ID.
Reference answered_pauses получает ту же proof reference.
Использовать verifier до replay ответа и в hitlEvidenceFor/recovery/evidence.
Не генерировать новый Judge turn для уже принятого pause.

Исторический v1 читается и структурно проверяется по v1 только в sealed legacy
read-only/replay контексте с исходной definition. Не преобразовывать v1 в v2,
не переписывать manifests, accepted answers, qualification или conclusions.
Новый запуск требует v2. Проверять old definition binding до productive resume;
не разрешать source upgrade в середине старого EVAL.
Потеря/изменение proof — retained evidence error, не разрешение повторить prompt.

### 3.4 Квалификация, диагностика и тесты — J6/J7/J8

Qualification identity использует actual contract version/prompt hash,
corpus/fixture/context hashes; старый PASS не допускает новый v2 запуск.
Сохранять first failure. Не retry-until-PASS, не majority vote и не ослаблять
expected ambiguous-reference ради Grok admission.
failure details: item ID, expected/observed, contract, qualification key,
receipt/packet locators; CLI не выгружает туда полный секретный context.
12th FAIL остаётся first cause, cleanup отдельно, не подмена причиной остановки.

Расширить существующий corpus paired cases:
- original CP193 unresolved reference;
- тот же вопрос с однозначным antecedent из context;
- shared source_quote для двух независимых решений;
- сохранение отрицания и условия archived/closed;
- mixed covered + ambiguous; covered + fixture_gap + extra scope;
- широкий ответ и два разных разумных referents;
- краткий ясный вопрос без references и ответы-альтернативы;
- accepted repeat vs действительно новое условие.
Текущие product answers и objective не менять. Corpus/context/checksums менять
только в новой committed definition согласно существующей политике.
Для targeted corpus items добавить expected_atoms: точный source_quote,
classification и response IDs. В live loop и при повторной проверке PASS receipt
сравнивать эти ожидания с validated atoms (без зависимости от порядка и свободной
формулировки decision/rationale); никаких expected полей в Judge packet.
Если одинаковый source_quote содержит несколько решений, oracle задаёт их
целевые классификации/IDs как multiset. Это узкий regression oracle, не
детерминированный semantic parser произвольного пользовательского текста.

Offline checks в существующих test suites:
- v2 schemas и runtime validator принимают/отклоняют одинаковые структуры;
- forged quote/source/answer/unknown ID/duplicate evidence и агрегаты отвергаются;
- covered atom без answer evidence и прежний J3 результат отвергаются;
- direct resolve не пропускает неверный verdict;
- productive/reference/recovery/qualification имеют общий boundary;
- changed packet/receipt/answer/fixture/stage/pause binding ломает replay;
- v1 read-only не превращается в v2 admission;
- canonical bytes/delimiter не переписываются, partial answer не доставляется;
- qualification failure показывает item + expected/observed + retained paths;
- сохранение aggregate verdict при потере ожидаемого атома не даёт qualification PASS;
- native smoke обновлён, не добавляет второй matcher;
- evidence/report schemas сохраняют grounded atoms без повторной классификации.

Живая проверка после реализации: стандартный runner definition qualify с общим
Judge gpt-6.1-sol/high через cx. Затем отдельная заранее ограниченная semantic
проверка unresolved/resolved pair: 3 fresh trials каждой, все исходы сохраняются,
каждый должен соответствовать oracle. Без paid probes во время planning.
Единичный PASS не доказательство отсутствия ошибок модели; flaky result не
перезапускать до зелёного. Scored E2E — отдельный следующий шаг после приёмки.

## 4. Порядок выполнения и проверяемые gates

1. Зафиксировать маленькую переносимую CP193 regression fixture (question,
   allowed context, responses, bad verdict), без абсолютных temporary paths.
2. Согласованно реализовать v2 schema + packet grounding + validator/projections;
   затем общий prompt. Existing functions first, новых dependencies нет.
3. Подключить boundary выдачи и retained verifier ко всем обнаруженным callers.
4. Обновить corpus, qualification identity/diagnostics, schema consumers и smoke.
5. Выполнить `node --test test/eval.test.mjs test/evidence-schema.test.mjs` и
   связанные cleanup/recovery тесты; затем `npm test`, `git diff --check`.
6. Провести diff review всех callers и live bounded qualification; сохранить
   PASS/FAIL отдельно от unit tests. Никаких product manual repairs.
7. Отчёт с закрытием J1–J9, known limits, commits/push при отдельном запросе
   реализации. Этот план сам по себе не разрешает EVAL restart/resume.

Definition/repo change достаточно: adapter/dd-flow release не нужен, если audit
реализации не покажет необходимость. Не обновлять native harnesses ради Judge fix.

## 5. Ponytail review

Применён full: fix once в общем Interaction Judge, не по harness; reuse existing
packet/validator/hash/cleanup/corpus/test инфраструктуры; stdlib substring/hash
проверки, без NLP-parser, новых зависимостей, второго Judge и отдельного сервиса.
Не хранить одновременно model-authoritative atoms и списки покрытия: списки
выводит runner. Не дробить canonical product answer ради ошибки reference.
Не оптимизировать whole-definition qualification cache в этом исправлении:
это отдельный policy вопрос, не доказанная причина J1.
Не упрощать trust-boundary validation и backward compatibility исторических
артефактов. Readiness gate — tests плюс ограниченная semantic проверка, не
утверждение «все ошибки Judge теперь невозможны».

## 6. Readiness review — уточнения перед реализацией

Эта секция уточняет предыдущие требования при расхождении. Проверены actual
readRegularFile, qualificationContext/materializeQualificationContext,
materializeStageSlice callers, retained context loading, judge-cleanup и
failureEvidenceRevision. Продуктивного запуска/изменения runtime не было.

### 6.1 Точный wire contract и stored projection

Raw Judge object имеет ровно `schema_id: dd-eval/hitl-match@2` и `atoms`.
Каждый atom имеет ровно поля, перечисленные в 3.2; все обязательны, массивы
могут быть пустыми только по своим правилам. classification атома использует
существующие пять значений. Непустые строки проверять trim, но не изменять
оригинальные quotes при сравнении. Exact comparison — JS string equality/includes
после штатного UTF-8 decode, без NFC/case/whitespace normalization.

reference_bindings item: `{reference_quote, source_id, evidence_quote}`.
reference_quote обязан присутствовать в source_quote данного atom.
answer_evidence item: `{response_id, answer_quote}`; answer_quote не пустой
и входит в exact answer выбранного response. Один atom может требовать несколько
responses и несколько цитат одного response. Полностью одинаковые evidence
items запрещены, повтор response_id для разных цитат разрешён.

На выходе shared validator возвращает stored normalized verdict с atoms и
derived status/classification/response_ids/covered_questions/uncovered_questions.
Raw schema и stored schema различаются явно: отдельные определения в одном
новом schema file, не два независимых контракта. Stored verification вычисляет
проекции повторно и сверяет, а не отвергает их как лишние raw keys.
Свободный rationale остаётся per-atom; итоговое объяснение для старых consumers
можно детерминированно собрать, не просить ещё одно объяснение у модели.

Matched iff все atoms covered. Иначе unmatched; primary определяется только
uncovered atoms по приоритету 3.1. response_ids — union доказательств covered
atoms, в fixture order. Атомы out_of_scope/unnecessary/ambiguous/fixture_gap
не имеют answer_evidence, даже если разделяют topic с covered atom.
Проекции questions использовать source_quote, сохраняя множественность атомов:
совпадающая исходная фраза у двух решений не ошибка. Consumers не должны
применять прежнее global string-disjointness к такой корректной декомпозиции.

### 6.2 Sources: небольшая frozen allowlist, а не сканирование

Packet grounding_sources — runner-built array `{id, origin, sha256, text}`.
`question` — исходный question; `context` — точная сериализация предоставленного
subject_context без filesystem roots как семантических доказательств;
`source-<index>` — объявленные source/task_input в стабильном порядке packet.
origin хранит исходный declared locator для аудита, не для model-selected reads.
IDs создаёт runner, модели разрешены только эти IDs. SHA вычисляется по retained
UTF-8 bytes, не по модели. Deduplicate одинаковые declared physical sources,
сохраняя roles; не дедуплицировать разные файлы только по равному содержимому.

В readRegularFile есть regular-file проверка, но сама она не доказывает root
containment. Builder сверяет lexical/realpath containment с declared roots
context (project/workspace/run/eval, только реально присутствующими), затем
читает regular file. Symlink наружу/отсутствующий required source/ошибка чтения
— retained context error, не ambiguous и не материал для домысла.
Optional missing source отмечается unavailable и не попадает в evidence allowlist.
Применять существующие reader/entry-pack ограничения; не вводить произвольный
новый лимит размера, silent truncation или fallback к глобальному project cwd.
Нельзя добавлять вопросу отсутствующую историю разговоров.

Snapshot источников создаётся на подготовке именно HITL packet, а не на stage
start. Stage context имеет уже существующий cache, поэтому источники не считать
неизменными по факту неизменного context_file. Если task_input/source имеет
обязательный digest, сверить его до snapshot. Для mutable allowed sources
зафиксировать фактически прочитанные bytes/hash на pause; больше не читать их
при verdict/replay. После фиксации Judge читает snapshot/inline text, не старый
mutable source path. Packet hash покрывает всю allowlist и её provenance.
Источники берутся только из declared context; произвольные native transcripts
не подключать как «полный контекст». Если принятого решения нет в declared
context/source, не притворяться, что Judge его знает; покрыть этот случай тестом.

### 6.3 Replay, compatibility и публикация

Проверка event→receipt→packet→answer использует anchor из durable matched event,
а не hash, заново вычисленный из potentially changed result как «ожидаемый».
New event/reference proof содержит receipt SHA, packet SHA, verdict contract,
pause ID, stage, round и execution/reference scope. Full packet привязывает
snapshot context/fixtures; answer bytes сверяются с selected fixture answers
из этого packet. Не перечитывать current canonical fixture для старого pause.
`resolveHitlJudgment` сверяет переданный fixture с packet до выдачи нового answer.

Нет matched event пока validation, answer materialization и cleanup не успешны.
Если event append оборвался, это не разрешение создавать новый Judge turn:
сначала проверить имеющийся завершённый operation/receipt существующим journal
механизмом. Не добавлять новый retry ledger. Retained proof loss даёт явный
judge_evidence_mismatch/judge_result_invalid, без автоматической отправки ответа.

Historical v1 evidence сохраняет доступность: не требовать полей v2, которых
в старом журнале не существовало. Existing v1 packet_sha/answer_sha/cleanup
проверять там, где они доступны, и явно отмечать legacy proof level без
retroactive invalidation ранее опубликованного итога. Новый validator не
разрешает v1 на new issuance. Productive resume старой definition — только
её pinned historical runner; новый runner не подменяет её contract и не
генерирует fresh v1 verdict. Pure historical report/read можно новым reader.
Derived run в новой definition требует новую qualification и v2 для новых
pauses; inherited v1 evidence остаётся историческим, не qualifying proof.

В failureEvidenceRevision сейчас HITL включает только stage/round/pause/answer
SHA. Для новых v2 exchanges добавить anchored receipt/packet/verdict identity,
чтобы изменение grounded evidence не исчезало из candidate/failure revision.
Не пересчитывать frozen historical candidate hashes новой projection policy.
Тестом разделить v1 historical hashing и v2 hashing. Это дополнительное
уточнение evidence consumer, не наблюдавшаяся причина CP193.

### 6.4 Oracle без переобучения на формулировку

Требование exact expected source_quote из 3.4 не означает единственную
грамматическую нарезку вопроса. Для targeted item oracle задаёт
`expected_atoms` с конечным authored набором допустимых source_quotes,
classification и response IDs; сравнение — one-to-one matching multiset
validated atoms, без зависимости от порядка. Corpus examples выбрать короткими,
где эти варианты ясны. Не задавать exact decision/rationale/answer_quote.
Не разрешать одному observed atom удовлетворить два независимых expectations.
Unknown/missing/extra decision atom вызывает FAIL у targeted strict item;
не делать generic semantic oracle для остальных произвольных текстов.
Не раскрывать допустимые quotes или expected labels Judge.

Тестировать duplicate phrases, shared compound source_quote, Unicode/CRLF,
quoted injection, полностью uncovered вопрос, несколько ответов на один атом,
один ответ для нескольких атомов, resolved reference и missing antecedent.
Исходный CP193 fixture отдельно проверяет сохранение неверного raw verdict
как доказательства FAIL, а не «починку» его в ожидаемую классификацию.

### 6.5 Acceptance, зависимости и остановка

Первый этап — offline implementation/tests/review. Полный suite должен пройти;
не скрывать failing tests обновлением goldens без причинного обоснования.
После него чистая committed definition: qualification использует точное tree,
поэтому финальную live qualification проводить после последних code/corpus edits,
а не до коммита. Документировать отдельные milestones implementation PASS,
qualification PASS и E2E (не запущен в рамках этого плана).

Живые проверки зависят от доступного CPA/Judge и host prerequisites. Если quota,
transport failure или semantic FAIL, сохранить first failure и остановить live
gate; offline результат не объявлять полным semantic acceptance. Не менять
Judge model, corpus oracle и canonical answers для обхода FAIL.
Bounded pair 3+3 trials можно поместить в existing native smoke runner, без нового
тестового сервиса. Команда принимает runtime root/profile и сохраняет все шесть
исходов. Для corpus квалификации сохраняется existing short-circuit on first FAIL.

Definition/schema consumers обновлять вместе с specs/017, актуальной ссылкой
plan062, execute-eval runbook и native smoke usage там, где описан старый контракт.
Исторические specs/reports не переписывать как будто они использовали v2.
Новая зависимость, dd-flow release или adapter change по этому readiness audit
не требуется. Семантическая ошибка модели остаётся возможной: gate предотвращает
допуск известного дефекта, но не доказывает безошибочность всех future questions.

## 7. Уточнения по implementation review 2026-10-03

Live FAIL `partial-covered` был false negative oracle: «уровни и подписи»
допускает объединённое и разделённое представления. `expected_atomizations`
задаёт конечные полные альтернативы к `expected_atoms`, каждая сравнивается
one-to-one. Это не разрешение игнорировать независимый SMS/ambiguous атом или
лишние решения; original first FAIL сохраняется. Corpus дополнен quoted-injection
case и переносимой отрицательной CP193 регрессией.

Публикация verdict восстанавливается из сохранённого capacity/native operation
без dispatch/continuation. Дедлайн повтора не уничтожает уже завершённый результат.
Если cleanup был подтверждён до публикации verdict, он привязывается к восстановленной
receipt по тому же durable stop proof — без нового stop на мёртвом daemon.
Неизвестный исход и неподтверждённый proof остаются блокером.

V2 требует durable profile/Session anchors и исключает downgrade через legacy flag.
Все HITL/cleanup/native-ledger входы читаются через regular-file descriptor,
чтобы FIFO/спецфайл не подвешивал read-only verification. Исторический v1
не получает новых обязательных полей, но duplicate selected IDs отвергаются.

Мalformed context/source и invalid UTF-8 отклоняются до native dispatch с
context diagnostic; stored provenance и schema namespaces согласованы.
Live gate/pair trials требуют отдельного выполнения на окончательной definition;
offline replay первого отказа не объявляется новым semantic PASS.
