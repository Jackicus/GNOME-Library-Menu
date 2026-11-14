// A player's control socket that speaks lines: connected only if the peer is the
// player's own process, read a line at a time and written one write at a time.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

import {isCancelled} from './mpris.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// The path of the Unix socket process `pid` listens on, as the process sees it:
// the launch names a fresh one per player (playerLaunch.js).
function listeningSocket(pid) {
    const inodes = new Set();
    const dir = GLib.Dir.open(`/proc/${pid}/fd`, 0);
    for (let name = dir.read_name(); name !== null; name = dir.read_name()) {
        const match = GLib.file_read_link(`/proc/${pid}/fd/${name}`).match(/^socket:\[(\d+)\]$/);
        if (match)
            inodes.add(match[1]);
    }
    // Num RefCount Protocol Flags Type St Inode Path; flags 00010000 is a listening socket.
    const [, bytes] = GLib.file_get_contents(`/proc/${pid}/net/unix`);
    for (const line of decoder.decode(bytes).split('\n')) {
        const field = line.split(/\s+/);
        if (field[3] === '00010000' && inodes.has(field[6]) && field[7]?.startsWith('/'))
            return field[7];
    }
    return null;
}

// A sandbox sees its own folder as the runtime directory; the shell sees it here.
function hostPath(path, sandboxId) {
    const runtime = GLib.get_user_runtime_dir();
    if (sandboxId && path.startsWith(`${runtime}/`))
        return `${runtime}/.flatpak/${sandboxId}/xdg-run/${path.slice(runtime.length + 1)}`;
    return path;
}

export class LineRemote extends EventEmitter {
    constructor() {
        super();
        this._cancellable = new Gio.Cancellable();
        this._connection = null;
        this._input = null;
        this._output = null;
        this._writes = [];
    }

    // Resolves true once connected to the socket process `pid` listens on, and
    // its peer is that process. Not `connect`, which connectObject builds on.
    _dial(pid, sandboxId) {
        let path;
        try {
            path = listeningSocket(pid);
        } catch {
            return Promise.resolve(false);
        }
        if (!path)
            return Promise.resolve(false);
        path = hostPath(path, sandboxId);
        return new Promise(resolve => {
            const client = new Gio.SocketClient();
            client.connect_async(Gio.UnixSocketAddress.new(path), this._cancellable, (_c, result) => {
                let connection, peer;
                try {
                    connection = client.connect_finish(result);
                    peer = connection.get_socket().get_credentials().get_unix_pid();
                } catch {
                    // No socket: the player is not set up for it, or not running.
                    resolve(false);
                    return;
                }
                if (this._cancellable.is_cancelled() || peer !== pid) {
                    connection.close_async(GLib.PRIORITY_DEFAULT, null, null);
                    resolve(false);
                    return;
                }
                this._connection = connection;
                this._input = new Gio.DataInputStream({
                    base_stream: connection.get_input_stream(),
                    close_base_stream: false,
                });
                this._output = connection.get_output_stream();
                this._readLine();
                resolve(true);
            });
        });
    }

    close() {
        this._shut();
        this._fail(new Error('closed'));
    }

    // One write at a time: a GIO stream refuses a second while one is pending.
    _send(text) {
        if (!this._output)
            return;
        this._writes.push(text);
        if (this._writes.length === 1)
            this._write();
    }

    _write() {
        const text = this._writes[0];
        if (text === undefined)
            return;
        const bytes = new GLib.Bytes(encoder.encode(`${text}\n`));
        this._output.write_bytes_async(bytes, GLib.PRIORITY_DEFAULT, this._cancellable, (stream, result) => {
            try {
                stream.write_bytes_finish(result);
            } catch (e) {
                this._writes = [];
                if (!isCancelled(e))
                    this._lost();
                return;
            }
            if (this._cancellable.is_cancelled())
                return;
            this._writes.shift();
            this._write();
        });
    }

    _readLine() {
        this._input.read_line_async(GLib.PRIORITY_DEFAULT, this._cancellable, (stream, result) => {
            let line;
            try {
                [line] = stream.read_line_finish_utf8(result);
            } catch (e) {
                if (!isCancelled(e))
                    this._lost();
                return;
            }
            if (this._cancellable.is_cancelled())
                return;
            if (line === null) {
                this._lost();
                return;
            }
            this._onLine(line.replace(/\r$/, ''));
            this._readLine();
        });
    }

    _lost(error = new Error('The player closed the connection')) {
        if (this._cancellable.is_cancelled())
            return;
        this._shut();
        this._fail(error);
        this.emit('lost');
    }

    // Closing at once frees a player that serves one client at a time.
    _shut() {
        this._cancellable.cancel();
        this._writes = [];
        this._connection?.close_async(GLib.PRIORITY_DEFAULT, null, null);
        this._connection = null;
        this._input = null;
        this._output = null;
    }
}
