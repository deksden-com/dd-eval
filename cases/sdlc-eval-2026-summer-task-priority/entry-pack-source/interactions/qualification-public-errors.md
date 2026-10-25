# Frozen existing project error rules

Normative excerpts from the CP254 project, not additional feature requirements.

From .memory-bank/spec/system/index.md:
Public errors имеют стабильные `code`/`message`; unexpected internals не
выдаются клиенту.

From .memory-bank/spec/engineering/coding-standards.md:
- Preserve the structured public error contract and safe `404` behavior. Do
  not expose resource existence across workspace boundaries.
