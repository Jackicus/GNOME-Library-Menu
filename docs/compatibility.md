# Compatibility

`metadata.json` claims GNOME Shell 51 only: the version the extension runs
on now, and the only one the code is written for, with no fallback for an
older shell. 50 is no longer claimed: the main desktop moved to 51 and 50
cannot be booted there, and its pop-up keyboard path is gone
([GNOME 51](#gnome-51)). This page lists what was run where, every code path
that depends on the version, and what claiming a version takes.

## What has been run, and where

- **The main desktop on 51** (NVIDIA GeForce GTX 1080, proprietary driver
  580.178.04; CachyOS, Wayland), 2026-10-28: GNOME Shell 51.1, mutter 51.1,
  GJS 1.90.1, GLib 2.90.1, GTK 4.24.1, libadwaita 1.10.0, libmanette 0.2.13,
  libsoup 3.8.1, gdk-pixbuf 2.44.8. In the nested shell under
  `start --stand-in`, Library Menu alone: enabled from `make link`, the menu
  from the dash button and from a desktop-dash button (Escape closing the
  overview it opened), the tabs, a pick's pop-up by click and by Return, the
  arrows and Tab in the grid, between tabs and grid and in the pop-up, the
  pop-up closed with Escape and a click away, a `reload` with the menu up, a
  `stop` + `start`, and the preferences' General page. Not yet: Dash to Panel
  and Blur my Shell beside it, a controller, the scanner online, the packed
  zip, the HP all-in-one.
- **The main desktop on 50**, before it moved to 51
  (CachyOS, Wayland): GNOME Shell 50.5, mutter 50.5, GJS 1.88.1, GLib 2.88.3,
  GTK 4.22.5, libadwaita 1.9.4, libmanette 0.2.13, libsoup 3.6.6,
  gdk-pixbuf 2.44.7. In the nested shell (`./scripts/nested.sh`) with and
  without Dash to Panel and Blur my Shell, the four combinations
  `detailDialog.js` `folderLook()` and `libraryButton.js`'s Dash to Panel
  branch exist for: the menu, the pop-up detail pane, `library-shortcut` and
  the preferences' General page. The scanner ran there on a real library
  on a local drive, online against TMDB, TVmaze and Wikipedia, and on a
  made-up library of the awkward cases (other scripts, seasons and extras,
  dot-files, links, covers with and without alpha, one section's folder inside
  the other's, the same film on two drives).
- **The HP all-in-one** (Intel UHD, Mesa; CachyOS, Wayland): GNOME Shell 50.4.
  The extension has been enabled there from `make link`, with no library
  scanned; nothing more is recorded.

Not run anywhere: GNOME 48 or 49 (and 50 is no longer claimed), a virtual machine, X11 (gone in mutter 50),
a second monitor.

Most of that went through `make link`, whose entry point is
`./scripts/dev-extension.js`, not the shipped `src/extension.js`; the packed
zip is tested on its own (checklist below).

## Read against the shell's sources

Every reach in [private-api.md](private-api.md) was read in `js/ui/` at the
`48.0`, `49.0`, `50.0` and `51.0` tags of `GNOME/gnome-shell`, and again at
`51.1` against `50.5` on 2026-10-28, and is there in the same shape at all of
them, except as noted below. One shape differs by
version:

- **`AppFolderDialog`'s click-away** is a `Clutter.ClickAction` at `48.0` and a
  `Clutter.ClickGesture` from `49.0`; `detailDialog.js` `_addClickAway()` uses
  the gesture.

Also read, and the same at all of them: `_getAppDisplayBoxForState` takes
six arguments; `DIALOG_SHADE_NORMAL`, `PAGE_PREVIEW_RATIO`,
`DASH_MAX_HEIGHT_RATIO` and `VERTICAL_SPACING_RATIO` are module-private with
the values restated.

## Version-sensitive code

- **The pop-up's keyboard** (`detailDialog.js` `vfunc_key_press_event()`)
  leans on 51's focus manager, which walks a group from a key controller on
  the group's root, under a grab too (below).
- **`Adw.ShortcutLabel`** (`prefs.js`) is libadwaita 1.8 (GNOME 49) and
  **`Adw.ToggleGroup`** 1.7; **`St.BoxLayout({orientation})`** is 48+ and
  **`-st-accent-color`** 47+. None has a fallback.
- **libmanette** is optional on every version: `controls.js` and `prefs.js`
  `loadManette()` import `gi://Manette` dynamically and go on without it.
- **`enable()`/`disable()`**: the shipped entry point's are synchronous;
  `./scripts/dev-extension.js` has an `async enable()` (the shell awaits it)
  and a synchronous `disable()`.

## GNOME 51

Claimed, and run on 51.1 (above). Read at `50.5` and `51.1`, with
gjs.guide's "Port Extensions to GNOME Shell 51":

1. `st_focus_manager_navigate_from_event()` is gone (`st-focus-manager.h`).
   St no longer watches the stage for arrows and Tab: `add_group()` puts a
   `Clutter.KeyController` on the group's root, which walks the group in the
   bubble phase, before the root's own `key-press-event`, and under a grab as
   well, since the root is inside it. `detailDialog.js` no longer calls it;
   the pop-up, a group, is walked by its own controller, as 51's
   `AppFolderDialog` and `ModalDialog` are.
2. `Clutter.get_default_backend()` is gone; `controls.js` already asks the
   stage's context for the backend.
3. `ControlsManager` is now a focus group and takes the key focus when the
   overview settles, handing it to `AppDisplay`; `AppDisplay` pages with a
   binding pool, not a stage handler. Its walk crosses from the grid to the
   tabs by position, so `libraryView.js` takes that step first, with a
   capture-phase `Clutter.KeyController` on the view, made reactive because
   Clutter delivers key events to reactive actors only.
4. `BaseAppView` scrolls with a `Clutter.ScrollController` and
   `_onScroll(controller, sprite, source, dx, dy)`; `mediaGrid.js` does not
   override it.
5. `St.ButtonMask.ONE`/`TWO`/`THREE` are deprecated names, `St` widgets lose
   `vertical`, `PopupMenu` `open()`/`close()` take a parameters object, and
   `disable()` may not be async: none is used here.

Everything else in [private-api.md](private-api.md) is there at `51.1`
(`AppDisplay` is now an exported ES class and still extends the unexported
`BaseAppView`). `key-press-event` and `captured-event` are deprecated in favour
of event controllers but still delivered; `mediaGrid.js`, `detailDialog.js`
and `mediaMenu.js` connect to them.

## Checklist for a new GNOME version

1. Read gjs.guide's "Port Extensions to GNOME Shell N" for anything
   [private-api.md](private-api.md) names, and the libadwaita version it ships
   (at least 1.7).
2. Diff `js/ui/{appDisplay,dash,iconGrid,layout,overviewControls}.js`
   between the last tag read and the new one, for every expression in
   private-api.md's table.
3. Install the zip, not the link: `make uninstall`, `make pack`,
   `gnome-extensions install dist/library-menu@jackicus.shell-extension.zip`,
   log in again.
4. `./scripts/dev.sh logs '10 min ago'`: no `TypeError`, no "No button beside
   Show Apps", no "not laid out as expected".
5. The menu from the button, the shortcut, a controller's Home and a dash
   button with **Buttons on the desktop** on; a pick's pop-up, closed with
   Escape, a click away and by leaving the overview.
6. Lock and unlock with the library open.
7. With Dash to Panel on and off, and **Work with Dash to Panel** on: the button
   beside Show Apps in both; with the setting off, Dash to Panel's panel as it
   is without Library Menu; with
   Blur my Shell on and off: the pop-up's shade follows a folder's.
8. Under `make link`, disable and enable ten times: no errors, and one
   `lib-<checksum>` directory left under
   `$XDG_RUNTIME_DIR/library-menu/shell-<pid>/`, the shell's own.
9. With Dash to Dock or Dash to Panel enabled too, disable each in turn: the
   other's button and the folded workspace row stay.
10. Then add the version to `shell-version`.
