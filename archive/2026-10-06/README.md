# Исторические материалы FLOW и EVAL

Материалы сохранены при уборке завершённых веток 6 октября 2026 года.
Это исторические документы и исходные checkpoints, не текущие инструкции,
не executable fixtures и не подтверждение успешного E2E. Исходные файлы
сохранены без изменения содержимого; относительные ссылки в них относятся
к первоначальному месту в репозитории.

## Сохранённые материалы

| Файл | Происхождение | Как использовать |
| --- | --- | --- |
| [CP141 checkpoint](checkpoints/cp-141-task-priority-zcode-0-46-7-flow-4-1-1-engine-0-9-0-beta-99.json) | EVAL dc9edcf, ZCode beta.99 | Только история exact tuple; не выбирать для нового запуска |
| [CP177 checkpoint](checkpoints/cp-177-task-priority-engine-0-9-0-beta-116.json) | EVAL efacd4c, beta.116 | История checkpoint; current case pin не изменён |
| [CP141 runbook](runbooks/cp-141-zcode-beta99-e2e.md) | EVAL dc9edcf | Подготовка с pending receipts, не доказательство completion |
| [Recovery E2E](runbooks/recovery-e2e-2026-09-06.md) | EVAL 7612831 | Исторические process-crash и child-admission observations |
| [План 048](specs/048-cp130-public-lifecycle-admission.md) | Незакоммиченный файл основного dd-eval checkout | Основание расследования; старый статус не означает новый незавершённый план |
| [Дополнение 051](specs/051-boundary-snapshot-and-native-worker-provenance.md) | Незакоммиченный файл dd-eval-cp136-137 | Исторический systematic/strictness audit; не заменять им нынешний план |

Планы 049–067 и implementation receipts в [текущем каталоге specs](../../specs/)
содержат последующие изменения. Сохранение этих черновиков не обещает, что каждый
их пункт завершён или остаётся актуальным: для новой задачи сопоставляйте конкретный
контракт с текущим кодом и его проверками.

## Восстановление веток и незакоммиченных данных

В обоих репозиториях исходные refs сохранены на origin под неизменяемыми тегами
`archive/retirement-20261006/local/<branch>` и
`archive/retirement-20261006/origin/<branch>`. Завершённые refs в этом namespace
не являются принятыми runtime artifacts. Release tags не переписаны.

Снимки WIP доступны под `archive/retirement-20261006/wip/<checkout-name>`.
Это отдельные commits с исходным HEAD как parent; они не меняют основную
реализацию. Восстанавливайте их в отдельном checkout, не поверх свежего main:

```sh
git fetch origin --tags
git worktree add --detach /absolute/path/to/recovered-checkout \
  archive/retirement-20261006/wip/dd-eval
```

Локальный полный manifest, WIP tar archives и точные refs сохранены в
`/Users/deksden/Documents/_Projects/_worktrees/dd-retirement-20261006.R3G8zZ`.
Tar archives и WIP tags сохраняют пользовательские изменения; зависимости
и historical runtime directories не нужно переносить в текущий source suite.

## Граница текущего изменения

Единственная executable SPECIFY response fixture остаётся
[`entry-pack-source/interactions/specify.json`](../../cases/sdlc-eval-2026-summer-task-priority/entry-pack-source/interactions/specify.json).
Удалены только две неиспользуемые legacy копии из case `interactions/`;
канонические ответы, текущий case.json, engine checkpoint, models и profiles
не изменены. Добавлена offline regression для этой единственности.

AGY 1.2.15 из старого CP192 не переносится как актуальный pin. Новая версия
требует собственной compatibility/capacity qualification; исторический PASS
не переносится на установленный другой runtime.
