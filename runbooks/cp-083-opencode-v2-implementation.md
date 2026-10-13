# 083 implementation / installation receipt

Date: 2026-10-13. Native candidate: OpenCode/client/plugin 2.0.28;
engine source candidate: 0.9.0-beta.135, not published or installed yet.
Scored SPECIFY/full E2E deliberately deferred.
This receipt records technical conformance, not model or product acceptance.

## Native artifact

- Upstream v2.0.28: 026b106bc5d41b679ffc413264229c340871e4d3.
- @opencode/cli-darwin-arm64@2.0.28 npm integrity:
  `sha512-HYFeBK8drYVq9b9DlQ51pBLCaL+GNyih1ysTQfmekW7YhAJngPYDM7xMgCINXopRVMGTw7EmbJPrMm+9V0G7Yg==`.
- Extracted executable SHA256:
  `7d9e936ab23af4928e0dfbf94c9fe313aac0728eef34a06709e1d86ca8987341`.
- Saved/reviewed official installer SHA256:
  `bc70dd317fd12ef09350cdb1667e55e19f9e7b3d2897d3a1b750b165ae579d87`.
- V1 archival source: archive/opencode-v1-final-beta134 at b243f4d;
  installed v1 before replacement: 1.18.35.

## Implemented contract

One v2-only Promise SDK adapter; private unregistered server/DB/config and owned
plugin; durable operation/message request binding; queue acknowledgement separate
from current user/idle outcome; read-only reconciliation/resume; no productive
replay after uncertain admission. Current native root/child identities, profile,
cwd and pending inbox/form/permission/shell state are observed independently.
Native overload after terminal/settled proof uses the existing continuation
authority; auth/quota/unknown effects cannot take that path.

Official self-contained upstream Promise SDK/Plugin.define assets are shipped
with the packed engine, without the optional AI/Effect/TUI dependency graph.
Snapshot dependencies use standard Node lookup/hoisting with conflicting-version
and cycle checks. Child completion notifications arriving between topology and
message reads trigger a read-only ancestry check, not a false foreign-input error.

The plugin preserves common shell/lifecycle admission, updatedInput and typed
refusal before effect. It pins the Node interpreter, strips private server
passwords from shell env and retains admitted after identities in native plugin
storage. Native completed tool with nonzero exit is failure, not Work success.
Operator permission/policy restrictions are retained; third-party plugins are
excluded. Parent-first native tree archives do not copy credentials or user DBs.

## Checks

- Typecheck, lint, build, release-contracts: PASS locally.
- OpenCode adapter: 25/25; shared adapter progress: 12/12.
- Targeted capacity/delegation/hooks/assets/installed snapshot and dependency
  DAG/conflict/cycle checks PASS; final full inventory is recorded below.
- Actual 2.0.28 local-provider probes: queue/root continuation/read-only resume,
  two background direct children + child continuation, profile/cwd readback,
  fork boundary, full-tree archive/import in a fresh DB, credentials activation,
  owned doctor and clean stop PASS.
- Actual native plugin: allowed/denied shell, pinned Node, secret removal,
  active shell cancel PASS. Long shell emitted output for >120s with a 10s
  sliding observer and finished PASS; no fixed native cutoff.
- Packed/installed snapshot loads SDK and plugin offline from outside checkout.
  Full release gates have not passed; see the explicit blockers below.
- EVAL full suite: 813 total, 803 PASS, 10 explicit platform/opt-in skips;
  no failures. Additional terminal identity/negative overload attribution checks PASS.

No paid provider requests, new scored EVALs, user DB migration or third-party
plugin fixes were performed. Existing EVAL homes/runs remain unchanged. Provider
model availability, real quota and scored flow acceptance remain future gates.

## Integration and installation

Source candidate: `2bf31592781b08329fed05b207d73e2485bdb868`;
canon: `fb848eee0c7340f8a776f269b86b9ac8412dec24` (4.1.2).
Engine implementation [PR 64](https://github.com/deksden-com/dd-flow-cli/pull/64)
is pushed, not merged. Earlier frozen candidates/failed reports are retained;
they do not qualify this final source tuple.

[Actions release run](https://github.com/deksden-com/dd-flow-cli/actions/runs/38411144949)
was blocked before any step by account billing/spending settings. This is not a
CI PASS. Main has no configured protected required checks. Use the supported
guarded local candidate/accept/publish route after all equivalent required suites
and their complete source/build-bound inventory pass.

Local full gate also failed on a loaded Mac: `process_ownership_unknown` /
`physical_identity_unavailable` in real process confirmation. The unchanged
ownership reader requires OS `ps` birth readback; an unavailable observation
must remain fail-closed, not a synthetic successful confirmation. A subsequent
sequential run encountered the same barrier, not merely four-shard contention.
`npm pack` of the final source also hit its 120s tool guard without producing a
candidate receipt. No accepted artifact, registry publish or release tag exists.

Additional fixture repairs: current daemon-state schema in six-transport tests;
positive OpenCode scheduling margins separated from deliberate silence expiry;
recovery cold-CLI guard and whole physical-stop test use the existing CI envelope,
with retained binding diagnostics. Runtime retry/ownership semantics are unchanged.

Installed native remains OpenCode 1.18.35; installed launcher remains engine
0.9.0-beta.134. Both Codex homes still share their existing absolute launcher
and explicit-pin hook configuration. Do not deploy a mismatched native/adapter
pair while the required gate is unconfirmed.

Private v1 executable/config/auth/SQLite-aware backup is retained at
`/Users/deksden/.dd-eval/artifacts/opencode/2.0.28/v1-backup-20261013`;
backup DB quick_check is OK. No user DB migration occurred. Only owned test
processes were retired; unrelated apps/EVALs and primary divergent mains remain.

To finish: run the full source/build-bound inventory and guarded pack/accept/
publish when OS readback is reliable (or Actions billing is restored); verify
registry bytes, install the selected native/engine pair, warm and verify both
Codex hook homes, run local-stub post-install conformance, then squash merge.
Do not launch scored EVALs as part of that continuation.
