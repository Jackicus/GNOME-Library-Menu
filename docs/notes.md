# Notes

Design reasoning that the code keeps to one line or none.

## Preferences

- A section's page adds to `lib/library.js`'s `SECTIONS` only what the preferences say
  about it; its Add menu (`PAGES.*.sources`) is what can be added, while the list in
  use is `<prefix>-sources`, where one source may appear twice with different keys.
- The sources and folders rows are torn down and rebuilt from their settings
  (`<prefix>-sources`, `<prefix>-folders`, `credentials`) on every change rather than
  kept in step by hand; that is also how a key edited on one section's page shows on
  the other's.
- Adding a keyed source takes the lowest slot the section is not already using, so a
  first TMDB row shares the other section's key and a second row is a second key.
  Removing the last row that names a slot removes its key.
- Shortcut capture follows GNOME Settings (`cc-keyboard-shortcut-editor.c`): Escape
  cancels, Backspace clears, a key the system already answers to is refused rather
  than taken over, and the dialog inhibits system shortcuts while it listens so a
  taken key can be named. The extension grabs whatever `library-shortcut` holds, so
  writing the setting is all the preferences do.
- Rescan runs `backend/scanLibrary.js`, which reads folders, sources,
  keys and the online switches itself; two scans at once queue on its lock.

## Input, playback and motion

- The shell reads no game controller itself, so without `controls.js` a pad does
  nothing on the desktop; libmanette's mapping gives a known pad the kernel's
  gamepad codes, and an unmapped one (a Pico running as a gamepad) its own.
- The watcher follows players over MPRIS because every player worth naming speaks
  it (VLC, mpv with mpv-mpris, Showtime, Celluloid), so a file counts however it
  was opened.
- `anim.js` `flyClone` flies by translation and scale rather than width and
  height: a clone already paints its source scaled into its box, so the frames
  look the same and nothing is re-allocated for 260 ms.
- The season tabs take the shape of the shell's screenshot/screencast switch
  (`.screenshot-ui-shot-cast-container`), and the primary action is the theme's
  `button.default`, so hover, focus and pressed states are the theme's.

## The buttons

- A button per section rather than tabs over the grid: the tab bar took 76 logical px
  of the slot, which the grid's height-limited covers now have, and a section is one
  press from the dash instead of two.
- Each button wears its section's icon from the theme (`video-display-symbolic`, a
  plain screen in Adwaita and Papirus alike, where `tv-symbolic` has a play triangle in
  Papirus; `video-x-generic-symbolic`; `applications-games-symbolic`), so it follows
  the icon theme and St recolours it. The glyph fills the dash's icon size, as the app
  icons beside it do: inset to the size of Show Apps' dots, it read small next to them.

## Scanner

- **Artwork sizes** (`backend/metadata.js` `POSTER_BOX` 512×768, `BACKDROP_BOX` 960×540).
  St decodes an image whole on the compositor thread and keeps it: a 2830×4000 poster
  costs tens of megabytes to draw a 320 px tile. 768 tall covers the detail hero
  (at most `detailView.js` `HERO_MAX_WIDTH_FRACTION` of the widest pane: 722) at scale 1, or a grid cover up to 384 at
  scale 2; a larger cover is drawn scaled up rather than every poster paying for a
  larger decode. The backdrop is the detail pane's dimmed backing.
- **Six lookups at once** (`ENRICH_WORKERS`): the providers are free, and Wikipedia
  answers bursts with HTTP 429.
- The GdkPixbuf and offline measurements are in `src/backend/CLAUDE.md`.

## The player bar

Measured before the bar was part of Library, as an extension of its own. The
machine was not recorded for the first two; both are behaviour of VLC and of
Clutter's easing, not of a GPU.

### VLC announces each seek twice (`mpris.js` `SEEK_SETTLE`)

VLC sends `Seeked` for a seek, then again about 150 ms later. In a run of
seeks (a held pad button, a fast scroll) the second one arrives after the next
seek has gone, and taken as read it pulled the position back, wasting every
other seek. For a second after a seek of ours, a reading nearer where it
jumped from than where it went is dropped (`Player.reading`).

### The fade-in stalls if restarted (`controlBar.js` `reveal`)

Pointer motion asks for the bar every 100 ms (`POINTER_INTERVAL`) while the pointer moves.
Restarting the 200 ms ease each time kept it from settling: the opacity stuck
at 254, rounded down, and the bar never finished arriving. `reveal()` returns
early while the bar is arriving or shown (`_shown`).

### Focus ring and slider fill against the panel (`stylesheet.css`, `.ml-player-*`)

Measured in the nested shell (Shell 50.5, GTX 1080 desktop) on the panel's
`#2e2e33`, with WCAG's contrast ratio; 3:1 is the floor for a focus indicator.
The plain accent as the 2 px ring and the slider fill: blue 3.58, teal 3.60,
green 3.55, yellow 4.49, orange 3.92, red 3.10, pink 3.86, purple 2.29, slate
3.45. The ring is now the theme's own focus colour, `st-mix(accent, white,
60%)`: blue 6.33, red 5.29, purple 5.05, yellow 7.12. The fill is
`st-mix(accent, white, 80%)`, which keeps it the accent: blue 4.76, red 3.90,
purple 3.39, yellow 5.64. The focused slider handle, `st-lighten(accent, 25%)`,
was already 5.58 for purple.

### Mutter's "enable_unredirect_for_display while unredirection is enabled"

Not ours. Mutter keeps one count for every caller and warns when an enable
finds it at zero. The bar's `disable_unredirect()` and `enable_unredirect()`
pair through `_unredirectOff` (`reveal`, the end of `conceal`, `_onDestroy`);
an ease removed before it ends never runs `conceal`'s `onComplete`. The
pop-out's `BoxPointer` pairs on `notify::mapped`, and its destroy handler
does not double it, since `clutter_actor_dispose` freezes notifications first
(both read at gnome-shell and mutter 51.1). In the nested shell (51.1, GTX 1080
desktop, 2026-10-28) reloads with the grab held, with the pop-out open and
mid-fade, and quick open-and-close runs, logged no warning. The one sighting
(twice, 2026-10-27 17:49 UTC) was in the real session, where the bar was not
running.
