# REV-020 rejection

The SPECIFY entry snapshot itself is intact, but the moving canonical Subject
silently introduced a priority-write exception for archived projects. The
active product policy says archived projects are read-only for task mutations;
the supplied intake did not authorize an exception. No downstream REV-020
checkpoint is accepted. The revision is diagnostic history only.
