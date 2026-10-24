# CP247 — five full E2Es, beta.149

Engine source `a98fb70bbcf26481de03def94fb3abc01fdfb525`; package SHA256
`83cc774e382e7a210be59b0392aaa73245ae705866c198b7306f9db539218957`.
Installed content and matrix receipt digests are bound by cp-247-runtime.json.
Preflight passes for all five profiles. On 2026-10-24 the operator explicitly
authorized five research E2Es on this exact unpublished artifact while release
acceptance continues. They do not claim release-accepted status. Publication and
global runtime updates still require PASS; retained CP247 runs keep these exact
bytes even if the eventual published candidate has a newer provenance commit.

Subject profiles: OpenCode GLM-5.3-Flash/max; ZCode GLM-5.3-Flash/max;
AGY Gemini-3.8-Flash/high; Codex gpt-6-luna/xhigh; Grok grok-4.7/high.
Both Judges use gpt-6.1-sol/high. All seven stages, semantic decisions disabled.
Product source, flow pack and canonical responses unchanged from CP246.

Native routing:

- OpenCode 2.0.31 and ZCode 0.17.0/bridge0.52.0 unchanged.
- Grok 1.0.70: changed-version smoke qualified one native child with confirmed
  native/physical cleanup; profile records its retained receipt, capacity1.
- AGY selected private exact copy1.4.6 (`11e51de3d0e3e16ea0a8574c13e730ab415bf95d11ec7af75b5b22eec3a98e3e`)
  reusing its existing exact native P3 receipt. Its initial private copy was
  replaced by AGY's background updater; EVAL-20261024105516-0bbb3eb1 failed
  before baseline on the correct runtime-version guard, cleanup settled.
  The replacement attempt uses fresh home cp-247-agy-r2-full and exact copy
  `~/.dd-eval/artifacts/agy/1.4.6-frozen-11e51de3/agy`, with
  `AGY_CLI_DISABLE_AUTO_UPDATE=true` from preflight through native descendants.
  Preflight PASS; selected version/digest reverified. User1.4.7 unchanged.
- Codex0.164.0 failed changed-runtime smoke with native
  `paginated_threads is not supported yet` before any child started. Original
  capture retained under cp-247-compatibility. Select installed immutable
  standalone0.163.0 instead through private `cp-247-engine/cx`; it preserves
  explicit CODEX_HOME (CPA default). User current/global Codex is unchanged.

Fresh homes `~/.dd-eval/qualification/cp-247-<harness>-full`; common registry
`~/.dd-eval/homes.json` and common resources cp-211-specify-scoped-base/resources.
Reuse verified EVAL PostgreSQL dd-eval-cp240-postgres on127.0.0.1:55439, never the
unrelated55433 service. Secrets are supplied privately, not stored here.
Admission and baseline are staggered; ACK is not completion or baseline PASS.
Existing CP246 and failed compatibility observations are never resumed/rewritten.
