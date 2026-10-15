# Old Memory Bank inputs for E4

The `minimal` and `mature` bundles start with real, locally integrated E3
`mb-init` results, not fresh blank projects or hand-written substitutes:

| Input | Original init EVAL | Integrated old-bank commit |
| --- | --- | --- |
| minimal | `EVAL-20261014111838-7f476246` | `bd66253` |
| mature | `EVAL-20261014124842-a0747535` | `57b72bc1b5b9d92b91164e10a00310cfa646a579` |

The original product source, canon4.1.2 manifest and original curated bank
remain intact. Explicitly authored fixture additions supply a known accepted
deferral, a project-owned executable command and its symbolic link. These are
test data, not claims about an actual project's decisions or owners.

`*-v2.bundle` corrects the **fixture's** DEF metadata to the normal document
status `ACTIVE`, with explicit deferral acceptance, owner and next gate. The
first bundles remain historical inputs of the retained dev2/dev3 checkpoints;
they were not scored model PASSes. Active cases identify their exact bundle
and commit through their current input checkpoints.

Known preservation inputs include:

- DEF identity `DEF-UPGRADE-001`, document version `1.2.7`, explicit acceptance
  and its product limitation;
- `scripts/check-local.sh` bytes and executable mode;
- `scripts/check-current` symbolic-link target;
- original product files and curated implementation-versus-plan facts.

Judge expectations are outside the Subject's stage blueprint. A successful
runtime or lint result does not prove semantic preservation. Definitions are
covered by `node --test test/memory-upgrade-cases.test.mjs`, which materializes
the pinned **old** bank without applying the target canon and runs its original
product checks.

The old init results lack an index `memory_bank_version`; their unchanged
canonical MBB carries stale prose `4.0.6`, while their exact manifest and
independently installed signed old canon identify `4.1.2`. This real historical
input is deliberately retained. Do not repair those project markers by hand
to make upgrade pass: the product must admit the authenticated legacy case
and publish the new marker while preserving original recovery bytes.

Private E4 development canon/CLI checkpoints are not published releases or
production qualification. Their exact local delivery evidence belongs to the
SPC-014 E4 campaign; no global installation is required by these fixtures.
