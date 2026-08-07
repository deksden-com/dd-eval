# Controller prompt: clarification and PLAN

Продолжай тот же goal и тот же protocol/RUN. Ниже единый исчерпывающий
clarification packet. Он передаётся целиком и в неизменном виде каждому прогону
независимо от заданных вопросов. Считай его authoritative user input и закрой
им заданные вопросы и остальные problem-space gaps.

{{CLARIFICATION_PACKET}}

Теперь:

1. Обнови и заверши SPECIFY по project-local flow, явно сохранив provenance
   clarification packet.
2. Затем пройди project-local `.memory-bank/dd-flow/plan.md` полностью со всеми
   применимыми aspect/review/evidence требованиями и predecessor guards.
3. Следуй project-local flow flags, routing и observability contract без
   controller-provided решений о применимости, группировке или глубине работы.
4. Не выполняй CODE, readiness, merge, commit или push.
5. После принятого plan остановись перед CODE. Goal можно отметить complete
   только если planning track действительно завершён и `ready_for_code` handoff
   доказан.
6. В финале дай protocol/run ids, plan verdict, resolved preset/flow flags,
   coverage units/jobs/groups/waves, effective pool, recovery count,
   timing/usage statuses, ключевые решения, validation evidence, артефакты и
   точный next action: отдельный implementation eval input from accepted
   `ready_for_code` state.
