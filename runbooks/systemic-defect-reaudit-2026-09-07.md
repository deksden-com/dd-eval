# Повторная ревизия: flow, recovery, evidence и release

Дата: 2026-09-07; обновлено 2026-09-08. Статус: исходная ревизия ниже сохранена как историческая. Системные исправления опубликованы в beta.35, restart-правка — в beta.36, ожидание provider-exit finalization — в beta.37, control retry delayed cleanup — в beta.38. На beta.38 подтверждены два последовательных recovery до принятого CODE; полный E2E до MERGE остаётся незавершённым после provider liveness timeout на CODE-REVIEW.

## Подтверждённый релиз и новая qualification

Полный engine gate: 338/338 тестов, typecheck, lint и strict build прошли. Полный dd-eval после финальных adapter-изменений: 251/251. Опубликован `@deksden-com/dd-flow-cli@0.9.0-beta.35`: artifact/source/tag commit `e2ed74f88c272aa8269bd8be56b1f1d73467f4d7`, canon 4.0.6 commit `c6fc50cb3b5526ea0162ee4454d1ee36f17be2da`. Remote main и annotated tag проверены в release receipt. Isolated и global consumer дали одинаковый engine checksum `f4dceb3ab8f1c49d5a0373cdc155e2cd42a5461c91b13e362fb911e18f28e070` и compatibility `ok`. Receipt завершён 2026-09-07T22:00:23.249Z.

Первый post-publish install остановился на npm `EALLOWSCRIPTS`: `pnpm run` добавляет `npm_config_allow_scripts=*`. Продолжение того же source tuple через Node проверило registry и завершило consumers без второй публикации. Последующий script-only commit `375a915` переносит inherited allow-scripts во временный npmrc, сохраняя политику. Проверены 4 release tests, typecheck, lint и реальный offline npm install: до нормализации ошибка воспроизводится, после неё policy readback сохранён и установка проходит. Скрипт не входит в package payload; новый npm bump не нужен, опубликованный runtime остаётся привязан к `e2ed74f`.

Новый immutable checkpoint cp-084 закрепляет beta.35. Source baseline и project flow pack полностью сохранены из cp-083; исторические checkpoint, RUN и receipts не редактировались. Preflight и реальные normal-flow/recovery ячейки выполняются отдельно и не считаются пройденными на основании релиза.

### Реальная qualification beta.35 и дополнительный дефект restart

Preflight cp-084 прошёл на definition `010e9145a4f5f0ddd255346ce6ba169d98ee4877`: baseline quality/browser и оба profile doctor успешны, provider Sessions не создавались. Обычный `EVAL-20260907220833-2c5dd25a` сохранил целостные границы SPECIFY, PROTOCOLIZE, PLAN, PLAN-REVIEW и CODE. В CODE общий quality gate потребовал отдельный formatting repair Work; принятые P1/P2 не переоткрывались и их receipts не переписывались.

На CODE-REVIEW первый reviewer завершился, второй перестал давать native activity. Adapter зафиксировал `subject_liveness_timeout` после штатного окна от `2026-09-07T23:22:15.915Z`; второй полный timeout не потребовался. Owned cleanup завершил процессы и дал clean receipt. Сохранён recovery `RCV-6ee98303-af6d-4bc9-8db0-7e0587ba1fb9`, manifest SHA-256 `44cf9223b3bdd1b73c4b39e4e3fae63905c57254cf355f147f37eaa9dd3251d3`, `work_result_integrity.valid=true`. Snapshot сохранил первый reviewer Work completed и второй running. Обычный E2E завершился с failures, не достигнув MERGE. Final Judge отдельно подтвердил неполноту реализации и существенные дефекты archived-project UI, write-boundary atomicity и verification coverage; provider interruption не выдан за отказ модели продолжать.

Явный recovery того же snapshot не отправил продуктивный prompt: admission вернул `tree_not_settled`. Результат и следующий clean capture сохранены отдельно: `RCV-c8744baa-1758-49f1-9a3d-2cbe4d546b7d`, manifest `5d3605913155406b367ce3a078f444d4bac93c86d0907fed28b94c523be3c724`. Оба candidate/Judge revisions и исходный timeout сохранены. Это не успешный recovery E2E.

Дополнительная причина в adapter: после проверенного clean shutdown restart копировал исторический root `fullyIdle=false` и child `tree_settled=false` в новый process segment. До отказа были только init и повтор старой terminal error, без нового исполнения child. Исправление в bundled/fallback AGY связывает retired tree с уже проверенным shutdown receipt, сохраняет native error/status и исходный daemon-history, снимает только устаревший root Stop из текущего process scope. Новые tool/step observations снова блокируют перекрывающий prompt; неподтверждённое root execution вне запрошенного Turn fail-closed. Чистый restart допускается только после существующих identity/config/process/operation-ledger checks, а не по одному dead PID.

Проверки дополнительной правки: IPC integration с fake provider воспроизводит error → cancel → clean stop → same-session restart → новый prompt, сохраняет прежнюю ошибку/receipt и отвергает prompt после новой child activity. Полный dd-eval: 254/254. Native no-flow probe `conformance/agy-restart-jVB6o3/receipt.json` на AGY 1.1.27 завершён успешно `2026-09-07T23:50:22.986Z`: root `9a49244f-63e4-418a-9450-c9cbcd8eb8ed`, один child, controlled cancellation, новый daemon той же Session, новый короткий ответ и normal clean stop. Проверенный source SHA-256 adapter: `49b15e82fa44cf4c7a87070f0ece2cffd175b85c12738f1e45a1be2370223839`.

Этот probe не выполнял flow recovery acceptance, не доказывает selective child import или все descendant crash races. Исторический cp-084 RUN не переводится на другую версию на месте.

Дополнительная правка опубликована как `0.9.0-beta.36`, source/artifact/tag `af66ec6e0c2e101f6966c96196d862599bde97eb`. Полный gate прошёл: 339/339 engine tests, typecheck, lint, strict build. Release script завершился одним запуском `2026-09-08T00:27:02.988Z`, включая isolated и global consumers; compatibility `ok`, общий checksum `8cf44566ce8ee23da4714fd85dac6fe1e80d155b5c59d73b4b17b685ffaddbcb`. Canon остаётся 4.0.6 / `c6fc50cb3b5526ea0162ee4454d1ee36f17be2da`. Runner source `acbb8cf98d1543294867d96e9c504d698e7f0139` прошёл 254/254 tests. Новый immutable cp-085 меняет только engine tuple и ID checkpoint относительно cp-084: source baseline и project flow pack сохранены. Полная матрица live qualification остаётся открытой.

### Beta.36: живой ACK и незакрытый fan-out recovery

cp-085 preflight прошёл на definition `3d7cbe4dd6b707bedc6686d5945b273c7b844f70`: baseline quality/browser и оба doctor успешны, engine checksum совпал. Свежий `EVAL-20260908003133-04554170` сохранил SPECIFY, PROTOCOLIZE, PLAN и PLAN-REVIEW. Оба PLAN reviewer Work завершились; обычный fan-in прошёл без `tree_not_settled`.

В CODE первый worker `1027df53-7d27-48da-a515-95e880a7a322` перестал давать native activity после чтения API. Adapter зарегистрировал `subject_liveness_timeout` от последнего события `2026-09-08T01:08:47.039Z`, runner сохранил failure `01:18:57.222Z` без второго полного окна. Clean shutdown подтверждён, оба процесса остановлены. Recovery generation 1: `RCV-e61a1d97-68b1-462b-a820-a43a827aaa6a`, manifest SHA-256 `5e2786a10d5a8808a12c846465857e5e3528f0a05c80cef875365609b982033c`, Work result integrity valid. Оригинальный candidate `5b2cf57c917695047c70bff0eb2de0e34f356ea1582281b4407d3b9769a852ab` и Judge сохранены: valid, incomplete; PLAN/review недостаточно определили migration/DB proof и archived UI. CODE interruption не классифицирован как отказ Subject от dispatch. MERGE не достигнут.

Явный recovery сохранил root Session `c8436d3d-ab0e-4f00-9a47-dd5c607f0e87`. Новый daemon `399e8a43-9153-4a3e-bcfc-1faeb37707ba` допустил точный pinned prompt; первым tool call root выполнил `run recovery accept` (`01:25:03.950Z`). Таким образом beta.36 устранила прежний restart admission blocker в реальном flow, а не только no-flow probe.

Но общий recovery prompt разрешал продолжить «unresolved code operation» до возвращения в штатный fan-out путь. Root реализовал часть P1 сам и получил `trusted_session_binding_required` при попытке закончить ещё created Work. Затем он послал старому P1 child поручение завершить результат. Native Session с тем же ID действительно возобновилась; новая activity сняла settlement. Work binding не открылся: `fresh_agent_required` отверг прежнюю Session, старый packet — текущий recovery generation. Подстановка Session ID не дала принять результат. Child отменил P1, после чего retry правильно отказал: текущий контракт разрешает retry только failed Work. Это не успешный selective same-ID recovery; root ACK и native child reactivation не равны принятию Work.

Последующий provider quota error `01:46:23.607Z` сохранён отдельно от исходного timeout. Generation 2: `RCV-78e6fa27-2f5e-4d74-a160-3100e55879b8`, manifest `c6bac2bb85890d4a26c9780bf0b8e6b8bc12703e06d155cdf92d3d0d6278d5b0`, clean shutdown и Work integrity valid. Candidate revision `9b7c02d77959c8794db389cee740779a4136ae245f49ebf1ce8269663f7c1707` ссылается на оригинальный candidate; отдельный Judge завершён `2026-09-08T02:00:46.318Z`: run valid, readiness not applicable. Он отметил пробелы PLAN/migration/atomicity, преждевременное требование browser proof от backend P1 перед UI P2 и дефекты частичного backend; quota отделена от поведения Subject. Оценка legal stage routing не доказывает корректность recovery ownership: описанная выше подмена child координатором отдельно подтверждена native journal. Исторический RUN и Judge не исправляются и не переводятся на новую definition.

Дополнительная runner-only правка читает engine-owned fan-out status перед подготовкой delivery. Для такого running stage root получает ACK-only Turn и немедленно возвращает управление; затем существующий `driveFanout` выдаёт текущие Work start commands с recovery ID и исходными launch policies. Non-fan-out, paused и completed-boundary ветки сохранены. Новый regression сначала воспроизвёл отсутствие coordinator-only packet, затем проверил его устойчивую identity, смену graph state без новых prompt bytes, запрет смены роли/стадии и сохранение paused/completed поведения. Полный dd-eval: 255/255. Изменение находится только в runner и не требует новой npm-версии engine. Live qualification этой правки и полная матрица остаются открытыми; ограничение same-ID при fresh-agent policy не ослаблялось.

### Контролируемая граница PLAN: поздняя финализация выхода

Runner-only ACK fix committed/pushed как `4cfb6213c14fdf3030e7db576af25d2efd084298`; его cp-085 preflight прошёл (`baseline-admission` SHA-256 `ef5a778873b446a94291cf35b82ffbeec0d8086dd97988fa1403aed572c3ad98`, оба doctor, без provider Sessions). Отдельный `EVAL-20260908020424-33526748` достиг завершённого PLAN. Контролируемый helper подтвердил PLAN `done` и Work/WorkSession `completed|completed`, отсутствие PLAN-REVIEW и точную принадлежность provider PID 82235 daemon PID 82187, затем отправил один SIGKILL `2026-09-08T02:23:28.601Z`. Стадия закончилась `02:23:28.161Z`; это interruption после принятого результата, а не отмена незавершённого PLAN.

Native `agy_terminal_result_missing` сохранён. Оба процесса завершились, но persisted daemon оказался `shutdown_state=clean, active_tree=true`. Recovery capture отказал с `recovery_settlement_unconfirmed`; candidate/Judge не опубликованы, projection остаётся awaiting_provider. Наличие dead PID не подменяет противоречивый receipt. Этот RUN не исправляется вручную и не возобновляется на другой definition. Следующие ячейки CODE/repeated recovery здесь не достигнуты.

Причина: обработчик provider `close` сначала устанавливал `exited=true` и отклонял active prompt, а проверку process group и финальную запись состояния запускал отдельным не ожидаемым promise. Параллельный `daemon.stop` мог уже сохранить clean/false и подтвердить остановку; поздний обработчик после этого записывал interrupted `active_tree=true`. Сериализация отдельных файловых записей не задаёт порядок двух асинхронных lifecycle-операций.

Дополнительная runtime-правка сохраняет promise финализации при создании provider и ожидает его в cancel, close, abort и перед replacement. Cleanup failure остаётся ошибкой и блокирует clean receipt. Init timeout снимается после readiness, а не удерживает завершившийся процесс ещё 30 секунд. Bundled и fallback изменены вместе. Новый test с задержанной exit persistence сначала воспроизвёл `clean + active_tree=true`, затем подтвердил порядок; отдельный test проверяет отказ всех четырёх путей при ошибке финализации.

Native no-flow probe `conformance/agy-exit-finalization.JRSK6I/receipt.json` завершился `2026-09-08T02:31:19.127Z`: фактический SIGKILL, сохранённый `agy_terminal_result_missing`, устойчивый clean/false receipt, restart той же Session `7e2c8042-9f00-45af-a5ef-7b433417ae5a`, новый ответ без повторения команды и clean stop. SHA-256 AGY source `3e9c1218ed146b093861fd08c9fa5c79c3f4fac051fd3ced90ef10ec272fd044`. Этот no-flow probe не включает leased flow persistence и не заменяет новую E2E qualification.

Связанный process-group guard теперь распознаёт выход лидера и по `signalCode`, а не только по `exitCode`. Test подтвердил, что прежний guard после SIGKILL лидера посылал SIGTERM оставшемуся helper вместо разрешённого наблюдения; исправленный guard даёт helper завершиться естественно, а при неопределённой ownership по-прежнему отказывает. Итоговые проверки: полный dd-eval 258/258, bundled regression, typecheck и lint прошли. Никакие ранее принятые snapshots или shutdown receipts не переписывались. Публикация этой дополнительной runtime-правки и live flow qualification ещё не завершены.

Дополнительная правка опубликована как `0.9.0-beta.37`, source/artifact/tag `04f94a5faa271bc0e837d6d3020f3a3668835e17`. Guarded release завершился одним запуском `2026-09-08T03:01:30.122Z`: полный engine gate 339/339, typecheck, lint, strict build, registry artifact и remote refs, isolated и global consumers. Оба consumer дали compatibility `ok` и checksum `3a2a1f5b9cc9664595541f09c328123941e60f5956be2344be0da2b4127651b0`. Canon остаётся 4.0.6 / `c6fc50cb3b5526ea0162ee4454d1ee36f17be2da`. Новый immutable cp-086 меняет только ID и engine tuple относительно cp-085. Новый live flow experiment требуется отдельно; публикация и unit coverage не выданы за его успех.

### Beta.37: delayed helper shutdown и повторная финализация

cp-086 preflight прошёл на definition `a8f120e04db9fff66b1e103861af971efe99c60e`: baseline и оба doctor успешны, checksum опубликованной beta.37 совпал. Новый `EVAL-20260908030516-d9f8ac66` закончил SPECIFY, PROTOCOLIZE и PLAN. В `2026-09-08T03:21:28.980Z` controlled helper отправил один SIGKILL точному provider PID 39112, подтвердив parent daemon 39070, `PLAN=done`, `WRK-002-plan` и его WorkSession completed и отсутствие PLAN-REVIEW.

Shutdown больше не дал противоречивый clean/active receipt. Вместо этого он сохранил `cleanup_failed/active_tree=true`: после выхода лидера его process group оставалась дольше первоначального окна наблюдения. `process_group_ownership_unknown` правильно запретил сигнал группе с потерянной ownership. Recovery capture отказал с `recovery_settlement_unconfirmed`. Сохранён non-restorable diagnostic snapshot `failure-evidence/53150759-2806-49a0-9cc2-8903f7d917e2`, manifest SHA-256 `0b0130417866598249c059766edd17444ff36cfca674d178ea6b2e9b15b1e9cf`; recovery snapshot и Judge не созданы. MERGE и обе recovery-ячейки не достигнуты.

Поздняя read-only проверка процессов показала отсутствие provider group, но повторный штатный `daemon stop --cancel-tree` всё равно вернул прежнюю ошибку. Причина: сохранённый rejected promise навсегда блокировал новую проверку cleanup, даже после естественного завершения helpers. Оставшийся owned daemon отдельно остановлен SIGTERM после проверки exact PID/command, отсутствия provider group и дочерних процессов. Его receipts не переписаны и не объявлены clean; исторический RUN не возобновляется на другой definition.

Дополнительное исправление оставляет исходную exit-finalization closure привязанной к точным child handle/process record и сохраняемому исходу. Только control может повторить её после `process_group_ownership_unknown`; конкурентные callers ждут одну текущую попытку с существующим пятсекундным control-бюджетом. Startup по-прежнему не повторяет failed cleanup, другие ошибки финализации не подавляются. Живая leaderless group остаётся fail-closed и не получает сигналов; clean допустим только после новой успешной проверки и исходных persistence/lease writes. Regression сначала воспроизвёл отказ, затем проверил повторный отказ при живом helper, естественный выход, concurrent stop, ровно один finish исходного lease и сохранение SIGKILL. Focused dd-eval 52/52, полный dd-eval 259/259, bundled runtime/assets 10/10, typecheck и lint прошли. Полный engine release gate, публикация и live flow qualification этой дополнительной правки ещё требуются.

Native no-flow probe `conformance/agy-cleanup-retry.xTIIwF/receipt.json` завершился успешно `2026-09-08T03:32:28.586Z` на AGY 1.1.27: controlled SIGKILL, сохранённый `agy_terminal_result_missing`, устойчивый clean/false, same-Session restart `b04523e0-095a-4a01-abd4-be8c0ec16603`, новая команда без replay и clean stop. SHA-256 проверенного source adapter `6f3cb8418ac7e1cfdeee330f6ba048efbaa63de7e8c25cd42cc65368ad576096`. Native probe проверяет продолжение общей цепочки shutdown/restart; именно delayed leaderless group с lease детерминированно проверена regression-тестом. Ни одна из этих проверок не выдана за полный recovery E2E.

Дополнительная правка опубликована как `0.9.0-beta.38`, source/artifact/tag `e1d723e620ee5aeec961c2bee1de1e72fcfb71a9`. Guarded release завершился одним запуском `2026-09-08T03:58:57.917Z`: 339/339 engine tests, typecheck, lint, strict build, registry artifact и remote refs, isolated/global consumers. Оба consumer дали compatibility `ok` и checksum `db7ca06504c4edf3c6f087c9b8acf467b76ae13086a9ea18c3964cfbd0847272`. Runner fix `8f5e5d2ea68ec9df352b6a142baf5300f7831eb3` committed/pushed, полный suite 259/259. Canon остаётся 4.0.6 / `c6fc50cb3b5526ea0162ee4454d1ee36f17be2da`. Новый immutable cp-087 сохраняет source baseline и project flow pack cp-086, меняя только ID и engine tuple. Live flow qualification нового checkpoint ещё не завершена.

### Beta.38: два последовательных recovery и принятый CODE

cp-087 preflight прошёл на definition `e7b0b943c856b183eede240c6e9784e93aea74a0`: baseline quality/browser и оба doctor успешны, provider Sessions не создавались. Свежий `EVAL-20260908040242-7c8c7f57` использует опубликованную beta.38 и неизменный project baseline. Ни runtime, ни checkpoint этого RUN не заменялись во время исполнения.

Первый controlled helper подтвердил PLAN `done`, `WRK-002-plan` и его WorkSession `completed`, отсутствие PLAN-REVIEW и точную принадлежность provider/daemon. Один SIGKILL отправлен `2026-09-08T04:16:16.437Z`, после завершения PLAN `04:16:15.079Z`. Исходный provider exit SIGKILL и первоначальный `process_group_ownership_unknown` сохранены; последующая control-проверка дала устойчивый `clean/active_tree=false`, оба процесса завершились. Создан `RCV-272ff3a5-ea68-42da-81a7-1739fc6ccda5`, manifest SHA-256 `f050343d3ff8a4f29163bd53d13fcf7cf598fc1d2d7eb5dabc7684d100cef3c5`, Work result integrity valid. Это реальная leased flow qualification cleanup retry, а не только no-flow probe.

После отдельного Judge исходной неполной попытки выполнен явный recovery. Root сохранил native Session `65897059-87bc-4ae7-9851-af8c4ccd4a70`; первый tool call `04:29:11.712Z` — точный `run recovery accept`. ACK принят `04:29:15.784Z`, PLAN boundary сохранена `04:29:49.998Z`, затем начался PLAN-REVIEW. Все поля принятого PLAN Work и WorkSession совпали со snapshot: повторного PLAN Work/исполнения не было.

После завершения обоих PLAN reviewers и перехода в CODE второй helper подтвердил running P1 Work `WRK-006-prt-007-task-priority-crud-p1`, WorkSession `WS-3dccdbca-573d-4b74-8ef4-66b556e63a20` и native child `f4e072f1-a78e-49f8-adf4-16069f198f63`. Один SIGKILL точному root provider отправлен `04:39:51.523Z`. Снова получен clean/false shutdown с сохранённой исходной ошибкой. Generation 2 — `RCV-6b0a90e8-ea77-4232-9d40-42016232249b`, manifest `014af34096ce7f7429adf20c9c6aa87ffd795efeec0660c560a2cc01cee4911c`; parent — первый recovery, Work result integrity valid.

После второго отдельного Judge явный recovery выполнил ACK первым tool call `04:51:31.560Z`; guard принял его `04:51:34.085Z`. Root вернул управление runner: `recovery_prompted` записан `04:51:45.669Z`, штатный fan-out dispatch — `04:51:49.980Z`, следующий root tool `invoke_subagent` — `04:51:59.434Z`. ACK-only routing не позволил координатору подменить P1 исполнителя. Тот же P1 Work получил новый native child `bce51fc6-bb6d-4bed-8005-264a030f89dd` и WorkSession `WS-a8a00d6a-a764-474f-a4b9-8deea47fb867`; прежний сегмент сохранился `interrupted`. Политика `fresh_agent_required` не ослаблялась, старый child не переиспользовался.

P1 принят `04:57:53.062Z`, зависимый P2 — `05:03:19.787Z`. Первый aggregate CODE gate прошёл DB/API/web, но отказал на formatting. Координатор объявил отдельный `WRK-008-code-gate-repair`; первый repair quality receipt failed, второй passed `05:15:41.107Z`, Work принят `05:15:41.111Z`. Повторный aggregate gate прошёл, CODE boundary сохранена как `code-36fbc0f57cc2ba3f951a0f9d71656669397138779947e600eff03755144c7a89`. CODE-REVIEW начался `05:19:38.305Z`. Принятые P1/P2 не переоткрывались ради formatting repair.

Read-only сравнение SQLite generation 2 с immutable CODE boundary подтвердило полное равенство всех колонок четырёх ранее completed Work и пяти completed WorkSession. Та же проверка прошла с последующим generation 3 snapshot. Новый P1 WorkSession completed, прежний interrupted: завершение CODE не стёрло границу прерывания.

### Beta.38: незавершённый CODE-REVIEW и предел qualification

Из трёх CODE reviewers `WRK-009-code-review-1` принят `05:22:27.927Z` с material finding: проверка membership/archive state отделена от записи, нарушается write-boundary concurrency rule. Это замечание к продукту, не к recovery. Два других reviewer Work остались running без новой native activity. Третьего искусственного прерывания не было.

От последнего наблюдения `05:22:42.901Z` сработал штатный `subject_liveness_timeout`; cleanup подтвердил clean shutdown `05:32:53.957Z`, failure записан `05:33:14.696Z`, без второго полного timeout окна. Daemon `22d9dc5c-39c1-4d35-8342-02e0f8787d58` сохранил `shutdown_state=clean, active_tree=false`; provider и daemon PID отсутствуют. Generation 3 — `RCV-2762dda7-6181-4417-9cd3-9ebfef4e9655`, parent generation 2, manifest `3f313307e8de46d1ecdcce757911f941f105768170099f0ff3c71e82089b178c`, `work_result_integrity.valid=true`, restorable `same-runtime-or-explicit-restore`. CODE и первый reviewer сохранены; два незавершённых reviewer не объявлены completed.

Original candidate `b15d20eb8bb0f3e2dffaab03c5361156473fd43eb4613be776b81b41a5fe4ebd` и его Judge не изменены. Первая revision `7f83667aafe583d158194d9402c3ced6833b5a093aa98645d80eb450833728ba` ссылается на original; вторая `0ec3b99c6bc1c7ed9e4f45971221a6b9ffabd32cb7b3ef4346b6f1bfabf3056f` — именно на первую revision. Отдельный final Judge завершён `2026-09-08T05:41:52.680Z`; итог runner — `completed_with_failures`, run validity — valid, candidate — incomplete. Judge отделил provider timeout от Subject и не оценивал недостигнутые CODE-REVIEW closure/MERGE как выполненные.

Четыре material finding Judge относятся к продукту и semantic handoff: UI отправляет title/description вместе с priority и потому не может изменить priority архивного проекта; membership/archive predicates не атомарны с записью; generic migration/API/web checks не доказывают feature-specific AC (migration command фактически не применил миграцию); принятое PLAN исправление не перенесло UI-edit/archive obligations в P2 без потерь. Успешный formatting repair и зелёный общий gate не устраняют эти дефекты. Итоговый Judge receipt сохранён в `judge/revisions/0ec3b99c6bc1c7ed9e4f45971221a6b9ffabd32cb7b3ef4346b6f1bfabf3056f/result.json` внутри указанного EVAL.

| Live ячейка beta.38 | Подтверждённый результат |
| --- | --- |
| Completed PLAN boundary interruption → recovery | PASS: clean capture, same-root ACK, completed Work/WorkSession сохранены, переход в PLAN-REVIEW |
| Running P1 interruption → второй recovery | PASS до принятого CODE: ACK-only, новый child/WorkSession при fresh-agent policy, P1/P2 и repair завершены |
| Повторные candidate/recovery generations | Три capture целостны, последовательные parent links сохранены, исторические ошибки не стёрты |
| Полный flow до MERGE + Judge | Не завершён: provider liveness timeout на CODE-REVIEW; MERGE не достигнут, отдельный Judge неполной попытки завершён |
| Native observed model attribution | Неполна: AGY child hooks не сообщают текущую модель; requested profile не выдан за observed |

Эти результаты не закрывают всю historical failure-permutation matrix ниже и не доказывают selective same-ID child recovery при другой policy. Новый resume generation 3 не выполнен; он должен быть отдельной явной операцией после Judge, без смены definition и без правки сохранённых receipts.

## Выполненная реализация

- F1–F3: AGY больше не заменяет native failure успешным Stop; новая активность снимает settlement, запоздалый Stop с меньшим native step отвергается. Prompt резервируется до persistence. Ошибка persistence освобождает reservation во всех шести адаптерах; bundled и fallback изменены вместе. Проверены новый/повторный step, разные concurrent prompt и disk failure. Событие без native identity по-прежнему нельзя однозначно привязать к Turn; локальный generation не выдаётся за такую гарантию.
- F4: общий cleanup сначала запрашивает normal stop и отменяет owned tree только при точном ответе `tree_not_settled` после terminal failure. Observation loss и ошибки доступа не разрешают отмену. Capture больше не зависит от списка infrastructure-кодов: его разрешает фактический RUN и sealed-writer barrier; productive resume остаётся отдельной явной операцией с проверкой точной identity. Attribution используется для отчётности, не как разрешение replay.
- F5: Work publication получает fsynced intent до SQL commit и атомарно материализуется после commit. Recovery seal завершает только intent, совпадающий с принятой DB receipt и WorkSession. Более поздний drift не перезаписывается. Retry использует устойчивый journal, сохраняет DB receipt в archive и продолжает частичный перенос вместо создания следующего ATT. Incomplete snapshot сохраняет противоречащие байты и hashes, остаётся non-restorable; проверяется соответствие уже скопированных файлов уже скопированной SQLite.
- Release: замороженный clean main/canon tuple, checkout lock, bounded metadata/tarball readback, reconciliation lost publish reply, отсутствующий tag создаётся только после проверки опубликованного artifact. Изолированный consumer предшествует global install; вызывается exact package entrypoint, проверяются router/engine/checksum/compatibility. Секреты не попадают в phase receipt. Версия остаётся beta.35, новый bump не выполнялся.

Локальные проверки: полный dd-eval после adapter-изменений — 249/249; snapshot/recovery и новые publication/retry crash-состояния — 15/15; fake release проходит accepted-publish/lost-reply, временно недоступный tarball и повтор после install failure без второй публикации. Полный engine gate и опубликованный consumer требуют отдельного завершения. Эти проверки не заменяют матрицу реального провайдера ниже и не доказывают causal identity отсутствующих native полей.

Реальный no-flow probe выявил отсутствие Stop-наблюдения в техническом режиме. Первый probe остановлен owned cancellation; separate stop подтвердил clean/settled, его исходный capacity receipt остаётся failed и не исправлялся. В no-flow теперь устанавливается только process-local Stop observer, без workspace hooks и без dd-flow mutation. Повторный probe `20260907211948856/antigravity-cli-google-gemini-3-1-pro-high/capacity.json` запустил один native child, сохранил его исход `settled_by_root` (не completed), завершил root и clean/settled daemon; qualified=true, профиль не менялся. Это техническая проверка дерева, не оценка продукта. Release gate commit 4d8e860 остановлен до публикации; для исправленного source требуется новый commit той же неопубликованной beta.35 и новый gate.

Исследованные исходники: dd-flow-cli `508b72a9e9bb17dfa6bff5e52462115507a8524c`, dd-eval `8b03c9a907cd43a5c6d34fabab24e757e6a742ec`. Опубликованный npm beta: `0.9.0-beta.34`. Выпуск beta.35 остановился до публикации: 332 теста прошли, тест AGY liveness превысил ограничение 350 мс. Исходники и исторические RUN в этой ревизии не менялись. Новые provider Sessions не запускались.

## Вывод

Предыдущие исправления закрыли ряд конкретных нарушений, но системное закрытие не доказано. Общая причина — превращение наблюдения или промежуточного эффекта в окончательное решение без достаточной идентичности, проверки актуальности и восстановления после частичного выполнения.

У этой причины четыре проявления:

1. Наблюдение относится к Session, а решение применяется к текущему Turn/Work без достаточного разграничения поколений.
2. Остановка процесса, исход provider Turn и принятие Work представлены одним статусом.
3. Последовательность эффектов над БД, файлами, журналом или registry считается одной операцией, хотя падение может произойти между ними.
4. Успех команды или одного теста подменяет проверку требуемого состояния.

Это общие инварианты, но не повод писать одну универсальную машину состояний для npm и всех провайдеров. Исправлять нужно небольшие общие точки внутри каждого контура, с одинаковой дисциплиной доказательств.

## Что из прежних исправлений сохраняет силу

| Прежний дефект | Текущее состояние | Граница доказательства |
| --- | --- | --- |
| Recovery не находил владельца после завершённого PLAN | `run-recovery.ts` выбирает последнюю coordinator WorkSession; completed boundary получает ACK без повторного открытия Work | Есть regression и историческое контролируемое восстановление с переходом PLAN → PLAN-REVIEW → CODE; это не полный успешный recovery E2E |
| Старый daemon сохранял authority после следующего recovery | Проверяются binding, generation, native Session и свежий hook; более ранний владелец отвергается | Поддерживать проверки на каждом mutation и после await; не считать это доказательством всех mutation paths |
| OpenCode использовал историческое сообщение вместо текущего ответа | Проверяется новый assistant message из текущего POST, Session и native error в HTTP 200 | Не решает произвольную потерю ответа; повторная продуктивная отправка не разрешается |
| ACP read-запрос стирал ошибку pending prompt | Ошибка прикрепляется к pending `session/prompt`, а не к Session вообще | Session-only notification всё ещё не доказывает, какому prompt принадлежит задержанное событие |
| Sequence журнала перезаписывался enrichment, candidate игнорировал новую причину ошибки | Sequence назначает журнал; сравнение candidate расширено, revisions проверяют hash и parent | Проверять crash между публикацией evidence и событием; существующий regression не равен перебору всех crash points |
| Root SUCCESS возвращался до доказательства остановки неизвестных descendants | Есть pending terminal receipt и `settled_by_root` | Найдены оставшиеся нарушения ниже |
| Reviewer принимался без per-aspect evidence | PLAN/CODE ingress проверяет coverage и непустые ссылки до принятия Work | Правильность смысла ссылки остаётся обязанностью reviewer/Judge; наличие файла само по себе её не доказывает |
| Файл result менялся после принятия Work | Перед snapshot сравниваются байты файла и DB receipt | Это обнаружение рассогласования, а не завершённый протокол сохранения/восстановления evidence |

## Подтверждённые повторными проверками дефекты flow

### F1. Stop стирает исход дочернего Turn — P1

Место: `dd-flow-cli/src/harness-runtime/lib/dd-agy-daemon.mjs`, `Runtime.observeHook`; аналогичная логика в `dd-eval/lib/dd-agy-daemon.mjs`.

Изолированный вызов на текущем Runtime: descendant имел `status: failed`; пришёл `Stop(fullyIdle=true, terminationReason=error)`; статус стал `completed`. Ни реального провайдера, ни рабочего RUN для этой проверки не использовалось.

Первопричина: `fullyIdle` означает отсутствие активности, но обработчик присваивает ему смысл успешного завершения. Это стирает failure и может поменять последующее решение fanout с обработки ошибки на `execution_ended_without_work_result`. Engine не принимает Work автоматически по native SUCCESS, поэтому это не доказательство автоматического ложного принятия Work.

Исправление: независимо хранить native outcome (`success/failed/cancelled/unknown`), tree settlement и accepted Work receipt. Stop обновляет settlement; никогда не переписывает outcome. Если своего terminal result нет, сохранять неизвестный исход и доказательство остановки.

### F2. Новая активность использует старый settlement — P1

Место: `Runtime.observeStep`, `receipt`, сохранённая карта descendants.

Изолированный вызов: descendant со статусом `settled_by_root` получил новый `step_update` в состоянии RUNNING; статус остался `settled_by_root`. `receipt()` включает этот статус в множество остановленных children. В наблюдении subagent также сохраняется `prior.status`.

Первопричина: settlement имеет длительность жизни Session, а должен иметь область действия конкретного Turn/поколения активности. Старые children сохраняются через restart, но новая активность не инвалидирует прежнее доказательство.

Исправление: привязать settlement к поколению и границе наблюдённой активности; любое подтверждённое новое исполнение снимает старый settlement. Исторические outcomes сохраняются отдельно. Локальный generation не следует выдавать за native request ID.

Ограничение: probe подтверждает ошибку перехода текущего Runtime; воспроизведение реального повторного использования native child требует отдельной qualification.

### F3. Два prompt проходят admission одновременно — P1

Место: `Runtime.prompt`. После проверки `this.active` выполняется `await persist`, и лишь затем устанавливается `this.active`.

Изолированная проверка с управляемым promise для persist: два разных prompt одновременно дошли до persist; после освобождения barrier в fake stdin ушли обе команды. Одна запись active не может представлять обе операции.

`durableDaemonDispatch` исключает повтор одного operation ID, но разные IDs проходят независимо. Это не per-Session mutex. В OpenCode/Grok productive-wrapper active устанавливается до persist; похожую дисциплину можно использовать без нового framework. Нужно также проверить их освобождение reservation при ошибке persist до входа в try/finally.

Исправление: резервировать productive operation синхронно перед первым await после admission; связывать reservation с operation ID; освобождать только владельцем, включая ошибку persistence и отмену. Control-path cancel/stop должен оставаться доступен.

### F4. Ошибки и остановка дерева выбираются разными списками — P1/P2

Место: `dd-eval/lib/runner.mjs`: `isInfrastructureFailure`, `requiresTreeCancellation`, `captureRecoveryEvidence`, `recoveryBridgeStopArgs`.

Факт кода: recovery capture допускается по whitelist error code, cancel-tree — по другому whitelist. Например, `agy_provider_failed` допускает capture, но не требует cancel-tree. AGY ERROR может завершить prompt при ещё не доказанном settlement descendants. Тогда normal stop откажет, а capture вернёт unavailable. Это сценарий для воспроизведения, а не заявление, что всякий provider ERROR оставляет живое дерево.

Первопричина: attribution ошибки используется как замена фактам о процессе и пригодности recovery. Новые коды требуют согласованного изменения нескольких мест.

Исправление: разделить attribution, outcome certainty, tree settlement, replay permission. После ошибки читать фактическое состояние принадлежащего запуску дерева и применять единую процедуру drain/owned cancellation/settlement. Recovery eligibility определять отдельно от product/infrastructure attribution. Полезен один нормализованный decision object, а не расширение нескольких списков.

### F5. Целостность receipt проверяется поздно; crash-consistency неполна — P1

Места: `work-registry.ts: settle/retryWork/assertRunWorkResultArtifacts`, `eval-snapshots.ts: captureEvalRunSnapshot`, stage fan-in writers.

Факты кода: result-файл записывается внутри SQL transaction, но rollback SQL не откатывает файл. Retry перемещает файлы перед изменением DB. Snapshot guard распространяется и на incomplete/recovery: drift completed Work блокирует также сбор такого evidence. DB авторитетна, но несколько downstream surfaces читают материализованные файлы.

Исправление: DB хранит принятый receipt и его identity; файловое представление публикуется атомарно и восстанавливается из принятого receipt. Отдельно сохранить обнаруженный изменённый файл и hashes — не перезаписывать следы. Принятие candidate при drift запрещать. Диагностический capture должен иметь возможность сохранить противоречие с пометкой «непригоден для resume»; восстановление должно требовать отдельного согласованного состояния. Проверить readback после копирования payload, а не только источник до копирования.

Это не предложение молча починить исторические snapshot или считать испорченный capture restorable.

## Release: системный план вместо следующего частного retry

1. Зафиксировать до проверки версию, commit, branch, ожидаемый canon и release channel. Проверить main, чистоту и неизменность этих входов непосредственно перед publish. Для долгих gates использовать существующий release lock или минимальную reservation; она должна исключать параллельный собственный release, но не обещать блокировку произвольного git другого процесса.
2. Перед любой повторной публикацией читать registry. Если версия уже опубликована — проверить артефакт и продолжить post-publish этапы для того же tuple. Если результат publish неизвестен — сначала reconciliation. Запретить bump как обход незавершённого выпуска. Непубликованный beta.35 сначала согласовать с registry; не создавать beta.36 автоматически.
3. Добавить bounded readback и для metadata, и для tarball. Повторять временные ошибки, отдельно обрабатывать auth/conflict. Ограничивать отдельную команду и общее ожидание. Использовать Node timer вместо внешнего `sleep`.
4. Проверять созданный Changesets tag; при частичном завершении восстанавливать только отсутствующий тег и только после подтверждения artifact commit. Проверять remote main и peeled tag. Существующий неправильный тег не перемещать.
5. Выполнять consumer smoke через точно установленный executable и сравнивать JSON: router version, selected engine, checksum, compatibility. Успешный exit и напечатанный JSON недостаточны. Чистый изолированный consumer должен предшествовать обновлению рабочего global router.
6. Повторно проверять canon tuple в опубликованном tarball, а не только наличие canon metadata в локальном prepublish. Проверить фактический registry/channel; `whoami` сам по себе не доказывает полномочия на требуемый package.
7. Сохранять итоговый receipt с фазами, exact tuple и readbacks, без секретов. Использовать существующие atomic-file/lock подходы; не строить release server.

Текущий retry и tag readback — полезные части, но release-script до сих пор не прошёл от начала до конца одним успешным запуском. Предыдущее утверждение об отсутствии создания тега было ошибочным: Changesets создаёт аннотированный тег; дополнительное создание не требовалось.

## Проверки и область уверенности

В этой ревизии повторно выполнены `node --test test/runner-recovery.test.mjs test/recovery-safety.test.mjs test/daemon-operations.test.mjs`: 33/33 прошли. F1–F3 проверены отдельными изолированными вызовами текущего Runtime со stub persistence/stdin; это новые воспроизведения вне существующего regression suite. F4–F5 установлены трассировкой исходников; полное crash/provider воспроизведение для них входит в план.

Нестабильный тест `<350 мс` присутствует в обоих репозиториях. Он проверяет скорость wall-clock выполнения машины вместе с механизмом liveness. Падение последнего full suite подтверждено; оно само по себе не доказывает ошибку production timeout. Проверять вычисление deadline на управляемых wall/monotonic clocks, отдельно оставив socket integration с широким watchdog. Простое увеличение 350 не закрывает класс.

Нужная матрица:

- terminal → Stop, Stop → terminal; ERROR → Stop; CANCELLED → Stop;
- child settled → новая активность; старый hook после нового generation; notification без native ID;
- два разных prompt одновременно; повтор одного ID; cancel до/после reservation; persist failure;
- crash до/после DB commit, публикации result, snapshot rename, boundary event, recovery ACK;
- два последовательных recovery, включая completed stage boundary; завершённые Work не запускаются снова;
- изменённый result/evidence сохраняется диагностически, но не становится принятым/restorable;
- registry 404 → visible, tarball временно недоступен, auth отказ, publish accepted → потерян ответ, tag push/install потерял ответ, PATH ведёт на другую версию;
- parity контракта bundled runtime и fallback в dd-eval; сравнивать поведение, а не только raw file hash (текущий diff AGY включает комментарии/форматирование).

При notification без native prompt identity нельзя обещать абсолютное causal fencing. Нужна явная capability/uncertainty политика: сомнение сохраняется и блокирует продуктивный replay; локальный счётчик не устраняет ограничение провайдера.

## Порядок реализации и критерии завершения

1. Зафиксировать реестр дефектов F1–F5 и release gaps с reproduction и ожидаемыми инвариантами. Начать с детерминированных failing tests; больше не проверять release orchestration новой npm-версией на каждую догадку.
2. Исправить admission и независимые outcome/settlement в AGY; проверить аналогичные границы шести адаптеров. Сначала закрыть F1–F3, затем привести cleanup/recovery decisions к наблюдённому состоянию (F4).
3. Восстановление DB/file receipts и диагностического capture (F5). Пройти crash points вокруг stage transitions и recovery, сохранив уже исправленные owner/generation/candidate инварианты.
4. Исправить release orchestration и test clocks; прогнать fake registry/git/consumer сценарии без публикаций. Обновить runbook под фактический путь и частичное завершение.
5. Один согласованный source candidate: targeted regressions, полный dd-eval/engine gate, strict build и pack. Повторять полный gate после существенного изменения, а не для неизменного промежуточного readback.
6. Одна публикация согласованного release tuple, exact consumer verification, новый immutable checkpoint.
7. Реальная qualification: обычный flow до MERGE + Judge; recovery внутри незавершённого Work; recovery на completed boundary; повторное interruption/recovery. Проверять отсутствие повторного Work, сохранение ошибок, чистое дерево и связность candidate/Judge revisions. Семантическую оценку продукта отделить от корректности orchestration.

Закрытие требует поведения на опубликованном артефакте и перечисленных failure permutations. Если native capability или quota блокирует сценарий — явно назвать незакрытую ячейку. Ни зелёный unit-suite, ни один удачный provider run не доказывают отсутствие этого класса во всей кодовой базе.
