# 083 implementation / installation receipt

Date: 2026-10-13. Native candidate: OpenCode/client/plugin 2.0.28;
engine: 0.9.0-beta.135, published and installed.
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
  Final full local release gate: 2381 integration cases / 139 files and
  46 runtime-sensitive cases / 2 files PASS, zero failures/skips; complete
  source/build-bound inventories verified. Exact installed-tarball native probes:
  2/2 PASS, including the long shell.
- EVAL full suite: 813 total, 803 PASS, 10 explicit platform/opt-in skips;
  no failures. Additional terminal identity/negative overload attribution checks PASS.

No paid provider requests, new scored EVALs, user DB migration or third-party
plugin fixes were performed. Existing EVAL homes/runs remain unchanged. Provider
model availability, real quota and scored flow acceptance remain future gates.

## Integration and installation

Source candidate: `2bf31592781b08329fed05b207d73e2485bdb868`;
canon: `fb848eee0c7340f8a776f269b86b9ac8412dec24` (4.1.2).
Engine implementation [PR 64](https://github.com/deksden-com/dd-flow-cli/pull/64)
squash merged at `38e8738c36b27d70c36eb3c02d753a2d19ce238e`.
Release tag `v0.9.0-beta.135` identifies the verified source `2bf3159`, not
the squash commit. Candidate tarball SHA256:
`d893f7b758be1ef4abd197e3d13f081caf3b1752f66f1b44f50882e6f7abb486`.
Guarded acceptance, registry byte readback and registry consumer verification
PASS; engine snapshot checksum:
`8ee5ab2e4c7962dce99dd9062dd15bc792684458460bb7f3718709826bcc14ee`.

The final gate and publication were entirely local, with no CI use. Receipts:
`/Users/deksden/.dd-eval/artifacts/opencode/2.0.28/engine-beta135-local-tests`
and `engine-candidate-beta135-local-retry`. Earlier failed attempts under heavy
load are retained, not counted as PASS. OS ownership proof remains fail-closed
and unchanged; the complete final run passed it without bypasses.

Additional fixture repairs: current daemon-state schema in six-transport tests;
positive OpenCode scheduling margins separated from deliberate silence expiry;
recovery cold-CLI guard and whole physical-stop test use the existing CI envelope,
with retained binding diagnostics. Runtime retry/ownership semantics are unchanged.

Installed native is OpenCode 2.0.28, exact executable hash as above; installed
launcher and prepared default engine are beta.135. Installation used the saved
official installer with the verified local binary and `--no-modify-path`, plus
the accepted engine tarball while npm processed its publication. Both Codex
homes retain their shared absolute launcher and explicit-pin configuration.
SessionStart preparation returned `{}`; configured PreToolUse commands under
minimal PATH returned `{}` in both homes, and a missing explicit pin failed
with exit 127 rather than switching engines.

Private v1 executable/config/auth/SQLite-aware backup is retained at
`/Users/deksden/.dd-eval/artifacts/opencode/2.0.28/v1-backup-20261013`;
backup DB quick_check is OK. No user DB migration occurred. Only owned test
processes were retired; unrelated apps/EVALs and primary divergent mains remain.

Post-install native conformance uses the installed binary and installed engine
assets against the same local deterministic provider: 2/2 PASS, zero skips,
including >120s shell, active cancellation, children and relocated archive.
Logs: `native-installed-local-proof.log` and `native-post-install-proof.log`
under the artifact root. The pnpm-installed default snapshot is healthy with
checksum `4ace1e00f14f6cdba90fd881cf8b675095abf594ed4869f63a7dc15ea12b0304`;
this is recorded separately from the npm registry consumer snapshot above.
Installed compatibility verdict is `ok` on canon 4.1.2.
Scored EVALs remain
deferred; technical conformance does not assert model/product acceptance.

## Post-implementation review

Reviewed the v2 transport/queue/outcome and sliding observer, native ownership,
child settlement/cancellation, private credentials/config, archive boundaries,
owned plugin admission and packed SDK assets against plan 083. Scored acceptance
remains explicitly deferred, not claimed from the technical probes.

One confirmed defect: the security-only no-flow plugin returned before removing
OpenCode's implicit 120s shell cutoff. The common shell entry now sets an omitted
timeout to zero in both modes while preserving explicit values. No lifecycle
dispatch is introduced in no-flow mode. Regression checks default, zero and
explicit timeout plus absence of hook dispatch. Adapter 26/26, shared progress
12/12, typecheck and lint PASS locally, no CI or new EVALs.

This follow-up is source-only. Published/installed beta.135 and its receipts above
are unchanged; the fix requires a subsequent engine release before live use.
