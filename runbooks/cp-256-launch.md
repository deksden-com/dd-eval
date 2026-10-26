# CP256 — four full E2Es

Use [execute-eval.md](execute-eval.md). Published engine beta.152 and its
checksum, flow pack, canonical responses, models and bridge are unchanged
from CP255. Reuse their accepted receipts; do not repeat engine or Judge tests.

CP255 Luna `EVAL-20261026050854-6c413a92` failed baseline before Subject:
Biome rejected five new producer tooling files. Preserve that EVAL/definition.
CP256 source tag `eval/cp256-library-proof` adds only formatting/import ordering;
product files are identical to the old baseline. Scoped Biome check (five files)
and three producer regressions passed. The same correction is FF-integrated
into dd-tasks main `c941b3e9d92a7c2fa18799bda1447adbdde09d6d`.

Fresh homes: `~/.dd-eval/qualification/cp256-{luna,zcode,agy,opencode}-full`.
Reuse the verified CP255 package/configuration, common resource/homes registries,
locked browser cache and owned PostgreSQL 55439. `COREPACK_HOME` selects the
existing exact pnpm cache even under isolated HOME. Normal runs execute their own
baseline; no standalone product suite, full release gate or GitHub CI.
