# REV-019 rejection

REV-019 is diagnostic only. During the first real SPECIFY completion its
generated finish command omitted the non-default `DD_FLOW_HOME`, so it could
not address the canonical RUN. The Subject recovered manually, but this is a
runtime contract defect. No REV-019 checkpoint is accepted or used as an eval
starter.
