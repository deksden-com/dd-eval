# Controller prompt: clarification and PLAN

Продолжай тот же protocol/RUN, но не прежний goal. Первым действием поставь
отдельный Goal B:

> Применить exact canonical clarification packet к EVAL-001-task-priority,
> завершить SPECIFY и PLAN по проектному flow, доказать ready_for_code и
> остановиться до CODE.

Ниже единый исчерпывающий clarification packet. Он передаётся целиком и в
неизменном виде каждому прогону независимо от заданных вопросов. Считай его
authoritative external user input и закрой им заданные вопросы и остальные
problem-space gaps.

{{CLARIFICATION_PACKET}}

Теперь:

1. До PLAN сохрани и проверь provenance clarification packet: exact content,
   SHA-256, controller message/event identity, timestamp, protocol и RUN.
   Missing/mismatched provenance делает eval input invalid и запрещает PLAN.
2. Обнови и заверши SPECIFY по project-local flow.
3. Затем пройди project-local `.memory-bank/dd-flow/plan.md` полностью со всеми
   применимыми aspect/review/evidence требованиями и predecessor guards.
4. Следуй project-local flow flags, routing и observability contract без
   controller-provided решений о применимости, группировке или глубине работы.
5. Не выполняй CODE, readiness, merge, commit или push.
6. После принятого plan остановись перед CODE. Goal B можно отметить complete
   только если planning track действительно завершён и `ready_for_code` handoff
   доказан.
7. В финале дай protocol/run ids, plan verdict, resolved preset/flow flags,
   coverage units/jobs/groups/waves, effective pool, recovery count,
   timing/usage statuses, ключевые решения, validation evidence, артефакты и
   точный next action: отдельный implementation eval input from accepted
   `ready_for_code` state.
