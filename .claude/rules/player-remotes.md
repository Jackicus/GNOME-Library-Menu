---
paths:
  - "src/lib/lineRemote.js"
  - "src/lib/vlcRemote.js"
  - "src/lib/mpvRemote.js"
  - "src/lib/tracksMenu.js"
---

# The tracks: VLC's and mpv's control sockets

MPRIS has no audio or subtitle tracks, subtitle timing or chapters, so those
come from the player's own control socket, which the launch opened
(`player.md`). `VlcRemote` and `MpvRemote` have one surface, so `TracksMenu`
and `playerControls.js` do not know which they hold; both are `LineRemote`s
(connect, peer check, one write at a time, read a line).

- **The socket is found from the player's process**: the listening Unix socket
  in `/proc/<pid>/fd`, matched in `/proc/<pid>/net/unix` (flags `00010000`).
  The pid is the window's (`Meta.Window.get_pid()`), also for the peer check,
  since a sandboxed player's bus connection is xdg-dbus-proxy's.
- **A sandbox's runtime directory is its own**: a path `/run/user/<uid>/…` a
  Flatpak sees is `$XDG_RUNTIME_DIR/.flatpak/<app-id>/xdg-run/…` on the host
  (`hostPath`, with `get_sandboxed_app_id()`).
- **A Unix socket path is at most 107 bytes**, and a sandbox's folder is 70 of
  them on the host, so the name is short. It is in `$XDG_RUNTIME_DIR`, which is
  private: the mpv socket can run commands. Never an abstract socket, which has
  no permission check.
- **No socket, or one that does not answer**: the bar has no tracks button.
- **The pop-out** (`TracksMenu`): audio and subtitles as radio lists that stay
  open as they are picked, a Timing row (− / value / + / ↺ in 0.1 s steps) and
  a chapter row when the file has chapters.
- **Subtitles are drawn along the foot of the picture, under the bar**, unless
  `bar-position` is `top`, which is what that setting is for.

## VLC

- **The module is `oldrc`.** `--extraintf rc` loads VLC 3's Lua CLI, which
  cannot listen on a Unix socket and ignores `--rc-unix`. `oldrc` will not
  start without a terminal ("fd 0 is not a TTY") unless `--rc-fake-tty`.
- **One client at a time**, and a second connection is accepted by the kernel
  and never read. `VlcRemote` keeps a connection only if the peer is the
  attached VLC and it then answers a harmless `atrack`; one unanswered attempt
  is retried a second later (a reload), and `_dropRemote` closes before
  anything else. Replies are matched to commands by verb, and one not in by 2 s
  ends the connection; the bar reconnects next time it comes up.
- **While paused, VLC answers almost everything with "Press pause to
  continue."** but still takes `key` hotkeys. `VlcRemote` keeps the lists read
  while playing (on connect, and whenever the bar comes up playing), shows those
  paused, and picks a track paused by pressing `key-audio-track` or
  `key-subtitle-track` as many times as it takes. Chapters use
  `key-chapter-next/prev`.
- **Subtitle timing** is VLC's `key-subdelay-*` hotkeys, 50 ms a press. VLC
  cannot be asked the delay, so the value is tracked here and reset on each new
  input; changes from VLC's own keys are not in it.
- **Two hotkey presses come at once**, so lines are queued.
- **A subtitle that already started is not drawn after a track switch**; the
  next one is. Not a failed switch.

## mpv

- **mpv answers while paused**, so nothing is cached: one `request_id` per
  request, events (`property-change` on `sub-delay`, `start-file`) interleaved.
  `sub-delay` is observed, so the Timing row shows what mpv has.
- **`chapter` is unavailable on a file with no chapters**: it is asked only when
  `chapter-list` is not empty. A decrement of `chapter` may restart the current
  one.
