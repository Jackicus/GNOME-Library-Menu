# The user's session, and the nested shell

The user works in the real GNOME session while the extensions are developed. Everything a
test does happens in a nested shell or not at all.

- **Nested shell only.** `./scripts/nested.sh start` runs a complete second GNOME Shell,
  headless, with its own session bus and virtual monitor, reading the same installed
  extensions. An exception in `enable()` takes down the nested shell, never the user's.
  `start` opens a live mirror window on the real desktop (a PipeWire screencast) so the
  user can watch: two people are looking, you through screenshots and the user through
  the mirror.
- **Stop it when done**, a failed check included: `./scripts/nested.sh stop` (`make
  nested-stop`) closes the mirror, the shell, its bus and every process it started, and
  says whether anything survived; read that line. The SessionEnd hook and the idle timeout
  are backstops for accidents, not the plan.
- **Never touch another repository's nested shell.** Several can run at once, one per
  repository, each with its own Wayland display and `$XDG_RUNTIME_DIR/<name>-nested/` run
  directory. Never stop, kill or `pkill` one but this repository's.
- **Never `pkill -f`** a pattern that appears in your own command line, the real
  session's processes or another nested shell's. Kill by pid, or through the nested
  shell's own commands.
- **Its settings are its own.** GSettings in the nested session is the keyfile backend in
  an `XDG_CONFIG_HOME` of its own (`~/.local/state/gnome-extensions-nested/<slug>/`), kept
  between starts; `start --clean` resets it to this extension alone and the real session's
  look. Nothing of the nested session opens the user's dconf, so `./scripts/nested.sh run
  timeout 5 gsettings …` is always safe. Plain `gsettings` outside `run` is the user's real
  database: never for a test. A repository that has no `./scripts/ext.conf` yet still runs
  its own older scripts, whose plain `start` shares the real dconf: there, always
  `--clean`.
- **Real side effects stay real.** A launch from the nested shell (Play, Show in Files,
  `xdg-open steam://…`) reaches the user's machine; an online scan with `--from-settings`
  reads the user's real API keys and goes to the network; a virtual pad from uinput is a
  device for the whole machine; the "Allow inhibiting shortcuts" answer is written to the
  real permission store. Do none of these to test unless the task asks, and undo what you
  did.
- **Secrets.** API keys and tokens live in dconf or in other tools' files in plain text.
  Never log them, print them, put them on a command line or paste them into the
  conversation.
- **Public repositories.** Nothing of the user's real data goes into a commit: no library
  titles, account names, paths of their files, or screenshots of their own collection.
  Committed screenshots are of `start --stand-in` nested shells only (the
  `screenshots` skill).
- **`Eval` is off** in the nested shell. Drive it with input, screenshots and D-Bus, as a
  user would. Screenshots and banners borrow `org.gnome.SettingsDaemon.MediaKeys` on the
  throwaway bus because the shell refuses unknown callers; never try that on the real bus.
- **The real session is the user's to restart.** A new UUID, an edit to
  `./scripts/dev-extension.js` or `metadata.json`, needs a logout in the real session: say
  so, never log anyone out. The nested shell picks them up with `stop` + `start`.
