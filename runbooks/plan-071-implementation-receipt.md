# Plan 071 implementation receipt

## Implementation and review

Profile@2 exposes optional provider-neutral semantic decisions and `stop_after`.
The first shared compact HITL consumer supports OpenRouter JEV and OpenAI
Decisions; the same native fallback profile remains authoritative. No Subject
harness/model special case, SDK dependency, product change or engine release.
Old profile@1, JEV route@1 and qualification keys retain their semantics.

New HTTP observations bind exact packet, fixture, EVAL, execution generation,
request, policy and dependency hashes. Cancellation never enters fallback;
unknown paid outcomes never resample. Two bounded transient retries use retained
backoff; low-confidence/refusal/unavailability uses native Judge directly.
Native children lose both decision secrets, while the detached owner retains
only the selected one. HTTP evidence never invents a native Session/cleanup.

Bounded completion reuses the engine stop target and requires capture/settlement.
It records `finished`, explicit scope and done/skipped outcome without claiming
full E2E PASS. Report@4 and candidate@3 preserve strict old schemas; candidate@3
is necessary because candidate@2 forbids the new completion-scope field.

Independent review found and fixed: undefined cancellation signal for canonical
callers; insufficient pre-publication packet/fixture/generation binding; invalid
relative JSON-schema references; scored stop target leaking into canonical
qualification; terminal publication preceding current Judge cleanup validation.

## Verification

Targeted shared routing, provider lifecycle, retained evidence, completion,
controller fork and storage checks: **48 PASS, zero failures/skips**.
They include real fake-engine managed stop captures (done and skipped), no
successor dispatch, finished resume rejection, canonical HTTP issuance/replay,
native qualification-key stability, and both plugin codecs. No paid calls.
`git diff --check` passed.

Full paired regression on the committed tree: **675 PASS, zero failures,
skips or cancellations**, 544.3 seconds. Command: `node --test
--test-concurrency=1`, with `DD_FLOW_SOURCE_ROOT` naming dd-flow-cli and both
`DD_EVAL_TEST_FLOW_CLI` / `DD_EVAL_TEST_OPERATIONAL_RUNTIME` naming the immutable
checkpoint engine beta.125 captured by CP-199. The first run used the unrelated
source checkout's CLI and encountered its missing local `semver` dependency;
it is not a regression result for the pinned engine. No dependencies or source
files in that checkout were modified.

Final independent read-only review found no blocking findings; its supplemental
completion/routing/fork checks passed **27/27**, zero skips.

Native compact Judge qualification key
`16ffa91a7a836d3c9dae4e7ff895d82ed3fb05ce19f0a091822fcb8ed96e61f3`
passed through the normal `runner definition qualify` entrypoint: **41 reused
cases, zero native calls**. Twenty negative observations received separate
hash-bound semantic review sidecars after main-agent and independent review of
the original questions, verdicts and source contexts. Original native outcomes
were not rewritten and no repeated calls were made to obtain PASS.

Implementation commit: `d6ccdb4`, pushed to `feat/071-semantic-decisions`;
integration PR: [#57](https://github.com/deksden-com/dd-eval/pull/57).

Operational acceptance is separate: three sequential
SPECIFY-only profiles use Subject gpt-6-luna/xhigh, Interaction Judge
gpt-6.1-sol/high, threshold 0.93, max_retries 2, Final Judge disabled.
Normal preflight must admit the native fallback before any scored run.
No live speed or classifier-accuracy claim is made by this receipt.
