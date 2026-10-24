# Private and deep GNOME Shell API

Library puts its button beside Show Apps, puts its tabs and grids in the
overview's app-grid slot, borrows the app grid for its posters and the folder
dialog's shape for its pop-up pane. None of that has a public API. This is everything it reaches into,
for reviewers on extensions.gnome.org and for whoever ports it. Which shell
versions each reach was read at is [compatibility.md](compatibility.md)'s.
Functions are named rather than line numbers.

## At a glance

"Guarded" **No** does not always mean a throw: most reaches are behind `?.` or
an `if`, and then the only sign is the symptom, with nothing logged.

| Expression | File | If it changes | Guarded |
|---|---|---|---|
| `Main.layoutManager._backgroundGroup` | desktopDash.js | Building the dash throws; with `desktop-dash` on, the library does not build | No |
| `Dash.ShowAppsIcon`, its `_createIcon`, `_iconActor` | libraryButton.js | The subclass throws building; no button, a warning | Yes, try/catch |
| `ShowAppsIcon._canRemoveApp()` (overridden) | libraryButton.js | The button becomes an unpin target again, silently | No |
| `Main.overview.dash._dashContainer`, `dash._hookUpLabel` | libraryButton.js | No button in the dash, a warning | Yes, try/catch |
| `global.dashToPanel.panels[0]`, `panels-created`, `.showAppsIconWrapper.realShowAppsIcon`, `.panel`, `._updateGroupedElements` (wrapped), `.geom`, `.updateElementPositions` | libraryButton.js | The button goes in the dash instead; `updateElementPositions` gone: no button, a warning | Yes, each checked first or inside `_attach()`'s try/catch; read only with `dash-to-panel` on |
| `panel._elementGroups`, a group's `.elements` and `.expandableIndex`, an element's `.actor` and `.position` | libraryButton.js | `_elementGroups` gone: the button is in the panel with no place in its layout. Another shape: the wrap throws inside `_attach()`'s try/catch, so no button and a warning | Partly |
| `Main.overview._overview.controls`, `.appDisplay`, `._box` | mediaMenu.js; `_overview.controls` also detailDialog.js | No library; one warning, if a section is enabled | Yes |
| `Main.overview.dash.showAppsButton` (`.checked`) | mediaMenu.js | The menu can no longer tell the app grid is up (the kit's "Is the app grid up?" rule) | No |
| `controls._searchController.searchActive` | mediaMenu.js | Workspaces do not come back for a search while the view is up | Yes, `?.` |
| `controls._stateAdjustment` | mediaMenu.js | The workspace row is not folded in step with the overview | Yes, `?.` |
| `controls._workspacesDisplay` (`.opacity`, `.reactive`, `setPrimaryWorkspaceVisible`) | mediaMenu.js | The row is never faded, so it stays over the posters and takes their clicks. `setPrimaryWorkspaceVisible` gone: folding the row throws | `_workspacesDisplay` `?.`; its method no |
| `controls.layout_manager._getAppDisplayBoxForState` (wrapped) | mediaMenu.js | The slot never grows over the workspace row | Yes, `typeof` check |
| Restated `DASH_MAX_HEIGHT_RATIO`, `VERTICAL_SPACING_RATIO`, and `_slotSize()` restating `ControlsManagerLayout.vfunc_allocate` | mediaMenu.js | A view built before the overview ever laid out is a little off until next built | No |
| `Object.getPrototypeOf(AppDisplay.AppDisplay)` (`BaseAppView`) | mediaGrid.js | `mediaGrid.js` throws as it loads; the extension does not load | No |
| `BaseAppView`'s `_parentalControlsManager`, `_appFavorites`, `_box`, `_pageIndicators`, `_grid` | mediaGrid.js | `MediaView`'s constructor throws; no grid anywhere | No |
| `BaseAppView`'s `_adjustment` | mediaGrid.js | `_shownPage()` throws: no staggered reveal, keyboard landing or remote page turn; swipe, wheel and arrows still page | No |
| `BaseAppView`'s `_createGrid`, `_loadApps`, `_compareItems` (overridden), `_addItem` (called) | mediaGrid.js | `_createGrid` renamed: square cells. `_addItem` changed: no tiles. The other two: a cancelled overview drag re-diffs the grid wrongly | No |
| `AppViewItem`'s `_id`, `_name` and positional `_init(params, isDraggable, expandTitleOnHover)` | mediaGrid.js | Tiles draw but share one id; a changed signature makes posters draggable or stops the title unfolding | No |
| Restated `PAGE_PREVIEW_RATIO` (`ARROWS_SHARE`) | mediaGrid.js | Covers sized for the wrong margin beside the page arrows | No |
| `IconGridLayout`'s `_pageWidth`, `_pageHeight`, `_pages`, `_pageSizeChanged`, `_shouldEaseItems` | mediaGrid.js | `_pageWidth`/`_pageHeight` gone: `vfunc_allocate` returns early and no tile is allocated, so no poster shows. `_pages` gone: it throws | No |
| `controls._appDisplay._folderIcons`, `icon._dialog`, `dialog._viewBox` | detailDialog.js `folderLook()` | The pop-up keeps the stock shade and theme even under Blur my Shell | Yes, `?.` to `null` |
| Restated `DIALOG_SHADE_NORMAL` (`SHADE`) | detailDialog.js | The shade drifts from the shell's | No |

## The button beside Show Apps (libraryButton.js)

`LibraryButtonIcon` subclasses `Dash.ShowAppsIcon` for the hover, focus
ring, label and sizing every dash icon has. `BaseIcon._init` calls
`_createIcon` before the subclass's `_init` returns, so `_gicon` is set before
the chain-up; `_canRemoveApp()` returns false so the button is no unpin target.
`_attach()` builds it inside one try/catch and logs "No button beside Show
Apps" on failure, at enable and on each re-attach.

In the plain dash it goes into `_dashContainer` and `_hookUpLabel` gives it
the dash's label. The dash cancels a pending show-label timeout only when the
item's hover goes, so the button's hover is cleared before it is destroyed.
Dash to Panel is reached only while the `dash-to-panel`
setting ("Work with Dash to Panel", off by default) is on. Off, none of what
follows runs, nothing of Dash to Panel is read or watched, and the button
stays in the overview's dash, which Dash to Panel hides. On,
`global.dashToPanel` is the object Dash to Panel exports for other extensions,
with its `panels` and its `panels-created` signal, and the extension manager's
`extension-state-changed` for Dash to Panel's UUID says when it comes and
goes. Dash to Panel has no way to add an element to its panel: it lays the
panel out from `_elementGroups`, a private list its `_updateGroupedElements`
rebuilds from its own settings. So the one patch is a wrap of that method on
`panels[0]`, the primary monitor's panel, put on at attach and taken off
("Chain-safe wraps", below) at detach, when the setting goes off, and when
Dash to Panel rebuilds its panels or is disabled. The wrap splices the
button's entry in after Show Apps in `_elementGroups`, with Show Apps'
`position`, and moves `expandableIndex` up one if it lay beyond. The shell
disables and re-enables the extensions enabled after one being disabled
without a signal, and Dash to Panel then hands its primary panel's bar back to
the top bar with the button still in it; so the `destroy` of its Show Apps
(`showAppsIconWrapper.realShowAppsIcon`) releases the button and looks for the
new panel on the next idle. `panels-created` and `extension-state-changed`
re-run `_attach`, but `_reattach` acts only when `panels[0]` changed or the
button lost its parent. If Dash to Panel renames or
reshapes what the table above lists, the button falls back to the dash, or is
missing with a warning in the log; turning the setting off puts it back in the
dash.

## The overview's app-grid slot (mediaMenu.js)

There is no extension point for a second view in the app grid's slot. The
library's `LibraryView` is added to `AppDisplay` beside its `_box`, and the
two take turns by `_box.visible`.

The row of small workspaces folds away by wrapping
`ControlsManagerLayout._getAppDisplayBoxForState` (`_foldWorkspaces()`), the
method that computes the app grid's box for each overview state: there is no
hook for that layout. The wrap also records the slot (`menu._slot`) for a view
that has to be built before it is ever laid out. `_slotSize()` works the same
slot out step for step for a button pressed before the overview has ever been
shown, with the two ratios restated from `overviewControls.js`.

## The app grid (mediaGrid.js)

`BaseAppView`, the class `AppDisplay` and `FolderView` extend, is not
exported; `Object.getPrototypeOf(AppDisplay.AppDisplay)` is the only way to
subclass it without `AppDisplay`'s favourites, folders and search. It is the
one point of failure with no fallback.

- `MediaView`'s constructor disconnects `_parentalControlsManager` and
  `_appFavorites`, whose changes would re-diff a grid of thousands of tiles
  for nothing; adds `_box` to itself, as `AppDisplay` does; keeps
  `_pageIndicators` visible at zero opacity on a one-page section so every
  section's rows line up; and follows `_grid`'s `pages-changed`.
- `_createGrid()` runs from the parent's `_init`, before `this` is usable,
  hence the module-level `pendingGrid`. `_loadApps()` returns the tiles
  already built, so the parent's diff is a no-op, and `_fillTo` places tiles a
  page at a time with `_addItem`.
- `MediaItem` passes `AppViewItem._init` its two flags positionally (`false`:
  not draggable; `true`: the title unfolds on hover) and sets `_id` and
  `_name`, which the public `id` and `name` getters return.
- `PosterGridLayout.vfunc_allocate` replaces the parent's whole allocation,
  which takes one square cell from an item's larger side; a poster is not
  square, and no narrower vfunc exists. The spacing and per-page counts are
  public GObject properties. `MediaGrid` replaces the layout `IconGrid` built
  and re-emits the new layout's `pages-changed` as the grid's own.

## The folder's panel (detailDialog.js)

`DetailDialog` is a copy of `AppFolderDialog`'s shape, not a subclass: the
folder's name entry and grid are built into `AppFolderDialog`'s own `_init`. To look like a folder
under Blur my Shell, which drops the shade, blurs behind and adds a class to
the folder's box, `folderLook()` asks a real folder's `_dialog` once per open
and copies its `Shell.BlurEffect` and extra `_viewBox` classes. A folder
builds its dialog the first time it opens, so with none opened yet there is
nothing to ask, and the stock shade stands, without a warning.

## The dash on the wallpaper (desktopDash.js)

The desktop is `Main.layoutManager._backgroundGroup`, the `Meta.BackgroundGroup`
at the bottom of `global.window_group` that holds a background actor per
monitor. There is no public place to draw between the wallpaper and the
windows, so the dash is a child of that group, appended above the backgrounds.
The overview and the workspace slide build wallpapers of their own and never
show it, which is accepted: the dash is not cloned into them.

## Chain-safe wraps

Dash to Panel's `_updateGroupedElements` (`libraryButton.js` `_attachToPanel`)
and the shell's `_getAppDisplayBoxForState` (`mediaMenu.js` `_foldWorkspaces`)
are wrapped as the kit's monkey-patch rule has it, since another extension may
wrap either (Dash to Dock patches the latter on the prototype). Each wrap here
closes over what the property held, always calls through, does nothing once it
is no longer current (`inert`, or `_foldedBox` no longer itself), and on
release puts back what it found only while it is still the outermost: another
extension's wrap if that was there, or a `delete` if the property was never an
own one. So disabling either, in either order, leaves the other's working.
