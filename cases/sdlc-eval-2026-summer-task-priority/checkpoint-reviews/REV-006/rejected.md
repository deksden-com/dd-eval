# REV-006 — chain rejected after SPECIFY

SPECIFY itself was semantically acceptable, but the engine left the live RUN
with `next_action: continue_specify` after a successful same-session handoff.
Its stage evidence and flow guidance said `start_protocolize`, so the state
machine was internally contradictory. The chain stops here; no PROTOCOLIZE
entry checkpoint was captured. Engine beta.62 fixes the shared transition.
