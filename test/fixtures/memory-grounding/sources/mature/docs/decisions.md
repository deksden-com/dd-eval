# Accepted local policy
A caller owns file placement and backups. A single writer per file is required. Corrupt JSON is a visible read failure, not automatically repaired. Changing the event format requires a migration decision; no migration utility exists. CI and deployment targets have not been chosen.
