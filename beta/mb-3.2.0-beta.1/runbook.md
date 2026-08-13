# Runbook: mb-3.2.0-beta.1

Этот runbook выполняется после реализации specs bundle. Он не заменяет общий
[beta contour](../../runbooks/beta-contour.md); здесь зафиксированы конкретные
refs, порядок gates и команды первого beta run.

## 1. Реализация

Рабочие каталоги:

```text
/Users/deksden/Documents/_Projects/dd-tasks.beta-mb-3-2
/Users/deksden/Documents/_Projects/dd-flow-cli.beta-engine-0-7
```

Реализуй specs интерактивно в этих checkout. Не запускай для разработки
длинный Memory Bank flow. Перед freeze должны пройти:

```sh
git -C /Users/deksden/Documents/_Projects/dd-flow-cli.beta-engine-0-7 status --short
pnpm -C /Users/deksden/Documents/_Projects/dd-flow-cli.beta-engine-0-7 typecheck
pnpm -C /Users/deksden/Documents/_Projects/dd-flow-cli.beta-engine-0-7 lint
pnpm -C /Users/deksden/Documents/_Projects/dd-flow-cli.beta-engine-0-7 test
```

В `dd-tasks` меняются только `.memory-bank/dd-flow/**`, включая flow contract,
prompts, schemas и examples. Product files не меняются.

## 2. Ранние механические gates

До agent eval проверь на materialized beta checkout:

1. `PreToolUse` с Bash-командой bootstrap и `--project-root` выбирает beta
   engine и возвращает только internal trusted hook reference;
2. `stage start --bootstrap` создаёт RUN, session binding и complete stage
   packet одним вызовом;
3. `stage finish` с валидным SPECIFY input создаёт JSON/Markdown/HTML/summary
   и переводит protocol/RUN в `waiting_for_user`;
4. агент не может передать или подменить session id;
5. manual lifecycle recovery называется `run override`, требует reason и не
   присутствует в worker prompt.

Пока хотя бы один gate не проходит, Codex task не запускай.

## 3. Build и install beta engine

Установи `0.7.1-beta.1` в обычный engine store. Router и `DD_FLOW_HOME` остаются
общими: изолированность обеспечивают immutable snapshot и точный project pin.

```sh
DD_FLOW_BUILD_CANON_ROOT=/Users/deksden/Documents/_Projects/dd-tasks.beta-mb-3-2 \
DD_FLOW_BUILD_CANON_VERSION=3.2.0-beta.1 \
DD_FLOW_BUILD_STRICT_CANON=1 \
pnpm -C /Users/deksden/Documents/_Projects/dd-flow-cli.beta-engine-0-7 build

node /Users/deksden/Documents/_Projects/dd-flow-cli.beta-engine-0-7/dist/cli.js engine install --json

dd-flow engine resolve \
  --project-root /Users/deksden/Documents/_Projects/dd-tasks.beta-mb-3-2 \
  --json
```

Resolve output must name `0.7.1-beta.1`. Record snapshot root and checksum in
the beta checkpoint.

## 4. Freeze

After clean worktrees and successful checks:

```sh
git -C /Users/deksden/Documents/_Projects/dd-tasks.beta-mb-3-2 tag -a \
  eval-mb-3.2.0-beta.1 -m "EVAL flow beta 1"

git -C /Users/deksden/Documents/_Projects/dd-flow-cli.beta-engine-0-7 tag -a \
  eval-engine-0.7.1-beta.1 -m "EVAL engine beta 1"
```

Push beta branches and tags. Then create `checkpoints/cp-002-mb-3-2-0-beta-1.json`:

- source tag/commit/tag object of `dd-tasks` beta;
- unchanged product baseline `cp-002` and `product_code_changed: false`;
- pack `3.2.0-beta.1`, exact engine `0.7.1-beta.1`, engine commit/tag/checksum;
- `operator_material_overrides.controller_initial_prompt` pointing to
  `beta/mb-3.2.0-beta.1/controller-initial.md`.

Add the checkpoint id to `EVAL-001-task-priority.materialization.checkpoints`
in the same `dd-eval` commit. Never revise it after the tag is recorded.

## 5. Prepare and launch SPECIFY

```sh
node ./bin/dd-eval.mjs validate \
  --case EVAL-001-task-priority \
  --checkpoint cp-002-mb-3-2-0-beta-1 \
  --source /Users/deksden/Documents/_Projects/dd-tasks.beta-mb-3-2

node ./bin/dd-eval.mjs prepare \
  --case EVAL-001-task-priority \
  --checkpoint cp-002-mb-3-2-0-beta-1 \
  --profile codex-desktop-gpt-5-6-luna-max-dd-flow-0-7-1-beta-1 \
  --track planning \
  --source /Users/deksden/Documents/_Projects/dd-tasks.beta-mb-3-2 \
  --output /Users/deksden/Documents/_Projects/dd-eval-runs/EVAL-001-task-priority/mb-3.2.0-beta.1-specify-01
```

The generated `.tasks/dd-flow/intake/**/initial-request.md` is controlled,
untracked eval input. Its path and SHA are in the adjacent `*.run.json`; no
other untracked files are permitted before worker activity.

Launch one Codex Desktop task with `gpt-5.6-luna`, `max`, full access and the
bundle [controller prompt](controller-initial.md). Stop after SPECIFY reaches
`waiting_for_user`; do not provide clarification or launch PLAN.

## 6. Review and archive

Use [analysis-template.md](analysis-template.md). First evaluate the mechanical
gates; only a valid run proceeds to semantic comparison. Archive the run home,
transcript and prepare manifest under the normal `dd-eval-runs/.../archive/`
path. Add the reviewed compact result under the case results directory.
