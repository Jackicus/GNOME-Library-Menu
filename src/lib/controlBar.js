import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {formatTime as formatClock} from 'resource:///org/gnome/shell/misc/dateUtils.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';

import {RATES, formatTime} from './playerActions.js';
import {Duration, Ease, RISE} from './anim.js';
import {TracksMenu} from './tracksMenu.js';

// Logical px on each side; the panel's max-width caps the width on a large monitor.
const SIDE_MARGIN = 32;
const TICK_MS = 250;
// Between volume writes while the slider is dragged, which moves it ~50 times a second.
const VOLUME_INTERVAL_MS = 100;
// Logical px at 100%. St sizes a button's icon from the theme, not the panel's
// font, so bar-scale multiplies these in JS.
const ICON_SIZE = 16;
const PLAY_ICON_SIZE = 22;

const scaleFactor = () => St.ThemeContext.get_for_stage(global.stage).scale_factor;

// The shell's formatting follows the 12/24-hour setting; its `%l` is space-padded.
const clockTime = dateTime => formatClock(dateTime, {timeOnly: true}).trim();

// [start | centre | end] with the centre on the row's middle however long the
// title is, unless the end needs more than its half: then the title gives way.
const CentredRowLayout = GObject.registerClass(class LibraryPlayerCentredRowLayout extends Clutter.LayoutManager {
    vfunc_get_preferred_width(container, forHeight) {
        const [start, centre, end] = container.get_children();
        const [cMin, cNat] = centre.get_preferred_width(forHeight);
        const [sMin, sNat] = start.get_preferred_width(forHeight);
        const [eMin, eNat] = end.get_preferred_width(forHeight);
        return [cMin + 2 * Math.max(sMin, eMin), cNat + 2 * Math.max(sNat, eNat)];
    }

    vfunc_get_preferred_height(container, _forWidth) {
        let min = 0, nat = 0;
        for (const child of container.get_children()) {
            const [m, n] = child.get_preferred_height(-1);
            min = Math.max(min, m);
            nat = Math.max(nat, n);
        }
        return [min, nat];
    }

    vfunc_allocate(container, box) {
        const [start, centre, end] = container.get_children();
        const width = box.get_width();
        const height = box.get_height();
        const gap = container.get_theme_node().get_length('spacing');
        const rtl = container.get_text_direction() === Clutter.TextDirection.RTL;
        const [, cNat] = centre.get_preferred_width(height);
        const cWidth = Math.min(cNat, width);
        let cX = Math.round((width - cWidth) / 2);
        const [, eNat] = end.get_preferred_width(height);
        const shortfall = eNat - (width - cX - cWidth - gap);
        if (shortfall > 0)
            cX = Math.max(0, cX - shortfall);

        const place = (child, x1, x2, align) => {
            const room = Math.max(0, x2 - x1);
            const [, natW] = child.get_preferred_width(height);
            const w = Math.min(natW, room);
            const [, natH] = child.get_preferred_height(w);
            const h = Math.min(natH, height);
            let x = align === 'end' ? x2 - w : x1;
            if (rtl)
                x = width - x - w;
            const y = Math.round((height - h) / 2);
            child.allocate(Clutter.ActorBox.new(box.x1 + x, box.y1 + y, box.x1 + x + w, box.y1 + y + h));
        };
        place(start, 0, cX - gap, 'start');
        place(centre, cX, cX + cWidth, 'start');
        place(end, cX + cWidth + gap, width, 'end');
    }
});

function iconButton(iconName, accessibleName, styleClass = 'screenshot-ui-type-button ml-player-button') {
    return new St.Button({
        style_class: styleClass,
        icon_name: iconName,
        accessible_name: accessibleName,
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
}

// Left and Right step by seek-step and volume-step, not the Slider's tenth of the
// whole. Captured, as the Slider's own key binding acts before any signal.
function arrowKeys(bar, slider, forward, back) {
    const keys = new Clutter.KeyController();
    keys.connect('key-press', () => {
        const [, key] = keys.get_key();
        if (key !== Clutter.KEY_Right && key !== Clutter.KEY_Left)
            return Clutter.EVENT_PROPAGATE;
        const rtl = slider.get_text_direction() === Clutter.TextDirection.RTL;
        bar.emit('action', (key === Clutter.KEY_Right) !== rtl ? forward : back);
        return Clutter.EVENT_STOP;
    });
    slider.add_action_full('ml-player-arrow-keys', Clutter.EventPhase.CAPTURE, keys);
}

// A wheel notch skips once by seek-step; touchpad deltas add up to whole notches.
function seekScroll(bar, actor, phase) {
    const scroll = new Clutter.ScrollController({
        flags: Clutter.ScrollControllerFlags.DISCRETE |
            Clutter.ScrollControllerFlags.SCROLL_VERTICAL |
            Clutter.ScrollControllerFlags.SCROLL_HORIZONTAL,
    });
    scroll.connect('scroll', (_scroll, _sprite, _source, dx, dy) => {
        const notches = dx - dy;
        for (let i = 0; i < Math.abs(notches); i++)
            bar.emit('action', notches > 0 ? 'seek-forward' : 'seek-back');
    });
    actor.add_action_full('ml-player-seek-scroll', phase, scroll);
}

// Greyed out and out of the focus chain together, as popupMenu.js syncSensitive does.
function setSensitive(actor, on) {
    actor.reactive = on;
    actor.can_focus = on;
}

function volumeIcon(volume) {
    if (volume <= 0)
        return 'audio-volume-muted-symbolic';
    if (volume < 0.34)
        return 'audio-volume-low-symbolic';
    if (volume < 0.67)
        return 'audio-volume-medium-symbolic';
    return 'audio-volume-high-symbolic';
}

export const ControlBar = GObject.registerClass({
    Signals: {'action': {param_types: [GObject.TYPE_STRING]}},
}, class LibraryPlayerBar extends Clutter.Actor {
    // The OSD's arrangement (osdWindow.js): the constraint sizes the actor to the
    // monitor, and the alignment shrinks it around the panel.
    constructor() {
        super({
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END,
            visible: false,
            opacity: 0,
        });
        this._constraint = new Layout.MonitorConstraint({index: 0});
        this.add_constraint(this._constraint);

        this._player = null;
        this._syncing = false;
        this._seeking = false;
        this._volumeDragging = false;
        this._volumeId = 0;
        this._tickId = 0;
        this._tickMode = null;          // 'playing', 'idle' or null
        this._shown = false;            // arriving or here, not leaving
        this._unredirectOff = false;
        this._top = false;
        this._monitorIndex = 0;
        this._showClock = false;
        this._showLength = false;
        this._sleepText = null;         // null: no sleep button
        this._previousNext = 'always';  // 'always', 'playlist' or 'never'
        this._hidden = [];              // playerActions.js BAR_BUTTONS ids
        this._dismissible = false;

        // A press on a window never reaches the stage, so while a press outside
        // may put the bar away, this bare actor under it takes the press.
        this._catcherConstraint = new Layout.MonitorConstraint({index: 0});
        this._catcher = new Clutter.Actor({reactive: true, visible: false});
        this._catcher.add_constraint(this._catcherConstraint);
        const press = new Clutter.ClickGesture({recognize_on_press: true});
        press.connect('recognize', () => this.emit('action', 'hide-bar'));
        this._catcher.add_action(press);
        Main.uiGroup.add_child(this._catcher);

        this.panel = new St.BoxLayout({
            style_class: 'screenshot-ui-panel ml-player-bar',
            accessible_role: Atk.Role.TOOL_BAR,
            accessible_name: 'Media controls',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: true,
            track_hover: true,
        });
        this.add_child(this.panel);
        // max-width is in em, so the width follows the style.
        this.panel.connect('style-changed', () => this.setMonitor(this._monitorIndex));
        global.focus_manager.add_group(this.panel);
        // After the focus group's own controller, which moves the focus, and
        // before the pop-out's, which toggles it from its source, the panel.
        const keys = new Clutter.KeyController();
        keys.connect('key-press', () => {
            const [, key] = keys.get_key();
            if (key === Clutter.KEY_Escape) {
                this.emit('action', 'hide-bar');
                return Clutter.EVENT_STOP;
            }
            switch (key) {
            case Clutter.KEY_Up:
            case Clutter.KEY_Down:
            case Clutter.KEY_Left:
            case Clutter.KEY_Right:
            case Clutter.KEY_Return:
            case Clutter.KEY_KP_Enter:
            case Clutter.KEY_space:
                return Clutter.EVENT_STOP;
            default:
                return Clutter.EVENT_PROPAGATE;
            }
        });
        this.panel.add_action(keys);
        seekScroll(this, this.panel, Clutter.EventPhase.BUBBLE);

        this._buildSeekRow();
        this._buildControlRow();

        this._icons = [
            ...[this._previous, this._back, this._forward, this._next, this._tracks, this._mute, this._close]
                .map(button => [button.child, ICON_SIZE]),
            [this._play.child, PLAY_ICON_SIZE],
            [this._sleepIcon, ICON_SIZE],
        ];

        this.tracksMenu = new TracksMenu(this.panel, this._tracks);
        this._menuManager = new PopupMenu.PopupMenuManager(this.panel);
        this._menuManager.addMenu(this.tracksMenu);
        this.tracksMenu.connect('open-state-changed', () => this._syncCatcher());
        this.connect('notify::translation-y', () => this.tracksMenu.reposition());
        this.connect('destroy', () => this._onDestroy());
    }

    get dragging() {
        return this._seeking || this._volumeDragging;
    }

    get hovered() {
        return this.panel.hover;
    }

    get menuOpen() {
        return this.tracksMenu.isOpen;
    }

    _buildSeekRow() {
        const row = new St.BoxLayout({style_class: 'ml-player-seek-row', x_expand: true});
        this._elapsed = new St.Label({style_class: 'ml-player-time ml-player-elapsed', y_align: Clutter.ActorAlign.CENTER});
        this._seek = new Slider(0);
        this._seek.add_style_class_name('ml-player-seek');
        this._seek.accessible_name = 'Position';
        this._remaining = new St.Label({style_class: 'ml-player-time ml-player-remaining', y_align: Clutter.ActorAlign.CENTER});
        // Out of the focus chain: the slider's Left and Right skip, Up and Down leave the row.
        this._lengthToggle = new St.Button({
            style_class: 'ml-player-time-button',
            accessible_name: 'Time remaining',
            child: this._remaining,
            can_focus: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._lengthToggle.connect('clicked', () => this.emit('action', 'toggle-length'));
        row.add_child(this._elapsed);
        row.add_child(this._seek);
        row.add_child(this._lengthToggle);
        this.panel.add_child(row);

        this._seek.connect('drag-begin', () => {
            this._seeking = true;
        });
        this._seek.connect('drag-end', () => {
            this._seeking = false;
            if (this._player?.length)
                this._player.seekTo(this._seek.value * this._player.length);
        });
        this._seek.connect('notify::value', () => {
            if (this._seeking && !this._syncing)
                this._tick();
        });
        // Captured, as the Slider's own scrolling acts before any signal.
        seekScroll(this, this._seek, Clutter.EventPhase.CAPTURE);
        arrowKeys(this, this._seek, 'seek-forward', 'seek-back');
    }

    _buildControlRow() {
        const row = new St.Widget({
            style_class: 'ml-player-control-row',
            layout_manager: new CentredRowLayout(),
            x_expand: true,
        });

        const info = new St.BoxLayout({
            style_class: 'ml-player-info',
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._title = new St.Label({style_class: 'ml-player-title'});
        this._subtitle = new St.Label({style_class: 'ml-player-subtitle'});
        this._clock = new St.Label({style_class: 'ml-player-subtitle ml-player-clock', visible: false});
        for (const label of [this._title, this._subtitle, this._clock]) {
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            info.add_child(label);
        }

        const transport = new St.BoxLayout({style_class: 'ml-player-transport'});
        this._previous = iconButton('media-skip-backward-symbolic', 'Previous');
        this._back = iconButton('media-seek-backward-symbolic', 'Skip back');
        this._play = iconButton('media-playback-start-symbolic', 'Play', 'icon-button default ml-player-button ml-player-play');
        this._forward = iconButton('media-seek-forward-symbolic', 'Skip forward');
        this._next = iconButton('media-skip-forward-symbolic', 'Next');
        const actions = [
            [this._previous, 'previous'], [this._back, 'seek-back'], [this._play, 'play-pause'],
            [this._forward, 'seek-forward'], [this._next, 'next'],
        ];
        for (const [button, action] of actions) {
            button.connect('clicked', () => this.emit('action', action));
            transport.add_child(button);
        }

        const extras = new St.BoxLayout({style_class: 'ml-player-extras', y_align: Clutter.ActorAlign.CENTER});
        this._tracks = iconButton('media-view-subtitles-symbolic', 'Audio and subtitles');
        this._tracks.visible = false;
        this._tracks.connect('clicked', () => this.emit('action', 'tracks'));
        this._sleep = new St.Button({
            style_class: 'screenshot-ui-type-button ml-player-button ml-player-sleep',
            accessible_name: 'Sleep timer',
            can_focus: true,
            visible: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const sleepBox = new St.BoxLayout({style_class: 'ml-player-sleep-box'});
        this._sleepIcon = new St.Icon({icon_name: 'weather-clear-night-symbolic', style_class: 'ml-player-sleep-icon'});
        sleepBox.add_child(this._sleepIcon);
        this._sleepLabel = new St.Label({style_class: 'ml-player-sleep-label', y_align: Clutter.ActorAlign.CENTER});
        sleepBox.add_child(this._sleepLabel);
        this._sleep.set_child(sleepBox);
        this._sleep.connect('clicked', () => this.emit('action', 'sleep-timer'));
        this._mute = iconButton('audio-volume-high-symbolic', 'Mute');
        this._mute.connect('clicked', () => this.emit('action', 'mute'));
        this._volume = new Slider(1);
        this._volume.add_style_class_name('ml-player-volume');
        this._volume.accessible_name = 'Volume';
        this._volume.x_expand = false;
        this._volume.y_align = Clutter.ActorAlign.CENTER;
        this._volume.connect('drag-begin', () => {
            this._volumeDragging = true;
        });
        this._volume.connect('drag-end', () => {
            this._volumeDragging = false;
            this._writeVolume();
        });
        this._volume.connect('notify::value', () => {
            if (this._syncing)
                return;
            if (!this._volumeDragging) {
                this._writeVolume();
            } else if (!this._volumeId) {
                this._volumeId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, VOLUME_INTERVAL_MS, () => {
                    this._volumeId = 0;
                    this._writeVolume();
                    return GLib.SOURCE_REMOVE;
                });
            }
        });
        arrowKeys(this, this._volume, 'volume-up', 'volume-down');
        this._rate = new St.Button({
            style_class: 'screenshot-ui-type-button ml-player-button ml-player-rate',
            label: '1×',
            accessible_name: 'Playback speed',
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._rate.connect('clicked', () => this._cycleRate());
        this._close = iconButton('window-close-symbolic', 'Close the player');
        this._close.connect('clicked', () => this.emit('action', 'quit'));
        for (const child of [this._tracks, this._sleep, this._mute, this._volume, this._rate, this._close])
            extras.add_child(child);

        row.add_child(info);
        row.add_child(transport);
        row.add_child(extras);
        this.panel.add_child(row);
    }

    _writeVolume() {
        if (this._volumeId)
            GLib.Source.remove(this._volumeId);
        this._volumeId = 0;
        this._player?.setVolume(this._volume.value);
    }

    setPlayer(player) {
        if (player === this._player)
            return;
        this._player?.disconnectObject(this);
        this._player = player;
        this._player?.connectObject('changed', () => this.sync(), this);
        this.sync();
    }

    // Off the stage the panel has no style to read max-width from; style-changed
    // calls this again.
    setMonitor(index) {
        const monitor = Main.layoutManager.monitors[index];
        if (!monitor)
            return;
        if (index !== this._monitorIndex)
            this.tracksMenu.close();
        this._monitorIndex = index;
        this._constraint.index = index;
        this._catcherConstraint.index = index;
        if (!this.panel.get_stage())
            return;
        let width = monitor.width - 2 * SIDE_MARGIN * scaleFactor();
        const maxWidth = this.panel.get_theme_node().get_max_width();
        if (maxWidth >= 0)
            width = Math.min(width, maxWidth);
        this.panel.width = width;
    }

    // Every size in the stylesheet is in em, so one font size scales the lot.
    setScale(percent) {
        const scale = percent / 100;
        const style = percent === 100 ? null : `font-size: ${percent}%;`;
        this.panel.style = style;
        this.tracksMenu.actor.style = style;
        for (const [icon, size] of this._icons)
            icon.icon_size = Math.round(size * scale);
        this.tracksMenu.setIconSize(Math.round(ICON_SIZE * scale));
        this.setMonitor(this._monitorIndex);
    }

    setTop(top) {
        this._top = top;
        this.y_align = top ? Clutter.ActorAlign.START : Clutter.ActorAlign.END;
        if (top)
            this.panel.add_style_class_name('ml-player-top');
        else
            this.panel.remove_style_class_name('ml-player-top');
        this.tracksMenu.close();
        this.tracksMenu.actor.updateArrowSide(top ? St.Side.TOP : St.Side.BOTTOM);
    }

    setRemote(remote) {
        this._tracks.visible = !!remote;
        this.tracksMenu.setRemote(remote);
    }

    openTracks({focus = false} = {}) {
        if (!this._tracks.visible)
            return;
        if (this.tracksMenu.isOpen)
            this.tracksMenu.close();
        else
            this.tracksMenu.openFresh({focus});
    }

    setButtons(previousNext, hidden) {
        this._previousNext = previousNext;
        this._hidden = hidden;
        const shown = id => !hidden.includes(id);
        this._back.visible = shown('skip');
        this._forward.visible = shown('skip');
        this._mute.visible = shown('volume');
        this._volume.visible = shown('volume');
        this._close.visible = shown('close');
        this.sync();
    }

    setShowLength(show) {
        this._showLength = show;
        this._lengthToggle.accessible_name = show ? 'Total length' : 'Time remaining';
        this._tick();
    }

    setClock(show) {
        this._showClock = show;
        this._clock.visible = show;
        this._tick();
        this._updateTicking();
    }

    // `text()` labels the sleep button as it runs; null hides it.
    setSleep(text) {
        this._sleepText = text;
        this._sleep.visible = !!text;
        this._tick();
        this._updateTicking();
    }

    sync() {
        const p = this._player;
        if (!p)
            return;
        this._syncing = true;
        this._title.text = p.title || p.identity || 'Unknown';
        const subtitle = p.artist || (p.title ? p.identity : '');
        this._subtitle.text = subtitle;
        this._subtitle.visible = !!subtitle;

        this._play.icon_name = p.playing ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        this._play.accessible_name = p.playing ? 'Pause' : 'Play';
        setSensitive(this._previous, p.canGoPrevious);
        setSensitive(this._next, p.canGoNext);
        // Both or neither, so play stays in the middle of the transport.
        const previousNext = this._previousNext === 'always' ||
            (this._previousNext === 'playlist' && p.hasPlaylist);
        this._previous.visible = previousNext;
        this._next.visible = previousNext;
        setSensitive(this._back, p.canSeek);
        setSensitive(this._forward, p.canSeek);
        setSensitive(this._seek, p.canSeek && p.length > 0);

        if (!this._volumeDragging)
            this._volume.value = Math.min(1, p.volume);
        this._mute.icon_name = volumeIcon(p.volume);
        this._mute.accessible_name = p.muted ? 'Unmute' : 'Mute';

        this._rate.visible = p.hasRate && !this._hidden.includes('rate');
        this._rate.label = `${Number(p.rate.toFixed(2))}×`;
        // The accessible name replaces the label, so it carries the value.
        this._rate.accessible_name = 'Playback speed: %s'.format(this._rate.label);
        this._syncing = false;
        this._tick();
        this._updateTicking();
    }

    _tick() {
        const p = this._player;
        if (!p)
            return;
        const at = this._seeking ? this._seek.value * p.length : p.now;
        this._elapsed.text = formatTime(at);
        if (!p.length)
            this._remaining.text = '';
        else if (this._showLength)
            this._remaining.text = formatTime(p.length);
        else
            this._remaining.text = `−${formatTime(p.length - at)}`;
        if (this._showClock) {
            const now = GLib.DateTime.new_now_local();
            const left = p.length ? (p.length - at) / (p.rate || 1) : 0;
            this._clock.text = left
                ? `${clockTime(now)} · ends at ${clockTime(now.add_seconds(left))}`
                : clockTime(now);
        }
        if (this._sleepText) {
            const text = this._sleepText();
            this._sleepLabel.text = text;
            this._sleepLabel.visible = !!text;
            this._sleep.accessible_name = text ? 'Sleep timer: %s'.format(text) : 'Sleep timer';
        }
        if (!this._seeking) {
            this._syncing = true;
            this._seek.value = p.length ? Math.min(1, at / p.length) : 0;
            this._syncing = false;
        }
    }

    // Only while something on the bar moves: the running time every TICK_MS,
    // the clock and the sleep countdown once a second.
    _updateTicking() {
        let mode = null;
        if (this.visible && this._player?.playing)
            mode = 'playing';
        else if (this.visible && (this._showClock || this._sleepText))
            mode = 'idle';
        if (mode === this._tickMode)
            return;
        if (this._tickId)
            GLib.Source.remove(this._tickId);
        this._tickId = 0;
        this._tickMode = mode;
        if (!mode)
            return;
        const tick = () => {
            this._tick();
            return GLib.SOURCE_CONTINUE;
        };
        this._tickId = mode === 'playing'
            ? GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_MS, tick)
            : GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, tick);
        GLib.Source.set_name_by_id(this._tickId, '[library-menu] tick');
    }

    _cycleRate() {
        const p = this._player;
        const allowed = RATES.filter(r => r >= p.minRate && r <= p.maxRate);
        const at = allowed.findIndex(r => r > p.rate + 1e-6);
        p.setRate(allowed[at === -1 ? 0 : at]);
    }

    reveal() {
        // Restarting the ease on every pointer poll stalled the opacity at 254 (docs/notes.md).
        if (this._shown)
            return;
        this._shown = true;
        if (!this._unredirectOff) {
            // As the OSD does: a fullscreen window scanned out directly would hide the bar.
            global.compositor.disable_unredirect();
            this._unredirectOff = true;
        }
        this.remove_all_transitions();
        if (!this.visible) {
            this.translation_y = (this._top ? -RISE : RISE) * scaleFactor();
            this.show();
        }
        // Above later chrome, as osdWindow.js does.
        this.get_parent().set_child_above_sibling(this, null);
        this._syncCatcher();
        this.ease({
            opacity: 255,
            translation_y: 0,
            duration: Duration.NORMAL,
            mode: Ease.OUT,
        });
        this._tick();
        this._updateTicking();
    }

    conceal({animate = true} = {}) {
        if (!this.visible)
            return;
        this._shown = false;
        this._syncCatcher();
        this.remove_all_transitions();
        this.tracksMenu.close();
        const done = () => {
            this.hide();
            this.opacity = 0;
            this.translation_y = 0;
            this._updateTicking();
            if (this._unredirectOff) {
                global.compositor.enable_unredirect();
                this._unredirectOff = false;
            }
        };
        if (!animate) {
            done();
            return;
        }
        this.ease({
            opacity: 0,
            duration: Duration.FAST,
            mode: Ease.OUT,
            onComplete: done,
        });
    }

    // Whether a press anywhere else on the monitor puts the bar away.
    setDismissible(on) {
        this._dismissible = on;
        this._syncCatcher();
    }

    _syncCatcher() {
        const want = this._shown && this._dismissible && !this.menuOpen;
        if (want && !this._catcher.visible)
            this.get_parent().set_child_below_sibling(this._catcher, this);
        this._catcher.visible = want;
    }

    focusDefault() {
        this._play.grab_key_focus();
    }

    _onDestroy() {
        this.tracksMenu.destroy();
        this._catcher.destroy();
        this._player?.disconnectObject(this);
        if (this._tickId)
            GLib.Source.remove(this._tickId);
        if (this._volumeId)
            GLib.Source.remove(this._volumeId);
        if (this._unredirectOff)
            global.compositor.enable_unredirect();
        global.focus_manager.remove_group(this.panel);
    }
});
