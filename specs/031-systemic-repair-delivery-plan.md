# 031 — Сводный план системных исправлений, интеграции и релизов

Дата: 2026-09-07. Статус: **P00 и P01 начаты; остальные delivery gates впереди**.

Поручение текущего этапа: зафиксировать спецификации и порядок всей работы.
Оно не запускает сейчас implementation, provider experiments, публикации или
изменение аккаунтов. Документы этого этапа — 030 и 031; следующие операции
выполняются после перехода к реализации. «Записано в файл» не равно committed,
pushed, released или accepted.

## 1. Состав и приоритет документов

- [030](030-native-child-lifecycle-integrity.md): hooks/identity/dispatch/settlement,
  открытый decision gate AGY и cross-harness regression matrix.
- [029](029-cross-harness-defects-and-observable-fallback.md): разрешённый
  наблюдаемый model fallback, control/terminal, baseline/test-world/ports.
- [028](028-droid-eval-defects-root-cause-and-repair-plan.md): исторические
  доказательства Droid и проектной тестовой инфраструктуры; запрет fallback
  оттуда заменён решением 029.
- [026](026-interrupted-eval-recovery.md): selective recovery и неизменяемые
  revisions; ранее выполненные части ревизуются, не переписываются с нуля.

031 задаёт общий порядок и доставку, а не заменяет технические требования.
Обновить статусы старых спецификаций по evidence при реализации: заголовок
«реализовано»/«не реализовано» не заменяет инвентаризацию текущего кода.

## 2. Prime: исходное состояние и владение

Наблюдавшийся срез, не обещание состояния на момент начала:

| Репозиторий | Срез | Что нужно перед изменениями |
| --- | --- | --- |
| dd-eval | main HEAD a51787d; package private, 0.1.0; большой незакоммиченный WIP по 028/029 | Ревизия diff, тестов и ownership; отделить plan docs от кода |
| dd-eval recovery branch | origin/recovery-e2e-20260906, известные commits f8eb771, 0e080a0, 7612831 | Сравнить с integration HEAD, принять нужные commits без двойного применения |
| dd-flow-cli | beta.20; recovery main 463a6ff; локально engines.ts и run-cli.test.ts изменены | Не перезаписывать WIP; проверить текущие HEAD/remote/artifact |
| dd-memorybank | HEAD 2aafb30, VERSION 4.0.6 | Проверить текущую compatibility/release policy и состояние дерева |
| dd-tasks | Baseline/test-world defects из 028/029 | Определить exact исходный baseline и отдельную ветку инфраструктурных исправлений |

До работы сохранить branch/HEAD/status/worktrees, upstream и staged/unstaged
inventory каждого затронутого repo без секретов. Согласовать пересекающийся WIP
с владельцем; непротиворечащие готовые изменения переиспользовать после ревью.
Не применять git add -A, reset/checkout очистку или перенос всей грязной копии.
Не включать unrelated WIP в commits «заодно».

Рекомендуемый маршрут для рискованного многорепозиторного пакета — изолированные
feature worktrees с интеграцией в существующие ветки по project policy. Не
создавать develop и не обходить обязательный PR/merge queue. До создания веток
проверить реальные branch protection/CI и правила каждого repo.

## 3. Пакеты реализации и зависимости

Каждая строка — отдельный проверяемый change set; один commit не обязан включать
всю строку. Названия commits ниже — предполагаемые темы, не созданные commits.

| Пакет | Репозитории / содержание | Зависит от | Выходной gate / commit themes |
| --- | --- | --- | --- |
| P00 | dd-eval: ревизия WIP, согласование 026/028/029/030/031, baseline evidence | — | Inventory, accepted scope; docs: record repair specifications |
| P01 | dd-eval: AGY raw ingress/native-source probe и decision record | P00 | Источник установлен либо bounded upstream blocker; test: qualify native child hook source |
| P02 | dd-flow-cli + canon: общий receipt identity, replay/freshness, atomic claim/bind | P00 | H-T03–07/13, все lifecycle entrypoints; fix: make lifecycle receipt claims consistent |
| P03 | dd-eval: AGY durable topology/ordering/deny; Grok parent; ZCode/Grok notifications; остальные adapters | P01 для AGY, P02 | H-T01–07/11 по adapter matrix; fix: preserve native child lifecycle identity |
| P04 | dd-eval + Flow: durable wave attempt/check-in/reconcile, все runner entrypoints | P02 | H-T08/09, restart/partial spawn; fix: prevent unresolved child redispatch |
| P05 | dd-eval + Flow: control path, owned cleanup, crash settlement, terminal reducer, recovery | P02/P04 | H-T09/10/14 и tests 029 A/B; fix: reconcile interrupted execution safely |
| P06 | dd-eval + Flow: requested/observed model history и разрешённый fallback | P00; P05 для fatal/control integration | H-T12, tests 029 C; feat: report observable native model transitions |
| P07 | dd-tasks + dd-eval: test-world isolation, ports, baseline/engine admission, keyboard qualification | P00 | Tests 029 D/E; fix: isolate verification resources and qualify baseline |
| P08 | Все: интеграция contract/canon/docs, version map, кандидат release set | P02–07 | Чистые integration commits, полные repo gates, candidate live smoke |
| P09 | CLI/canon/eval/baseline: commit/push/tag/package и consumer readback | P08 | Published artifact identities, compatibility и rollout evidence |
| P10 | dd-eval: новый immutable checkpoint и release-artifact E2E/recovery | P09 | E2E до MERGE, controlled recovery, final reports; docs: record release acceptance |

P01 source probe на текущем AGY 1.1.27 подтвердил child hook ingress и
physical-parent propagation через текущий adapter; historical root-only trace
не воспроизводится этим bounded probe. Это не заменяет productive lifecycle
qualification. Если последующий release-artifact smoke даст blocker, общие
defensive fixes P02/P04–07 продолжаются, а AGY остаётся explicit unsupported.
Подменять AGY другой упряжкой без решения пользователя нельзя.

## 4. Реестр причин и покрытие всего пакета

| Причина | Пакеты | Приёмка |
| --- | --- | --- |
| Child IDs есть, lifecycle channel не подтверждён | P01–03 | Native ingress -> Flow receipt -> ровно одна WorkSession |
| Physical parent теряется/угадывается, topology теряется на restart | P02/03 | Foreign, early hook, replay/restart/immutable parent |
| Delivery duplicate и новый execution смешаны; claim вне binding transaction | P02/03 | Same/conflicting event, two claimants, crash/lost ACK |
| Unknown child оставляет Work ready для повторной волны | P04 | Ни одного duplicate child при retry/restart |
| Root/child/process/Work settlement смешаны | P05 | Unknown не success; проверенное дерево и независимая resumability |
| Diagnostic/profile failure ломает cancel; конкурирующая финализация | P05 | Cancel-first/complete-first/fatal-first, empty receipts, late generation |
| Requested profile выдаётся за observed; fallback запрещается частично | P06 | Root/child transitions durable; mixed/unattributed usage честно раскрыт |
| Общая БД и hardcoded ports смешивают проверки | P07 | Два checkout и две проверки одного checkout изолированы |
| Baseline/tag/version не доказывают пригодность/identity artifact | P07–10 | Pre-feature admission, digest mismatch rejection, installed artifact smoke |
| Mocks/root smoke ошибочно заменяют native child квалификацию | P08–10 | Capability matrix exact version/digest/config, no unsupported PASS |

Для каждого изменяемого общего helper найти всех callers и sibling entrypoints.
Аудит охватывает start/finish/fail/pause/resume/recovery accept, launch/reference/
resume/recovery runner, status/cancel/stop, reports/checkpoints и canonical prompts.
UI/runtime consumers новых unknown/blocked статусов также проверить. Не менять
unrelated продуктовую логику только потому, что она оказалась рядом.

## 5. Verification strategy

1. До реализации — baseline suite и известные failures на зафиксированном SHA.
2. Каждый change set — focused regression, воспроизводящая причину, плюс tests
   общего контракта и adapter-specific test, если native semantics различается.
3. Перед интеграцией — полные доступные gates repo; после merge повторить
   необходимые gates на integration SHA, не только на feature branch.
4. Перед publication — короткий native child/control smoke release candidate.
5. После publication — exact installed package/canon/runner readback, затем
   новый checkpoint и полный E2E до MERGE + отдельный selective recovery E2E.

dd-flow-cli: `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, `pnpm run build`.
dd-eval: `npm test` (node --test), с project-supported Node; точные selective
команды брать из существующего test inventory, не придумывать имена файлов.
Canon: schema/consistency проверки compatibility/release-impact и принятый
repo validation. dd-tasks: project-owned test launcher, изоляция DB/ports,
integration/upgrade/browser и pre-feature checks из 029.

Тяжёлые suites запускать с контролем ресурсов; isolated pass после full-suite
failure не превращает весь suite в pass. Flake/host load записываются отдельно,
причина и повтор полного релевантного gate обязательны до acceptance.
Нельзя специально исчерпывать квоту: fallback branch проверяется scripted 402.
Live probes запускаются только в implementation/qualification phase, с точными
owned paths/processes, cleanup и ограниченным бюджетом/длительностью.

## 6. Commit, push и интеграция — часть Definition of Done

- Первым docs-only commit зафиксировать 030/031 и согласованные ссылки/статусы.
- Для каждого пакета отдельные commits по репозиториям: код + регрессия + нужный
  contract/docs fragment. Межрепозиторные SHA связать delivery manifest.
- Перед commit проверить staged diff, whitespace, secrets, generated artifacts
  и отсутствие чужих изменений. Не коммитить native auth/logs, snapshots с
  приватными данными, временные worktrees и сырые provider transcripts.
- Push topic commits после локальных gates; проверить remote SHA/CI. Интегрировать
  принятым repo способом; сохранить итоговый merge/squash SHA, не только topic SHA.
- Push integration branches и release tags после соответствующих gates.
  Проверить remote readback. Созданный local tag не считается опубликованным.
- Незавершённый change set хранится в явной WIP ветке/статусе, не выпускается
  из грязного дерева. Завершение не допускает оставшийся незакоммиченный scope.
- Если нет доступа к push/publish, зафиксировать exact blocker и следующий шаг;
  не объявлять локальный результат доставленным.

## 7. Release matrix

Точные номера определяются перед release по checkout, remote tags и registry;
beta.21/4.0.7 заранее не резервировать и не считать гарантированно свободными.

| Компонент | Нужная доставка | Ограничения |
| --- | --- | --- |
| @deksden-com/dd-flow-cli | Новый beta package при изменении runtime, Changeset/version/changelog, tags | Сейчас prerelease beta; не продвигать latest/stable автоматически |
| dd-memorybank | Canon release для новых обязательных contracts/prompts, VERSION/changelog/release-impact/compatibility | Требуемый CLI должен реально существовать в registry |
| dd-eval | Committed/pushed runner revision и связанный release evidence | package private=true: npm publish не применим; tag/release по repo policy |
| dd-tasks baseline | Infrastructure commit + новый immutable baseline/checkpoint tag | Не править старые scored workspaces и не передвигать published tags |
| AGY / другие внешние runtimes | Version/digest qualification, при необходимости upstream release dependency | Не выпускать внешние продукты от своего имени и не делать silent upgrade |

Сверить pending Changesets с фактически опубликованным artifact commit:
наличие fragment не доказывает отсутствие публикации и не требует повторного bump.
Generated CHANGELOG получать штатным Changesets процессом, без параллельного
ручного Unreleased. Breaking schema change требует явной совместимости/миграции;
не маскировать его как patch без проверки.

## 8. Порядок coupled release и readback

1. Подготовить точный version map, compatibility/migrations и release-impact;
   прогнать schema + consistency checks. Сохранить предыдущий usable artifact set.
2. Создать финальный canon release commit, на который будет ссылаться CLI build.
   Не объявлять canon release доступным потребителям до linked-CLI readback.
3. Выполнить Changesets versioning, release-source commit CLI, clean strict build
   с `DD_MEMORYBANK` на выбранный canon checkout и `DD_FLOW_BUILD_STRICT_CANON=1`.
   Проверить build-info version/CLI SHA/canon SHA штатным prepublish guard.
4. После candidate gates push source commits; выполнить штатный beta publish
   (`pnpm run release` согласно текущему package scripts), проверить registry
   version, dist-tag, integrity и содержимое artifact. Если source изменился
   после сборки — повторить build; не использовать устаревший dist.
5. Только после доступности совместимого CLI публиковать/promote canon tag и
   release notes, завершать eval integration delivery. Не менять canon commit,
   уже встроенный в artifact: post-release evidence хранить отдельным addendum.
6. В чистом consumer environment установить опубликованную точную версию.
   Проверить executable realpath, `dd-flow version --json`, build metadata,
   installed digest и compatibility verdict. Symlink на dev dist не readback.
7. Создать новый checkpoint с exact runner/CLI/canon/baseline/harness identities;
   preflight не должен создавать provider Sessions. Запустить P10 именно на
   этом наборе, не на случайном PATH binary.
8. Закрепить acceptance evidence отдельным commit/push; remote tags и manifest
   readback завершают доставку. Failed acceptance -> gate failed, не completed.

Перед authenticated publish проверить registry/account/target/authority по
проектной политике. Credential presence не доказательство разрешения. Секреты
только command-local, без значений в документах/логах/Git; не менять глобальные
аккаунтные настройки. Требующий отдельного approval gate не обходить.

## 9. Partial failure, rollback и evidence

Опубликованные версии/immutable tags не переписывать. При package-published /
canon-blocked сохранить частичный статус и не promote consumer checkpoint.
При failed consumer acceptance — новый corrective release или возврат к
предыдущему проверенному artifact set по policy. Не удалять evidence.

При изменении SQLite/schema заранее проверить upgrade старого runtime на копии
и backup/restore. Откат executable не означает откат миграции. Если schema
необратима, указать roll-forward и запрет запуска старого engine на новой БД.
Активные RUN не мигрировать и не менять harness generation скрытно.

Итоговый curated manifest связывает:

- scope/пакет, repo, base и final SHA, commit/push/merge/CI verdict;
- версии, peeled tags, registry channel/integrity, installed artifact readback;
- canon compatibility и migration verdict, runner/baseline/checkpoint identities;
- tests: command, SHA/environment, результат, duration и ссылка на evidence;
- native capability matrix, AGY source decision и оставшиеся blockers;
- E2E IDs, reached stages/MERGE, candidate/Judge revisions, recovery lineage;
- previous safe artifact set, rollback/roll-forward и partial publication state.

## 10. Финальный checklist

- [ ] P00 inventory/WIP ownership выполнен; планы закоммичены и запушены.
- [ ] AGY source decision принят на evidence; unsupported не выдан за fixed.
- [ ] P02–07 выполнены с аналогами во всей затронутой кодовой базе.
- [ ] H-T01–14 и gates 029 A–F имеют реальные verdicts/evidence.
- [ ] Все in-scope изменения имеют reviewed commits и integration remote SHA.
- [ ] CLI/canon/eval/baseline delivery matrix закрыта, N/A обоснованы.
- [ ] Published и installed artifact identities совпадают; compatibility pass.
- [ ] Новый E2E достиг MERGE; selective recovery прошёл без повтора completed Work.
- [ ] Reports отделяют инфраструктуру, качество Subject и model attribution.
- [ ] Итоговый evidence commit/push выполнен; rollback handoff и blockers видимы.

Полное «готово» возможно только после всего checklist. Safety release с AGY
unsupported — полезный промежуточный результат, но не закрытие child recovery.
