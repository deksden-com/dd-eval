# CP188 launch observation — 2026-09-30 12:54 UTC

Two new scored full E2Es launched; AGY is blocked before scored launch.
No heartbeat was created. Grok remains excluded until October 2.

## Frozen inputs

- Engine: published `0.9.0-beta.123`, CLI commit `0d75e9e7e18868fbe9eee8d51e4c4d06ab03a8cd`.
- Canon: `bbb3845083d7c1984bb61d813dd6700fe695180a`, version 4.1.2.
- Flow pack: `e23f32d0e199794af8e0b9ad211a8d83027275f6`.
- Product source remains `d81cd0acd589a35789aec4c5291ffb5a6efd2d4e`.
- Definition: `a7f1acf53e94388ffdb73163b014bba4cbb5e13f`, tree `bb56b54ad6ef5574bd06019dfa54d7dfca3806d5`.
- Installed engine snapshot checksum: `a7d62a3b522498c728789cfa8eee31e10df398ca742c98ddc2014d04f57a6ff1`.
- Release CI `36712741009`: all jobs passed, publication verified.
- Matrix qualification @2: four owning Stage publications passed.
- HITL definition qualification: six cases passed, key `d306caea7b5d0d34d13eccc2cbc50aa1dc75ef08ecbbbe106677ccbc088cc99f`.
- Final and Interaction Judges: `gpt-6-sol/high`; Codex uses `cx` and `.codex-cpa`.

## Luna

Home: `/Users/deksden/.dd-eval/qualification/cp-188-luna`.
EVAL: `EVAL-20260930124453-85fe1ce6`.
Baseline passed all four checks at `12:47:37Z`.
Actual RUN stage SPECIFY attached at `12:48:40Z`.
Native Session: `01a0f25b-6f79-7b41-917e-a93295a95f25`.
Provider prompt active, current native events observed, controller and observer alive.
This proves startup, not full-cycle completion or quality acceptance.

## ZCode

Home: `/Users/deksden/.dd-eval/qualification/cp-188-zcode`.
EVAL: `EVAL-20260930124831-90499313`.
Launched only after Luna's own baseline PASS; no baseline receipt was reused.
Baseline passed all four checks at `12:51:56Z`.
Actual RUN stage SPECIFY attached at `12:53:19Z`.
Native Session: `sess_a2cf1bc8-7340-482b-a46a-6aa0366659e2`.
Prompt dispatched; native session/update events continued at `12:54:03Z`.
Controller, daemon and observer alive. This is startup, not completion.

## AGY — qualification blocker, no scored EVAL

Preflight observed a native update from qualified 1.2.13 to 1.2.14.
The live definition checkout was left unchanged. Compatibility qualification
was attempted from this separate report checkout using the current native binary.
The provider rejected Session creation:

`agy_provider_rejected: Eligibility check failed: Your current account is not eligible for Antigravity, because it is not currently available in your location.`

Native receipt: empty conversation ID, zero turns and zero tokens. No child
Session started. The secondary cleanup receipt reports an absent daemon socket
(`connect ENOENT`); a read-only process inventory found no remaining CP188 AGY
adapter processes. This is not a product defect or model overload.

Evidence:
`/Users/deksden/.dd-eval/qualification/cp-188-agy/conformance/native-subagents/20260930124708359/antigravity-cli-google-gemini-3-1-pro-high/capacity.json`.

AGY was not forced past the qualification gate, retried or substituted.
After access is restored, qualify the current native tuple and capacity,
commit its profile in a separate definition, qualify that definition's HITL,
run preflight, then create a fresh scored AGY E2E. Do not modify the running
Luna/ZCode definition or their runtime artifacts.
