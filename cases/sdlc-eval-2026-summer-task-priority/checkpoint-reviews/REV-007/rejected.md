# REV-007 — chain rejected after PLAN

PLAN is mechanically and semantically acceptable, including six review groups
for measured capacity six. However, `run.next_action` required PLAN-REVIEW
while `flow_guidance` exposed CODE. The engine guard in CODE would still reject
an early start, but the published state graph was contradictory. No
PLAN-REVIEW entry was captured; beta.63 corrects shared guidance.
