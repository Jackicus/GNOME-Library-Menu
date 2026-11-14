// The bar over a player the library launched: which player, when the bar is
// seen, and what each action does (.claude/rules/player.md).

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    NAVIGATION, SLEEP_EPISODES, SLEEP_MINUTES, SUBTITLE_SHIFT_MS, normaliseName, playerNames, repeats, stepRate,
} from './playerActions.js';
import {ControlBar} from './controlBar.js';
import {Gamepads} from './playerPads.js';
import {PlayerRegistry, clock} from './mpris.js';
import {MpvRemote} from './mpvRemote.js';
import {VlcRemote} from './vlcRemote.js';

const POINTER_INTERVAL = 100;
const EDGE_FRACTION = 0.2;
// Seconds before a VLC without a socket is tried again as the bar comes up.
const REMOTE_RETRY = 10;
// Seconds before the end: a player that exits at the end of its file stays open.
const SLEEP_END_MARGIN = 0.5;
// A file left this near its end was watched: room for the credits and a lagging reckoning.
const SLEEP_WATCHED_MARGIN = 30;
// Milliseconds a player has to leave once its window is closed, before it is asked to quit.
const QUIT_DELAY = 1000;

// Inherited by whatever the player starts, and still there after a lock or a shell restart.
const MARK = 'LIBRARY_MENU_PLAYER=1';
const decoder = new TextDecoder();

// Turn the player's own fullscreen controls off, and open the socket its tracks
// come from (lineRemote.js finds it from the process).
const vlcFlags = socket => ['--no-qt-fs-controller', '--extraintf=oldrc', `--rc-unix=${socket}`, '--rc-fake-tty'];
const mpvFlags = socket => ['--osc=no', `--input-ipc-server=${socket}`];
const LAUNCH_FLAGS = {
    'vlc': vlcFlags, 'cvlc': vlcFlags, 'org.videolan.VLC': vlcFlags, 'mpv': mpvFlags, 'io.mpv.Mpv': mpvFlags,
};

// `argv` launching the player under the bar, or null for a player it does not know.
export function controlledArgv(argv) {
    const player = [GLib.path_get_basename(argv[0]), ...argv.slice(1)].find(arg => LAUNCH_FLAGS[arg]);
    if (!player)
        return null;
    // A Unix socket path is at most 107 bytes; $XDG_RUNTIME_DIR is short and private.
    const socket = GLib.build_filenamev([GLib.get_user_runtime_dir(),
        `library-menu-${GLib.uuid_string_random().slice(0, 8)}.sock`]);
    return ['env', MARK, ...argv, ...LAUNCH_FLAGS[player](socket)];
}

// Whether process `pid`, or one it was started from, came from controlledArgv().
// A sandboxed player is a child of the `flatpak run` that was launched.
function isControlled(pid) {
    while (pid > 1) {
        let environ, stat;
        try {
            environ = decoder.decode(GLib.file_get_contents(`/proc/${pid}/environ`)[1]);
            stat = decoder.decode(GLib.file_get_contents(`/proc/${pid}/stat`)[1]);
        } catch {
            return false;
        }
        if (environ.split('\0').includes(MARK))
            return true;
        // "pid (name) state ppid …", and the name may hold spaces.
        pid = parseInt(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
    }
    return false;
}

export class PlayerControls {
    constructor(settings) {
        this._settings = settings;
        this._registry = null;
        this._bar = null;
        this._pads = null;
        this._player = null;
        this._window = null;
        this._pointerId = 0;
        this._pointerTimeoutId = 0;
        this._hideId = 0;
        this._grab = null;
        this._touch = null;
        this._updateId = 0;
        this._watched = null;
        this._remote = null;
        this._remoteTriedAt = -Infinity;
        this._remoteRetryId = 0;
        this._keyboard = null;
        this._sleep = null;
        this._sleepId = 0;
        this._quitId = 0;
    }

    enable() {
        this._bar = new ControlBar();
        this._bar.connect('action', (_bar, action) => this.perform(action));
        this._bar.panel.connect('notify::hover', () => this._armHide());
        this._bar.tracksMenu.connect('open-state-changed', () => this._armHide());
        // Under the grab every press or touch reaches the panel; one outside it closes the bar.
        const outside = new Clutter.ClickGesture({recognize_on_press: true});
        outside.connect('may-recognize', () => !!this._grab &&
            !this._bar.panel.contains(global.stage.get_event_actor(outside.get_point_event(0))));
        outside.connect('recognize', () => this._conceal());
        this._bar.panel.add_action(outside);
        const settings = this._settings;
        const syncButtons = () =>
            this._bar.setButtons(settings.get_string('previous-next'), settings.get_strv('hidden-buttons'));
        const barSettings = {
            'bar-scale': () => this._bar.setScale(settings.get_int('bar-scale')),
            'bar-position': () => this._bar.setTop(settings.get_string('bar-position') === 'top'),
            'previous-next': syncButtons,
            'hidden-buttons': syncButtons,
            'show-clock': () => this._bar.setClock(settings.get_boolean('show-clock')),
            'show-length': () => this._bar.setShowLength(settings.get_boolean('show-length')),
        };
        for (const [key, apply] of Object.entries(barSettings)) {
            apply();
            settings.connectObject(`changed::${key}`, apply, this);
        }
        // trackFullscreen stays off (the default), so the bar is shown over fullscreen windows.
        Main.layoutManager.addChrome(this._bar);

        this._registry = new PlayerRegistry();
        this._registry.connectObject(
            'added', () => this._queueUpdate(),
            'removed', (_registry, player) => {
                if (this._sleep?.player === player)
                    this._setSleep(null);
                this._queueUpdate();
            },
            // Once a player is attached, only the window's own pid, arriving
            // late, may replace one matched by desktop entry.
            'changed', (_registry, player) => {
                if (!this._player ||
                    (player.pid && player.pid === this._window?.get_pid() && this._player.pid !== player.pid))
                    this._queueUpdate();
            },
            this);
        this._registry.enable();

        global.display.connectObject('notify::focus-window', () => this._queueUpdate(), this);
        Main.overview.connectObject(
            'showing', () => this._queueUpdate(),
            'hidden', () => this._queueUpdate(),
            this);
        Main.layoutManager.connectObject('monitors-changed', () => this._queueUpdate(), this);
        this._settings.connectObject(
            'changed::pointer-reveal', () => this._syncPointerWatch(),
            'changed::gamepad-enabled', () => this._syncGamepads(),
            'changed::sleep-timer', () => this._syncSleep(),
            'changed::sleep-timer-mode', () => {
                this._setSleep(null);
                this._syncSleep();
            },
            this);
        this._syncSleep();

        Main.wm.addKeybinding('toggle-bar', this._settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.POPUP, () => this._toggleFocus());

        this._syncGamepads();
        this._update();
    }

    disable() {
        Main.wm.removeKeybinding('toggle-bar');
        this._setSleep(null);
        this._dropRemote();
        this._ungrab();
        // Disposed now, so the virtual keyboard leaves the seat at once.
        this._keyboard?.run_dispose();
        this._keyboard = null;
        this._pads?.disable();
        this._pads = null;
        this._stopPointerWatch();
        this._watchWindow(null);
        this._player?.disconnectObject(this);
        this._player = null;
        this._window = null;
        global.display.disconnectObject(this);
        Main.overview.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._registry.disconnectObject(this);
        this._registry.disable();
        this._registry = null;
        this._bar.destroy();
        this._bar = null;
        if (this._hideId)
            GLib.Source.remove(this._hideId);
        this._hideId = 0;
        if (this._updateId)
            GLib.Source.remove(this._updateId);
        this._updateId = 0;
        if (this._quitId)
            GLib.Source.remove(this._quitId);
        this._quitId = 0;
    }

    // Focus moves as the overview hides: such changes are settled together.
    _queueUpdate() {
        if (this._updateId)
            return;
        this._updateId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._updateId = 0;
            this._update();
            return GLib.SOURCE_REMOVE;
        });
    }

    _update() {
        const focused = global.display.focus_window;
        this._watchWindow(focused);
        const window = focused?.is_fullscreen() && !Main.overview.visible && isControlled(focused.get_pid())
            ? focused : null;
        const player = window ? this._playerFor(window) : null;
        this._attach(player, player ? window : null);
    }

    // The focused window can change fullscreen or close without the focus moving.
    _watchWindow(window) {
        if (window === this._watched)
            return;
        this._watched?.disconnectObject(this);
        this._watched = window;
        window?.connectObject(
            'notify::fullscreen', () => this._queueUpdate(),
            'notify::main-monitor', () => this._queueUpdate(),
            'unmanaged', () => this._queueUpdate(),
            this);
    }

    // Several windows of one app (Celluloid) each have a player of their own: the
    // one whose title the window shows.
    _playerFor(window) {
        const players = this._registry.players;
        const choose = found => found.find(p => p.title && window.get_title()?.includes(p.title)) ?? found[0] ?? null;
        const pid = window.get_pid();
        const byPid = pid > 0 ? players.filter(p => p.pid === pid) : [];
        if (byPid.length)
            return choose(byPid);
        const app = Shell.WindowTracker.get_default().get_window_app(window);
        const ids = [app?.get_id(), window.get_sandboxed_app_id(), window.get_gtk_application_id(),
            window.get_wm_class(), window.get_wm_class_instance()].filter(Boolean).map(normaliseName);
        return choose(players.filter(p => p.desktopEntry && ids.includes(normaliseName(p.desktopEntry))));
    }

    _attach(player, window) {
        if (player === this._player && window === this._window) {
            if (window)
                this._bar.setMonitor(window.get_monitor());
            return;
        }
        this._player?.disconnectObject(this);
        this._player = player;
        this._window = window;
        this._dropRemote();
        this._ungrab();
        this._bar.setPlayer(player);
        if (!player) {
            this._bar.conceal({animate: false});
            this._syncPointerWatch();
            return;
        }
        this._bar.setMonitor(window.get_monitor());
        let status = player.status;
        let url = player.url;
        player.connectObject(
            'changed', () => {
                if (player.status !== status || player.url !== url) {
                    status = player.status;
                    url = player.url;
                    this._reveal();
                }
            },
            'seeked', () => this._reveal(),
            this);
        this._syncPointerWatch();
        this._connectRemote(player);
        if (player.status === 'Paused')
            this._reveal();
    }

    _reveal() {
        if (!this._bar.visible) {
            this._player.refreshPosition();
            this._player.refreshTrackList();
            this._readTracks();
            if (!this._remote && clock() - this._remoteTriedAt > REMOTE_RETRY)
                this._connectRemote(this._player);
        }
        this._bar.reveal();
        this._bar.setDismissible(!this._grab && this._player.status === 'Paused');
        this._armHide();
    }

    _conceal() {
        this._bar.conceal();
        this._ungrab();
        if (this._hideId) {
            GLib.Source.remove(this._hideId);
            this._hideId = 0;
        }
    }

    _armHide() {
        if (this._hideId)
            GLib.Source.remove(this._hideId);
        this._hideId = 0;
        if (!this._bar.visible)
            return;
        this._hideId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            this._settings.get_int('hide-delay') * 1000, () => {
                this._hideId = 0;
                if (this._staying())
                    this._armHide();
                else
                    this._conceal();
                return GLib.SOURCE_REMOVE;
            });
        GLib.Source.set_name_by_id(this._hideId, '[library-menu] hide');
    }

    _staying() {
        return this._bar.hovered || this._bar.dragging || !!this._grab || this._bar.menuOpen ||
            (this._settings.get_boolean('stay-while-paused') && this._player?.status === 'Paused');
    }

    _syncPointerWatch() {
        const want = !!this._player && this._settings.get_string('pointer-reveal') !== 'never';
        if (want && !this._pointerId) {
            // Read at most once a POINTER_INTERVAL, however fast the mouse reports.
            this._pointerId = global.backend.get_cursor_tracker().connect('position-invalidated', () => {
                if (this._pointerTimeoutId)
                    return;
                this._pointerTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POINTER_INTERVAL, () => {
                    this._pointerTimeoutId = 0;
                    const [x, y] = global.get_pointer();
                    this._pointerMoved(x, y);
                    return GLib.SOURCE_REMOVE;
                });
                GLib.Source.set_name_by_id(this._pointerTimeoutId, '[library-menu] pointer');
            });
            // The cursor tracker never sees a finger: a touch is a move to where it lands.
            // Turning every sequence down leaves the touch to the rest of the stage.
            this._touch = new Clutter.ClickGesture();
            this._touch.connect('should-handle-sequence', (_gesture, event) => {
                if (event.type() === Clutter.EventType.TOUCH_BEGIN)
                    this._pointerMoved(...event.get_coords());
                return false;
            });
            global.stage.add_action_full('library-menu-touch', Clutter.EventPhase.CAPTURE, this._touch);
        } else if (!want) {
            this._stopPointerWatch();
        }
    }

    _stopPointerWatch() {
        if (this._pointerId)
            global.backend.get_cursor_tracker().disconnect(this._pointerId);
        this._pointerId = 0;
        if (this._pointerTimeoutId)
            GLib.Source.remove(this._pointerTimeoutId);
        this._pointerTimeoutId = 0;
        if (this._touch)
            global.stage.remove_action(this._touch);
        this._touch = null;
    }

    _pointerMoved(x, y) {
        const monitor = Main.layoutManager.monitors[this._window.get_monitor()];
        if (!monitor || x < monitor.x || x >= monitor.x + monitor.width ||
            y < monitor.y || y >= monitor.y + monitor.height)
            return;
        if (this._settings.get_string('pointer-reveal') === 'edge' && !this._bar.hovered) {
            const top = this._settings.get_string('bar-position') === 'top';
            const edge = monitor.height * EDGE_FRACTION;
            if (top ? y >= monitor.y + edge : y < monitor.y + monitor.height - edge)
                return;
        }
        this._reveal();
    }

    _toggleFocus() {
        if (this._grab)
            this._conceal();
        else
            this._enterFocus();
    }

    _enterFocus() {
        if (!this._player || this._grab)
            return;
        this._reveal();
        this._grab = Main.pushModal(this._bar.panel, {actionMode: Shell.ActionMode.POPUP});
        this._bar.setDismissible(false);
        this._bar.focusDefault();
        this._armHide();
    }

    _ungrab() {
        if (!this._grab)
            return;
        Main.popModal(this._grab);
        this._grab = null;
    }

    // Returns whether a player was there to ask.
    perform(action) {
        if (!this._player)
            return false;
        if (this._performQuietly(action))
            return true;
        if (!this._performOnPlayer(action))
            return false;
        this._reveal();
        return true;
    }

    // The actions that leave the bar as it is, or put it as they need it.
    _performQuietly(action) {
        switch (action) {
        case 'quit': this._quit(); break;
        case 'hide-bar': this._conceal(); break;
        case 'navigate': this._toggleFocus(); break;
        case 'tracks': this._openTracks(); break;
        // No reveal: the subtitles being timed are under the bar.
        case 'cycle-audio': this._remote?.cycle('audio'); break;
        case 'cycle-subtitles': this._remote?.cycle('subtitles'); break;
        case 'subtitles-earlier': this._remote?.shiftSubtitles(-SUBTITLE_SHIFT_MS); break;
        case 'subtitles-later': this._remote?.shiftSubtitles(SUBTITLE_SHIFT_MS); break;
        default: return false;
        }
        return true;
    }

    // The actions that bring the bar up.
    _performOnPlayer(action) {
        const p = this._player;
        const seek = this._settings.get_int('seek-step');
        const volume = this._settings.get_int('volume-step') / 100;
        switch (action) {
        case 'play-pause': p.playPause(); break;
        case 'seek-back': p.seekBy(-seek); break;
        case 'seek-forward': p.seekBy(seek); break;
        case 'previous': p.previous(); break;
        case 'next': p.next(); break;
        case 'volume-up': p.setVolume(p.volume + volume); break;
        case 'volume-down': p.setVolume(p.volume - volume); break;
        case 'mute': p.toggleMute(); break;
        case 'slower': p.setRate(stepRate(p.rate, -1, p.minRate, p.maxRate, p.refusedRates)); break;
        case 'faster': p.setRate(stepRate(p.rate, 1, p.minRate, p.maxRate, p.refusedRates)); break;
        case 'show-bar': break;
        case 'toggle-length':
            this._settings.set_boolean('show-length', !this._settings.get_boolean('show-length'));
            break;
        case 'sleep-timer':
            if (!this._settings.get_boolean('sleep-timer'))
                return false;
            this._cycleSleep();
            this._bar.sync();
            break;
        default: return false;
        }
        return true;
    }

    // The window is closed first, as its own close button would: Showtime's MPRIS
    // Quit can leave it frozen full screen. A player still there a moment later
    // (cvlc) is asked to quit.
    _quit() {
        const player = this._player;
        this._conceal();
        this._window.delete(global.get_current_time());
        if (!player.canQuit || this._quitId)
            return;
        this._quitId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, QUIT_DELAY, () => {
            this._quitId = 0;
            if (this._registry.players.includes(player))
                player.quit();
            return GLib.SOURCE_REMOVE;
        });
    }

    // A VLC still busy with a connection from before (a reload) gets one retry.
    // The window's process is the player's: a sandboxed player's bus connection is its proxy's.
    _connectRemote(player, retry = true) {
        this._dropRemote();
        const pid = this._window.get_pid();
        const names = playerNames(player);
        const mpv = names.some(name => name === 'mpv' || name.includes('celluloid'));
        if (pid <= 0 || !mpv && !names.includes('vlc'))
            return;
        this._remoteTriedAt = clock();
        const remote = mpv ? new MpvRemote() : new VlcRemote();
        this._remote = remote;
        remote.open(pid, this._window.get_sandboxed_app_id()).then(ok => {
            if (this._remote !== remote)
                return;
            if (!ok) {
                remote.close();
                this._remote = null;
                if (retry && remote.answered === false) {
                    this._remoteRetryId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                        this._remoteRetryId = 0;
                        if (this._player === player && !this._remote)
                            this._connectRemote(player, false);
                        return GLib.SOURCE_REMOVE;
                    });
                }
                return;
            }
            remote.connectObject('lost', () => {
                if (this._remote === remote)
                    this._dropRemote();
            }, this);
            this._bar.setRemote(remote);
            this._readTracks();
        });
    }

    // VLC serves one client, so the connection is closed before anything else.
    _dropRemote() {
        if (this._remoteRetryId) {
            GLib.Source.remove(this._remoteRetryId);
            this._remoteRetryId = 0;
        }
        const remote = this._remote;
        if (!remote)
            return;
        this._remote = null;
        remote.close();
        remote.disconnectObject(this);
        this._bar.setRemote(null);
    }

    // VLC lists tracks only while playing: read them for a pop-out opened paused.
    _readTracks() {
        if (this._remote && this._player.playing)
            this._remote.state().catch(() => {});
    }

    _openTracks() {
        this._reveal();
        this._bar.openTracks({focus: !!this._grab});
    }

    // Returns what to repeat while held, or null. Decided at the press: an arrow
    // while the bar holds the focus, an action otherwise.
    _onPadButton(button, action) {
        const player = this._player;
        if (!player)
            return null;
        const navigating = () => !!(this._grab || this._bar.menuOpen);
        const key = NAVIGATION[button];
        if (key && navigating()) {
            const keyval = Clutter[`KEY_${key}`];
            this._pressKey(keyval);
            if (key === 'Return' || key === 'Escape')
                return null;
            return () => {
                if (this._player !== player || !navigating())
                    return false;
                this._pressKey(keyval);
                return true;
            };
        }
        if (action === 'tracks' && this._remote)
            this._enterFocus();
        if (!this.perform(action) || !repeats(action))
            return null;
        return () => this._player === player && !(key && navigating()) && this.perform(action);
    }

    // Only called while the bar or its pop-out holds the grab, so the key lands there.
    _pressKey(keyval) {
        if (!this._keyboard) {
            const seat = global.stage.context.get_backend().get_default_seat();
            this._keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        }
        const time = GLib.get_monotonic_time();
        this._keyboard.notify_keyval(time, keyval, Clutter.KeyState.PRESSED);
        this._keyboard.notify_keyval(time, keyval, Clutter.KeyState.RELEASED);
    }

    _syncSleep() {
        const on = this._settings.get_boolean('sleep-timer');
        if (!on)
            this._setSleep(null);
        this._bar.setSleep(on ? () => this._sleepText() : null);
    }

    _sleepText() {
        const sleep = this._sleep;
        if (!sleep || sleep.player !== this._player)
            return '';
        if (sleep.episodes === 1)
            return 'End';
        if (sleep.episodes)
            return '%d eps'.format(sleep.episodes);
        return '%d min'.format(Math.max(1, Math.ceil((sleep.until - clock()) / 60)));
    }

    _cycleSleep() {
        const mine = this._sleep?.player === this._player ? this._sleep : null;
        if (this._settings.get_string('sleep-timer-mode') === 'episodes') {
            const episodes = this._player.length && this._player.url &&
                SLEEP_EPISODES.find(n => n > (mine?.episodes ?? 0));
            this._setSleep(episodes ? {episodes} : null);
            return;
        }
        let at = -1;
        if (mine)
            at = SLEEP_MINUTES.indexOf(mine.episodes ? 'end' : mine.minutes);
        const step = SLEEP_MINUTES[at + 1];
        if (step === undefined || (step === 'end' && !this._player.length))
            this._setSleep(null);
        else
            this._setSleep(step === 'end' ? {episodes: 1} : {minutes: step});
    }

    _setSleep(timer) {
        if (this._sleepId) {
            GLib.Source.remove(this._sleepId);
            this._sleepId = 0;
        }
        for (const id of this._sleep?.signals ?? [])
            this._sleep.player.disconnect(id);
        this._sleep = null;
        if (!timer)
            return;
        const player = this._player;
        this._sleep = {...timer, player, url: player.url, signals: []};
        if (timer.episodes) {
            this._sleep.signals = [
                player.connect('changed', () => this._sleepPlayerChanged()),
                player.connect('seeked', () => this._armSleepEnd()),
            ];
            this._armSleepEnd();
        } else {
            this._sleep.until = clock() + timer.minutes * 60;
            this._sleepId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, timer.minutes * 60, () => {
                this._sleepId = 0;
                this._sleepEnded();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    // A new file counts one episode unless the one before was skipped. A
    // player between files may name none for a moment.
    _sleepPlayerChanged() {
        const sleep = this._sleep;
        const {url, lastFile} = sleep.player;
        if (url && url !== sleep.url) {
            const skipped = lastFile?.length > 0 && lastFile.length - lastFile.reached > SLEEP_WATCHED_MARGIN;
            const counted = !!sleep.url && !skipped;
            sleep.url = url;
            if (counted && --sleep.episodes < 1) {
                this._sleepEnded();
                return;
            }
        }
        this._armSleepEnd();
    }

    _armSleepEnd() {
        if (this._sleepId) {
            GLib.Source.remove(this._sleepId);
            this._sleepId = 0;
        }
        const p = this._sleep.player;
        if (this._sleep.episodes !== 1 || !p.playing || !p.length)
            return;
        const left = Math.max(0, (p.length - p.now) / (p.rate || 1) - SLEEP_END_MARGIN);
        this._sleepId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.round(left * 1000), () => {
            this._sleepId = 0;
            this._sleepEnded();
            return GLib.SOURCE_REMOVE;
        });
    }

    _sleepEnded() {
        const {player} = this._sleep;
        this._setSleep(null);
        player.pause();
    }

    _syncGamepads() {
        const want = this._settings.get_boolean('gamepad-enabled');
        if (want && !this._pads) {
            this._pads = new Gamepads(this._settings, (button, action) => this._onPadButton(button, action));
            this._pads.enable();
        } else if (!want && this._pads) {
            this._pads.disable();
            this._pads = null;
        }
    }
}
