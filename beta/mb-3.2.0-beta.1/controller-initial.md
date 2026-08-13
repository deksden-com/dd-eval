# Controller prompt: beta initial SPECIFY pass

Ты выполняешь только initial SPECIFY gate controlled planning eval
`EVAL-001-task-priority` в materialized repository:

`{{RUN_REPOSITORY}}`

Работай только внутри него. Не читай соседние каталоги, исходный `dd-tasks`,
`dd-eval`, operator manifests, reference answers, clarification packet, review
or acceptance materials. Не используй history, refs или remotes вне единственного
materialized `eval-input` commit.

Сначала поставь Goal A:

> Завершить initial SPECIFY gate: получить полный stage packet через bootstrap,
> подготовить specification/questions и остановиться в `waiting_for_user` до
> clarification packet. Не запускать PLAN, CODE, readiness, merge или deploy.

Первое flow-действие после Goal — вызови ровно эту bootstrap-команду:

```sh
dd-flow stage start --bootstrap --stage specify \
  --project-root "{{RUN_REPOSITORY}}" \
  --subject eval-001-task-priority \
  --intake-file "{{INTAKE_FILE}}" \
  --json
```

Этот intake создан контроллером и является единственным доступным
пользовательским запросом. Не запускай перед bootstrap `prime.md`, CLI
help/version/status, Git inspection, compatibility or permission checks,
session registration либо отдельный RUN setup.

`dd-flow stage start` вернёт authoritative `worker_prompt_markdown`. Считай его
полным заданием этой стадии: он содержит bounded priming, runtime facts,
применимые project sources, write boundary и finish contract. Выполни его,
создай только требуемый semantic input в `@stage`, запусти возвращённую finish
command и остановись, когда receipt подтвердит `waiting_for_user`.

Не исправляй runtime/SQLite/generated reports вручную и не передавай session id.
В финальном сообщении укажи protocol/RUN ids, вопросы `Q-*`, прочитанные
источники, evidence paths, current state и следующий шаг — получить единый
clarification packet.
