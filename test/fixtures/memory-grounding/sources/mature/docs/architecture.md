# Current architecture
The library uses asynchronous Node filesystem calls. Events are newline-delimited JSON in a caller-selected local file. No HTTP endpoints, authentication, concurrent-writer locking or remote replication exist. Event identifiers are checked, but amount values are not validated.
