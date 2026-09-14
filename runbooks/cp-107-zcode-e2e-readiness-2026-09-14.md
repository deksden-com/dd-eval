# cp-107: ZCode E2E на beta.63

Входы из cp-106 сохранены без изменений: source `924ef61752b642f06c2c326b444ed7a3239f20ff`,
flow pack `9b121e24f94ac56c2a076cd95e84f427eeea8c6d` и Memory Bank `4.1.1`.
Меняется только проверенный движок: `@deksden-com/dd-flow-cli@0.9.0-beta.63`, commit
`4975ba184bd847fd34db995cd3d9e1feb3db9f9f`, checksum
`6fe98d1bb5f9dc212d082a800256ac9ab4f5325f194effc38b82cd231a5611f7`.

Перед E2E обязательны только механические шаги: установить опубликованный пакет в новый
campaign home и выполнить его non-generative `doctor`. Doctor должен подтвердить
`compatible: true`, bridge commit `60af0d31e13076a313d9770f10aa70f7c94742cf` и contract
`dd-zcode-harness@1`. Baseline, проверка сценария и judge выполняются самим E2E ровно один раз.
Не запускать отдельные quality, browser или изоляционные прогоны.

Использовать отдельный home `cp-107-zcode`; не менять и не переиспользовать состояние cp-106.
Запуск фиксируется через [cp-107](../checkpoints/cp-107-task-priority-zcode-admission-flow-4-1-1-engine-0-9-0-beta-63.json).
