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

The pack snapshot gate remains closed until K04 provides verified authority.
This candidate does not establish that a pack fork or this profile has run;
the earlier seven passing checks predate this continuation change.
