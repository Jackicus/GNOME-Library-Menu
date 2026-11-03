// One grid per section, each built the first time its section is shown.

import St from 'gi://St';
import Clutter from 'gi://Clutter';

import {createMediaView} from './mediaGrid.js';
import {createEmptyState} from './widgets.js';

export class LibraryView {
    // width and height are the whole view, in physical px.
    constructor({sections, itemsFor, active, width, height, onActivate, onEmpty}) {
        this._sections = sections;
        this._itemsFor = itemsFor;
        this._width = width;
        this._height = height;
        this._onActivate = onActivate;
        this._onEmpty = onEmpty;
        this._pages = new Map();
        this._key = this._sectionFor(active)?.key ?? null;

        // Unclipped: the grid overhangs it so hovered edge tiles are not cut off.
        this.actor = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
        });
        this.actor.connect('destroy', () => this._pages.clear());
    }

    destroy() {
        this.actor.destroy();
    }

    get currentView() {
        return this._pages.get(this._key)?.view ?? null;
    }

    show(key) {
        this._key = this._sectionFor(key)?.key ?? this._key;
        if (!this._key)
            return;
        const page = this._page(this._key);
        for (const other of this._pages.values())
            other.actor.visible = other === page;
    }

    _sectionFor(key) {
        return this._sections.find(s => s.key === key) ?? this._sections[0] ?? null;
    }

    _page(key) {
        let page = this._pages.get(key);
        if (page)
            return page;
        const section = this._sections.find(s => s.key === key);
        const items = this._itemsFor(key);
        let view = null;
        let actor;
        if (items.length) {
            view = createMediaView({
                section,
                items,
                width: this._width,
                height: this._height,
                onActivate: this._onActivate,
            });
            actor = view;
        } else {
            // A launchers' section needs no setting first, so it offers the scan itself.
            actor = createEmptyState({
                icon: section.icon,
                title: `Nothing in ${section.title} yet`,
                hint: section.emptyHint,
                actionLabel: section.launchers ? `Find ${section.title}` : 'Open Settings',
                actionIcon: section.launchers ? 'system-search-symbolic' : 'preferences-system-symbolic',
                onAction: button => this._onEmpty(section, button),
            });
        }
        this.actor.add_child(actor);
        page = {actor, view};
        this._pages.set(key, page);
        return page;
    }
}
