# CP239 AGY 1.4.3 candidate

Operator restored access and requested a fresh full E2E. Native CLI changed
from 1.4.2 to 1.4.3. Engine remains published beta144; Subject remains
Gemini 3.8 Flash High and both Judges remain gpt-6.1-sol/high.

- Compatibility PASS with one native direct child:
  `cp-239-agy-full/conformance/harness-compatibility/20261020091524610/antigravity-cli-google-gemini-3-8-flash-high/receipt.json` below `~/.dd-eval/qualification`.
- Its capacity receipt requested/started 1; child status is `settled_by_root`,
  not an inferred Work success. Physical and native cleanup both settled.
- Pin capacity conservatively to **1**. This supports full E2E with serial
  native children, not the previous four-child throughput.
- Optional capacity-4 attempt `20261020093639772` was not qualified: no children
  started; model inspected probe artifacts and encountered native 503
  `No capacity available for model gemini-3.8-flash-high`. Operator's launch
  authorization was used to cancel only this extra probe through public
  `session cancel`; original observer confirmed settled daemon/scope cleanup.
  Preserve its failed receipt; do not promote it or repeat it to obtain PASS.
- Profile/corpus tests: 29 passed, 0 failed/skipped. Judge qualification reused.

Launch only from a committed clean definition after preflight. Use isolated
campaign PostgreSQL port 55438; leave existing EVALs unchanged. Runtime
compatibility is not full-cycle product acceptance. Increase capacity only
after another explicitly selected, successful native-capacity qualification.
