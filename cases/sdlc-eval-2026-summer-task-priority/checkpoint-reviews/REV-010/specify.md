# REV-010 / SPECIFY entry

Accepted as the canonical entry for SPECIFY.

- Canonical Subject: `01a018f2-55ce-76e3-95d1-db3402cfb8b9` (Luna/xhigh).
- Frozen child: `01a018f3-941e-7383-ba97-e1d01b9f29fe`; it is idle and received no stage message.
- RUN: `RUN-001-task-priority`, status `running`, next action `start_specify`.
- The run has no stage records or child Work. The dedicated `DD_FLOW_HOME` contains only this canonical RUN and its exact beta.64 engine snapshot.
- The project checkout is the immutable `eval-flow-vnext-plan-review-beta.65` tag at `a5f156939a260412bf299966a144d8cf21ae5781`.

The checkpoint contains priming only. The ordinary task message is supplied by
the SPECIFY start packet after a routine evaluated Subject has forked its
starter Session; no eval or Judge material is present in either Subject Session.
