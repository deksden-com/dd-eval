# CP237 — five-harness preparation, blocked before scored launch

2026-10-19. No scored EVAL was started; baseline and productive Stage are NOT RUN.
Each harness has a fresh `~/.dd-eval/qualification/cp-237-<harness>-full` home.
No new public release or global hook replacement was performed.

Selected engine: frozen Plan092 tarball, source
`19ca01d60193f96acf002246cfe7eb4d98b00ae1` (same tested tree as integrated
`41c019e9b9a20cd8d1a6bf73bf6368ae89ebd414`), version beta.142, installed
checksum `e13087f1515758dc6cfa9106ce3c7a534b1cb9e6145273c1c938fc6ae1370a4b`.
This private candidate is NOT the older registry package with the same version.
Canon: `a1cfe8b06329c691c314064b6ea6a3da6628cceb`. Source baseline remains
CP236 plus only scoped check tooling (`1fc6fac469a3666a693d382d418f466f934e05ac`);
product `apps/*/src` and migrations have no delta from CP236. Flow pack
`98245526073f38066326bbaf0c698181d9ed4aa4` retains new Sessions/server MERGE and
adds accepted-intent instructions/schemas with refreshed manifest hashes.

Profiles: Grok grok-4.7/high; Codex gpt-6-luna/xhigh; AGY gemini-3.8-flash/high;
OpenCode and ZCode GLM-5.3-Flash/max. Judges: gpt-6.1-sol/high through cx/CPA.
Luna/ZCode retain gpt-6-luna Decisions at 0.7. All request full E2E, no stop_after.

Preparation findings:

- Installed matrix publication exposed a consumer omission: accepted intake and
  HITL text were JSON-parsed in qualification, unlike final case acceptance.
  Shared text-role classification now serves both consumers. Producer/admission
  regression includes plain intake/question/answer and exact retained bytes;
  installed operational runtime regressions pass 20/20. Actual installed
  PLAN/CODE/MERGE matrix qualification passed, with CODE-REVIEW explicitly off
  in that technical fixture only. Failed preparation attempts remain retained.
- Native doctors report the already-qualified tuples for all five harnesses and
  Judge (Codex0.163.0, Grok1.0.63, AGY1.4.2, OpenCode2.0.31,
  ZCode0.16.9/bridge0.52.0 at9c5ca6c). No unnecessary native upgrade was made.

Required shared HITL qualification then failed. Key
`188bf333edbc76e0356af2deb79423d1de1033e254d6e13f151acd1f90b2dbad`, operation
`operation-31a34e6f-d791-4185-81a5-9f84cf5c69ce`: 1 of46 cases passed;
the next Judge Turn was interrupted by failure cleanup, not declared successful.
Its session `01a1533b-444b-72c0-bc4f-cd3045a39364` accepted `turn/start` at
08:16:02.090Z. A compact `thread/read` transiently reported idle with no turns.
At08:16:02.096Z the adapter unconditionally requested `thread/turns/list`; native
app-server returned RPC-32601 `list_turns is not supported yet` a millisecond later.
The adapter propagated this optional-history failure and cleanup interrupted the
in-progress Turn. This is observed local RPC incompatibility, not evidence of an
HTTP/model/CPA outage. No productive request was repeated.

Next correction must capability-handle this exact unsupported read while retaining
same-operation events/authoritative reads, inactivity budget, malformed-response
rejection and unknown-outcome fences. It must not turn an unavailable history into
success or broadly swallow RPC errors. Add the accepted-start/idle-read/delayed-
event/unsupported-history regression before producing a new engine candidate.
Doctor readiness alone did not exercise this path. The old qualification evidence
must be reconciled/reused under its retained outcome, not silently replaced.

Artifacts and exact preparation wrapper:
`/Users/deksden/Documents/_Projects/_artifacts/cp237-launch.nF52bO/`.
Qualification failure/native journals remain in
`~/.dd-eval/definition-qualifications/<key>/<operation>/`.
Prior active EVALs, their installed engines and unrelated PostgreSQL service were
not modified. No new PostgreSQL container was created; the existing isolated EVAL
service uses55437 rather than the unrelated service on55433.
