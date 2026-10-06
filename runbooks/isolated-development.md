# Изолированная разработка FLOW/EVAL

Этот runbook исполняет E0 плана SPC-014 в dd-memorybank. Он не обновляет рабочую
установку, не разрешает publication/cutover и не квалифицирует native live routes.

## Рабочие границы

- Source edits/builds выполняются в отдельных worktrees. Создание через Worktrunk
  использует explicit path и `--no-hooks`; dependencies устанавливаются отдельно
  по owning repo runbook. Никакого global `link`, смены рабочей ветки или hooks.
- Pack candidate один раз, install в fresh prefix вне checkout. Сохранить source
  revision/delta, canon tuple, package SHA, full-content engine SHA и adapters.
  Не перестраивать этот candidate во время tests/eval; новый delta — новый prefix.
- Canon — отдельный exact snapshot, а project fixture восстанавливается из
  закреплённого dd-tasks tree. Не использовать working main как mutable fixture.
- Каждый execution имеет fresh Flow home. Campaign использует отдельные eval,
  config, resource, registry и console roots. Один campaign resource root общий
  для controller, external workers, merge server и Judges.

## Explicit environment

Ниже значения — placeholders, а не defaults, готовые для исполнения:

```sh
DD_FLOW_BIN=/absolute/candidate/bin/dd-flow \
DD_FLOW_HOME=/absolute/candidate/execution/flow-home \
DD_FLOW_CONFIG_HOME=/absolute/candidate/config \
DD_FLOW_RESOURCE_HOME=/absolute/candidate/resources \
DD_EVAL_HOME=/absolute/candidate/eval \
DD_EVAL_REGISTRY_FILE=/absolute/candidate/registry/homes.json \
DD_MEMORYBANK=/absolute/candidate/canon \
node /absolute/eval-worktree/bin/dd-eval.mjs homes list
```

Не export эти значения в shell startup files. Eval profile и installed Flow
agent profile имеют разные schemas. Копировать только reviewed `harnesses.json`
и `agent-profiles/`, не DB, RUN, locks, ports, daemons или credentials. Adapter
paths после provision указывают на exact installed engine, native binary —
на explicit supported executable. Конфигурация native Session создаётся managed
adapter; текущие user hooks не переписываются.

Private Flow launcher создаётся CLI-owned `tools/development-context.mjs` по
проверенному `dd-flow/development-context@1`. Owning runbook —
`dd-flow-cli/tools/development-context.md` (logical repo path, без требования
sibling layout). Producer instructions не находятся в каноне.

`DD_EVAL_REGISTRY_FILE` обязан быть absolute. Отсутствующий private registry —
пустой список; invalid/corrupt selection не переключается на рабочий файл.
New run/fork сохраняет `eval_registry_file`. Continuation читает его из manifest
и передаёт detached worker; смена ambient env не меняет registry. Historical
manifest без поля использует прежний global default, поэтому не направляй старую
кампанию в dev-контур переменной окружения. Это не migration старых EVAL.

## Проверки до live

Development:

```sh
node --test test/homes.test.mjs test/monitoring-status.test.mjs test/runner-fork.test.mjs
```

Приёмка — полный paired offline procedure из
[flow-test-suite-verification](flow-test-suite-verification.md), на frozen build
из isolated FLOW checkout. Required FLOW suites не заменяются этими тремя files.
Producer/console проверяются вместе с одинаковым private registry. Installed
smoke проверяет actual engine identity, dependency closure и child env, не только
наличие launcher text.

Canary working roots должны оставаться неизменными при negative launch,
migration, stop/recovery и cleanup. Для настоящих active homes не сравнивай
DB hashes: соседние legitimate writers могут менять их. Подтверждай ownership
и exact operation receipts, не останавливая соседние кампании ради «чистоты».
Отдельный registry не изолирует host ports; fixture bind и owner-scoped stop
проверяются offline. Native coexistence и provider capacity имеют separate gates.

## Cleanup и переключение

Отмена/cleanup выполняются только штатным owner-scoped control текущей campaign.
Не убивать процессы по имени и не удалять uncertain roots. Candidate prefix
сохраняется, пока не завершены все его процессы; retained receipts не указывают
на уже удалённый checkout. Worktrees с незакоммиченными/неинтегрированными
изменениями сохраняются для handoff.

Global install, working canon/home/profile defaults и local cutover требуют
отдельного explicit разрешения после приёмки. Откат executable не откатывает DB;
storage recovery выполняется по verified backup/migration contract.
