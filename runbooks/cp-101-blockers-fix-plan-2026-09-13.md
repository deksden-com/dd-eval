# cp-101: план системного исправления блокеров Luna и ZCode

Статус: реализовано локально 2026-09-13; готово к одному release gate. Публикация и новый live E2E намеренно остаются отдельными внешними этапами.
Область: надёжность dd-flow/dd-eval, не доработка продукта, создаваемого Subject.
Исходные попытки не переписывать и не возобновлять автоматически.

## Доказательства и границы выводов

- Luna: EVAL-20260913083044-109f3e75, первый HITL принят, второй сохранён в SPECIFY. Fixture `specify.json` допускает один раунд. `runner.mjs:2527` возвращает null до чтения вопроса и Interaction Judge. Следовательно, отсутствие подходящего ответа не установлено: сопоставления не было.
- ZCode: EVAL-20260913083044-10343615. В `turn-00002.md` фактически выдан `--answer-stdin` без подачи файла. `run-controller.ts` добавляет перенаправление, но `managedLifecycleCommand` возвращает старую команду целиком. CLI отказал из-за пустого ответа.
- Далее finish для paused Work получил `invalid_work_state`; после успешного resume прежняя попытка finish воспроизводила этот отказ. Самостоятельно выбранный агентом ID закономерно отвергнут как `invocation_unknown`.
- ZCode control завершился в 08:57:55 UTC, recovery создан. Observer завершился примерно четырьмя секундами раньше. Записанный pending не доказывает незавершённую остановку.
- Источники: `dd-flow-cli/src/services/{lifecycle-invocations,run-controller,stage-pause,vnext-specify}.ts`, `src/cli/run-cli.ts`, `src/harness-runtime/lib/dd-zcode.mjs`; `dd-eval/lib/{runner,managed-flow-client,eval-resume-worker}.mjs` и сохранённые артефакты указанных EVAL.

## 1. Непредусмотренный HITL — ошибка, не ожидание

Первопричина: два пути реализуют одну политику по-разному. Reference callback (`runner.mjs`, около 448) уже бросает `unexpected_hitl`; Subject callback возвращает null. В общем managed observer null означает допустимое ожидание человека.

Реализация:

- Вынести только общую проверку допустимости нового HITL в маленькую функцию внутри существующего модуля: forbidden и исчерпанный max_rounds => `unexpected_hitl`; отсутствующий идентификатор/файл вопроса => отдельная ошибка целостности, не ошибка Subject.
- Сначала искать уже принятый ответ по pause ID и проверять его hash: переподключение к той же паузе не расходует новый раунд. Число раундов восстанавливать из durable receipts.
- В ошибке сохранять execution/stage/pause ID, фактическое число раундов, лимит, основание отказа, ссылку и hash вопроса, если доступен. Не запускать Judge после отказа политики.
- Использовать существующий путь execution failure -> managed stop -> settled recovery -> итоговый отчёт. Сохранять `unexpected_hitl` как первоначальную ошибку; сбой cleanup добавлять отдельно.
- Не запрещать обычный HITL в dd-flow: ограничение принадлежит eval. Ручная review-пауза reference (`pending_context`) остаётся законной и не превращается в failure.

Проверки: forbidden/второй вопрос завершаются ошибкой; Judge и answer dispatch не вызваны; первая допустимая пауза работает; replay того же pause не увеличивает счётчик; malformed pause классифицируется отдельно; после cleanup итог не awaiting_provider.

### Почему Luna задала второй вопрос

Первый вопрос был о шкале и default. Канонический ответ также определял UI: при создании новая задача получает no_priority, изменение возможно после создания. Второй вопрос явно различал UI и прямой API: отклонять любое переданное значение, принимать допустимое или принимать только no_priority; при PATCH без поля сохранять прежнее значение.

Наблюдаемое объяснение: модель сочла неоговорённое поведение прямого запроса существенным решением публичного контракта. Stage prompt требует не завершать работу при существенном открытом вопросе и использовать stage pause. Формулировка вопроса учитывает первый ответ, а не повторяет вопрос о шкале. Это объяснение по входам и публичному артефакту, а не доказательство внутренних рассуждений модели.

По согласованию с пользователем исходная fixture дополнена явной семантикой API: create принимает отсутствие priority/no_priority, отклоняет другие значения без создания; update без priority сохраняет прежнее значение, допустимое устанавливает, недопустимое отклоняет весь запрос. Архивные правила одинаковы для UI/API. Applicability включает API, max_rounds остаётся 1. Это новая редакция для будущих запусков, ещё не опубликованная квалифицированная версия. Старые receipts/hashes/ответы не менять. Не раскрывать Subject лимит раундов. Исторический отчёт сохраняет и дополнительный HITL, и неполноту прежнего ответа.

## 2. Идентичность операции не равна тексту команды

Первопричина: fingerprint намеренно не учитывает stdin и presentation options, но cache hit возвращает `prior.command` целиком. Потеря `< answer-file` — один экземпляр общего дефекта.

Реализация:

- Переиспользовать ID, а не старую строку. В общий renderer выделить существующую вставку invocation ID перед shell suffix из `issueLifecycleInvocation`; использовать её для первоначальной выдачи и повторного представления текущей валидированной команды.
- После вставки проверять scope/fingerprint тем же parser/checkCommand. Не использовать произвольную строковую замену shell-конструкций. Сохранить запрет составных команд и допустимые heredoc/redirection формы.
- Read-only путь тоже должен сохранять текущую форму команды, но не создавать authority и не менять ledger. Исходную выданную команду хранить как evidence; фактическую исполняемую команду — в существующем receipt.
- Ответ controller остаётся файлом с проверенным hash. Не переносить ответ в prompt и не заводить альтернативный канал ответа.
- Проверить семантику `reason`: сейчас fingerprint сводит разные значения к одному. Если это меняет действие, значение должно участвовать в идентичности; если это разрешённые входные данные, renderer обязан сохранить текущие данные. Зафиксировать решение для каждого реального lifecycle consumer.

Обследованные смежные потребители: stage pause/resume; controller stage start с response-file; finish SPECIFY/PLAN/CODE/reviews/MERGE; start переходов и merge-server; retry и recovery overlay. Это область риска общего helper, не утверждение о наблюдавшемся сбое каждого этапа.

Проверки: одна authority + позднее добавленные stdin/file/heredoc; актуальные response-file/json/progress options; reason; readonly rerender; recovery suffix; запрет изменения operation/project/Work/generation; исполнение выданного controller resume с точными байтами ответа. Использовать существующие DB/parser/controller tests, а не только сравнение строк.

## 3. Законная новая попытка после доказанного отказа

Первопричина: settled outcome правильно неизменяем, но нет полного пути получения следующей попытки после исправимого отказа состояния. Повторное представление команд не учитывает этот случай.

Реализация:

- Не переисполнять старый ID: он всегда возвращает старый outcome.
- Использовать существующий механизм `retryLifecycleInvocationCommand`, не вводить новый сервис команд или неограниченную команду mint-ID.
- Разрешать successor на основании явно отмеченного отказа до эффекта/после подтверждённого rollback, а не глобального allowlist `invalid_work_state`. Новый вызов заново проходит обычные проверки актуального состояния.
- Проверить throw sites в stage-pause, stage-blocker, SPECIFY, PLAN и work-registry: одинаковый код ошибки используется и на входной проверке, и при конкурентном изменении. Непроверенные случаи остаются без автоматического retry.
- В error packet возвращать точную retry_command и условие её применения. После успешного resume актуальный packet должен ссылаться на этот successor, не на окончательно отвергнутую попытку.
- Executing/unknown, успешные эффекты, scope mismatch и старая recovery generation никогда не получают автоматическое переисполнение. Recovery должен видеть последнее поколение/последнюю попытку и её outcome.
- Проверить старые settled no-effect failures без successor: либо доказуемое штатное восстановление, либо явный отказ с инструкцией; не обещать совместимость неустановленных outcomes.

Проверки: finish(paused) -> отказ -> resume -> новый finish успешно; старый ID по-прежнему возвращает отказ; два читателя получают один successor; неизвестный эффект/успех не переисполняются; конкурирующее изменение не обходит admission.

## 4. Ошибки lifecycle и ошибки вторичных журналов

Первопричина задержки: lifecycle observer складывает ошибку в notificationError, но prompt может продолжаться до flush. В соседнем secondary-notification пути уже есть отдельная немедленная реакция на profile_integrity_violation.

Реализация:

- Разделить ожидаемый отказ CLI с достоверным receipt, нарушение authority/неподтверждённый lifecycle effect и ошибку вторичного evidence. Обычный отказ команды не должен сам по себе ломать adapter; нарушение authority не должно молча разрешать дальнейшую продуктивную работу.
- Для fatal lifecycle нарушения сохранить первый incident с session/tool/invocation ID и временем, запретить новые productive requests, завершить ожидание prompt ошибкой и передать остановку существующему владельцу RUN control.
- Reject promise не считать физической остановкой native. Финализация обязана дождаться штатного stop/drain/capture. Не делать второй независимый kill path.
- Не ломать permission responses/control requests, необходимые для остановки. Ошибка записи incident не должна скрывать первоначальную причину. Вторичные telemetry failures не переводить безусловно в fatal.

Проверки: CLI validation с receipt допускает исправление; unknown authority блокирует последующие productive requests до завершения длинного prompt; журнал сохраняет первопричину; stop остаётся доступен; secondary evidence failure не выдаётся за потерю lifecycle.

## 5. Pending cleanup должен иметь живого владельца наблюдения

Первопричина: finalizeRunProjection делает одну проверку, а eval-resume-worker считает любой возврат runnerResume завершением своей работы. Awaiting cleanup и законная пользовательская пауза не разделены.

Реализация:

- Использовать существующий detached observer и control status. Возвращать явную причину pending: cleanup/recovery, authorized human/reference pause, observation unavailable. Не создавать отдельный daemon или cron для исправления базового lifecycle.
- Пока cleanup продолжается, существующий observer следит за ним с bounded polling/backoff и durable heartbeat. После settled повторно подхватывает capture и завершает candidate/report. Не запускать Subject prompt повторно.
- При завершении worker сохранять результат работы observer отдельно от результата EVAL. Completed observer не означает completed execution.
- При недоступности источника сохранять last_observed_at, источник и явное unknown; при доказанном capture failure — конечную ошибку cleanup, не бесконечный pending. Предусмотреть штатное переподключение после потери observer.
- Пройти соседние пути runnerResume/reconcile/cancel/recovery: все должны использовать ту же финализацию, сохранять первую ошибку и не завершать отчёт до подтверждённого control outcome. Read-only status сообщает свежесть проекции, но не возобновляет выполнение побочным эффектом.

Проверки: control settles после первого прохода; capture появляется позднее; capture failed; observer restart в cleanup; stop status временно недоступен; idempotent terminal report; original error не заменён cleanup error; ни одного повторного Subject dispatch. Законная human/reference пауза остаётся паузой.

## Порядок выполнения и критерии готовности

### Сквозной проход обеих CLI: вход, выполнение, результат

Дополнительно прочитан весь router `dd-eval/bin/dd-eval.mjs`, общий pipeline `dd-flow/src/cli/run-cli.ts`, classifier, parser, context/database modes и eval process-json bridge; прослежены lifecycle/control/snapshot handlers и GC guards. Это покрытие границ команд обеих CLI, не заявление о построчном аудите всех реализаций всех service-модулей (включая legacy protocol, dashboard, migrations и все providers).

**К-01 — запрос оператора -> parse eval (подтверждено).** Parser молча заменяет повторное значение опции; большинство branches не проверяют неизвестные опции и лишние positionals. Изолированный запуск исходной функции parse без dispatch подтвердил: `runner cancel --eval A --eval B` выбирает B; `runner cancel --eval A --executoin e2e` сохраняет неизвестную опцию, а handler не передаёт executionId, то есть запрос становится отменой всего EVAL; лишний positional также не отвергается. Мутационные команды в эксперименте НЕ запускались. Существенность: опечатка ограничителя способна расширить target операции. Исправление: перед dispatch валидировать точную форму каждой команды — arity, разрешённые flags, обязательность, типы и дубликаты singleton. Использовать небольшую таблицу команд без нового framework. В control branches уже есть частичная проверка; перенести её в общий путь, не дублировать.

**К-02 — request -> parse dd-flow (подтверждён смежный класс).** parseCommandArgs сохраняет массив значений, optionalOption выбирает последнее; большинство handlers потребляют только известные поля. Повтор singleton project-root/run/work/ID и неизвестные ограничения нельзя молча принимать. Общая проверка до engine routing и открытия writable context, с явным списком repeatable (`origin-work`, `from-finding`, `flag` и прочие существующие массивы). Не запрещать все повторы глобально. Не изменять синтаксис совместимых опубликованных engine команд без теста router/engine границы.

**К-03 — help/usage -> exit (подтверждено).** `node bin/dd-eval.mjs --help` реально вернул code operation_failed и exit 1: parse требует значение раньше help branch. В dd-flow parseOutputOptions вызывается до try, поэтому некорректный response-file выходит мимо штатного JSON/error handling. Исправление в рамках общей входной границы: help распознать до value parsing; parsing errors завернуть в единый usage reply/exit 2, не создавать runtime и provider. Важно для машинного клиента, не косметика текста справки.

**К-04 — classify -> DB mode (подтверждён разрыв маршрутизации).** `work status/ls/show`, `stage fanout status`, `run recovery inspect` отсутствуют в read-only allowlist classifier и попадают в normal_write/initialize, хотя CLI handlers читают состояние. getDatabase initialize открывает writer и выполняет schema initialization. Значит сам диагностический вход допускает запись/инициализацию хранилища и лишние compatibility барьеры. Исправление: явно классифицировать чистые status/inspect формы после проверки их service-контрактов; для inspect, который действительно reconcile/mutate, сделать это явной отдельной командой, не просто переименовать mode. Тест в существующей readonly/fenced DB: диагностика не требует writer и не меняет schema/files. Это не разрешение массово пометить все inspect read-only без проверки.

**К-05 — route -> dispatch -> reply (проверено по коду).** Router получает response-file обратно в routedArgs и forwards json/progress. При settled invocation replay dispatch пропускается; writeResponseFile выполняет atomic rename и при ошибке возвращает response_file_error с исходным payload, не разрешает новый effect. Эту защиту сохранить. Потребитель обязан читать response_file_error и использовать retained payload/receipt, а не повторять start/finish. Отдельный тест forwarded failure: parent progress сейчас сообщает done независимо от routed.exitCode; исправить terminal progress на failed при ненулевом exit, не менять реальный exitCode.

**К-06 — stdin -> owner -> mutation (проверено).** work finish требует ровно file или stdin и проверяет owner; stage finish выбирает разные stage-specific result contracts, pause/resume используют stdin. Нельзя объединять все finish в один универсальный payload и считать любую validation безопасной после dispatch. Прежние исправления Т-06/07/08 применять на фактических границах effect. Дополнение к входным тестам: взаимно исключающие result-file/semantic-file/data aliases не должны молча выбирать один из двух разных файлов; проверять неоднозначные singleton/aliases до изменения состояния.

**К-07 — dd-flow reply -> dd-eval bridge (проверено).** commandJson читает stdout JSON и stderr errors/progress, сохраняет structured code при ненулевом exit, а AbortSignal прерывает CLI observer, не доказывает остановку detached RUN. Существующий stop/drain остаётся обязательным. Не вводить общий агрессивный timeout/kill для всех CLI как обход зависаний. Отдельно тестировать transport failure после принятого effect: unknown -> reconcile, не автоматический productive retry.

**К-08 — accepted eval request -> detached observer (вывод сквозного пути).** Успешный exit eval run означает принятый запрос, не успешный E2E. `ok:true` status также означает успешное чтение, а не passed execution. Не менять все status exits на nonzero для failed Subject; выдавать отдельные operation acceptance / execution outcome / observer state. Согласовать это с исправлениями finalizer/Judge Т-11–13, иначе вызывающий shell снова примет завершённый worker за успешный прогон.

**К-09 — stop/recover/snapshot -> report (проверено на dispatch-границе).** Snapshot create требует ровно один из candidate/incomplete/recovery/stage-entry — корректный инвариант сохранить. Control commands должны оставаться доступны при запрете productive admission и изменённом definition. Нельзя переводить их в общий fatal-adapter запрет. Recovery generation и immutable original evidence остаются источником допустимости нового dispatch, не exit 0 предыдущей команды.

**К-10 — storage/GC (проверено по коду, без удаления).** gcApply проверяет принадлежность plan текущему home, target непосредственно под runs, запрет symlink, lifecycle lock и повторно читает terminal state. Это нужные guards, не переписывать. Но disposable state приходит из проекции, поэтому исправление завершения observer/Judge должно гарантировать, что completed/cancelled не публикуется при активных владельцах. До такой гарантии добавить проверку отсутствия активных scope owners перед удалением; при unknown отказ. Не расширять GC на failed/completed_with_failures ради этого пакета.

**Результат для пакета.** Добавить общий блок «безопасная входная граница CLI»: строгая форма запросов и singleton/alias conflicts, корректные usage replies, согласованные read-only modes. Это устраняет тот же класс потери намерения, что и возврат старой command string. Проверять сначала парсер изолированно (без dispatch), затем несколько реальных CLI на временном home: malformed cancel не вызывает handler, help не создаёт runtime, readonly status не пишет, forwarded failure не сообщает done. Не требуется запускать живые Subject Sessions или выполнять GC на реальных данных.

### Выполненная статическая трассировка: результаты повторного прохода

Повторно пройден фактический код с подстановкой предложенных изменений. Ниже результаты, а не задания «проверить позже». Runtime ещё не реализован, поэтому выводы о целевой цепочке условны выполнением конкретных изменений. Динамическое подтверждение остаётся за регрессиями.

**Т-01. Планирование -> fixture -> Judge.** `interactionFixture` (runner.mjs:1590–1620) вычисляет hash содержимого JSON и сравнивает его с manifest. Дополнение answer/applicability уже меняет hash без изменения schema_id. Вывод: механизм фиксации версии достаточен, новую схему не вводить. Старый manifest с новой fixture закономерно несовместим. Новый пакет публиковать новым definition; старые запуски сохраняют старые условия.

**Т-02. Issued -> observed -> executing.** `observeLifecycleInvocation` проверяет expired/deadline внутри BEGIN IMMEDIATE, duplicate identity возвращает существующий receipt, `awaitLifecycleInvocation` забирает observed условным UPDATE. Вывод: защита от позднего события и двойного claim уже существует; нового механизма не нужно. Сохраняем её тестами при изменении renderer/retry. Ранее этот пункт был риском для проверки, не новым дефектом.

**Т-03. Command -> CLI replay -> output.** run-cli.ts:282–306 получает retained outcome до dispatch; при replay dispatch не вызывается, а дальнейшая выдача использует текущий output configuration. Вывод: исправление renderer достаточно для актуального response-file/формата на этом пути; результат повторно не исполняется. Не нужно менять семантику settled replay или хранить отдельный outcome для каждого формата вывода.

**Т-04. Первый HITL -> принятый ответ.** runner.mjs:2474–2492 восстанавливает раунды и hashes из matched events; answerFor сначала ищет тот же pause. `answerRunController` (203–244) связывает request ID с pause/hash, проверяет конкурирующий ответ и сохраняет operation + answer_accepted event в одной DB-транзакции. Файл создаётся wx, а оставшийся после crash файл сверяется побайтно. Вывод: механизмы защиты от двойного принятия уже есть. Новый answer queue не нужен. Существующую границу matched -> controller acceptance покрыть восстановлением, не дублировать данные в другом хранилище.

**Т-05. Accepted -> dispatch resume.** controller:364 формирует stdin-file, helper раньше терял его. После исправления renderer команда действительно прочитает сохранённый ответ. Контроллер проверяет hash файла, а answer store не перезаписывает существующие байты штатным путём (wx). Вывод: отдельное расширение CLI hash-параметром не обязательно для устранения наблюдавшегося дефекта; не включать его без воспроизведённого нарушения принятой модели хранения. В тесте проверить реальные принятые байты и отказ при изменении файла до controller dispatch.

**Т-06. CLI resume -> mutation.** stage-pause.ts:70–99 проверяет paused и непустой ответ, но пишет answer.md ДО проверки наличия Work Session и ДО транзакционного claim. Следовательно, отказ runtime_missing или claim может оставить файл, не являющийся принятым ответом; при конкурирующих попытках общая answer.md может быть перезаписана до выбора победителя. Это дополнительный существенный пробел сохранения evidence. Исправление: все доступные read-only preconditions до записи; уникальный неизменяемый файл попытки, а authoritative answer_path устанавливается только вместе с успешным state transition. Невостребованный файл допустим как orphan evidence, но не выдаётся за принятый ответ. Использовать существующие atomic/immutable file helpers, не пытаться объявить filesystem частью SQLite rollback. Регрессия: отказ claim/Session не меняет принятый ответ; два кандидата не перезаписывают байты победителя.

**Т-07. Paused finish -> retry -> resumed packet.** SPECIFY проверяет work.status до обработки result, так что конкретный paused отказ можно квалифицировать как no-effect. Но stage-pause.ts:105–124 читает старый workSession.prompt_path и добавляет только HITL-блок: finish ID в старом prompt не меняется. Вывод: одной выдачи successor НЕ хватает. В возвращаемом resume packet нужен runtime-generated command overlay с текущими разрешёнными командами и явным замещением старых IDs. Исходный prompt сохранить как evidence. Переиспользовать принцип существующего recovery overlay, не глобально заменять UUID в prose. Регрессия исполняет команду именно из packet после resume, а не берёт successor напрямую из тестовой DB.

**Т-08. Rejection -> successor settlement.** run-cli.ts:319–329 сначала готовит successor, затем отдельным вызовом сохраняет отказ. При потере процесса между ними исходная попытка остаётся executing, а successor уже выдан. Предложение «использовать существующий retry helper» само по себе этот разрыв не закрывает. Объединить создание successor и settlement conclusive rejection одной внешней DB-транзакцией; вложенный SAVEPOINT helper не является самостоятельной атомарностью всей пары. Если запись исхода не удалась, successor не должен стать доступным. Успешный dispatch имеет отдельную защиту: invocationSettlement сбрасывается до записи успеха, так что persistence failure не получает retry; её сохранить.

**Т-09. Второй HITL -> failure cleanup.** Замена null на unexpected_hitl направляет ошибку мимо isManagedWait к существующему cancelExecutionTree и execution.failed (runner.mjs:2340–2379). Это достаточно для запуска остановки, но НЕ для полного evidence: hitlEvidenceFor собирает только matched events. Поэтому rejected question явно прикрепить к failure через error.hitl/существующий error evidence путь до остановки; сохранить причину лимита, pause, question/hash. Иначе итог отчёта покажет лишь первый вопрос. Отдельно malformed pause не классифицировать как subject error.

**Т-10. Adapter failure -> native stop.** Сохранение notificationError до flush объясняет задержку. Немедленный reject ожидания позволит controller увидеть failure раньше, но не является остановкой процесса. Целевая цепочка должна идти error -> существующий controller/control stop -> drain; блокировка productive requests не должна блокировать control. Вывод: два самостоятельных механизма убийства процесса не нужны; тест обязан наблюдать native stop receipt, а не только rejected promise.

**Т-11. Stop pending -> capture -> final report.** finalizeRunProjection сначала пробует capture, затем отдельно проверяет status.settled. Между этими чтениями control может завершиться: pending станет false при ещё не присоединённом capture. Кроме того, incomplete_evidence устанавливается при отсутствии снимка, но не очищается при последующем успехе. Вывод: pending вычислять из согласованного результата control + capture readiness; после появления снимка снять только прежний pending-capture marker, не другие evidence errors. Не freeze candidate до готового снимка либо явно конечного capture failure. Это обязательное дополнение к простому циклу наблюдения.

**Т-12. Pending loop -> journal.** Каждый вызов finalizeRunProjection для failed без recovery_id дописывает execution.failed даже при прежнем результате. Наивный polling размножит ошибки и revisions. Дополнение: писать enrichment только при содержательном изменении control/capture/evidence; heartbeat — отдельное состояние observer, не новая failure revision. Когда snapshot появился, зафиксировать одну новую evidence revision. Повторная reconciliation её не меняет.

**Т-13. Candidate -> final Judge -> report.** runner.mjs:1370–1388 ловит только operation_in_progress; прочая ошибка Judge выбрасывается ДО публикации report/state. При operation_in_progress report публикуется, но observer может завершиться без дальнейшего Judge observation. Вывод: отдельно сохранять terminal Subject outcome и Judge outcome; Judge failed не лишает запуска отчёта, Judge in_progress остаётся под наблюдением либо явно передаётся существующему владельцу. Не повторять Judge продуктивно после неизвестного исхода; использовать его retained operation. Добавить две конкретные регрессии failed/in_progress, а не только флаг «Judge проверен».

**Т-14. Boundary -> следующая стадия -> terminal.** managed-flow-client сначала проигрывает упорядоченные events, дочитывает страницы по 100 и лишь затем трактует terminal status; required HITL проверяется в onEvent boundary_captured. Вывод: существующий порядок сохраняет проверку обязательного вопроса перед принятием boundary, дополнительный terminal shortcut недопустим. После исправленного finish переход оставить существующему controller continuation, не выполнять next-stage command силами Subject. Локальная цепочка должна доходить до следующей стадии и terminal capture, иначе packet/continuation дефект Т-07 можно снова пропустить.

**Итог прохода.** Исходных пяти направлений достаточно архитектурно, но прежних деталей реализации было недостаточно. Обязательные дополнительные изменения: immutable answer publication (Т-06), актуальные команды в resume overlay (Т-07), атомарность successor/outcome (Т-08), rejected HITL evidence (Т-09), согласование stop/capture и очистка устаревшего marker (Т-11), idempotent enrichment (Т-12), самостоятельное завершение/наблюдение Judge (Т-13). Т-02/03/04/14 используют уже существующие корректные механизмы; не переписывать их без необходимости. Все пункты включить в критерии приёмки реализации, не оставлять исследовательскими TODO.

### Дополнение: пошаговая проверка целевого поведения

Это проектная трассировка будущего кода, не результаты исполнения. Перечисленные дополнительные риски не объявляются доказанными дефектами без воспроизведения.

1. **Версия входов.** Зафиксировать новую fixture в definition commit и штатно получить manifest hash. Проверить applicability, Judge packet, reference inputs и последующие stage entries на согласованность API-решений. Противоречащий canonical package требует новой версии штатным способом; исторические snapshots не редактировать. Старый EVAL из изменённого checkout не продолжать: definition/fixture guard должен отказать. Остановка старого RUN должна оставаться доступной независимо от definition.
2. **Preflight.** Проверить pins и baseline до Subject. Ошибка до регистрации project не должна запускать Judge, требующий project, или ждать отсутствующую Session. Сохранять исходную инфраструктурную причину. Добавить тест раннего failure, не расширяя матрицу providers.
3. **Выдача start.** Переиспользовать authority, сохраняя текущие response-file и shell suffix. Проверить replay с новым response-file: старый outcome выдаётся в запрошенной форме без повторного эффекта. Общая вставка ID до redirection/heredoc не допускает вторую shell-команду.
4. **Admission.** Native receipt связан с Session/tool/scope; атомарный claim оставляет одного исполнителя. Дубликат события не создаёт второй receipt. Позднее подтверждение не оживляет expired attempt. Executing/unknown не превращается в retry. Покрыть timeout и конкурентный claim существующими DB-тестами.
5. **Pause.** Сначала сохраняются вопрос и pause identity. Replay паузы не является новым вопросом. Счётчик восстанавливается из принятых receipts по execution/stage, не обнуляется после restart. Не менять неявно лимит на stage на лимит каждой попытки stage.
6. **Разрешённый ответ.** Сначала проверяется существующий accepted answer/hash, затем политика нового вопроса. Judge получает новую pinned fixture и возвращает канонические решения. Проверить restart между materialize, matched receipt, drive answer accepted и ответным prompt: уже подтверждённый ответ не должен повторно вызывать Judge или исполняться дважды. Использовать существующие operation IDs, без нового transaction journal.
7. **Resume.** CLI принимает точные байты ответа для нужного pause/work, меняет paused -> running один раз. Проверка hash в controller сама по себе не доказывает неизменность файла до чтения CLI: проверить гарантии хранения/потребления; если их нет, проверить ожидаемый hash при потреблении stdin. Это дополнительный риск, не установленный exploit. Тест проверяет принятый текст, не только строку команды.
8. **Retry.** Старый отказ неизменяем, successor разрешён только при доказанном отсутствии эффекта. Проверить окно между созданием successor и settlement исходного отказа: при сбое нельзя оставлять разрешённую новую попытку рядом с unknown исходом. При необходимости объединить записи существующей локальной DB-транзакцией. Новый packet выбирает successor. Успех, executing/unknown и expired имеют отдельные правила, не общий автоматический retry.
9. **Нарушение HITL.** Forbidden/лишний/unmatched вопрос завершают execution соответствующей ошибкой без ответа. Отсутствие обязательного HITL также остаётся ошибкой на boundary. Malformed fixture/receipt и сбой Judge — отдельные инфраструктурные причины, не вина Subject. Сохранить доступный вопрос до cleanup. Добавить required-missing и unmatched в проверки.
10. **Fatal event.** Обычный CLI rejection с достоверным receipt не ломает adapter. При нарушении authority фиксируется первопричина, закрывается productive admission и вызывается managed stop. Одного запрета новых prompt недостаточно для активного native turn: stop должен реально прервать его. Уже начавшиеся эффекты drain/фиксируются, а не объявляются отсутствующими. Control/permission ответы для завершения остаются доступны; поздний event не снимает failure.
11. **Stop.** Проверить одновременное завершение Subject и stop, повтор stop и restart observer. Существующие generation/admission guards сохраняют одного владельца control, не затрагивают соседний EVAL и не запускают Subject повторно.
12. **Capture.** Stop settled и готовность recovery — разные условия. Продолжать обогащать failure evidence до наличия снимка либо доказанной capture failure. Не freeze candidate/Judge несколько раз при повторном опросе. Таймаут означает unknown/needs attention с heartbeat и reattach, не выдуманный stopped. Законная ручная пауза может завершить observer, cleanup не должен потерять владельца.
13. **Итог.** Раздельно показывать execution outcome, control/capture/observer state, исходную и cleanup ошибки, источник и время последнего подтверждения. Сбой final Judge не маскировать под активный Subject. Reconciliation идемпотентна и не выполняет productive dispatch. Покрыть capture failed, Judge failed и потерю observer на границах финализации.
14. **Следующая стадия.** После успешного finish брать текущую continuation, не packet до pause/retry. Передавать принятые API-решения дальше и сохранять per-stage HITL accounting. Локально проверить start -> pause -> answer -> resume -> rejected finish -> successor finish -> next stage -> terminal capture с fake provider и реальным CLI/DB.

### Дополнительные критерии проверок

- Две сквозные локальные регрессии: успешная цепочка пункта 14 и unexpected HITL -> stop -> поздний capture -> конечный failed report. Без платных provider Sessions.
- Остальные развилки — компактные параметризованные тесты существующих renderer/ledger, HITL, observer, adapter и cleanup suites. Не умножать каждую комбинацию на все harnesses.
- Проверить неизменность mode/max_rounds/response ID/уровней и архивных правил fixture; API добавлен в канонический ответ, а не скрытую подсказку Subject. Новый manifest hash отличается, старый отвергается guard.
- Проектная трассировка не заменяет исполнение тестов и не гарантирует успех будущего E2E. Реализация принимается только после этих проверок и согласованного release gate.

1. Зафиксировать найденные последовательности регрессионными тестами, затем исправить общий renderer и безопасные successors.
2. Исправить общую HITL policy и её failure path.
3. Исправить fatal lifecycle propagation и совместно проверить stop/finalization.
4. Обновить runbooks: источник истины для статуса, unexpected_hitl, retry после отказа, initial failure против cleanup failure, ссылки на evidence.
5. Выполнить профильные suites и type/build checks. Один обязательный полный release gate на финальном release commit; не повторять полный gate после каждой узкой правки.
6. Опубликовать по release runbook, проверить установленный пакет и согласованность checkpoint при отдельном выполнении релизного этапа. Новые живые E2E — следующий этап, не скрытая часть этого плана расследования.

Готово, когда все пять причин покрыты исполняемыми регрессиями, нет потери входов/застрявших известных отказов, непредусмотренный HITL даёт явную ошибку, а stop и recovery доводят EVAL до достоверного конечного статуса. Продуктовые решения и неизменяемые артефакты старых прогонов не исправляются задним числом.

## Результат реализации

- Canonical fixture уточняет одинаковую UI/API семантику `priority`; её definition-изменение уже зафиксировано отдельным commit `63ccc4d`. Исторические EVAL не меняются и корректно не пройдут definition guard.
- Один renderer lifecycle-ID теперь сохраняет текущие stdin, heredoc и response-file при повторной выдаче authority. Known no-effect `invalid_work_state` получает successor только при явном `retryable_no_effect`; settlement старого outcome и создание successor выполняются в одной SQLite-транзакции. Resume packet выводит только текущие разрешённые replacement-команды.
- Ответ паузы материализуется под content-addressed именем после успешного hook claim; существующий файл обязан совпасть байт-в-байт. Случайный/непринятый ответ не становится ссылкой из RUN state.
- Общая `authorizeHitl` используется reference и Subject: malformed pause — ошибка целостности, forbidden или исчерпанный лимит — `unexpected_hitl` с pause/question hash и причиной. Такой случай проходит обычный failure/stop/capture путь, а не переводит EVAL в ожидание человека.
- Fatal lifecycle authority errors ZCode немедленно отменяют активные и будущие productive requests, сохраняя incident. Control/drain остаётся владельцем RUN; обычные CLI rejection и secondary evidence errors не повышены до fatal.
- Finalization не повторяет одинаковый failure event, снимает устаревший marker неполного evidence после capture и публикует report/state даже при terminal ошибке Final Judge. Observer ждёт pending cleanup с backoff 250 ms → 5 s и записывает settling не чаще раза в 5 s.
- Eval CLI отвергает повтор singleton-option, неизвестные options и лишние positional arguments в известных командах; help не создаёт state. Flow CLI отвергает повтор singleton-option, а `work status|ls|show`, `stage fanout status` и `run recovery inspect` классифицированы как read-only.

Проверено после финальной правки: `dd-flow` build; 41 профильный Vitest-test (lifecycle, ZCode observer, control/read-only); 68 unit tests `dd-eval`; расширенная интеграционная выборка `dd-eval` — 142 passed, 5 deliberately skipped. Не запускать ещё один полный gate до финального release commit.
