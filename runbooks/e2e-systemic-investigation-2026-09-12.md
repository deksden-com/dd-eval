# Разбор Luna / ZCode beta.52 и план системных исправлений

Статус: расследование и проект решения; исходный код и исторические EVAL не изменены. Этот документ уточняет предварительный `e2e-runner-continuation-incident-2026-09-12.md`. Подход ponytail: использовать существующие цикл наблюдения, lifecycle lock, проверку definition и адаптерные журналы.

## Проверенная основа

- Definition обоих запусков: `f6f5b07f9d5f0cd96bfda99ae97feab4d13307b1`; engine `0.9.0-beta.52`.
- Luna: `EVAL-20260912145714-a6df3a35`. MERGE выполнен в 18:50:15 UTC, candidate захвачен в 18:51:08, clean stop — 18:51:11, EVAL completed — 18:57:21.
- Judge Luna: `judge/result.json`, validity `valid`; все outcome-критерии 4, flow-критерии 4 кроме observability = 3. Completed означает завершённую оценку; успешное восстановление не доказывает непрерывность наблюдения.
- ZCode: `EVAL-20260912145801-7107a4ac`; ошибка операции сохранена в 16:17:01 UTC, controller `recovery_required`. Вызов справки, связанный с ошибкой, зарегистрирован в 15:55:13; прежний отчёт ошибочно называл это временем завершения.
- Артефакты: `/Users/deksden/.dd-eval/qualification/cp-100-luna-zcode/runs/<EVAL>/`; controller-журналы внутри `executions/e2e/dd-flow-home/projects/PRJ-001-project/runs/RUN-001-eval-subject/controllers/`.

## Что произошло по этапам

| Этап | Luna | Существенная информация |
| --- | --- | --- |
| Подготовка | baseline admission passed, engine pinned | Нет подтверждённого нового дефекта подготовки |
| SPECIFY | один зарегистрированный HITL, затем завершение | Требования и канонический ответ сохранены |
| PROTOCOLIZE | завершён | Предшествующие результаты использованы в следующей стадии |
| PLAN / PLAN-REVIEW | принята revision 2 | Уточнены PATCH/null/allowlist, DB-инварианты, legacy migration, ordering, изоляция, fixtures и evidence |
| CODE | завершён с repair | Сам факт зелёного gate не обнаружил все ошибки продукта и проверок |
| Перед CODE-REVIEW | около 30 минут waiting_for_context | Observer отсутствовал; штатный runner resume восстановил тот же controller |
| CODE-REVIEW | семь distinct findings, исправлены | Реальный дефект priority-only edit и шесть пробелов доказательств/документации |
| MERGE | интеграция, target gate, capture и clean stop | Существующий observer самостоятельно передал следующий контекст |
| Judge | завершён | Выявил пробелы evaluator evidence |

ZCode дошёл до PLAN-REVIEW; сохранённая ошибка hook привела к recovery_required. Причину поздней фиксации ошибки относительно исходного tool event надо проверять отдельно: наличие ошибки в уведомлении ещё не доказывает, что исполнение команды было синхронно запрещено.

## Подтверждённые проблемы инфраструктуры

### I-01. Lifecycle-парсер принимает help за мутацию

Первопричина: `dd-flow-cli/src/services/lifecycle-command.ts:lifecycleOperation` определяет операцию по первым словам, тогда как CLI заранее обрабатывает help (`src/cli/help.ts:helpForArgs`). `work start --help 2>&1 | head -60` становится compound work_start. В result ZCode сохранён именно этот standalone_command.

Область: stage start/finish/pause/resume, work start/finish/fail, session register, recovery accept; общий парсер используется hooks и sessions. Затронуты все адаптерные обработчики, а не только ZCode.

Минимальный фикс: совместить распознавание help с фактическими правилами CLI в общем парсере. Проверять конкретный argv, а не наличие слова help в произвольной строке. Не вводить общий запрет распознавания команд без RUN: bootstrap является законным исключением. Правила version сначала сверить с dispatcher, не объявлять всякий `--version` безопасным.

Проверки: help с абсолютным executable и pager не участвует в lifecycle; настоящий compound start остаётся запрещён; help рядом с настоящей мутацией не скрывает её; bootstrap сохраняет binding.

### I-02. Исключение stdin разрешает лишнюю shell-композицию

Первопричина: `hooks.ts:allowsStdinLifecycleCompound` проверяет лишь work_finish + result-stdin либо pause/resume + heredoc. Оно не учитывает `analysis.reason=multiple_lifecycle_invocations`. Команда `dd-flow work finish WRK-001 --result-stdin; dd-flow work start WRK-002` получает разрешение исключения для первого вызова. Это подтверждённая брешь в standalone guard; обход остальных проверок прав или успешная вторая мутация не доказаны.

Область: четыре общих места применения helper в hooks; packet генерация в `work-registry.ts` требует stdin и одновременно называет pipe standalone-командой.

Минимальный фикс: единая разрешённая форма — один lifecycle-вызов с прямым heredoc, как уже принято для HITL. Генерировать эту форму в worker packet, отклонять несколько lifecycle-вызовов, `;`, `&&`, посторонние команды и неразрешённые stdin-производители. Не расширять собственный shell parser до полноценного интерпретатора. Если совместимость старого pipe обязательна, поддерживать только конкретную проверяемую форму отдельной веткой с тестом.

Проверки: реальный generated work/HITL packet проходит; второй lifecycle и посторонний хвост не проходят; содержимое heredoc остаётся данными.

### I-03. Redirection искажает argv и предложенный retry

Воспроизведено на dist-парсере: `work start WRK-001 2>&1` превращается в argv `[work,start,WRK-001,2]`, command заканчивается лишним `2`, rewriteSafe=true. Первопричина: commandSegments убирает оператор и target, но оставляет номер fd. В ошибке ZCode виден тот же лишний `2` после help.

Область: разбор immutable arguments, fallback receipt matching, standalone retry и hook rewrite. Не все случаи меняют identity, но parser уже не соответствует реальной команде.

Фикс в том же модуле: сохранять различие аргумента `2` и fd redirection; неизвестную форму считать непригодной для rewrite. Тестировать fd, обычный числовой аргумент, input/output redirects и экранирование. Не удалять числовые слова регулярным выражением.

### I-04. Потеря observer и устаревшее состояние не диагностируются

Факт: Luna ожидала контекст с 17:12:35 до 17:42:50; ZCode journal перестал получать controller events раньше terminal error. В обоих EVAL нет operation.suspended, operation.observation_lost или managed_run_controlled.

Прежняя «первопричина» неверна: `lib/managed-flow-client.mjs:observeManagedRun` уже содержит цикл contextFor → drive context; terminal controller errors там тоже обрабатываются. Этот цикл обслужил ранние переходы Luna и переход CODE-REVIEW → MERGE после resume. Нельзя приписать остановку отсутствию цикла или ветке managed_run_controlled без события.

Установленный архитектурный недостаток: обычные eval run/resume наблюдают в процессе вызывающего CLI; после его потери controller продолжает работу, а runnerStatus читает только сохранённый EVAL journal. Причина исчезновения первоначального процесса (сигнал, завершение tool session, crash) по имеющимся журналам не установлена.

Минимальный план: сохранять identity и состояние observer, показывать recorded EVAL отдельно от read-only live controller status и ошибки observation. Если требуется переживать завершение вызывающего процесса, повторно использовать detached-worker/process-registration подход из `lib/eval-resume-worker.mjs`; оставить единственный observeManagedRun, не создавать второй цикл контекста или auto-prompt. Отдельно проверить живой owner до takeover через существующий lifecycle lock. Обычный status не должен мутировать историческую оценку.

Проверки: остановка observer после dispatch, detached controller продолжает; status честно показывает orphaned/stale observation; reattach не повторяет prompt и передаёт ровно один контекст; control/HITL/recovery_required не становятся автоматическим resume.

### I-05. Ошибка при runner resume может остаться без terminal EVAL receipt

`runnerResumeLocked` вызывает recoverExecution без локального преобразования conclusive error в failure receipt. Общий CLI catch печатает ошибку и выходит. В launchEvalExecution и recoverLocked такое оформление уже существует. Поэтому reattach к failed controller может опять оставить started operation в старом состоянии. Это подтверждённая асимметрия кода; данный путь на ZCode в расследовании не запускался.

Фикс: использовать существующую классификацию outcome loss/control/terminal и общий способ сохранения failure/evidence для launch и reattach. Не преобразовывать recovery_required в unrecoverable: terminal относится к текущей операции; разрешённое восстановление остаётся отдельной операцией.

Проверки: conclusive controller failure сохраняется; observation loss остаётся unknown; operator pause остаётся paused; исходная ошибка не заменяется cleanup error.

### I-06. Evidence-проекция осталась от старого владельца сессий

`runner.mjs:attachModelAttribution`, failure statistics и `executionEvidence` ищут `drivers/subject.events.jsonl`, а tool_evidence читают из `driver.evidence`. Новый managed result содержит controller/boundary/cursor; реальные adapter journals лежат в controller sessions. Judge подтвердил отсутствующий путь, null tool evidence и incomplete model attribution.

Фикс: разрешать список доказательств из зарегистрированных controller sessions/state_dir и использовать существующие readers model/observation. Учитывать root, child и successor identities, не суммировать повторно inclusive usage. Для unsupported native evidence сохранять unavailable с причиной. Проверять существование публикуемых ссылок. Не копировать весь сырой поток в EVAL journal.

Проверки: managed candidate с реальным controller journal даёт модель и доступные tool/context observations; пустой/отсутствующий журнал честно unavailable; несколько session не дублируются; failure-report использует тот же resolver.

### I-07. Начатый resume недостаточно проверяет исходную definition

`runnerResumeLocked` читает текущий case/blueprint, но assertRetainedRunDefinition вызывает только для ещё не запущенной execution. `recoverLocked` проверяет эту definition для explicit recovery. Checkpoint engine проверяется в обоих, но это не доказывает неизменность stage-context case. Следующий ещё не подготовленный stage может получить изменённый blueprint.

Фикс: вызвать уже существующий assertRetainedRunDefinition перед продуктивным reattach начатой execution; ранее подготовленные context hashes продолжать проверять. Уточнить проверку untracked case-файлов: git diff сам по себе их не охватывает. Это дополнительная поверхность проверки, не доказанный эпизод загрязнения этих EVAL.

Проверки: изменить case blueprint при том же checkpoint — resume блокируется до dispatch; неизменная definition допускает resume; существующий context hash mismatch остаётся ошибкой.

## Дефекты результата Luna, закрытые самим прогоном

Семь причин из `06-code-review/decision.json` и repair `WRK-016`: active priority-only UI отправлял неизменённые обычные поля и менял updated_at/order; seed маскировал legacy migration; order-test редактировал уже последнюю строку; программный focus не доказывал клавиатурную доступность; invalid PATCH не сравнивал полное состояние до/после; screenshots не попадали в receipt; SCN-002 описывал устаревшие порты. Decision, repair result и merge gate подтверждают заявленное закрытие; это не отдельный полный независимый product audit.

Класс проблем: проверка должна различать сломанную и правильную реализацию и читать тот же world, который меняет операция. В инфраструктуре оценки аналогичный дефект — ссылка на старый journal и source-regex tests, доказывающие наличие функции вместо прохождения launch/reattach. В плане добавить поведенческие checks на этих границах. Не превращать каждую находку Subject в универсальную новую обязанность движка.

## Порядок реализации и достаточная проверка

### Дополнение: причина запроса справки ZCode и наблюдение runner

В adapter.events.jsonl восстановлена предыстория для WRK-005:
order 1675 — правильный standalone work start; 1690 — trusted_session_binding_required
с указанием повторить команду; 1695 — точный повтор; 1704 — ambiguous_lifecycle_receipt
с двумя event_keys исходного и повторного вызовов; 1713 — запрос help.
Для WRK-004 та же последовательность: 1671 → 1687 → 1699 → 1709.
Следовательно, help был реакцией на противоречивый путь восстановления binding,
а не доказательством отсутствия исходной команды в packet.

I-08: асинхронная доставка lifecycle event и retry по поиску свежих совпадений.
Первый вызов не находит receipt в отведённое окно, поздний receipt остаётся observed;
повтор создаёт второе совпадение. findRecentMatchingHookEvent использует окно 60 s
и ожидание 250 ms; точная причина задержки первого event пока не установлена.
Общее решение — связать исполнение с конкретным trusted tool-call/event identity
и обеспечить регистрацию до исполнения через доступный native hook/permission
barrier. Возможность такого барьера для ZCode children требуется проверить.
Нельзя выбирать latest receipt или просто увеличивать timeout: это не устанавливает
принадлежность. Проверки: delayed receipt, retry, два различных child и replay.

I-09: поздняя эскалация notification error. В dd-zcode.mjs обработка notifications
сохраняет первую ошибку в notificationError; немедленный rejectAll применяется
только к profile_integrity_violation; flush выбрасывает сохранённую ошибку позже.
Help фактически вернул текст (order 1721). Поэтому это не синхронный запрет Bash.
Нужно сразу сохранять отдельное событие сбоя forwarding с tool-call identity и
временем, сохраняя исходный error code; отличать безопасный отказ команды от
потери доверенного lifecycle observation. Политику settlement согласовать с
существующим controller, без произвольного прекращения здоровых siblings.

DD_EVAL_HOME/runs/EVAL-* уже хранит manifest, events и результаты. Предлагаемое
дополнение — runner-attempts/<id> с метаданными физического owner (PID + start
identity, parent, command kind, definition), process events, stdout/stderr и
bounded current status (last observation, ожидаемое событие/операция).
Resume создаёт новый physical attempt того же EVAL. Supervisor фиксирует exit
code/signal; после SIGKILL/отключения питания следующий observer фиксирует
owner_disappeared и unknown reason, не выдумывает причину. Логи исключают secrets.

Разделение сохраняется: eval владеет экспериментом/контекстом/Judge и своим
процессом; flow владеет RUN/Stage/Work/Session/transition/capture; adapter — native
identity, delivery и lifecycle event bridge. Уточнение требуется на границах
observability и binding, а не перенос orchestration обратно в eval. Рассмотреть
заранее подготовленный контекст можно отдельно, только если его пути и semantics
не зависят от результатов предыдущих стадий; это не универсальное лечение observer.

1. I-01/I-02/I-03: один согласованный parser/packet fix, профильные hooks-shell/native contract tests.
2. I-05/I-07: общее сохранение исхода и существующий definition guard в reattach; поведенческие recovery tests.
3. I-06: один resolver доказательств для result/status/Judge/failure.
4. I-04: observer ownership/status; переиспользовать detached worker только для явно требуемой устойчивости к потере CLI. Отдельно искать host exit evidence; не утверждать неизвестную причину.
5. Один обязательный полный release gate на окончательном коммите, публикация/проверка пакета и новый checkpoint по ранбуку. Затем согласованный живой E2E: ZCode для прежнего failure path и Luna для launch-to-finalize без внешнего resume. Не повторять полный gate после каждой локальной узкой правки.

В этом расследовании выполнены read-only проверки journal/controller/source и три воспроизведения parser. Новые живые прогоны и полный gate не запускались. Не завершены: доказательство host-причины потери observer, независимая повторная квалификация каждого harness и полный аудит всех продуктовых исходников. Их нельзя объявлять выполненными по успешному MERGE Luna.
