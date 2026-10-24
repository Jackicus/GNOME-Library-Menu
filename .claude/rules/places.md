---
paths:
  - "src/lib/app.js"
  - "src/lib/libraryButton.js"
  - "src/lib/libraryView.js"
  - "src/lib/mediaMenu.js"
  - "src/lib/detailDialog.js"
  - "src/lib/desktopDash.js"
---

# Where the library and the pane open

## The menu (`mediaMenu.js`)

- The library is one `MediaMenu` holding one `LibraryView` (tabs over a grid per
  section, each grid built the first time its tab is chosen and kept, so a tab switch
  is which grid is visible), opened from the button, the shortcut or a controller's
  Home. The button behaves as a dock's Show Apps: pressed on the desktop it opens the
  overview, so a second press or Escape lands back on the desktop; pressed with the
  overview up, back to the window picker. A dock's own `forcedOverview` flag is never
  set by us.
- The shell lights Show Apps for its app-grid state, which the library borrows:
  `showAppsButton.checked` is what drives that state, so it stays checked, and the
  `checked` pseudo-class is taken off it instead (`_syncAppsLook`), so only the
  library's button is lit. A press on Show Apps then reads as "show the apps", and
  does: the library is swapped out for the apps, in place. The shell's own unchecks
  (a swipe to the window picker, a search, Super+A, the overview closing) close the
  library as they always did. Dash to Panel mirrors the stock button's `checked` on
  its own, which stays lit.
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
- The pane sits inside the panel by `shape.js` `PANE_INSET`, the width of the panel's
  inset ring, so the two edges are one curve; the inset is taken out of the pane's
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

## The dash (`desktopDash.js`, setting `desktop-dash`)

- A row of one `St.Button` per enabled section, icon over title, centred in the
  primary monitor's work area on `Main.layoutManager._backgroundGroup`
  (`docs/private-api.md`): over the wallpaper, under every window, so a window covers
  it as it covers the wallpaper. Its container takes no clicks, so the wallpaper's own
  menu still opens beside the buttons. A button's click is `MediaMenu.open(key)`: the
  overview to the library on that section.
- The overview's previews and the workspace slide build wallpapers of their own and
  do not show it; it is a desktop thing and is not cloned into them.
- It follows the work area itself (`monitors-changed`, `workareas-changed`) and is
  rebuilt with everything else on a setting or a rescan. No keyboard reaches it: the
  shortcut and a controller's Home are the keyboard's ways in.
