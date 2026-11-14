# Working on this extension

CLAUDE.md says what this extension is and what is true only of it; this file and the
other rules here say what holds for any GNOME Shell extension worked on this way. When
they disagree, CLAUDE.md is the more specific and wins; fix whichever is wrong.

## The stack

- GJS with ES modules, GNOME Shell 51. `metadata.json` claims `["51"]`, the version it
  has been run on. A version is claimed only once it has been booted, per major version
  ("GNOME Shell 51"; a point release a doc mentions is not policed), and `main` claims
  only what it boots on: users of an older shell keep the last release made for it, and
  no code detects versions.
- Two processes, two toolkits. `extension.js` and everything it imports run **inside the
  compositor**: St, Clutter, Meta, Shell, `resource:///org/gnome/shell/…`. `prefs.js` runs
  in the Extensions app's process: Gtk 4 and libadwaita, never St, Clutter, Meta, Shell
  or `ui/`. A module both sides import imports neither (Gio, GLib and its own pure code
  only). A shell import reached from `prefs.js` fails only when the preferences open.
- `src/` is exactly what ships: `make pack` zips it into `dist/<uuid>.shell-extension.zip`
  and `make install` copies it, both as far as `./scripts/ext.conf`'s `EXT_SHIP` says.
  `make link` installs a directory of links into `src/` whose entry point is
  `./scripts/dev-extension.js`, which stages `lib/` afresh per edit, under a directory of
  the running shell's own, so `reload` picks up edits and one shell never deletes
  another's stage.
- The tooling: `./scripts/dev.sh` for the extension (link, install, reload, logs, pack,
  check, status), `./scripts/nested.sh` for the nested shell, and the make targets in
  `./scripts/common.mk`, which the Makefile includes. What is particular to this
  extension is `./scripts/ext.conf` (its UUID, name, log prefix, what ships, its checks,
  the tools its scripts use) and its own commands and hooks in `./scripts/dev.d/` and
  `./scripts/nested.d/`.
- Settings are a GSettings schema in `src/schemas/`, `org.gnome.shell.extensions.<name>`.
  `glib-compile-schemas --strict` must pass: an install compiles it that way.

## Never the user's session

The user's desktop is the one they are working in. Everything is tried in a **nested
shell**: a second, headless GNOME Shell with its own session bus, mirrored live on the
desktop (`.claude/rules/live-session.md`; the `nested-shell` skill to drive it). Never
reload, restart or enable anything in the real session to test a change, never write the
user's dconf for a test, and never touch another repository's nested shell. The nested
shell keeps settings of its own and is stopped by the SessionEnd hook if the session ends
first; stop it yourself when the work is done. Shots, logs and anything else scratch go
in the repository's own folder of the scratchpad (`<scratchpad>/<repo>/`): sessions and
agents running side by side share the scratchpad, and overwrite generic names.

## Style

- `make lint` is ESLint with gjs.guide's configuration (`eslint.config.mjs`). No errors,
  and no new warnings.
- 4-space indents, `const` and `let`, `console.*` for logging behind the extension's own
  `[Name]` prefix, which `make logs` filters on (`make logs SINCE='5 min ago'` for a
  window). The shipped code logs failures only.
- Comments describe the code as it is: no phase numbers, review IDs, plans or history.
  History is git's.
- Only the code that is needed, and comments only for the why
  (`.claude/rules/simplicity.md`): extensions.gnome.org rejects code that reads as
  generated. `make check` ends with `./scripts/dev.sh size`: the lines, comment share and
  `try` count of `src/`.
- GObject type names, CSS classes, settings paths, cache and runtime directories are
  global to the shell: the extension prefixes its own (`.claude/rules/gjs-st.md`).
- Private shell API (an underscore field, an unexported class) is listed where the repo
  keeps that list (`docs/private-api.md` or CLAUDE.md), with what breaks when it moves.

## Landing a change

`main` is protected: no direct push, from anyone. The required check is the `make check`
job in `.github/workflows/ci.yml`.

1. **An issue first**, for anything but a trivial fix (a typo, a comment). Separate
   problems are separate issues and separate pull requests.
2. **A branch per issue**, named for it (`fix/…`, `feat/…`, `docs/…`).
3. **`make check`** passes on the branch: ESLint, plus whatever the repo checks without a
   shell (schemas, imports, parsers, shaders). A visible change is also seen in the nested
   shell, before and after, and an enable-path change survives a nested `stop` + `start`.
4. **Push, open the pull request** with "Fixes #N" and how it was verified
   (`.github/pull_request_template.md`).
5. **Wait for CI to go green**, fix what it finds, then
   `gh pr merge --squash --delete-branch`. No approving review is required, so a session
   merges its own.
6. **Check main's CI run** after the merge, and pull main locally.

"Fix this" or "implement this" authorises the whole loop: carry it through to the merge
without stopping to ask. Ask first only for what reaches outside the repo and the nested
shell: the user's real session or settings, a real launch, an online scan with real keys,
a release (the `release` skill).

A change that makes a line in CLAUDE.md, a `.claude/rules/` file, a skill or `docs/`
wrong fixes that line in the same pull request.

## Where things are kept

- `CLAUDE.md`, at most 200 lines: what the extension is, its layout, how its parts fit,
  its design rules and the traps that are its alone.
- `.claude/rules/<area>.md` with `paths:` frontmatter, for an area's detail that only
  matters while its files are open.
- `.claude/skills/drive-extension/SKILL.md`: what this extension looks like in the nested
  shell (coordinates, its own commands and fixtures, what must never be pressed). The
  generic driving is the `nested-shell` skill; the drive skill does not repeat it.
- The other skills in `.claude/skills/`: `fix-bug`, `review-pass`, `nested-shell`,
  `release`, `screenshots` (published shots, stand-in data only), `ego-review` (the
  extensions.gnome.org review, before any upload), `port-shell-version`, `hig-polish`,
  `readme` (the README skeleton and the GitHub page), `simplify-pass` (code down to the
  simplicity rule, behaviour proven unchanged).
- `.claude/commands/` (`/logs`, `/reload`, `/status`, `/preview`, …).
- `.claude/settings.json`: the SessionEnd hook that stops the nested shell.

A release is a pushed `v*` tag: the `Release` workflow builds the zip and the GitHub
release, whose notes are the changelog. Release tags are protected and never move.
