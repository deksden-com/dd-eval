# CP267 — Luna after check-recovery successor correction

Continue [CP264 campaign rules](cp-264-luna-plan113.md): correction cycle **3 of 3**; no budget reset. Preserve CP266 evidence. This is preparation only, not a launch or PASS.

`cp-267-runtime` is `preparing`, `launchable: false`. Target beta.162 is not a published claim. Engine commit/checksum and matrix file/checksum are deliberately null until actual receipts exist. Do not bind case.json, pins or monitor to this draft.

## Release admission

After reviewed implementation and metadata merge, freeze clean main and canon provenance. Reconcile stale Changesets against the published artifact commit; do not replay historical release notes. Use the existing change-impact selector and valid retained PASS evidence, not a full gate or GitHub CI. Pack once, accept scoped receipts, publish the exact candidate and retain registry byte/dependency/tag readback. Never repeat an unknown publication effect.

Hooks and lifecycle bytes belong to the matrix component inventory, so produce a fresh offline installed matrix; the CP266 qualification cannot simply be rebound. From dd-flow-cli:

```sh
node scripts/qualify-verification-matrix.mjs <actual-installed-package-root> <fresh-cp267-installed-matrix-proof-root>
```

From dd-eval, use the producer's actual fixture.json paths:

```sh
node bin/qualify-verification-matrix.mjs --run-home <fixture.run_home> --engine-json <fixture.engine_manifest> --project-root <fixture.project_root> --flow-commit 01cad45f12b853d716d887d76636ccda1fcc714a --output <fresh-cp267-qualification.json>
```

Only actual accepted/published engine provenance and fresh qualification permit checkpoint finalization. Review final checkpoint bytes, bind their checksum in case.json, and commit definitions before preflight/launch. Main owns those pins and campaign ledger.

## Owned preparation and dispatch

Ignored templates live in `.tasks/cp264-luna-monitor/{prepare-cp267-candidate,prepare-cp267,launch-cp267,update-hooks162}.mjs`. All fail closed while this checkpoint is nonlaunchable. Do not execute them during draft preparation. Reconcile any existing receipt rather than dispatching a duplicate.

Fresh home: `/Users/deksden/.dd-eval/qualification/cp267-luna-full`; receipts: `/Users/deksden/.dd-eval/qualification/cp267-preparation`. Copy only CP266 portable agent-profiles/harness configuration; never RUN databases, locks or runtime state. Preserve native adapter configuration and exact profiles: Luna gpt-6-luna/xhigh, capacity 3, Judges gpt-6.1-sol/high, no Decisions/stop_after. Keep canon 4.1.4, flow pack and product unchanged. Reuse verified Worktrunk resources under cp-211-specify-scoped-base and registry `/Users/deksden/.dd-eval/homes.json`.

Use only owned cp240 PostgreSQL loopback 55439; never foreign 55433. Keep credentials in memory, allocate fresh application ports, preserve absolute workstation hook fallback and CPA symlink. After final pins, perform one provider-free preflight and one fresh full Luna launch. Retain exclusive launch intent and receipt; record actual ID/root/engine/definition commit in the existing ledger, keeping cycle 3/3. Update monitor to current_eval only and stop foreground after accepted launch.
