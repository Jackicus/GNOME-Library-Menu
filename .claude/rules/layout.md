---
paths:
  - "src/lib/mediaGrid.js"
  - "src/lib/gridMath.js"
  - "src/lib/mediaMenu.js"
  - "src/lib/detailView.js"
  - "src/lib/detailDialog.js"
  - "src/lib/shape.js"
  - "src/lib/widgets.js"
  - "src/stylesheet.css"
---

# How the grid and the pane size themselves

- **The grid's arithmetic is `gridMath.js`**, which imports nothing of the shell so
  the preferences' preview (`prefs.js` `gridPreview`) lays a page out by the same
  sums over a nominal 1600 × 900 slot. `readGridStyle` reads the eight grid keys
  once; `app.js` hands them to `mediaGrid.js` `setGridStyle`, read as a grid is built
  and as it allocates.
- **`columns` and `rows` are the grid's shape**, each capped by what fits at
  `gridMath.js` `MIN_ART` in the box the view is given, so a small screen shows fewer
  of either. `gridFor` shrinks the cover to fit `rows` and `columns` exactly inside
  the page less `grid-padding-*`; with `show-titles` off the label's share of a cell
  goes to the cover.
- **The spacing settings are floors** (`tile-spacing-*`): `placeGrid` widens them
  with the room the covers cannot take, up to the theme's `max-column-spacing` for
  `.icon-grid` (`MAX_SPREAD`), as the shell spreads its icons, and centres the block
  in what is left. `grid-align` only decides whether a part-full row is centred under
  the full ones or hugs the leading edge.
- **The page dots keep their room on a one-page section**: the shell hides them, but the
  grid still budgets their height, so every section's rows land on the same lines.
- **The hero has a floor** (`detailView.js` `HERO_MIN`, 132 logical px): on a small
  work area the smallest `detail-height` leaves less room than the buttons beneath the
  artwork take, so the panel shrinks instead and the artwork does not vanish.
- **The overview is laid out in the work area, not on the monitor.** The box
  `ControlsManagerLayout.vfunc_allocate` divides is already inset by the top bar and
  anything reserved (Dash to Panel's 48 px), so `mediaMenu.js` `_slotSize`, which works
  the slot out before the overview has ever been shown, starts from
  `getWorkAreaForMonitor` and measures the dash whether or not it is visible, as the
  shell does. Wrong, and the first tab's grid is built against a taller box than every
  later one. The box each view was built for is kept, and every view is rebuilt when it
  moves.
- What tracks hover is what paints its own `:hover`: the section and season tabs, the
  detail rows and their watched disc, and the icon and action buttons (`widgets.js`,
  `detailView.js`). Tiles do not.
- **A measurement of something just built**: the detail pop-up's height is asked of the
  side column after `anim.js` `ensureStyleDeep()`; without it `get_preferred_height`
  answers as if there were no spacing or margins, the panel comes out shorter than the
  pane, and the clip cuts the backdrop's corners square.
