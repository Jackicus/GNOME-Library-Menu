// The MPRIS players on the session bus. MPRIS never announces the position, so
// it is reckoned from the last reading by the clock while playing.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

const ROOT = 'org.mpris.MediaPlayer2';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';
const PLAYER = 'org.mpris.MediaPlayer2.Player';
const TRACKLIST = 'org.mpris.MediaPlayer2.TrackList';
const PROPERTIES = 'org.freedesktop.DBus.Properties';
const NO_TRACK = '/org/mpris/MediaPlayer2/TrackList/NoTrack';
// Well under GDBus's 25 s default, so a hung player is given up on.
const CALL_TIMEOUT = 5000;
// Seconds a reading may still be from before a seek of ours: VLC announces
// each seek twice, ~150 ms apart (docs/notes.md).
const SEEK_SETTLE = 1;

export const clock = () => GLib.get_monotonic_time() / 1e6;

export function isCancelled(e) {
    return e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

// What a file is called when its metadata has no title.
function nameFromUrl(url) {
    if (typeof url !== 'string' || !url)
        return '';
    const last = url.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop();
    try {
        return decodeURIComponent(last);
    } catch {
        return last;
    }
}

// One per unique bus name, however many well-known names it holds.
export class Player extends EventEmitter {
    constructor(registry, owner, busName) {
        super();
        this._registry = registry;
        this.owner = owner;
        this.busName = busName;
        this.pid = 0;
        this.identity = '';
        this.desktopEntry = '';
        this.canQuit = false;
        this.status = 'Stopped';
        this.trackId = null;
        this.url = '';
        this.title = '';
        this.artist = '';
        this.length = 0;
        this.volume = 1;
        this.rate = 1;
        this.minRate = 1;
        // Steps the player held at another rate (Showtime has no 0.75).
        this.refusedRates = new Set();
        this.maxRate = 1;
        this.canSeek = false;
        this.canGoNext = false;
        this.canGoPrevious = false;
        // Null from a player that keeps no TrackList.
        this.playlistLength = null;
        this.position = 0;
        this.readAt = clock();
        // {from, to, at}: the last seek of ours.
        this._seek = null;
        // {length, reached} of the file before: the sleep timer tells watched from skipped.
        this.lastFile = null;
        // What Mute puts back: MPRIS has a volume but no mute.
        this._unmuted = null;
    }

    get playing() {
        return this.status === 'Playing';
    }

    get now() {
        let position = this.position;
        if (this.playing)
            position += (clock() - this.readAt) * this.rate;
        return this.length ? Math.min(position, this.length) : position;
    }

    // CanGoNext is no guide (VLC and mpv say true with one file open); the
    // track list is, where the player keeps one.
    get hasPlaylist() {
        if (this.playlistLength)
            return this.playlistLength > 1;
        return this.canGoNext || this.canGoPrevious;
    }

    get hasRate() {
        return this.minRate < 1 || this.maxRate > 1;
    }

    get muted() {
        return this.volume === 0 && this._unmuted !== null;
    }

    read(position) {
        this.position = Math.max(0, position);
        this.readAt = clock();
    }

    // Takes the reckoning as read, before what it runs on changes.
    settle() {
        this.read(this.now);
    }

    // Shortly after a seek of ours, a position nearer where it jumped from than
    // where it went is from before it: dropped, and false returned.
    reading(position) {
        const seek = this._seek;
        if (seek && clock() - seek.at < SEEK_SETTLE) {
            const expected = seek.to + (this.playing ? (clock() - seek.at) * this.rate : 0);
            if (Math.abs(position - expected) > Math.abs(position - seek.from))
                return false;
        }
        this.read(position);
        return true;
    }

    playPause() {
        this._call(PLAYER, 'PlayPause');
    }

    pause() {
        if (this.playing)
            this._call(PLAYER, 'Pause');
    }

    next() {
        if (this.canGoNext)
            this._call(PLAYER, 'Next');
    }

    previous() {
        if (this.canGoPrevious)
            this._call(PLAYER, 'Previous');
    }

    // SetPosition where the player names its track, as MPRIS asks; Seek otherwise.
    seekTo(seconds) {
        if (!this.canSeek)
            return;
        const target = Math.max(0, this.length ? Math.min(seconds, this.length - 1) : seconds);
        if (this.trackId && this.trackId !== NO_TRACK) {
            this._call(PLAYER, 'SetPosition',
                new GLib.Variant('(ox)', [this.trackId, Math.round(target * 1e6)]));
        } else {
            this._call(PLAYER, 'Seek', new GLib.Variant('(x)', [Math.round((target - this.now) * 1e6)]));
        }
        this._seek = {from: this.now, to: target, at: clock()};
        this.read(target);
        this.emit('changed');
    }

    seekBy(seconds) {
        this.seekTo(this.now + seconds);
    }

    setVolume(volume) {
        volume = Math.max(0, Math.min(1, volume));
        if (volume > 0)
            this._unmuted = null;
        this.volume = volume;
        this._set('Volume', new GLib.Variant('d', volume));
        this.emit('changed');
    }

    toggleMute() {
        if (this.muted) {
            this.setVolume(this._unmuted || 0.5);
        } else {
            const was = this.volume || 0.5;
            this.setVolume(0);
            this._unmuted = was;
        }
    }

    setRate(rate) {
        if (!this.hasRate || rate === this.rate)
            return;
        this.settle();
        this.rate = rate;
        this._set('Rate', new GLib.Variant('d', rate), () => this._registry.call(this.owner, PROPERTIES, 'Get',
            new GLib.Variant('(ss)', [PLAYER, 'Rate']), '(v)', reply => {
                const held = reply.recursiveUnpack()[0];
                if (Math.abs(held - rate) < 0.001)
                    return;
                this.refusedRates.add(rate);
                this.rate = held;
                this.emit('changed');
            }));
        this.emit('changed');
    }

    quit() {
        this._call(ROOT, 'Quit');
    }

    refreshPosition() {
        this._registry.call(this.owner, PROPERTIES, 'Get',
            new GLib.Variant('(ss)', [PLAYER, 'Position']), '(v)', reply => {
                const position = reply.recursiveUnpack()[0];
                if (typeof position === 'number' && this.reading(position / 1e6))
                    this.emit('changed');
            });
    }

    // VLC's list is empty until playback begins, and announced only as it was made.
    refreshTrackList() {
        if (this.playlistLength === null)
            return;
        this._registry.call(this.owner, PROPERTIES, 'Get',
            new GLib.Variant('(ss)', [TRACKLIST, 'Tracks']), '(v)', reply => {
                this.applyTrackList({Tracks: reply.recursiveUnpack()[0]});
                this.emit('changed');
            });
    }

    _call(iface, method, args = null) {
        this._registry.call(this.owner, iface, method, args, null, null,
            e => console.warn(`[Library Menu] ${this.identity || this.owner} refused ${method}: ${e.message}`));
    }

    _set(prop, value, onReply = null) {
        this._registry.call(this.owner, PROPERTIES, 'Set', new GLib.Variant('(ssv)', [PLAYER, prop, value]),
            null, onReply,
            e => console.warn(`[Library Menu] ${this.identity || this.owner} refused ${prop}: ${e.message}`));
    }

    applyRoot(props) {
        if ('Identity' in props)
            this.identity = props.Identity ?? '';
        if ('DesktopEntry' in props)
            this.desktopEntry = props.DesktopEntry ?? '';
        if ('CanQuit' in props)
            this.canQuit = !!props.CanQuit;
    }

    applyPlayer(props) {
        if ('Rate' in props) {
            this.settle();
            this.rate = props.Rate > 0 ? props.Rate : 1;
        }
        if ('MinimumRate' in props)
            this.minRate = props.MinimumRate;
        if ('MaximumRate' in props)
            this.maxRate = props.MaximumRate;
        // A new file or playing again is where the reckoning may be furthest off.
        let refresh = 'Metadata' in props && this._applyMetadata(props.Metadata ?? {});
        if ('PlaybackStatus' in props && props.PlaybackStatus !== this.status) {
            this.settle();
            this.status = props.PlaybackStatus;
            refresh = true;
        }
        if (refresh && this.playing)
            this.refreshPosition();
        if ('Position' in props)
            this.read(props.Position / 1e6);
        if ('Volume' in props) {
            this.volume = props.Volume;
            if (this.volume > 0)
                this._unmuted = null;
        }
        for (const [key, field] of [['CanSeek', 'canSeek'], ['CanGoNext', 'canGoNext'],
            ['CanGoPrevious', 'canGoPrevious']]) {
            if (key in props)
                this[field] = !!props[key];
        }
    }

    // Returns whether it names a new file.
    _applyMetadata(meta) {
        const url = meta['xesam:url'] ?? '';
        const changed = url !== this.url;
        if (changed) {
            if (this.url)
                this.lastFile = {length: this.length, reached: this.now};
            this.read(0);
            this._seek = null;
        }
        this.url = url;
        // Some shims send a plain string, which SetPosition cannot take.
        const trackId = meta['mpris:trackid'];
        this.trackId = typeof trackId === 'string' && GLib.variant_is_object_path(trackId) ? trackId : null;
        this.length = Math.max(0, meta['mpris:length'] ?? 0) / 1e6;
        this.title = meta['xesam:title'] || nameFromUrl(url);
        const artist = meta['xesam:artist'];
        this.artist = Array.isArray(artist) ? artist.join(', ') : artist ?? '';
        return changed;
    }

    applyTrackList(props) {
        if (Array.isArray(props.Tracks))
            this.playlistLength = props.Tracks.length;
    }
}

export class PlayerRegistry extends EventEmitter {
    constructor() {
        super();
        this._bus = null;
        this._cancellable = null;
        this._subscriptions = [];
        // Unique name -> Player; well-known name -> unique name.
        this._players = new Map();
        this._names = new Map();
    }

    get players() {
        return [...this._players.values()];
    }

    enable() {
        this._bus = Gio.DBus.session;
        this._cancellable = new Gio.Cancellable();
        const bus = this._bus;
        this._subscriptions = [
            bus.signal_subscribe('org.freedesktop.DBus', 'org.freedesktop.DBus', 'NameOwnerChanged',
                '/org/freedesktop/DBus', ROOT, Gio.DBusSignalFlags.MATCH_ARG0_NAMESPACE,
                (_bus, _sender, _path, _iface, _signal, params) => {
                    const [name, oldOwner, newOwner] = params.deep_unpack();
                    if (oldOwner)
                        this._dropName(name);
                    if (newOwner)
                        this._addName(name, newOwner);
                }),
            bus.signal_subscribe(null, PROPERTIES, 'PropertiesChanged', MPRIS_PATH, null,
                Gio.DBusSignalFlags.NONE,
                (_bus, sender, _path, _iface, _signal, params) => {
                    const player = this._players.get(sender);
                    if (!player)
                        return;
                    const [iface, changed, invalidated] = params.recursiveUnpack();
                    if (iface === PLAYER)
                        player.applyPlayer(changed);
                    else if (iface === ROOT)
                        player.applyRoot(changed);
                    else if (iface === TRACKLIST)
                        player.applyTrackList(changed);
                    else
                        return;
                    // Invalidated properties, as TrackList's Tracks always is, are read again.
                    if (invalidated.length)
                        this._readAll(player, iface);
                    this._changed(player);
                }),
            bus.signal_subscribe(null, PLAYER, 'Seeked', MPRIS_PATH, null, Gio.DBusSignalFlags.NONE,
                (_bus, sender, _path, _iface, _signal, params) => {
                    const player = this._players.get(sender);
                    if (!player || !player.reading(params.recursiveUnpack()[0] / 1e6))
                        return;
                    this._changed(player);
                    player.emit('seeked');
                }),
        ];

        this._busCall('ListNames', null, '(as)', (_bus, result) => {
            let names;
            try {
                [names] = bus.call_finish(result).deep_unpack();
            } catch (e) {
                if (!isCancelled(e))
                    console.warn(`[Library Menu] Could not list media players: ${e.message}`);
                return;
            }
            for (const name of names.filter(n => n.startsWith(`${ROOT}.`)))
                this._lookUpOwner(name);
        });
    }

    disable() {
        for (const id of this._subscriptions)
            this._bus.signal_unsubscribe(id);
        this._subscriptions = [];
        this._cancellable.cancel();
        this._cancellable = null;
        this._players.clear();
        this._names.clear();
        this._bus = null;
    }

    // `onError` gets any error but a cancellation.
    call(owner, iface, method, args, replyType, onReply, onError) {
        this._bus.call(owner, MPRIS_PATH, iface, method, args,
            replyType ? new GLib.VariantType(replyType) : null, Gio.DBusCallFlags.NONE, CALL_TIMEOUT,
            this._cancellable, (bus, result) => {
                let reply;
                try {
                    reply = bus.call_finish(result);
                } catch (e) {
                    if (!isCancelled(e))
                        onError?.(e);
                    return;
                }
                if (this._players.has(owner))
                    onReply?.(reply);
            });
    }

    _changed(player) {
        player.emit('changed');
        this.emit('changed', player);
    }

    _busCall(method, args, replyType, onReply) {
        this._bus.call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', method, args,
            new GLib.VariantType(replyType), Gio.DBusCallFlags.NONE, CALL_TIMEOUT, this._cancellable, onReply);
    }

    _lookUpOwner(name) {
        this._busCall('GetNameOwner', new GLib.Variant('(s)', [name]), '(s)', (bus, result) => {
            try {
                const [owner] = bus.call_finish(result).deep_unpack();
                this._addName(name, owner);
            } catch {
                // Gone again already, or cancelled: nothing to follow.
            }
        });
    }

    _addName(name, owner) {
        this._names.set(name, owner);
        if (this._players.has(owner))
            return;
        const player = new Player(this, owner, name);
        this._players.set(owner, player);
        this._readAll(player, ROOT);
        this._readAll(player, PLAYER);
        // A player without one answers with an error, which is dropped.
        this._readAll(player, TRACKLIST);
        this._busCall('GetConnectionUnixProcessID', new GLib.Variant('(s)', [owner]), '(u)', (bus, result) => {
            try {
                [player.pid] = bus.call_finish(result).deep_unpack();
            } catch {
                return;
            }
            if (this._players.get(owner) === player)
                this._changed(player);
        });
        this.emit('added', player);
    }

    _readAll(player, iface) {
        this.call(player.owner, PROPERTIES, 'GetAll', new GLib.Variant('(s)', [iface]), '(a{sv})', reply => {
            const [props] = reply.recursiveUnpack();
            if (this._players.get(player.owner) !== player)
                return;
            if (iface === ROOT)
                player.applyRoot(props);
            else if (iface === TRACKLIST)
                player.applyTrackList(props);
            else
                player.applyPlayer(props);
            this._changed(player);
        });
    }

    _dropName(name) {
        const owner = this._names.get(name);
        this._names.delete(name);
        if (!owner || [...this._names.values()].includes(owner))
            return;
        const player = this._players.get(owner);
        this._players.delete(owner);
        if (player)
            this.emit('removed', player);
    }
}
