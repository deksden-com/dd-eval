---
file: 'beta/vnext-specify-beta.8/index.md'
description: 'Beta 8: make the canonical SPECIFY applicability matrix mandatory.'
status: 'READY_FOR_EVAL'
---

# vNext SPECIFY beta 8

Engine: `dd-flow-cli@0.8.0-beta.7`  
Flow pack: `3.2.0-vnext-specify-beta.8`

The semantic contract from beta 7 remains. Beta 8 makes all nine canonical
requirements-analysis method rows mandatory and validates their exact set. A
method can still be `not_applicable`; its file is read only for `light` or
`full`.
