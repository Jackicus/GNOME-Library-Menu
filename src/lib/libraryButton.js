// A button per section beside Show Apps, in the dash or in Dash to Panel's panel.

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';

const DASH_TO_PANEL = 'dash-to-panel@jderose9.github.com';

const LibraryIcon = GObject.registerClass(
class LibraryButtonIcon extends Dash.ShowAppsIcon {
    _init(section) {
        // Read by _createIcon, which BaseIcon's _init calls before the chain-up returns.
        this._gicon = new Gio.ThemedIcon({name: section.icon});
        // eslint-disable-next-line no-restricted-syntax -- constructor() could not set it first
        super._init();
        this.setLabelText(section.title);
    }

    _createIcon(size) {
        this._iconActor = new St.Icon({
            gicon: this._gicon,
            icon_size: size,
            style_class: 'show-apps-icon',
            track_hover: true,
        });
        return this._iconActor;
    }

    // Show Apps doubles as the dash's unpin target; the library is not one.
    _canRemoveApp() {
        return false;
    }
});

export class LibraryButtons {
    constructor({settings, onActivate}) {
        this._settings = settings;
        this._onActivate = onActivate;
        this._sections = [];
        this._buttons = new Map();
        this._buttonHost = null;
        this._hostPanel = null;
        this._dashToPanel = null;
        this._reattachId = 0;
        this._lit = null;
        this._attached = false;
    }

    attach(sections) {
        const same = sections.length === this._sections.length &&
            sections.every((section, i) => section === this._sections[i]);
        this._sections = sections;
        if (this._attached) {
            if (!same)
                this._attach();
            return;
        }
        this._attached = true;
        this._settings.connectObject('changed::dash-to-panel', () => this._follow(), this);
        this._follow();
    }

    detach() {
        this._attached = false;
        this._sections = [];
        this._settings.disconnectObject(this);
        Main.extensionManager.disconnectObject(this);
        if (this._reattachId)
            GLib.Source.remove(this._reattachId);
        this._reattachId = 0;
        this._detach();
        this._dashToPanel?.disconnectObject?.(this);
        this._dashToPanel = null;
    }

    // The key of the section showing, or null.
    sync(key) {
        this._lit = key;
        this._buttonHost?.sync?.();
        for (const [k, button] of this._buttons)
            button.toggleButton.checked = k === key;
    }

    // Nothing of Dash to Panel is read or watched unless the setting asks.
    _follow() {
        this._detach();
        Main.extensionManager.disconnectObject(this);
        if (this._settings.get_boolean('dash-to-panel')) {
            Main.extensionManager.connectObject('extension-state-changed', (_manager, extension) => {
                if (extension.uuid === DASH_TO_PANEL)
                    this._reattach();
            }, this);
        }
        this._armDashToPanel();
        this._attach();
    }

    // Dash to Panel's own global, which emits panels-created whenever it rebuilds its
    // panels: on enable, on its settings' changes and on monitors-changed.
    _armDashToPanel() {
        const dashToPanel = this._settings.get_boolean('dash-to-panel') ? global.dashToPanel ?? null : null;
        if (dashToPanel === this._dashToPanel)
            return;
        this._dashToPanel?.disconnectObject?.(this);
        this._dashToPanel = dashToPanel;
        dashToPanel?.connectObject?.('panels-created', () => this._reattach(), this);
    }

    // Only when the host changed.
    _reattach() {
        this._armDashToPanel();
        const [first] = this._buttons.values();
        if ((this._dashToPanel?.panels?.[0] ?? null) !== this._hostPanel || !first?.get_parent())
            this._attach();
    }

    _attach() {
        this._detach();
        const panel = this._dashToPanel?.panels?.[0] ?? null;
        this._hostPanel = panel;
        try {
            if (panel?.showAppsIconWrapper && panel.panel && panel._updateGroupedElements)
                this._attachToPanel(panel);
            else
                this._attachToDash(Main.overview.dash);
        } catch (e) {
            console.warn(`[Library Menu] No buttons beside Show Apps: ${e}`);
            this._detach();
        }
        this.sync(this._lit);
    }

    _detach() {
        const host = this._buttonHost;
        this._buttonHost = null;
        host?.release();
        this._buttons.clear();
        this._hostPanel = null;
    }

    _newButtons() {
        for (const section of this._sections) {
            const container = new LibraryIcon(section);
            container.show(false);
            container.toggleButton.connect('clicked', () => this._onActivate(section.key));
            this._buttons.set(section.key, container);
        }
        return [...this._buttons.values()];
    }

    _attachToDash(dash) {
        const buttons = this._newButtons();
        const resize = () => buttons.forEach(b => b.icon.setIconSize(dash.iconSize));
        for (const container of buttons) {
            dash._hookUpLabel(container);
            dash._dashContainer.add_child(container);
        }
        resize();
        dash.connectObject('icon-size-changed', resize, this);
        this._buttonHost = {
            release: () => {
                dash.disconnectObject(this);
                for (const container of buttons) {
                    // The dash cancels a show-label timeout it armed for the item only
                    // when its hover goes; one left to fire after the destroy throws.
                    container.toggleButton.hover = false;
                    container.destroy();
                }
            },
        };
    }

    // Chain-safe, as another extension may wrap it too: docs/private-api.md.
    _attachToPanel(panel) {
        const showApps = panel.showAppsIconWrapper.realShowAppsIcon;
        const box = new St.BoxLayout({
            orientation: panel.geom?.vertical
                ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL,
        });
        const buttons = this._newButtons();
        const match = () => {
            for (const container of buttons) {
                container.icon.setIconSize(showApps.icon.iconSize);
                container.toggleButton.set_style(showApps.toggleButton.get_style());
            }
        };
        for (const container of buttons) {
            container.toggleButton.connect('notify::hover', button => {
                if (button.hover)
                    container.showLabel();
                else
                    container.hideLabel();
            });
            box.add_child(container);
        }
        match();

        // The way out is in place before anything goes into the panel. The shell disables
        // and re-enables the extensions enabled after one being disabled, with no signal,
        // so Show Apps going is what says Dash to Panel let go of its panel.
        let released = false;
        let gone = false;
        let host = null;
        box.connect('destroy', () => (released = true));
        showApps.connectObject('destroy', () => {
            gone = true;
            this._detach();
            this._reattachId ||= GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._reattachId = 0;
                this._reattach();
                return GLib.SOURCE_REMOVE;
            });
        }, box);
        const element = {actor: box, box: new Clutter.ActorBox()};
        const hadOwn = Object.hasOwn(panel, '_updateGroupedElements');
        const stock = panel._updateGroupedElements;
        let inert = false;
        const wrapped = function (positions) {
            stock.call(this, positions);
            if (inert)
                return;
            for (const group of this._elementGroups ?? []) {
                const at = group.elements.findIndex(e => e.actor === showApps);
                if (at < 0)
                    continue;
                element.position = group.elements[at].position;
                group.elements.splice(at + 1, 0, element);
                if (group.expandableIndex > at)
                    group.expandableIndex++;
                break;
            }
            box.visible = showApps.visible;
        };
        host = {
            sync: match,
            release: () => {
                inert = true;
                if (panel._updateGroupedElements === wrapped) {
                    if (hadOwn)
                        panel._updateGroupedElements = stock;
                    else
                        delete panel._updateGroupedElements;
                }
                if (!released)
                    box.destroy();
                if (gone)
                    return;
                try {
                    panel.updateElementPositions();
                } catch (e) {
                    console.warn(`[Library Menu] Dash to Panel's panel was not laid out again: ${e}`);
                }
            },
        };
        this._buttonHost = host;

        panel.panel.add_child(box);
        panel._updateGroupedElements = wrapped;
        panel.updateElementPositions();
    }
}
