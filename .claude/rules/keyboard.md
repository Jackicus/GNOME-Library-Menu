---
paths:
  - "src/lib/app.js"
  - "src/lib/libraryView.js"
  - "src/lib/mediaGrid.js"
  - "src/lib/detailDialog.js"
  - "src/lib/controls.js"
  - "src/lib/actions.js"
  - "src/lib/widgets.js"
  - "src/prefs.js"
---

# The keyboard, remotes and controllers

## St's focus

- Each grid is a focus group (`global.focus_manager.add_group`), as the shell's
  dialogs are, and so is the pop-up pane: the nearest group around the focus is the
  one the arrows walk.
- Nothing is focused until a navigation key asks; then Tab and the arrows move, Enter
  opens, Escape backs out a level. A focused row destroyed under the pop-up drops key
  focus to the stage, so `detailDialog.js` watches `notify::key-focus` and takes it
  back while it is open.
- The tabs and the grid are two groups, and St never walks between groups: an arrow
  up from the grid's top row (`atTopRow`) focuses the tabs and an arrow down from them
  the first tile (`libraryView.js`). A tab chooses itself on `key-focus-in`
  (`widgets.js`), so a remote with only arrows can switch sections.
- The pop-up holds the keyboard as it opens and an arrow finds nothing to move to, so
  its first navigation key lands where Tab would (`detailDialog.js`
  `vfunc_key_press_event`).

## Bound keys and controllers

- Ten actions (`lib/actions.js`): the four directions, Select, Back, Home, a page each
  way, Mark watched. Each has keys (`keys-<action>`, `a(uu)` keyval and modifiers:
  numbers, because Clutter's keysym table lacks `XF86OK`, `XF86HomePage` and others a
  remote sends) and controller inputs (`pad-<action>`, `"button:304"`, `"axis:1-"`).
- The first six are replayed as their key through a Clutter virtual keyboard, so they
  do exactly what the arrows, Enter and Escape do. Paging (`mediaGrid.js` `pageBy`:
  the shell's grid turns no page for a key), Home and Mark watched (a row's
  `toggleWatched`: St's focus stops at the row) are done directly.
- A bound key is handed over by the view it reached (a grid's key handler, the pop-up's
  `vfunc_key_press_event`), so a binding means nothing outside a library. The arrows,
  Enter and Escape are never offered for binding.
- Controllers are read with libmanette, loaded on demand (it runs without it), and
  acted on only while the menu or the pop-up is up (`app.js` `isActive`), except
  Home, which opens the library when no window has the focus and nothing is modal
  (`_controlsOpen()`).

## The shortcut

`library-shortcut` (`as`, empty by default) is grabbed with `Main.wm.addKeybinding`,
so mutter follows the setting at once; it is not listed in GNOME Settings. A press is
the button's press, in `NORMAL` and `OVERVIEW` modes, so it does nothing while the
pop-up holds its grab. The preferences capture
it as GNOME Settings does (`prefs.js` `_captureShortcut`): system shortcuts are
inhibited while listening (the shell asks once whether the Extensions app may), and a
key the window manager, the shell or the media keys already hold is refused.
