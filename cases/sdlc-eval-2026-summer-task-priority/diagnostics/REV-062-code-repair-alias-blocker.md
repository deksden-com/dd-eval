---
revision: 'REV-062'
status: 'blocked'
scope: 'code'
---

# CODE repair alias blocker

The accepted PLAN used `@check/db-migrate-local`. The shared check runner
correctly resolved that alias to `pnpm db:migrate ...` in aggregate receipt
`RCP-008`. `work repair add` then incorrectly copied the receipt command into
the successor Work packet. The next `work finish` correctly rejected it as
`raw_code_check_forbidden` before rerunning project checks.

The product repair was not the cause: the successor independently observed
passing quality, browser and DB checks. The failure is an engine projection
defect at the receipt-to-repair boundary. Engine beta.119 resolves the failed
declaration by `declaration_id`, preserves its accepted alias in the packet,
and has an end-to-end regression test covering aggregate failure, repair and
accepted finish.

REV-062 is retained as diagnostic evidence only. It is not used as a
canonical checkpoint source for the next pair.
