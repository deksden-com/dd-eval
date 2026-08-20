# REV-021 rejection

The canonical Subject received the user-level trigger before its isolated
runtime command was supplied. It invoked a global CLI, allocated the wrong
RUN, and then paused that unrelated RUN. No REV-021 checkpoint was captured
or accepted. REV-022 starts from a clean project/runtime pair and sends the
bound stage command only after the SPECIFY-entry snapshot.
