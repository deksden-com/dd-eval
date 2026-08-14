# Standard stage lifecycle for vNext SPECIFY

## Problem

The earlier beta exposed `flow launch` and `work submit` to the worker. That
duplicated the normal lifecycle vocabulary, led the controller to finish the
agent's work, and made the generated prompt omit the exact finish contract.

## Decision

The first user-triggered command is the standard bootstrap form:

```bash
dd-flow stage start --bootstrap --stage specify --project-root <root> \
  --intake-file <raw-intake> --subject <slug> --json
```

For a project carrying the vNext SPECIFY pack, that entry deterministically
creates the RUN, root Work, trusted session binding and worker prompt. The
returned prompt contains the exact result path, schema path, compact valid
JSON skeleton, and this exact completion command:

```bash
dd-flow stage finish <RUN-ID> --project-root <root> --stage specify \
  --semantic-file <result-path> --json
```

`stage finish` identifies the vNext Work by RUN and completes it. `work
status` remains diagnostic only; no agent-facing `work submit` command exists.

## Acceptance

1. The prompt has the result schema and a compact valid skeleton, so the
   worker need not search the project or CLI help.
2. The worker invokes `stage finish` itself after writing the result.
3. Invalid input creates a receipt and leaves the Work correctable; a valid
   `waiting_for_user` result keeps the RUN open.
4. A RUN-bound `0.8.0-beta.5` engine executes both lifecycle commands.
5. No canonical `dd-memorybank/main` changes are made during this beta.
