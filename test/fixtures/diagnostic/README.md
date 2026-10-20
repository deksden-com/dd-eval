# Diagnostic conformance product

`mature-conformance-v1.bundle` pins product commit
`fc3edfee4d6dc8b27a664bb5ee5e08cc58387817`, based on the unchanged E4 mature
product `7f5fabdd0874935e8e6f6733c2ab5662cdaaee7b`.

Only two project-memory documents change. The new linked feature claims
implemented amount validation, concurrent-writer locking and an npm migration
utility, and links a missing migration runbook. Actual source and package scripts
do not implement those guarantees. Original architecture/decisions and active
`DEF-UPGRADE-001` retain the correct accepted limitation. Diagnostic agents must
detect the documentation/code disagreement without repairing the project,
closing the existing DEF or inventing a duplicate missing-lock deferral.

The original code, tests, scripts, executable modes, symlink, accepted DEF and
legacy project flow pack are retained. The legacy pack is project evidence,
not the executable authority for these new diagnostic flows. Source delivery
must use the separately pinned installed canon, without overlaying the product.

This is an authored fixture, not an accepted case or scored-run receipt.
