# CP-241 preparation

Use [execute-eval.md](execute-eval.md). This campaign selects the reviewed plan096
tooling snapshot `5270b266` without changing product behavior or the project flow
pack. Engine candidate beta.146 / `ec625cbe`, canon 4.1.2 / `925ef10e`; installed
full-content checksum is recorded in `checkpoints/cp-241-runtime.json`.

The immutable local tarball is installed under
`~/.dd-eval/qualification/cp-241-engine-candidate`; five fresh homes
`cp-241-{opencode,zcode,agy,luna,grok}-full` reference that retained installation.
Provider-free preflight does not authorize dispatch before local release acceptance.
The candidate is not a public npm release; publication needs working npm credentials.

Full profiles retain GLM-5.3-Flash/max for OpenCode/ZCode, Gemini-3.8-Flash/high
for AGY, gpt-6-luna/xhigh for Codex and Grok-4.7/high. Both Judges use
gpt-6.1-sol/high. No semantic decisions or stop-after. Codex routing uses `cx`
with `CODEX_HOME=~/.codex-cpa`.

Reuse the shared resource registry at
`~/.dd-eval/qualification/cp-211-specify-scoped-base/resources`, the existing
`~/.dd-eval/homes.json` discovery registry, and owned PostgreSQL on loopback
55439. Select `/Users/deksden/Library/Caches/ms-playwright` explicitly for all
new baselines and productive checks. Do not replace historical runtime pins.
Retire owned daemons and stop the shared DB only after its last consumer and
capture/Judge cleanup. No GitHub CI.
