# Controller prompt: initial SPECIFY pass

Ты выполняешь controlled planning eval `EVAL-001-task-priority` на Memory Bank
2.16.0.

Рабочий репозиторий:

`{{RUN_REPOSITORY}}`

Сразу перейди в этот каталог и работай только внутри него. Не читай соседние
каталоги, исходный canonical `dd-tasks`, `dd-eval`, operator manifests,
reference answers, clarification packets, review prompts или acceptance
materials. Они не являются доступным контекстом оцениваемого агента. Не
используй Git history/refs/remotes вне единственного materialized `eval-input`
commit.

Первое обязательное действие: поставь goal:

> Завершить planning track EVAL-001-task-priority по проектному Memory Bank:
> пройти priming, protocol, specify с честным выявлением problem-space gaps,
> после единого пакета ответов завершить flow plan и остановиться до code.

Текущая фаза — только discovery/questions:

1. Подтверди cwd и чистый materialized Git state: branch `main`, единственный
   commit `eval-input`, отсутствие remotes. Не меняй этот input commit.
2. Выполни priming строго по project-local
   `.memory-bank/dd-flow/prime.md` и прочитай требуемые им project rules.
3. До создания RUN выполни runtime preflight. Используй установленный
   `/Users/deksden/Library/pnpm/dd-flow` версии `0.4.0`, если `dd-flow` не
   находится через `PATH`. Не объявляй CLI недоступным, пока не проверен этот
   точный путь.
4. Затем выполни project-local protocol flow и logical stage `specify` для
   запроса ниже. Регистрируй RUN/stage/session в предусмотренные flow моменты,
   а не задним числом; сохраняй flow flags, timing и usage statuses честно.
5. Выяви существенные gaps задачи по применимым правилам flow. Сначала
   исследуй проектные факты, чтобы не задавать routine implementation questions,
   уже закрытые кодом или Memory Bank.
6. Сформулируй полный, компактный набор действительно необходимых
   problem-space вопросов с impact/recommendation там, где это требует flow.
7. После вопросов остановись в `waiting_for_user`. Не придумывай ответы, не
   выполняй plan, code, readiness или merge. Goal не закрывай.

Единственный пользовательский запрос для SPECIFY:

> Добавьте приоритет задач. Приоритет нужно выбирать при создании и
> редактировании задачи и видеть в списке задач.
>
> Сначала пройдите проектный flow `protocol -> specify -> plan`. На стадии
> `specify` выявите существенные пробелы задачи и задайте необходимые вопросы.
> До получения ответов к реализации не переходите.

В итоговом сообщении этой фазы дай: protocol/run ids, список вопросов, какие
применимые правила и аспекты были прочитаны, current stage, evidence paths и
точный next action — получить единый clarification packet.
