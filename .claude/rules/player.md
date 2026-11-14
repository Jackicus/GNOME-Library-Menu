---
paths:
  - "src/lib/playerControls.js"
  - "src/lib/playerPads.js"
  - "src/lib/playerActions.js"
  - "src/lib/app.js"
---

# The player bar: which player, when it shows, what it does

With `player-controls` on (the default), a file played from the library in VLC or
mpv gets the library's control bar over it in place of the player's own
fullscreen controls. A player opened any other way keeps its own controls and
never gets the bar. `app.js` builds a `PlayerControls` only while the setting is
on. The bar, the MPRIS players and the track sockets are `player-bar.md`,
`player-mpris.md` and `player-remotes.md`.

## The launch

- **`controlledArgv()`** turns the section's open command into the bar's launch
  when its program, or an argument (a `flatpak run` id), is one it knows (`vlc`,
  `cvlc`, `org.videolan.VLC`, `mpv`, `io.mpv.Mpv`). It appends the flags that
  turn the player's own controller off (`--no-qt-fs-controller`, `--osc=no`) and
  open a control socket at `$XDG_RUNTIME_DIR/library-menu-<random>.sock`
  (`--extraintf=oldrc --rc-unix … --rc-fake-tty`, `--input-ipc-server …`), and
  puts `env LIBRARY_MENU_PLAYER=1` in front. Any other command, and the system
  default app, launches as it always did, with no bar.
- **Nothing of the player's settings is written.** The flags last for that one
  launch. On the command line they win over vlcrc and mpv.conf.
- **The mark is the environment variable.** `Util.spawn` hands back no process
  id, and one kept here would not outlive a lock (which disables the extension)
  or a shell restart. `isControlled()` reads `/proc/<pid>/environ` of the
  fullscreen window's process and of each process it was started from, so a
  sandboxed player under the `flatpak run` that was launched counts too.
- **A player that hands the file to an instance already running** (Celluloid,
  any GApplication) is not ours: the launched process exits and the window
  belongs to the old one.

## Which player, and when it shows

- **The focused window, when it is fullscreen, the overview is not up and
  `isControlled()` holds** (`_update`). Its MPRIS player is matched by process id
  first (`GetConnectionUnixProcessID` against `Meta.Window.get_pid()`), then by
  desktop entry, for a sandboxed player whose bus connection is xdg-dbus-proxy's.
  No such window: nothing is attached and nothing reacts, the pads included.
- **Pointer motion over the player** (`pointer-reveal`: `anywhere`, `edge` for
  the fifth of the monitor at the bar's edge, or `never`), watched through
  Mutter's cursor tracker (`position-invalidated`, read at most every 100 ms).
  It takes no input from the video, as a reactive hot strip would.
- **`toggle-bar`** (Super+C) or the pad's `navigate` (Start) opens it holding
  the focus (`Main.pushModal`, `POPUP` mode); Escape, a click outside or the key
  again puts it away.
- **The player's own changes show it**: a pause (a remote's media key), a seek,
  a new file. It hides after `hide-delay` seconds unless the pointer is on it,
  it holds the focus, the pop-out is open, a slider is being dragged or, with
  `stay-while-paused`, the player is paused.
- **It is chrome**, `Main.layoutManager.addChrome()` with no params: only chrome
  that asks for `trackFullscreen` hides over a fullscreen window.

## Actions

`ACTIONS` in `playerActions.js` is the one list every input speaks: the bar's
buttons emit an action id, the pads map a button to one (`gamepad-buttons`), and
`perform()` is the only place an action turns into a call. An action added
there and in `ACTIONS` reaches the pads and the preferences.

## Pads

- **`playerPads.js` reads pads through libmanette**, as `controls.js` does for
  the library, under the same `gamepad-enabled`. Each acts only while its own
  view is up: the library's while it is on screen, the bar's while its player
  is fullscreen and focused. Library's Home (Start among them) opens the
  library only when no window has the focus, so it never fires over the player.
- **Buttons are named by position** (`south`, `east`, `dpad-left`,
  `left-trigger`, `BUTTONS`): libmanette maps every pad onto the kernel's
  standard codes, so Xbox, PlayStation and Switch press the same one.
- **Pads are never grabbed**: a game beside the player still sees every press.
- **Navigation is a Clutter virtual keyboard**: while the bar holds the focus
  or its pop-out is open, the `NAVIGATION` buttons press arrow keys, Return and
  Escape, so the pad reaches what the keyboard does.
- **A held button repeats** (400 ms, then every 150 ms): the actions marked
  `repeats` and the arrows, never play or Return. `_onPadButton` settles at the
  press what repeats, so a hold never turns from moving the highlight into
  seeking.
- **Track and subtitle actions leave the bar down**, so the subtitles under it
  stay visible.

## The sleep timer

- **Off by default** (`sleep-timer`): with it on, the bar has a button for it.
  **Minutes** (`SLEEP_MINUTES`): 15 to 120, then the end of the file, then off.
  **Episodes** (`sleep-timer-mode` `episodes`): 1 to 5 files, this one counted.
- **It pauses, and leaves it at that**, half a second before the end of the
  last file counted (`SLEEP_END_MARGIN`), so a player set to exit at the end
  (`--play-and-exit`) stays open.
- **A new `url` counts one if the file before was left within 30 s of its end**
  (`SLEEP_WATCHED_MARGIN`); one skipped is not. Episodes need a url and a
  length, so a stream gets none.
- **The timer belongs to the player it was set on**, and goes when its player
  leaves the bus.
