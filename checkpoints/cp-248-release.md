# Beta.149 delivery / CP247 research launches

Engine `7d17167f768483ffdb5d37f64cc385035c7d4658`, npm/tag
`0.9.0-beta.149` / `v0.9.0-beta.149`. Full local release gate PASS; no GitHub CI.
Tarball `0b59b876e0870fb660655b02fd320c7094fa45d219a5e6f9794976b5332d618e`;
accepted installed checksum is bound by cp-248-runtime.json and its matrix receipt.
Native bridge remains 0.52.0; no unrelated native installation was downgraded.

Global router selects the accepted npm dependency snapshot, not pnpm's different
transitive snapshot. Six obsolete global adapter paths now select that immutable
snapshot. Both Codex homes passed fallback/pin smoke under minimal PATH and
missing-pin failure; shared hooks.json/symlink and unrelated handlers unchanged.
Default store pair was backed up with SQLite backup and explicitly prepared.

Operator-authorized CP247 research runs retain the earlier exact artifact from
`a98fb70bbcf26481de03def94fb3abc01fdfb525`; never replace their runtime with CP248.
All five passed their own baseline:

| Harness | EVAL |
| --- | --- |
| OpenCode | EVAL-20261024104506-df281e83 |
| ZCode | EVAL-20261024105015-75afd0a0 |
| AGY replacement | EVAL-20261024112219-0d36ade5 |
| Luna | EVAL-20261024110351-b0d9470e |
| Grok | EVAL-20261024114436-8c031eeb |

AGY initial EVAL-20261024105516-0bbb3eb1 failed before baseline after native
self-update; exact 1.4.6 replacement disables updater only in EVAL environment.
Replacement later blocked on PROTOCOLIZE `controller_native_shutdown_unproven`;
Luna blocked on CODE `check_gate_blocked`. Retain both for investigation; no
manual resume/restart or verdict repair. Other runs' completion is not claimed.
