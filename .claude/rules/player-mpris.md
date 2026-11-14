---
paths:
  - "src/lib/mpris.js"
---

# MPRIS: the bar's players, their position, their playlists

- **Position is never polled.** MPRIS never announces where playback has got
  to, so `Player` keeps the last reading and the monotonic time it was taken,
  and `now` reckons forward from that at the current rate while playing. A
  reading is taken when the bar comes up from hidden (`refreshPosition`), when
  a player starts playing, when it moves to a new file, and whenever it
  announces `Seeked`.
- **A reading from before a seek of ours is dropped**: for a second
  (`SEEK_SETTLE`) after one, a reading nearer where it jumped from than where
  it went is stale (`Player.reading`). VLC announces each seek twice, the
  second `Seeked` ~150 ms after the first; in a run of seeks (a held pad
  button, a fast scroll) that second one arrives after the next seek has gone,
  and taken as read it pulled the position back and wasted every other seek.
- **A seek made while VLC is paused is not announced at all.** Ours are
  reckoned here; one from VLC's own keys shows only once it plays again.
- **Seeks** use `SetPosition(trackid, µs)` where the player names its track as
  an object path, relative `Seek` where it does not.
- **Nothing blocks a player**: every call is asynchronous with a 5 s timeout
  (`CALL_TIMEOUT`) and a cancellable that `disable()` cancels. Players are
  found with `NameOwnerChanged` (arg0 namespace `org.mpris.MediaPlayer2`) plus
  one `ListNames` at enable, and followed with `PropertiesChanged` and
  `Seeked`. One `Player` per unique bus name, however many well-known names it
  holds (VLC takes a second per instance).
- **A player's `CanGoNext` says nothing about a playlist**: VLC says true with a
  single file open (certainly under `--loop`, which the nested `player` passes);
  mpv (mpv-mpris 1.2), Celluloid and Showtime say false, Showtime always. `hasPlaylist` counts the `TrackList`'s `Tracks` instead,
  which VLC serves (and announces, as invalidated) although its `HasTrackList`
  says false; a player that keeps no list falls back on `CanGo*`. VLC's list
  is what it started playing with: **empty until playback begins**, announced
  only as it was made, and a file added while it plays is announced but not
  listed, so `Tracks` is read again whenever the bar comes up from hidden
  (`refreshTrackList`).
- **A player may hold the rate to steps of its own.** Showtime has no 0.75 and
  rounds a request for it to 1.0, without announcing anything. `setRate`
  therefore reads `Rate` back after the `Set`; when the player kept another
  value the bar shows that one and `refusedRates` keeps the step out of
  `stepRate`, so "Slower" from 1× reaches 0.5×.
- **`playback.js` follows the same players for the watched marks** with a
  `Player` of its own: it only reads, and keeps no reckoning the bar could use.
- **Several windows of one app each have a player**. `_playerFor` takes the
  player whose `xesam:title` the window's title shows, else the first. For a
  sandboxed player `Player.pid` is xdg-dbus-proxy's and never equals the
  window's, so it is matched by desktop entry.
- **Close deletes the window, then quits** (`playerControls.js` `_quit`): a player still
  on the bus a second later (cvlc, whose window closing leaves it playing) is
  sent MPRIS `Quit`. Quit alone left Showtime frozen full screen: its shutdown
  stops the pipeline with the window still up, and that teardown hangs now and
  then (3 of 5 closes in the nested shell, NVIDIA decoders or not; its own ✕
  hangs the same, out of sight). With the window gone first, the hang, when it
  comes, is the background process's, and the `Quit` sent to it times out.
- **Showtime's** rounding and frozen close are why `setRate` reads back and
  Close deletes the window first; the bar goes only over VLC and mpv now
  (`player.md`), but the code is the player's, not VLC's.
