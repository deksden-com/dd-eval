# EVAL-002 session baseline

The baseline is the state of a normal agent conversation immediately after
priming and product discussion, before the user says “Ок, давай оформим
протокол.” It is not a RUN and it does not contain any stage result.

## Build once per harness/model/profile

1. Materialize the exact checkpoint and retain its `*.run.json` manifest.
2. Start one clean agent session in that repository.
3. Send `prompts/session/00-prime.md` and let it finish.
4. Send `prompts/session/01-discussion.md` and let it finish without starting
   a flow.
5. Record the native session id, harness, model, reasoning, checkpoint commit,
   prompt file SHA-256 values and the final turn id in the baseline JSON. Set
   `state` to `ready` and commit that immutable record.

The session is now the canonical fork point for that exact profile. A measured
run forks it and sends only `prompts/session/02-start-flow.md`; it must not add
a controller bootstrap or a synthetic intake message.

## Other harnesses

No hidden model context is portable across harnesses. Replay the two canonical
messages in order in a new clean session, save that harness’s own baseline
record, and fork it when the harness supports native forks. If it does not,
send the trigger to the replayed session directly. Do not copy a Codex thread
id into another harness’s record.

## Scope of the current beta

The vNext beta must expose a user-level flow entry for the trigger. Until it
does, this baseline is valid but no forked run is scored: a primed agent would
otherwise follow the legacy `prime.md` direction to `protocol.md`, rather than
the vNext SPECIFY-first entry. The old cold-start RUN is diagnostic evidence
only and is not a result for this case.
