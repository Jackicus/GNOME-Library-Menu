// mpv's JSON IPC socket: one JSON object per line, a reply carrying the
// request_id it answers and events interleaved with the replies. mpv answers
// while paused, so nothing is kept between readings.

import GLib from 'gi://GLib';

import {LineRemote} from './lineRemote.js';

const REPLY_TIMEOUT_MS = 2000;

function trackLabel({title, lang, id}) {
    return title || (lang ? lang.toUpperCase() : `Track ${id}`);
}

function trackList(tracks, type) {
    return tracks.filter(t => t.type === type).map(t => ({id: t.id, label: trackLabel(t), current: t.selected}));
}

export class MpvRemote extends LineRemote {
    constructor() {
        super();
        this._requests = new Map();   // request_id → {resolve, reject, timeoutId}
        this._nextId = 1;
        // In ms, as mpv has it.
        this.subtitleDelay = 0;
    }

    // Resolves true once connected to the socket of the mpv with process id `pid`
    // (a sandboxed player's id is `sandboxId`).
    async open(pid, sandboxId) {
        if (!await this._dial(pid, sandboxId))
            return false;
        try {
            const delay = await this._request(['get_property', 'sub-delay']);
            this.subtitleDelay = Math.round(delay * 1000);
            this._send(JSON.stringify({command: ['observe_property', 1, 'sub-delay']}));
            return true;
        } catch {
            this.close();
            return false;
        }
    }

    // {audio, subtitles, chapter}; subtitles lead with "Off".
    async state() {
        const tracks = await this._request(['get_property', 'track-list']);
        const subtitles = trackList(tracks, 'sub');
        const chapters = await this._request(['get_property', 'chapter-list']);
        const current = chapters.length ? await this._request(['get_property', 'chapter']) : 0;
        return {
            audio: trackList(tracks, 'audio'),
            subtitles: [{id: -1, label: 'Off', current: !subtitles.some(t => t.current)}, ...subtitles],
            chapter: {current: Math.max(0, current), count: chapters.length},
        };
    }

    async setTrack(kind, id) {
        await this._request(['set_property', kind === 'audio' ? 'aid' : 'sid', id === -1 ? 'no' : id]);
    }

    cycle(kind) {
        this._send(JSON.stringify({command: ['cycle', kind === 'audio' ? 'aid' : 'sid']}));
    }

    // Positive `ms` is later.
    shiftSubtitles(ms) {
        this._send(JSON.stringify({command: ['add', 'sub-delay', ms / 1000]}));
    }

    resetSubtitles() {
        this._send(JSON.stringify({command: ['set_property', 'sub-delay', 0]}));
    }

    async chapter(delta) {
        await this._request(['add', 'chapter', delta]);
        return this.state().then(s => s.chapter);
    }

    _request(command) {
        return new Promise((resolve, reject) => {
            if (!this._connection) {
                reject(new Error('not connected'));
                return;
            }
            const id = this._nextId++;
            const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REPLY_TIMEOUT_MS, () => {
                const error = new Error(`mpv did not answer ${command[0]}`);
                this._requests.delete(id);
                reject(error);
                this._lost(error);
                return GLib.SOURCE_REMOVE;
            });
            this._requests.set(id, {resolve, reject, timeoutId});
            this._send(JSON.stringify({command, request_id: id}));
        });
    }

    _onLine(line) {
        let message;
        try {
            message = JSON.parse(line);
        } catch {
            return;
        }
        if (message.event === 'property-change') {
            this.subtitleDelay = Math.round((message.data ?? 0) * 1000);
            this.emit('changed');
        } else if (message.event === 'start-file') {
            this.emit('new-input');
        }
        const request = this._requests.get(message.request_id);
        if (!request)
            return;
        this._requests.delete(message.request_id);
        GLib.Source.remove(request.timeoutId);
        if (message.error === 'success')
            request.resolve(message.data);
        else
            request.reject(new Error(message.error));
    }

    _fail(error) {
        for (const request of this._requests.values()) {
            GLib.Source.remove(request.timeoutId);
            request.reject(error);
        }
        this._requests.clear();
    }
}
