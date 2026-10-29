# CP266 — Luna after accepted-handoff custody correction

Continue [CP264 campaign rules](cp-264-luna-plan113.md): correction cycle **2 of3**,
not a new budget. Do not change its ledger until publication and actual launch.
Keep failed CP264/CP265 evidence; do not resume or replay their native prompts.

Release preparation completed: published beta.161 registry bytes/dependencies
verified 2026-10-29; source367b9cb844aa34fd36d0a00cf059160377d10bdd,
engine SHA ef2b95e878f00d8ea016efc9ea6e6b4a0c29c54cd1f207d2ddaea04f0c541de4.
Scoped acceptance46contracts PASS (39executed,7reused), installed matrix-r2
PASS1 selected fixture102.74s. Initial host-load timeout attempts remain FAIL;
neither limits nor model/capacity were changed. Matrix qualification SHA
e1442cd0f615e51f6664c034afab216cae9433ab0ea2d760a55b11cc14aab79d.
The steps below describe the reproducible preparation, not permission to repeat
already retained installs/preflight/launch receipts.

## Pending release and definition

- Engine beta.161 source: `367b9cb844aa34fd36d0a00cf059160377d10bdd`.
  Existing scoped verification is primary session44864, output
  `~/.dd-eval/qualification/cp266-engine-verification-r1`. Do not duplicate it.
- `cp-266-runtime` is deliberately non-launchable. Its checksum identifies the
  isolated local candidate, not a published/release-accepted engine.
  Publish only after affected acceptance, install exact published bytes privately
  at `~/.dd-eval/qualification/cp266-published-engine`, and retain readback/checksum.
- Current inventory matches CP265, but its `services/vnext-plan.js` bytes changed.
  Therefore produce one fresh offline installed matrix, not a full gate or paid
  Judge/capacity qualification. Reuse all other unchanged guarantees.
- Finalize a new `cp-266-installed-matrix-qualification.json` reference/checksum,
  actual engine artifact checksum and published state in the checkpoint. Hash its
  final bytes into the case binding; review and commit before preflight/launch.
  Do not change historical checkpoints or claim the provisional CP265 proof covers161.

## Preparation after publication

Reuse the CP265 preparation/launch script structure in
`.tasks/cp264-luna-monitor/{prepare-cp265,launch-cp265}.mjs`; copy to fresh CP266
scripts before editing paths/version. Never execute the CP265 scripts again.
Change CP265 output/home/package prefixes to CP266, old portable-config source to
CP265, expected engine to beta.161, and adapter replacement265→266. Clone only
`harnesses.json` and `agent-profiles`, never RUN/SQLite/locks/engine runtime state.
Retain exclusive receipt creation and launch intent to prevent duplicate dispatch.

Fresh home: `~/.dd-eval/qualification/cp266-luna-full`; receipts:
`~/.dd-eval/qualification/cp266-preparation`. Private `engine install --json`
must return161 and the published artifact checksum. For the offline producer:

```sh
# dd-flow-cli repository; exact installed npm package root, fresh output directory
node scripts/qualify-verification-matrix.mjs <cp266-published-package-root> <cp266-installed-matrix-proof>
# dd-eval repository; values below come from that producer's fixture.json
node bin/qualify-verification-matrix.mjs --run-home <fixture.run_home> --engine-json <fixture.engine_manifest> --project-root <fixture.project_root> --flow-commit 01cad45f12b853d716d887d76636ccda1fcc714a --output <cp266-new-qualification.json>
```

Keep canon4.1.4, flow-pack `01cad45f12b853d716d887d76636ccda1fcc714a`, source,
fixture and profile unchanged: Luna `gpt-6-luna/xhigh`, native capacity3,
Interaction/Final Judge `gpt-6.1-sol/high`, no Decisions or `stop_after`.
Resources remain `~/.dd-eval/qualification/cp-211-specify-scoped-base/resources`;
the verified shared Worktrunk0.72 cache exists. Do not reseed a valid cache.
Registry remains `~/.dd-eval/homes.json`; owned PostgreSQL is loopback55439,
container `dd-eval-cp240-postgres`. Do not touch foreign55433. Preserve existing
credential injection without printing credentials and allocate fresh application
ports. Update installed hooks only through the primary release workflow, retaining
the absolute workstation fallback and CPA symlink.

Then one provider-free preflight, followed by one fresh full E2E using the same
prepared configuration. Record actual EVAL ID, exact pins/definition and receipts
in the existing campaign ledger; keep cycle counter2 and five-minute monitor.
Stop foreground after detached launch. No full gate or GitHub CI.
