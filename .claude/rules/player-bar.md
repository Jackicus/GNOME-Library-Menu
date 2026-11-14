---
paths:
  - "src/lib/controlBar.js"
  - "src/lib/tracksMenu.js"
  - "src/stylesheet.css"
---

# The player bar: placement, keys and sizes

## Where it is

- **The OSD's arrangement** (`osdWindow.js`): a `Layout.MonitorConstraint` sizes
  the `ControlBar` actor to the monitor, and `x_align CENTER` / `y_align END`
  shrink it back around the panel. It raises itself above later chrome when
  shown, as the OSD does.
- **`bar-position` `top`** is `y_align START`, the panel's margin moved to its
  top (`.ml-player-top`), the arrival a drop rather than a rise, and the pop-out's
  `BoxPointer` turned to hang below it (`updateArrowSide`, public on
  `menu.actor`).
- **The width** is the monitor's less `SIDE_MARGIN` a side (logical px, times
  the stage's `scale_factor`), capped by the panel's `max-width` in em, read
  back from the theme node (already physical). Off the stage the panel has no
  style, so `setMonitor` runs again on `style-changed`. The row gap
  (`CentredRowLayout`) is the row's `spacing`, read the same way.
- **Unredirection is off while it is shown**, as the OSD does it
  (`global.compositor.disable_unredirect()`), so a fullscreen window scanned
  out directly cannot hide it.
- **The pop-out keeps to the panel as it rises**: a `BoxPointer` places itself
  from its source's transformed position only when laid out, which a
  translation does not cause, so `notify::translation-y` calls
  `TracksMenu.reposition()`.

## What is on it

- **Which buttons** is two settings: `previous-next` (`always`, greyed out
  with nowhere to go; `playlist`, only while `Player.hasPlaylist`; `never`) and
  `hidden-buttons` (`BAR_BUTTONS`: skip, volume, rate, close). A hidden
  button's action still works from the keys and pads.
- **The time at the end of the seek row** is a button out of the focus chain
  whose click is the `toggle-length` action (`show-length`: the time left or
  the whole length).
- **`show-clock`** (off by default) adds a line under the title, "21∶40 · ends
  at 23∶12", formatted by the shell's own `dateUtils.formatTime`, so 12/24-hour
  follows the top bar's clock.
- **The volume slider writes at most every 100 ms while dragged**
  (`VOLUME_INTERVAL_MS`) and once more at `drag-end`: a write per motion event
  was ~50 D-Bus calls a second.

## Keys

- **Keys are `Clutter.KeyController`s, not `key-press-event`**: on 51 an
  actor's actions see an event before its own signal does. The panel is a
  focus group (`add_group` gives it the shell's controller, which moves the
  focus under the grab too). A focused slider takes Left/Right first, in a
  controller in the **capture** phase, since the Slider's own key binding is
  an action too (the seek slider skips by `seek-step` instead of the Slider's
  tenth of the film, `arrowKeys`); Up/Down leave it.
- **A `PopupMenu` toggles on Return, Space or the arrow towards it reaching its
  source actor**, which is the panel for `TracksMenu` (so it stands above the
  bar rather than over its top row); on 51 that is a key controller the menu
  adds to the panel. The panel's own controller, added after the focus
  group's and before the menu exists, swallows those keys; a focused button
  has already taken them.
- **`TracksMenu` overrides `itemActivated` on its sections as well as the
  menu**: picking a track leaves the pop-out open.
- A scroll anywhere on the panel skips as the buttons do (`seekScroll`, a
  `Clutter.ScrollController`); the seek slider's is in the capture phase, ahead
  of the Slider's own scroll controllers. The volume slider keeps its own.

## Touch

- **The cursor tracker never sees a finger** (`position-invalidated` is for
  the pointer alone), so while it is watched `playerControls.js` puts a `ClickGesture` on
  the stage whose `should-handle-sequence` treats a `TOUCH_BEGIN` as a pointer
  move to where it landed, edge band and monitor test included, and turns
  every sequence down, so the gesture never takes part in the touch.
- **A press or touch outside the bar closes it under its grab**: a
  `ClickGesture` on the panel (`recognize_on_press`) whose `may-recognize`
  holds only for an event actor outside it, as the shell's `PopupMenuManager`
  does. Inside the panel it declines, and the buttons and sliders keep the
  press.
- **Without the grab, a paused bar is put away by a press outside it** too,
  which the stage cannot see: Mutter hands a press on a window to the client
  and Clutter never gets it (a touch it does get). So while the bar is shown,
  paused (`setDismissible`, from `playerControls.js`) and its pop-out is shut, a bare
  reactive actor covers the monitor just under it and emits `hide-bar` on a
  press or touch (a `ClickGesture`, `recognize_on_press`). Meanwhile the
  player gets no pointer events: that click, a scroll or a double-click over
  the video are the catcher's, and the pointer is the shell's. A gesture
  stops nothing, so a scroll over the catcher goes on to the stage's own
  handler (Super+scroll). Keys still go to the player. An open pop-out holds
  its own grab, so the catcher stands aside: one press closes the pop-out,
  the next the bar.

## Sizes and redraws

- **`bar-scale` scales the icons by hand**: `controlBar.js` sets `icon_size` from `ICON_SIZE` (16) or `PLAY_ICON_SIZE` (22) × the setting, the
  pop-out's buttons too (`setIconSize`).
- **The redraw timer exists only while the bar is visible and something on it
  moves**: every 250 ms (`TICK_MS`) while playing, once a second otherwise,
  for the clock and the sleep countdown. A paused bar can be up for hours.
