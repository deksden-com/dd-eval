# 108 — Завершение реализации и границы приёмки

Дата: 2026-10-27. План: [108](108-thin-hooks-progress-and-native-recovery-plan.md).
Engine: `4a03066b`, branch `fix/plan108-thin-hooks`; bridge:
`ac3e1063934fd516b7e69e900dc196eaafd3e7a9`, `fix/plan108-native-turn`.
Это source implementation acceptance, не release-accepted и не результат EVAL.

## Что завершено

| Область плана | Реализация и полезная граница |
| --- | --- |
| H1–H10: hooks/correlation | Thin CLI ingress; native ledger сохраняет факт до ACK. Прямой первый `work start` AGY/OpenCode/Droid не ждёт публикации child metadata. CLI вызывает daemon verification после ACK и материализует receipt через существующий handler/CAS. Нет нового writer/очереди/таблицы. |
| Первый child | Точные native session/tool/event/command, физическая ancestry к root и выданное назначение достаточны для Work; creator prompt не угадывается. Смена observer prompt не превращает его в creator. Late failures сохраняются на исходной записи и не отклоняют новый prompt. |
| Совместимые пути | Compound/wrapped команды, невыданные manual/auxiliary операции остаются на существующем проверяемом handler. Быстрый ACK не обещан для произвольного shell. OpenCode plugin не импортирует Node tree-sitter в Bun: узкую команду распознаёт daemon. |
| C1–C3 / S1–S6 | Полезный progress отделён от liveness наблюдателя; удалены исследованные reader-only ceilings и мёртвый recovery дубль. Сохранены доверительные границы, identity/cursor/hash, отсутствие прогресса и custody принятого результата. Эти изменения вошли в предыдущие commits той же ветки. |
| N1/N4: shutdown | Execution proof сохраняется до отдельного retirement. Cleanup failure не переписывает semantic result. Explicit cancel, late activity, ownership/generation и неполный inventory не дают разрешения на следующий writer. |
| N2/N3: continuation | Owned OpenCode synthetic continuation не foreign input; техническая пауза согласуется с поздним accepted Work без повторного исполнения. Work acceptance не равен Stage acceptance. |
| E1–E4 / D1 | В dd-eval согласованы physical cleanup, capture/assessment obligations, health/technical waiting и all-role cleanup. Подготовка не требует полного gate. Исторические EVAL не изменены. |

Дополнительно при финальной приёмке исправлено:

- JSON registration и in-memory binding теперь одинаковы даже при optional `undefined` полях; иначе реальный AGY `hook.verify` отвергал собственную сериализованную запись.
- Повторный recovery immutable packet не принимает унаследованные successor rows за новые исходные команды. Следует последнему relevant attempt; executing/unknown-effect не перевыпускается.
- Public Work command без внутреннего UUID сравнивается с уже выбранным уникальным назначением; fingerprint/target/native proof/CAS остаются обязательны.
- Probe reader переведён на актуальный streaming transcript callback. Частичный хвост отбрасывает tentative evidence; большой transcript не копируется целиком в память.
- Collector больше не объявляет любой наблюдаемый root terminal: берёт фактическое native состояние. Completion наблюдается, пока родитель ещё работает.
- Старые hook-fixtures обновлены: observation timeout отказывает конкретному tool, но не становится недоказанным primary error prompt. Отрицательный synthetic fixture физически убирает только свои PID/birth даже без graceful settlement. Оставшиеся от раннего неудачного fixture процессы остановлены адресно; EVAL не затронуты.

## AGY P3: новые нативные доказательства

AGY **1.4.7**, binary SHA256:
`260149dbfa7f6cd4bf57984906304935bb490a8d950af12228f7241a10c444fe`.
Inspector policy SHA256:
`5faeb1ce263a2698ff0f80f97098c6e3b36e09c3e8a34c525b41396c8184aaac`.

Private evidence root:
`/Users/deksden/.dd-eval/qualifications/native/agy-1.4.7-plan108-20261027`.
Новые tree/background/service/timer/completion captures дают восемь live cases;
executor-error, timeout и late-activity/cancel/restart — executed deterministic
fault-injection cases, не live captures. Все **11** checks валидатором приняты.
Отдельный штатный no-model finalizer создал новую `qualification.json`;
source и built `readAgyNativeQualification` возвращают `qualified:true`.
Историческая 1.4.6-квитанция не изменялась и новой версией не переименована.

| Файл в evidence root | SHA256 |
| --- | --- |
| `evidence-complete.json` | `7059558200425b1d683cc072b9c1c7cac8e6614864902ba89c4922341a062bb6` |
| `qualification.json` | `33a549a8faaf1fb306bad4ee855a8b8b28c2165df3d02915aa4034e2ddfd7e3b` |
| `captures/production-stop.json` | `1ee3216b1a0d7c2632a9bef8dbbc4d95baf84536e190a43f69e961e2ec8349a7` |

Production-stop выполнялся с настоящим qualified observer, без injected native
idle. `prepareStop`: clean/settled; отдельный `retireNativeServices`: сервис
stopped; финальная физическая очистка подтверждена. Это отдельная native-проба,
не EVAL: один первоначальный fixture prompt, далее read-only observation/control.
В ходе P3 были также неудачные probe attempts; они не объявлены PASS, их исходные
reports сохранены во временных native-inspection roots.

Выявленный реальный дефект retirement: наш ForceStopCascadeTree создаёт pending
system/task cancellation notices уже **после** завершения required execution.
Требование «исчезновение любых сообщений» делало уборку невыполнимой без нового
model request. Теперь только новые сообщения после acknowledged owned stop,
с точным native ID/recipient/известным sender и неизменным trajectory/fence,
сохраняются как pending technical evidence. Они **не считаются доставленными**
и не превращают ERROR в SUCCESS. Сообщения, существовавшие до stop, чужой sender,
новые writers, смена revision/trajectory и partial inventory остаются отказом.
Закрытие provider и физическое отсутствие собственных процессов всё ещё нужны.

## ZCode bridge

Native **0.17.0**, binary SHA256
`97490d0f06a7a225d54d47817acf4b4859cdb268b59f2490caaeda982bef063a`;
bridge **0.52.0/ac3e106**, contract `dd-zcode-harness@2`.
Одна изолированная native-проба подтвердила ACP request→native turn,
late child tool после ответа root, исходный native turn и физические child/tool
IDs: **4/4 PASS**. Receipt:
`/Users/deksden/.dd-eval/qualifications/native/zcode-0.17.0-plan108-20261027/receipt.json`,
SHA256 `17b49a2dc54eac41ea8bc6c856c96dc91acd2cdb52ec0eb53de79c5ccc8906cf`.

Первый capture содержал старый dirty build stamp. Он сохранён без ретуши.
После чистой сборки ac3e106 все **449** runtime dist files совпали побайтно;
изменилась только `dd-harness-build.json`. Aggregate runtime digest:
`192a3a16970fed8c325bedefd3dd2e33b908ab282cfa25541b18cf3be13fe6de`.
Это основание reuse наблюдавшихся bytes, не подмена capture provenance.
Source/built engine doctor с правильным `dist/cli.js` entrypoint подтверждают
exact tuple. Один номер версии и `dist/index.js` server module не являются
doctor identity proof. Nested native children по-прежнему не обещаются.

## Проверки и границы

- 200 Vitest checks: bootstrap/retained-native/lifecycle-invocations/ZCode observer.
- 29 AGY inspection/qualification Node checks; 23 hook-source/failure checks.
- 73 OpenCode/Droid adapter fixtures.
- После build: native ingress + retained hooks — 57 checks; cross-harness Work CAS и bootstrap — 17 checks; hook-runtime wrapper — PASS (16 внутренних Node checks). Это перекрывающиеся зоны, не суммарное число уникальных тестов.
- TypeScript, lint затронутых lint-owned файлов, build и `git diff --check` — PASS. Runtime executable assets проверяются Node fixtures/build, а не ошибочным запуском ESLint на исключённых файлах.

Без полного gate, GitHub CI и новых EVAL. Не было publish, promotion, обновления
pins или глобальных hooks. First-child Work CAS AGY/OpenCode/Droid проверен
с synthetic native APIs и настоящими production registration/verification/SQL;
полный модельный E2E здесь не заявляется. Native P3 и ZCode compatibility probes
использовали реальные модели в своих disposable fixture prompts; это не
«проверки без модельных вызовов». Read-only inspection/finalization не делали
дополнительных запросов модели для подтверждения завершения.
