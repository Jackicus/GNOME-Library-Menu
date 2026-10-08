---
description: Apply src/ edits to Library in the nested shell and check for errors
allowed-tools: Bash(./scripts/nested.sh status), Bash(./scripts/nested.sh start:*), Bash(./scripts/nested.sh reload), Bash(./scripts/nested.sh logs:*), Bash(./scripts/nested.sh mirror:*), Bash(./scripts/nested.sh stop)
---

Apply the current `src/` edits to Library in this repository's **nested
shell**, then confirm they took. Never the user's own session: `make reload` and
`./scripts/dev.sh reload` disable and enable the extension on the real desktop,
which is the user's to do.

1. `./scripts/nested.sh status`.
   - **Not running:** `./scripts/nested.sh start` (add `--stand-in` for a library
     to look at: the made-up one, since a plain start reads the user's own cache,
     and an empty section shows only its placeholder). A fresh start loads the
     current `src/`, so Library is ACTIVE with the edits when it returns;
     skip step 2.
   - **Running:** go on. Its settings are its own whichever way it was started.
2. `./scripts/nested.sh reload`. It waits for ACTIVE.
3. `./scripts/nested.sh logs 40` and report whether it came up clean. A healthy
   reload logs `[Library Menu] Enabled from
   $XDG_RUNTIME_DIR/library-menu/shell-<pid>/lib-<checksum>` (a new checksum when
   `lib/` changed); `[Library Menu] Rebuilt` follows a rescan or a setting's change.
   Anything with `Failed to load`, `Error during disable`, or a JS stack trace
   under a `[Library Menu]` line is a real failure: quote it and say which file
   it points at.

How to see it: the mirror window on the desktop shows the nested shell live
(`./scripts/nested.sh mirror on` if `status` says it is closed); the library
opens from its button beside Show Apps, so `/preview` (or the `drive-extension`
skill) opens it and screenshots it. Leave the nested shell running for that, and
stop it (`./scripts/nested.sh stop`) when the work is done. Never press what the
`drive-extension` skill's "Never press" lists.
