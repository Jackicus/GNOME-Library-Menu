---
name: drive-extension
description: Where Library is on the nested shell's screen and how to drive it - coordinates of the button, tabs, grid and the pop-up pane, its remote keys and virtual pad, the stand-in library the README's screenshots are taken of, and what must never be pressed. Use with gnome-ext:nested-shell whenever a Library change must be seen (layout, the tabs, a pick's pop-up, the preferences).
---

# Driving Library in a nested shell

Read the kit's `gnome-ext:nested-shell` skill first: the loop, `do` and its steps,
its own settings, `--clean`, `--stand-in`, the logs and stopping are all there. This
page adds only what is Library's.

## Never press

CLAUDE.md's list, and why, unless the task asks for exactly that:

- **Play, Continue, or an episode or film row** runs the section's open command (VLC
  by default) on the user's real media, and the tracker then writes their real
  watched marks and positions. A game's **Play** launches the real game through Steam
  or PCSX2 (under `--stand-in` it runs `true`).
- **Rescan** (and an empty Games tab's **Find Games**), or `make scan` (`/scan`, which runs only when the user types it), is an
  online scan with the user's real keys, writing `~/.cache/library-menu@jackicus/` (unless
  under `--stand-in`).
- **A watched disc**, or Mark watched from a key or the pad, outside `--stand-in`, writes
  the real `~/.local/share/library-menu@jackicus/watched.json` and, with `tracking` `source`,
  a `.library-watched.json` into the library folder itself. If a test needs it,
  put both back.

## Its own commands and fixtures

- **`start --stand-in`** (or `--demo`): the made-up library `scripts/demo_library.py`
  draws, written by `./scripts/nested.d/library.sh` into the stand-in home's
  cache (`XDG_CACHE_HOME`), with fresh settings and watched marks of its own. Use it
  for anything that shows library content, and always for `docs/screenshots/`. A
  plain `start` (or `--clean`) has settings of its own too, but the user's real cache
  and watched marks. `status` says which a running one is (`data:` stand-in or your own).
- **The nested Wayland display** is `library-menu-dev`.
- **`overview on` sets `OverviewActive` only if it is not already set**, so
  `do "overview on" "shot $S/x.png"` photographs an overview the extension opened (the
  button pressed from the desktop).
- **Remote keys**: `key XF86OK`, `XF86Back`, `XF86HomePage`, `XF86ChannelUp` and the
  rest a remote sends work as `key` steps, against the `keys-*` defaults.
- **A game controller is `scripts/vpad.py`**, a virtual Xbox 360 pad on uinput driven
  through a FIFO (`tap A`, `hat down`, `stick right 1.0`, `quit`). It is a real device
  for the whole machine while it runs: `quit` it when done. Start it by its full path
  (`"$PWD/scripts/vpad.py" FIFO &` from the repository): that is the name
  `nested.sh stop` sweeps it by (`NESTED_STRAYS` in `./scripts/ext.conf`). Controller input is acted
  on only while a library is up and no window has the focus, so close the prefs first.
- **The "Allow inhibiting shortcuts" prompt** (capturing `library-shortcut` in the
  prefs): if a test answers it, delete the entry
  afterwards (`PermissionStore.DeletePermission gnome shortcuts-inhibitor
  org.gnome.Shell.Extensions.desktop`) so the real session still asks.

## Reading the screen (1600×900)

Measure from a fresh screenshot if the columns, the sections, the accent or the
geometry changed. The nested shell enables Library alone (and `--stand-in` always
does), so the button is in the overview's dash: `overview on` first, then click it at
about (960, 838). With **Dash to Panel on** (below, "Its own traps") it is in the panel
instead: Show Apps ≈ (30, 875), the library button ≈ (90, 875). There is one button,
beside Show Apps, tooltip "Library", and with the shortcut and a pad's Home it is the
only way in.

- **The menu**: the overview opens onto the tabs (y ≈ 131: TV Shows ≈ x 721, Films
  ≈ x 809, Games ≈ x 887) over the grid, rows centred at y ≈ 320 and 570, first poster
  ≈ (407, 320).
- **A pop-up detail**: the squares under the poster, Play ≈ (263, 761), never pressed,
  and Show in Files ≈ (320, 761); season tabs y ≈ 368 from
  x ≈ 695; rows from y ≈ 430 in ≈ 54 px steps at the default row size. The shade's edge is 48 px in from the
  work area, so `click 20 450` closes it, as `key Escape` does.
- **An empty section** shows a centred placeholder with Open Settings (Find Games for
  Games): normal until it has a folder and a scan.
- **The dash** (`desktop-dash` true in the nested session's own settings; a fresh
  `--stand-in` start has it off): three buttons centred on the wallpaper, TV Shows
  ≈ (584, 466), Films ≈ (800, 466), Games ≈ (1016, 466). A click opens the overview
  onto that section: `overview on` before the `shot`, or the shot dismisses it.

## Its own traps

- **No `say` or `shot` inside a keyboard walk**: either takes the keyboard away from
  the tile or row that had it.
- **The preferences open under the overview** when it is up: `overview off` before a
  `window` shot of them.
- **`overview on` holds across `do` calls** until `overview off`: a later `click` meant
  for the desktop (a dash button) lands in whatever overview is up instead, and the
  workspace preview's click handler closes it. `overview off` first.
- **The look beside Dash to Panel, Blur my Shell and app folders** (`detailDialog.js`
  `folderLook`) needs them enabled in the nested session's own settings (`run timeout
  5 gsettings set org.gnome.shell enabled-extensions "['library-menu@jackicus',
  'dash-to-panel@jderose9.github.com', 'blur-my-shell@aunetx']"` and
  `dash-to-panel` true in this extension's schema, then `stop` + `start`); not under
  `--stand-in`, whose home has none of the user's extensions.

## Screenshots for the README

The `gnome-ext:screenshots` skill, plus: full-screen shots lose the top 32 px, the top
bar with the screencast indicator and the clock: `jpegtran -crop 1600x868+0+32 -copy
none -perfect` on the JPEG, lossless because 32 is a whole number of JPEG blocks. They
are 1600×868.
