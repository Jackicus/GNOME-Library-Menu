// Game controllers through libmanette, never grabbed: a game beside the player
// still sees every press. A held button repeats what the handler hands back.

import GLib from 'gi://GLib';

import {buttonForCode} from './playerActions.js';

// ms: a held key's feel, a little slower, since each repeat is a call to the player.
const REPEAT_DELAY = 400;
const REPEAT_INTERVAL = 150;

// Optional: without it the pads are off and the bar stays.
let Manette = null;
try {
    ({default: Manette} = await import('gi://Manette?version=0.2'));
} catch {
    // Not installed.
}

export class Gamepads {
    constructor(settings, onButton) {
        this._settings = settings;
        this._onButton = onButton;
        this._monitor = null;
        this._devices = new Set();
        this._held = null;              // {device, id, source}: repeating
    }

    enable() {
        if (!Manette) {
            console.warn('[Library Menu] libmanette is not installed, so game controllers are off');
            return;
        }
        this._monitor = new Manette.Monitor();
        const it = this._monitor.iterate();
        for (let [ok, device] = it.next(); ok; [ok, device] = it.next())
            this._watch(device);
        this._monitor.connectObject(
            'device-connected', (_monitor, device) => this._watch(device),
            'device-disconnected', (_monitor, device) => this._unwatch(device),
            this);
    }

    disable() {
        this._stopRepeat();
        for (const device of this._devices)
            device.disconnectObject(this);
        this._devices.clear();
        if (this._monitor) {
            this._monitor.disconnectObject(this);
            // Closes every pad's evdev node now rather than whenever the
            // collector gets to the monitor.
            this._monitor.run_dispose();
            this._monitor = null;
        }
    }

    _watch(device) {
        if (this._devices.has(device))
            return;
        this._devices.add(device);
        device.connectObject(
            'button-press-event', (_device, event) => this._pressed(device, event),
            'button-release-event', (_device, event) => this._released(device, event),
            this);
    }

    _unwatch(device) {
        if (!this._devices.delete(device))
            return;
        if (this._held?.device === device)
            this._stopRepeat();
        device.disconnectObject(this);
    }

    _pressed(device, event) {
        this._stopRepeat();
        const [ok, code] = event.get_button();
        const button = ok ? buttonForCode(code) : null;
        if (!button)
            return;
        const action = this._settings.get_value('gamepad-buttons').deep_unpack()[button.id] ?? 'none';
        const again = this._onButton(button.id, action);
        if (again)
            this._startRepeat(device, button.id, again);
    }

    _released(device, event) {
        const [ok, code] = event.get_button();
        if (ok && this._held?.device === device && this._held.id === buttonForCode(code)?.id)
            this._stopRepeat();
    }

    _startRepeat(device, id, again) {
        const held = {device, id, source: 0};
        this._held = held;
        const repeat = () => {
            if (again())
                return true;
            held.source = 0;
            this._held = null;
            return false;
        };
        held.source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REPEAT_DELAY, () => {
            if (repeat()) {
                held.source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REPEAT_INTERVAL,
                    () => repeat() ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE);
                GLib.Source.set_name_by_id(held.source, '[library-menu] pad repeat');
            }
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(held.source, '[library-menu] pad repeat');
    }

    _stopRepeat() {
        if (this._held?.source)
            GLib.Source.remove(this._held.source);
        this._held = null;
    }
}
