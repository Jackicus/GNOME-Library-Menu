---
name: nested-shell
description: Drive a GNOME Shell extension in a throwaway nested GNOME Shell, mirrored live on the user's desktop - start it, reload into it, click, press keys, screenshot regions, read the PNGs, read its logs, then stop it. Use whenever a change to an extension must be SEEN (layout, colour, spacing, motion end-states, the preferences window) or needs a fresh shell start (extension.js, metadata.json, the schema, a new UUID). Read the repository's own drive-extension skill too, for its coordinates and commands.
argument-hint: "[what to show or check]"
---

What to check: $ARGUMENTS

The extension draws into the shell, not into a window, so a visual change is verified only
by looking at it. This is the generic loop; the repository's
`.claude/skills/drive-extension/SKILL.md` adds where things are on its screen, its own
commands (a player, a virtual pad, demo data) and what must never be pressed. Read both
before the first `start`. The rules in `.claude/rules/live-session.md` hold throughout.

`./scripts/nested.sh help`
lists it with this repository's own commands (from `./scripts/nested.d/`). A repository
without `./scripts/ext.conf` still runs its own older script: its CLAUDE.md says how it
differs.

**Not from a git worktree.** A worktree of the extension has the main checkout's UUID, so
its install and its nested shell: there `nested.sh` (and `dev.sh link`, `install`,
`reload`, `uninstall`) refuse and name the main checkout. Try the change there.

## The loop

```bash
S=<your scratchpad>/<repository>          # shots go there, never into the repository; a folder
                                          # per repository, since sessions and agents share it
./scripts/nested.sh start                 # ~2 s; the extension is ACTIVE when it returns
./scripts/nested.sh do "say Baseline" "shot $S/before.png"
# … edit src/ …
./scripts/nested.sh reload
./scripts/nested.sh do "say After the change" "shot $S/after.png"
./scripts/nested.sh stop                  # closes the mirror; read its last line
```

Then **Read the PNGs** and say what actually differs. If nothing visibly changed, say so;
never assume an edit worked.

- **`start`** reuses a running shell. Its settings are its own (only this extension
  enabled, the user's look copied in), kept between starts; `--clean` resets them.
  `--headless` skips the mirror; `--monitors N` puts N monitors side by side; `WxH` sets
  each (default 1600x900); `--stand-in` runs it over stand-in data, for shots that are
  kept (below).
- **`reload`** recompiles the schema and disables and enables the extension inside the
  nested shell (under `--stand-in`, after copying `src/` again). It does not re-read
  `extension.js` or `metadata.json`: those need `stop` + `start`.
- **`stop` + `start` at least once before calling a change done.** Only a fresh start runs
  the enable path and the first frame as a login does.
- **It stops itself** after 10 minutes with no `nested.sh` command (`NESTED_IDLE=<seconds>`
  at `start`, `0` = never), a backstop, not the plan.
- **It runs the link's entry point**, `./scripts/dev-extension.js`. To try the shipped
  `src/extension.js` (which logs nothing on success), point the installed `extension.js`
  link at it for one `start`, then point it back.

## One call per interaction: `do`

`do` runs its steps over one connection and input session and stops at the first that
fails, so a whole walkthrough is one tool call.

| Step | Does |
|---|---|
| `say TEXT` | A banner in the nested shell (≤ ~40 characters, no apostrophes: steps are shell-split). One before every step the user should follow. |
| `click X Y` / `move X Y` | Click or hover at desktop coordinates. |
| `scroll X Y up\|down [N]` | N wheel notches with the pointer there. |
| `key KEYSYM` | `Escape`, `Return`, arrows, `F1`–`F12`, one character, or a chord (`Super+Page_Down`). |
| `wait SECS` | Let something land: ~1 s after the overview opens or closes, ~0.6 s after a pop-up. |
| `shot [FILE [X Y W H]]` | A screenshot, or only a region: crop to what is being judged. |
| `window FILE` | The focused window alone (the preferences). |
| `overview on\|off` | Show or hide the overview; a `shot` or `click` outside `overview on` dismisses it. |

The same steps exist as single commands for a one-off. Also: `status`, `logs [N] [--all]`,
`mirror on|off`, `run CMD…` (against the nested bus and displays, never the real ones).

- **Keep a keyboard walk in one `do`**: each `do` makes a fresh virtual keyboard.
- **Never click or hover at the top-left**: the Activities hot corner.
- **A screen-sharing indicator in the top bar** is the input session's screencast, not a
  bug. Crop it off shots that are kept.
- **The preferences**: `./scripts/nested.sh run gnome-extensions prefs <uuid>` opens them
  inside the nested session. The Extensions app keeps the `prefs.js` it first imported;
  after an edit, close the nested one before reopening, by its pid: the process is
  `gjs`, so find the one whose environment names this repository's nested Wayland
  display (`/proc/<pid>/environ`) and `kill <pid>`. Never by name: `pkill`, `pkill -x`
  and `killall` reach the whole machine, through `nested.sh run` too.
- **Settings**: `./scripts/nested.sh run timeout 5 gsettings --schemadir src/schemas set
  org.gnome.shell.extensions.<name> KEY VALUE` changes the nested session's own settings
  at once, never the user's (`live-session.md`).

## When it looks wrong

`./scripts/nested.sh logs` first: a JS exception in `enable()` leaves the previous UI up
and reads as "no change". `logs 200 --all` shows the D-Bus and portal chatter too. Lines
with the extension's `[Name]` prefix are its own.

**A JS ERROR removing `gnome-shell-disable-extensions` is harmless.** Every shell, the
real one and each nested one, creates `$XDG_RUNTIME_DIR/gnome-shell-disable-extensions`
at startup and deletes it 60 s later or at shutdown (`js/ui/extensionSystem.js`). They
share the runtime directory, so with two nested shells up, or a stop inside the 60 s,
one finds it already gone and logs the error. The file only arms the real session's
crash fallback; nothing of the extension is wrong. A runtime directory of its own would
also move the Wayland socket, Xwayland's auth and PipeWire, which the mirror needs.

If the mirror will not open (it needs GStreamer's PipeWire plugin), use `--headless` and
screenshots, and tell the user.

**Headless without the mirror never paints** but for a screenshot: with nothing consuming
frames the compositor does not draw, so a CPU or GPU reading under `--headless` measures
nothing. Measure with the mirror on; it adds a constant screencast cost, so compare
readings with each other, not with zero.

## Screenshots that are kept

`docs/screenshots/` images are taken under `start --stand-in`, never of the user's own
collection, accounts or files: the `screenshots` skill.

## Finishing

`./scripts/nested.sh stop` when the task is done or abandoned. Report what was checked,
which shots show it (paths in the scratchpad), and anything that looked wrong.
