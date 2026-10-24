---
paths:
  - "src/lib/app.js"
  - "src/lib/libraryButton.js"
  - "src/lib/libraryView.js"
  - "src/lib/mediaMenu.js"
  - "src/lib/detailDialog.js"
---

# Where the library and the pane open

## The menu (`mediaMenu.js`)

- The library is one `MediaMenu` holding one `LibraryView` (tabs over a grid per
  section, each grid built the first time its tab is chosen and kept, so a tab switch
  is which grid is visible), opened from the button, the shortcut or a controller's
  Home. The button behaves as a dock's Show Apps: pressed on the desktop it opens the
  overview, so a second press or Escape lands back on the desktop; pressed with the
  overview up, back to the window picker. Every way out of an overview it opened goes
  all the way down: a dock's own `forcedOverview` flag is never set by us, and an
  overview left on the window picker made every later Show Apps press land there. Show
  Apps itself is left alone.
- The tabs and grids go into the overview's app-grid slot, and the row of small
  workspaces folds away, read from the overview's own state adjustment, never timed (a
  fade of ours is out of step with the shell's, and one started as the overview unmaps
  stalls until it is next shown).
- Tabs switch in place, with no overview transition. A rebuild (a setting, a rescan)
  replaces the menu and puts back the tab that was showing (`state`/`restore`).
- Nothing is drawn on the wallpaper. Every poster is `widgets.js` `createArtwork`.

## The pop-up pane (`detailDialog.js`)

- A copy of the shell's `AppFolderDialog` with the folder's grid and name entry taken
  out, styled `app-folder-dialog`, sized around a poster rather than a 720px square,
  holding a `DetailView` where the folder holds its grid. It lives in `overviewGroup`,
  added at build and raised on each open, since every pick is made in the overview,
  and it is gone the moment its tile unmaps.
- The pane sits inside the panel by `shape.js` `PANE_INSET`, taken out of the pane's
  own padding: `detailView.js` `PADDING` and the stylesheet's `.ml-pane-content` are
  the two halves and must agree, or the pane overhangs and the clip cuts the
  backdrop's bottom corners square.
- What goes behind it is asked of a folder, never assumed (`folderLook`): a
  `Shell.BlurEffect` on a folder's dialog is matched with the shade dropped, and any
  class on its box beyond `app-folder-dialog` goes on ours (Blur my Shell does both).
  With no folder opened yet, the stock shade (`DIALOG_SHADE_NORMAL`) and theme stand.
- It opens in two moves: the panel zooms out of the tile as the artwork and buttons
  alone, poster-shaped, then widens onto the title, facts and list, built on an idle
  meanwhile. Closing mirrors it. The pane is laid out once at the open width inside a
  clip that is the panel, whose height is the side column's (`layout.md`).
- Its `GrabHelper` takes Escape and the keyboard, and holds the grab as
  `Shell.ActionMode.POPUP`, the app folder's tier, not `SYSTEM_MODAL`. It is not a
  window: a `Meta.Window` would need a second process, since the shell links no GTK.
