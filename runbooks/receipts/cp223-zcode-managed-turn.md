# CP223: delivery of the managed native-turn fix

2026-10-12. CP222 failed on PLAN because its selected bridge 91a1470 inferred
end_turn after a frozen read watermark and 120s of protocol silence. The next
native model request was still unconfirmed. The already-reviewed fix 636b141
was absent from the installed package and profile.

Selected immutable bridge: zcode-acp-server 0.46.7, source
636b14181d5c9a95476055079836fd6b58169f58, dd-zcode-harness@2.
Artifact: `/Users/deksden/.dd-eval/qualification/cp-223-bridge-candidate/zcode-acp-server-0.46.7.tgz`.
SHA256: c562bcd000bbb1d5f60e21d028f67c51d7b12ee1f900b3dfd2a795e4d4da04c7.
Installed code fingerprint: 2ad2ce92a5e471529f730b7c73a536b0dfb6250dd6740aea55e97673e0d9ee76 (88 files).
Global launcher `/Users/deksden/Library/pnpm/zcode-acp` readback confirms the
exact commit and contract. This is our downstream artifact, not unmodified npm
upstream. Native ZCode remains 0.16.9. Retained CP222 is unchanged.

The initial package-manager update failed because the old global dependency
pointed to a deleted /tmp archive. Removed only the old zcode-acp-server
dependency, then installed from the persistent artifact above; other global
dependencies were preserved. No live ZCode eval process used that launcher
at replacement time.

Regression added on current fork main in PR7: >10 minutes of reasoning with
frozen counters, completed TodoWrite, then >120 seconds of silence during the
next native request. Require no inferred completion, stop or resend; then
complete via real turn.completed. Typecheck/build/lint and affected 51 tests
PASS. Exact scenario also passes against selected 636b141 source. A temporary
copied test initially used the wrong closeSession import; corrected, then all
31 affected candidate tests PASS. That test-only failure is not runtime evidence.

Native capacity receipt:
`/Users/deksden/.dd-eval/qualification/cp-223-zcode-decisions-full/conformance/native-subagents/20261012042135899/zcode-acp-zai-glm-5-3-flash-max/capacity.json`.
SHA256 b1ccd68795cd3605586825d8b3386f3300a77ee8e30c562b87462e75e27ae543.
15 requested, 15 started, 15 completed, zero failed/cancelled. Physical cleanup
settled. Doctor compatibility: already_qualified, observed exact selected tuple.

Keep existing CP222 checkpoint and engine beta.130/source09c3a78/content checksum
0f830868453106ca108e9739e4e789cd562297f062a98ebd0c05454aec5deaf4:
only the bridge profile changed. The beta.130 engine is a local candidate, not
a newly published official release. Do not repeat Judge semantic qualification
for this bridge-only change. Full run: ZCode GLM-5.3-Flash/max, OpenAI gpt-6-luna
Decisions threshold0.7/retries2, Judge gpt-6.1-sol/high, no stop_after.

Source regression integration and installed bridge identity are deliberately
different: test-only PR7 preserves regression on the newer 0.52.0 fork; its
merge does not promote that unqualified upgrade. The scored run uses the
already admitted 0.46.7 fix. Completion of capacity is not E2E acceptance.
