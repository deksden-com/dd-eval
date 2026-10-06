# CP-197: lifecycle retry authority and terminal finalization

Historical `EVAL-20261006193841-0fda13fc` remains unchanged. Product source,
canonical answers, baseline policy and models are unchanged.

FLOW `1d439fdc1c2500ad659e58b816c5d022b3cd89b2` publishes the transactional
retry authority back into the original CLI error only after successful settlement.
CLI and hook therefore observe the same committed successor; rollback cannot
expose a retry. PLAN-REVIEW correction reuses PLAN's check-contract instructions,
including planned check providers and the exact workspace check profile.

EVAL `d5847e296c14d8409453dcd1cbd8357f2d0a4eca` sends ordinary scored continuation
through final projection after cleanup settles, including the recovery-budget
path. Explicit cleanup remains cleanup-only. Terminal finalization cannot dispatch
Subject work and does not re-admit a definition whose drift already caused the
primary failure. Manifest and terminal-operation fences remain enforced.

## Offline evidence

Evidence directory: `/Users/deksden/Documents/_Projects/_worktrees/dd-cp197-retry.gritrD`.
Typecheck, lint, strict canonical build and release checks passed. FLOW full
integration: 2212/2212; runtime-sensitive: 43/43, zero skips. Final paired EVAL:
592/592, zero failures/skips. The first EVAL run exposed an extra definition
guard preventing a failed fork from reaching its report; this was corrected and
the complete suite rerun. Do not relabel that initial 591/592 run as PASS.

Ordinary cold candidate acceptance passed. Tarball SHA256:
`b775d336f459500d8bef10c75f1ee60762076b06d4aa43a4fb0813d91936b7d4`.
Installed snapshot SHA256:
`8bf2ee67722d212ef13d36d9c4b7c32b794d0d50c01e916b1e864bb82d049f7b`.
Installed full-cycle matrix fixture passed and published four real Stage packets;
its explicit review-off fixture setting is retained, not a scored waiver.

## Fresh launch

Home: `/Users/deksden/.dd-eval/qualification/cp-197-luna.62LX8X`.
Use its published CLI, engine-config and resources explicitly. Native command
`/Users/deksden/.local/bin/cx`, authorization source `~/.codex-cpa`;
Subject `gpt-6-luna/xhigh`, both Judges `gpt-6.1-sol/high`.
Standard profile: `e2e-inline-merge-luna-xhigh.json`.

Reuse qualification@4 native evidence under the current oracle: engine repairs
alone must not repeat paid Judge calls. Require preflight admission, then actual
baseline PASS, native Subject Session and SPECIFY controller/timeline evidence
before reporting successful startup. Do not create a heartbeat or repair old runs.
