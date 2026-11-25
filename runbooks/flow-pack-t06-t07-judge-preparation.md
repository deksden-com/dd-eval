# T06/T07 Judge preparation

On dd-eval `0368653142d7441caf08f60ed4d2344add43850f`, based on
`cdb3d810c902fdb2b6ff11d6318362abb59cd083` with T02 cherry-picked as
`5b9a8a91e9312f7175a335f8768267c00f67f9ff`:

```text
node --test --test-concurrency=1 test/judge-profile-contract.test.mjs test/judge-cleanup-legacy.test.mjs
  6 passed, 0 failed, 0 skipped
node --test --test-concurrency=1 --test-name-pattern='HITL qualification binds Judge task evidence' test/eval.test.mjs
  1 passed, 0 failed, 0 skipped
```

These are deterministic contracts for new Judge turn observations, tampering,
legacy receipt reading and retained HITL evidence. They do not exercise a live
provider, either Judge channel, an installed engine, preflight, a real world,
an E2E or fork. No new qualification or readiness is claimed. Model and
reasoning in a new receipt are adapter-observed session settings after the Turn;
they cannot prove undisclosed provider routing. Missing or differing observations
remain `unknown` or `mismatched` and cannot establish the requested settings.

B01 and T05 remain unaccepted. T06 must use their accepted artifacts and T07
requires accepted T06. No paid operation or database was started for these checks.

## Bounded stop and continuation candidate

The separate `bounded-plan-review-luna-xhigh-sol-6-2-xhigh` profile uses the
same Subject and Interaction Judge as T02, stops after PLAN-REVIEW and does not
request another Final Judge. After accepted T06, preflight and a bounded run
must use the accepted checkpoint and engine, then retain the published stop and
its source RUN evidence. To explicitly request a derived execution through CODE,
use `runner fork` with `--through code` and the exact engine and request IDs;
the ready response supplies its corresponding `--start true` command. The
fork checks the stopped controller, successful stage and exact published
snapshot, and refuses a newly needed, previously unadmitted profile. A later
target needs its own admissible assessment scope when Final Judge is enabled.

On dd-eval `989e480b4e6f9e695975bf02c80d7b6f69448adb`, the two scoped
commands below passed, without failures or skips:

```text
node --test --test-concurrency=1 --test-name-pattern='bounded fork extends|flow-pack bounded profile' test/execution-contract.test.mjs
  2 passed
node --test --test-concurrency=1 --test-name-pattern='fork inherits pins, crosses a boundary and finalizes through ordinary EVAL exactly once' test/runner-fork.test.mjs
  1 passed
```

The first command checks bounded selection, profile validation and rejection
of foreign boundaries or unadmitted profiles. The second exercises the
pre-existing legacy fork path; it does not exercise the new `--through` path.
The pack snapshot gate remains closed until K04 provides verified authority.
Neither these checks nor the earlier seven establish a real pack fork, a live
bounded run, an installed-pair preflight or Judge qualification. B01 and T05
remain unaccepted; there were no model calls or databases in these checks.

## Public Stage fork bridge

The later bounded continuation verifies the source controller, capture operation,
boundary key, snapshot digest and completed stop before calling the pinned
public `dd-flow run fork`. It then reads the public `dd-flow/run-fork@1`
receipt, `dd-flow/run-fork-lineage@1`, completed import guard and target RUN
status, checks their source/target identities, and retains their digests in
`public-fork-authority.json`. It repeats the target checks before dispatch and
does not require the source snapshot to remain present after publication. An
unconfirmed interrupted bounded import is retained for inspection, not erased.
Stage `@14` is recognized structurally; the selected engine still owns full
resource and payload validation. Assessment-only Stage evidence cannot be
restored, and listing labels it accordingly.

CLI candidate `d64373b3` defines the `@19` accepted PLAN-REVIEW → CODE
Stage snapshot and a separate `dd-flow/stage-publication@1` export. The eval
candidate reads this particular format, obtains the original publication via
the pinned source CLI or accepts its independently retained exact bytes and
digest, and supplies it with the exact engine checksum to public fork. It binds
the target guard, lineage, retained source, publication, engine and exact visit
before dispatch. Older assessment-only pack snapshots remain rejected. Work
snapshot `@4` is a different contract and does not authorize a Stage fork.
This is an integration candidate: CLI K04 and the installed pair are not yet
accepted, and no live `@19` end-to-end fork has been demonstrated here.

On product commit `d554fd2e5ff5ba1569bf06eb72ad017647bf8086`, the scoped
checks below passed without failures, cancellations or skips:

```text
node --test --test-concurrency=1 test/snapshot-version.test.mjs
  5 passed
node --test --test-concurrency=1 --test-name-pattern='bounded public fork requires|fork rejects unsupported and incomplete Stage manifests|pack.*assessment' test/runner-fork.test.mjs
  2 passed
node --test --test-concurrency=1 --test-name-pattern='bounded fork extends|flow-pack bounded profile' test/execution-contract.test.mjs
  2 passed
node --test --test-concurrency=1 --test-name-pattern='rejects pack snapshot before using contour as accepted history' test/runner-fork.test.mjs
  1 passed
```

An additional test added after that commit used the pattern `assessment-only
Stage snapshot is visible` in `test/runner-fork.test.mjs`: 1 passed, 0 failed
or skipped. It confirms listing marks assessment-only and the public eval fork
rejects it before creating output. These are isolated synthetic contract checks;
they do not establish a K04 pack Stage fork, a live bounded `--through` chain,
preflight on the installed pair, or provider qualification.

The later `@19` reader, publication path, pack visit handling and target checks
were developed after these checks; their targeted tests have not yet run.
