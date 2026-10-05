# CP195 — installed engine identity and new Luna preparation

2026-10-05. Historical CP194 receipts and the failed CP195 candidate are unchanged.
Product source, flow pack, request, baseline policy@2, canon and models are unchanged.

## Root cause and shared fix

Plan065's engine-mode fast path correctly stopped inventory/probe work in lease
maintenance, but synthesized `degraded_local_development` for every executing
build, including a materialized installed snapshot. Normal release acceptance
therefore rejected the missing `status` checksum despite successful `engine resolve`.
The earlier plan065 installed check covered install/resolve, not that equality;
its retained PASS is not relabelled as consumer acceptance.

FLOW `ff066da12c2ebf86ed28ae76c72bd837cc57891a` reads the manifest at the actual
executing module's physical package root. Installed identity must match the
build/root, with a full-content checksum. Corrupt/missing installed metadata
cannot fall back to development identity. Environment aliases cannot substitute
another installed build. Unmaterialized development packages still have no proof.

Compatibility preflight checks identity without recursive content hashing or
entrypoint probes. Status/diagnostics and new routing/binding retain full byte
verification. No inventory scanning or dependency-closure hashing was added to
the bounded lease ACK path. A real cold installed subprocess regression covers
identity, corrupt/missing metadata, root/version mismatch and changed content;
its compatibility subprocess forbids all directory scans.

## Exact offline acceptance

- Evidence: `/Users/deksden/Documents/_Projects/_worktrees/dd-cp195-engine-identity.MXZVnb`.
- FLOW `ff066da12c2ebf86ed28ae76c72bd837cc57891a`; EVAL offline tests on clean
  `b954eab1a10020f28cb805df23f1fd0588f09bc8`; canon
  `2e57b987ec91b7c3b0fa97f6169047802a1233fb` / 4.1.2.
- Typecheck, lint, strict canonical build PASS; release 2 node + 8 Vitest PASS;
  runtime-sensitive 42/42 PASS; integration 2204/2204 PASS in 126 files;
  paired EVAL 542/542 PASS, zero fail/cancel/skip/todo.
- Ordinary candidate pack and accept PASS; trusted full integration covered all
  four required shards. `status` and `engine resolve` agree on installed identity.
- Tarball SHA256 `6d8ae917739325ed4b9195bb0dafed5cb3e451b3ebb96f275d5615fdb5aadad6`.
- Installed snapshot SHA256 `bb56aaea749cb52bc8c6c5469b9820eaaa909afc4729bdd57eab6791f43c9eaf`.
- Fresh installed matrix fixture PASS; normal qualification@3 published four
  owning Stage packets, including final MERGE coverage. Its explicit review-off
  fixture setting is retained, not a waiver for scored execution.

This definition update still needs its own offline checks and exact HITL corpus
qualification. Candidate acceptance is not scored E2E success.

## Launch contract

- Home `/Users/deksden/.dd-eval/qualification/cp-195-luna`.
- Explicit installed CLI `<home>/published-engine/node_modules/@deksden-com/dd-flow-cli/dist/cli.js`;
  configuration `<home>/engine-config`; shared resources
  `/Users/deksden/.dd-eval/qualification/cp-191-resources`.
- Native runtime `/Users/deksden/.local/bin/cx`, authorization/config source
  `CODEX_HOME=/Users/deksden/.codex-cpa`; Codex CLI 0.160.0.
- Subject `gpt-6-luna/xhigh`; Interaction/Final Judge `gpt-6.1-sol/high`.
- Standard profile `cases/sdlc-eval-2026-summer-task-priority/run-profiles/e2e-inline-merge-luna-xhigh.json`;
  fresh Session per Stage, server MERGE as declared by the pinned flow pack.

After clean committed definition checks, run one fresh 18-item qualification,
the reference-pair smoke, light preflight and one scored E2E with the same tuple.
Stop on a conclusive blocker; never resume/repair old evidence or retry semantic
rejection until PASS. Preflight baseline `not_run` is not PASS. Report startup
only after this execution's baseline PASS, native Session and actual SPECIFY
controller/timeline evidence. No implicit heartbeat or global CLI switch.
