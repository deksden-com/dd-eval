# CP-240 release preparation

Engine `0.9.0-beta.145`, commit/tag `52851c6a5c8419e93b543fd6a53e71f9aa359d9f` /
`v0.9.0-beta.145`. Full local release profile passed, including integration
3269/3269 and runtime-sensitive 52/52; no GitHub CI. Registry tarball SHA256:
`0b0ca0dfb57894366d206f4bfe97df82a25ebf02af659de7c4f81a688368dcf1`.
Checkpoint stores the separate installed-engine checksum. Canon: 4.1.2 /
`51f7d7155f578e877e4db5c3d022772084ecea5a`.

Product baseline and project flow pack are unchanged. The V3 matrix qualification
comes from the installed public package's actual PLAN/CODE/MERGE lifecycle,
including published owning Stage packets; it is not a rebound historical proof.
Global CLI and both shared Codex hook homes are refreshed. Nonparticipating hook
checks pass with minimal PATH; a missing explicit pin refuses without fallback.
Unrelated handlers, symlink topology and historical EVAL runtimes are preserved.

Five fresh homes: `~/.dd-eval/qualification/cp-240-<harness>-full`.
Use isolated PostgreSQL on loopback 55439; never touch another project's 55433.
Follow [execute-eval.md](execute-eval.md) for registry retirement, preflight and
per-workspace baseline. Preparation is not launch or completed E2E acceptance.

Full profiles preserve the previous common campaign: OpenCode/ZCode
GLM-5.3-Flash/max, AGY Gemini-3.8-Flash/high, Codex Luna/xhigh and Grok-4.7/high.
Interaction and Final Judges use gpt-6.1-sol/high. Classic Judge policy, no
`semantic_decisions` and no `stop_after`; separate Decisions experiments remain
unchanged. AGY 1.4.4 and Grok 1.0.66 changed native contracts passed compatibility;
capacity is conservatively 1. AGY child `settled_by_root` is not Work success,
and its model-attribution limitation remains recorded in the profile.
