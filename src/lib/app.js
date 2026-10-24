// The library's button, the menu it opens in the overview, the pane a pick opens
// and the dash on the wallpaper: .claude/rules/places.md.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {SECTIONS, loadLibrary, libraryPath, openCommandKey, sectionByKey} from './library.js';
import {setCornerRadius} from './shape.js';
import {setGridStyle} from './mediaGrid.js';
import {GRID_KEYS, readGridStyle} from './gridMath.js';
import {LibraryButton} from './libraryButton.js';
import {MediaMenu} from './mediaMenu.js';
import {DetailDialog} from './detailDialog.js';
import {DesktopDash} from './desktopDash.js';
import {Tracker} from './tracking.js';
import {PlaybackWatcher} from './playback.js';
import {Controls} from './controls.js';
import {note} from './log.js';

// With the section's command, or the default app when its program is not installed.
// An array is a game's own command line, run as it is.
function openPath(path, command = '', beforeLaunch = null) {
    if (!path)
        return;
    if (Array.isArray(path)) {
        beforeLaunch?.();
        Util.spawn(path);
        return;
    }
    const file = Gio.File.new_for_path(path);
    // Asynchronous: a share that has idled out would stall the compositor.
    file.query_info_async(
        'standard::type', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null,
        (_file, result) => {
            let isDir = false;
            let found = false;
            try {
                isDir = file.query_info_finish(result).get_file_type() === Gio.FileType.DIRECTORY;
                found = true;
            } catch {
                // Not there: let the launch below say so.
            }
            if (found && !isDir)
                beforeLaunch?.();
            if (command && !isDir) {
                let argv;
                try {
                    [, argv] = GLib.shell_parse_argv(command);
                } catch (e) {
                    Main.notifyError(`Could not open ${file.get_basename()}`, e.message);
                    return;
                }
                if (GLib.find_program_in_path(argv[0])) {
                    Util.spawn([...argv, path]);
                    return;
                }
            }
            Gio.AppInfo.launch_default_for_uri_async(file.get_uri(),
                global.create_app_launch_context(0, -1), null, (_source, res) => {
                    try {
                        Gio.AppInfo.launch_default_for_uri_finish(res);
                    } catch (e) {
                        Main.notifyError(`Could not open ${file.get_basename()}`, e.message);
                    }
                });
        });
}

// A teardown step that reaches private shell API or another extension's object:
// if it throws, the rest of the teardown still runs.
function settle(what, step) {
    try {
        step();
    } catch (e) {
        console.error(`[Library Menu] Could not release the ${what}: ${e}`);
    }
}

export class LibraryApp {
    constructor(extension) {
        this._extension = extension;
        this._settings = extension.getSettings();
        this._dialog = null;
        this._browser = null;
        this._dash = null;
        this._sections = {};
        this._sectionKey = null;
        this._reloadWanted = false;
        this._monitor = null;
        this._rebuildTimer = 0;
        this._scanProc = null;
        this._button = new LibraryButton({
            settings: this._settings,
            onActivate: () => this._browser?.toggle(this._sectionKey),
        });
        this._tracker = new Tracker(this._settings);
        this._playback = new PlaybackWatcher(this._settings, this._tracker);
        this._controls = new Controls(this._settings, {
            isActive: () => !!(this._dialog?.isOpen || this._browser?.isShowing),
            onHome: () => this._dismiss(),
            onOpen: () => this._controlsOpen(),
            currentView: () => this._browser?.currentView ?? null,
        });
    }

    // The shell never calls disable() after enable() throws, so undo it here.
    enable() {
        try {
            this._enable();
        } catch (e) {
            this.disable();
            throw e;
        }
    }

    _enable() {
        this._controls.enable();
        this._tracker.enable();
        this._playback.enable();
        this._sections = loadLibrary();
        this._build();

        St.ThemeContext.get_for_stage(global.stage).connectObject('notify::scale-factor',
            () => this._scheduleRebuild(), this);
        const rebuildKeys = [...GRID_KEYS, 'corner-radius', 'detail-width', 'detail-height',
            'detail-row-size', 'desktop-dash', ...SECTIONS.map(s => `${s.prefix}-enabled`)];
        for (const key of rebuildKeys)
            this._settings.connectObject(`changed::${key}`, () => this._scheduleRebuild(), this);

        Main.wm.addKeybinding('library-shortcut', this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._browser?.toggle(this._sectionKey));

        const file = Gio.File.new_for_path(libraryPath());
        this._monitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
        this._monitor.connect('changed', (_m, _f, _o, event) => {
            if (event === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
                event === Gio.FileMonitorEvent.CREATED ||
                event === Gio.FileMonitorEvent.RENAMED ||
                event === Gio.FileMonitorEvent.MOVED_IN)
                this._scheduleRebuild({reload: true, delay: 400});
        });
    }

    disable() {
        Main.wm.removeKeybinding('library-shortcut');
        St.ThemeContext.get_for_stage(global.stage).disconnectObject(this);
        this._settings.disconnectObject(this);
        if (this._monitor) {
            this._monitor.cancel();
            this._monitor = null;
        }
        if (this._rebuildTimer)
            GLib.source_remove(this._rebuildTimer);
        this._rebuildTimer = 0;
        this._scanProc?.force_exit();
        this._scanProc = null;
        this._teardown();
        settle('button', () => this._button.detach());
        this._sections = {};
        // Playback saves its position before the tracker stops.
        this._playback.disable();
        this._tracker.disable();
        this._controls.disable();
    }

    _teardown() {
        settle('library view', () => this._browser?.disable());
        this._browser = null;
        this._dialog?.popdown();
        this._dialog?.destroy();
        this._dialog = null;
        this._dash?.destroy();
        this._dash = null;
    }

    // Settings and a rescan's writes come in bursts: one rebuild per burst.
    _scheduleRebuild({reload = false, delay = 150} = {}) {
        this._reloadWanted ||= reload;
        if (this._rebuildTimer)
            GLib.source_remove(this._rebuildTimer);
        this._rebuildTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._rebuildTimer = 0;
            if (this._reloadWanted) {
                this._sections = loadLibrary();
                this._tracker.sync();
            }
            this._reloadWanted = false;
            const browsing = this._browser?.state ?? null;
            this._teardown();
            this._build();
            this._browser?.restore(browsing);
            note('Rebuilt');
            return GLib.SOURCE_REMOVE;
        });
    }

    _enabledSections() {
        return SECTIONS.filter(s => this._settings.get_boolean(`${s.prefix}-enabled`));
    }

    // Never over a window, where Home would be a game's Start button too.
    _controlsOpen() {
        if (global.display.focus_window || Main.modalCount > 0)
            return;
        this._browser?.open(this._sectionKey);
    }

    _dismiss() {
        this._dialog?.popdown();
        this._browser?.close();
    }

    _openSettings() {
        this._dismiss();
        this._extension.openPreferences();
    }

    // The video sections need a folder first; games are found with none.
    _onEmpty(section, button) {
        if (!section.launchers) {
            this._openSettings();
            return;
        }
        // Put back by the rebuild the scan's write brings, or a failure's.
        button.setLabel('Looking…');
        button.reactive = false;
        this._scan(section.key);
    }

    // In a process of its own, as the preferences' Rescan runs it (backend/CLAUDE.md).
    _scan(key) {
        if (this._scanProc)
            return;
        const scanner = GLib.build_filenamev([this._extension.path, 'backend', 'scanLibrary.js']);
        let proc;
        try {
            proc = Gio.Subprocess.new(['gjs', '-m', scanner, '--only', key],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (e) {
            this._scanFailed(e.message);
            return;
        }
        this._scanProc = proc;
        // A scan that disable() stopped still lands here, and is not ours any more.
        proc.communicate_utf8_async(null, null, (_proc, result) => {
            if (this._scanProc !== proc)
                return;
            this._scanProc = null;
            try {
                const [, , stderr] = proc.communicate_utf8_finish(result);
                if (!proc.get_successful())
                    this._scanFailed(stderr);
            } catch (e) {
                this._scanFailed(e.message);
            }
        });
    }

    _scanFailed(why) {
        console.error(`[Library Menu] Scan failed: ${why}`);
        this._scheduleRebuild();
    }

    _open(path, section) {
        const key = section ? openCommandKey(section) : null;
        openPath(path, key ? this._settings.get_string(key) : '', () => {
            if (Tracker.tracks(section))
                this._playback.resumeNext(path);
            // The pop-up's grab would hold a game's window off.
            if (Array.isArray(path)) {
                this._dismiss();
                Main.overview.hide();
            }
            this._toPlayingWorkspace();
        });
    }

    // A new window opens on the active workspace, so the player's lands on this one.
    _toPlayingWorkspace() {
        if (!this._settings.get_boolean('play-on-new-workspace'))
            return;
        const workspace = this._emptyWorkspace();
        if (!workspace) {
            console.warn('[Library Menu] No empty workspace to play on (Settings → Multitasking).');
            return;
        }
        this._dismiss();
        Main.overview.hide();
        workspace.activate(global.get_current_time());
    }

    // Dynamic workspaces always end in an empty one; a window there makes the shell add the next.
    _emptyWorkspace() {
        const wm = global.workspace_manager;
        const free = ws => !ws.list_windows().some(w => !w.is_on_all_workspaces());
        if (Meta.prefs_get_dynamic_workspaces()) {
            const last = wm.get_workspace_by_index(wm.n_workspaces - 1);
            return free(last) ? last : wm.append_new_workspace(false, global.get_current_time());
        }
        for (let i = wm.n_workspaces - 1; i >= 0; i--) {
            const ws = wm.get_workspace_by_index(i);
            if (free(ws))
                return ws;
        }
        return null;
    }

    _build() {
        // Before anything is built: every rounded surface reads it as it is made.
        setCornerRadius(this._settings.get_int('corner-radius'));
        setGridStyle(readGridStyle(this._settings));

        const sections = this._enabledSections();
        if (!sections.length) {
            this._button.detach();
            return;
        }
        if (!sections.some(s => s.key === this._sectionKey))
            this._sectionKey = (sections.find(s => this._sections[s.key]?.length) ?? sections[0]).key;
        this._button.attach();

        this._dialog = new DetailDialog({
            onOpen: (path, section) => this._open(path, section),
            tracker: this._tracker,
            width: this._settings.get_int('detail-width') / 100,
            height: this._settings.get_int('detail-height') / 100,
            rowSize: this._settings.get_int('detail-row-size'),
        });
        this._browser = new MediaMenu({
            sections,
            itemsFor: key => this._sections[key] ?? [],
            onActivate: (key, item, tile) => this._dialog.popup(tile, item, sectionByKey(key)),
            button: this._button,
            onSwitch: key => (this._sectionKey = key),
            onEmpty: (section, button) => this._onEmpty(section, button),
        });
        this._browser.enable();

        if (this._settings.get_boolean('desktop-dash')) {
            this._dash = new DesktopDash({
                sections,
                onActivate: key => this._browser.open(key),
            });
        }
    }
}
