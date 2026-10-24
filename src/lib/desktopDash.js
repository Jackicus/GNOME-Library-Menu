// A row of buttons on the wallpaper, one per section, each opening the library on it.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {radiusStyle} from './shape.js';

// Logical px: a button's width; its height is its content's.
const BUTTON_WIDTH = 200;

export class DesktopDash {
    constructor({sections, onActivate}) {
        // Fills the work area and takes no clicks, so the wallpaper's menu still opens
        // beside the buttons; the row is centred in it.
        this.actor = new St.Widget({
            name: 'LibraryDesktopDash',
            layout_manager: new Clutter.BinLayout(),
            reactive: false,
        });
        const row = new St.BoxLayout({
            style_class: 'ml-dash',
            reactive: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        row.layout_manager.homogeneous = true;
        this.actor.add_child(row);

        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        for (const section of sections) {
            const content = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                style_class: 'ml-dash-button-content',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            content.add_child(new St.Icon({
                icon_name: section.icon,
                icon_size: 40,
                x_align: Clutter.ActorAlign.CENTER,
            }));
            content.add_child(new St.Label({text: section.title, x_align: Clutter.ActorAlign.CENTER}));
            const button = new St.Button({
                style_class: 'ml-dash-button',
                style: radiusStyle(),
                width: BUTTON_WIDTH * scale,
                track_hover: true,
                accessible_name: section.title,
                child: content,
            });
            button.connect('clicked', () => onActivate(section.key));
            row.add_child(button);
        }

        // Docks register their struts after login, moving the work area under it.
        Main.layoutManager.connectObject('monitors-changed', () => this._place(), this.actor);
        global.display.connectObject('workareas-changed', () => this._place(), this.actor);
        this._place();
        // Over the wallpaper and under every window: docs/private-api.md.
        Main.layoutManager._backgroundGroup.add_child(this.actor);
    }

    destroy() {
        Main.layoutManager.disconnectObject(this.actor);
        global.display.disconnectObject(this.actor);
        this.actor.destroy();
    }

    _place() {
        const monitor = Main.layoutManager.primaryMonitor;
        this.actor.visible = !!monitor;
        if (!monitor)
            return;
        const area = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        this.actor.set_position(area.x, area.y);
        this.actor.set_size(area.width, area.height);
    }
}
