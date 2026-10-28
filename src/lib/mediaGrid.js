// The shell's own app grid, holding posters instead of apps. A library runs to
// thousands, so only the pages in reach of the one showing are built.

import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as AppDisplay from 'resource:///org/gnome/shell/ui/appDisplay.js';
import * as IconGrid from 'resource:///org/gnome/shell/ui/iconGrid.js';

import {handleBoundKey} from './controls.js';
import {gridFor, placeGrid} from './gridMath.js';
import {createArtwork} from './widgets.js';
import {tileStyle} from './shape.js';

// Not exported by the shell, but it is what AppDisplay extends.
const BaseAppView = Object.getPrototypeOf(AppDisplay.AppDisplay);

const PAGES_AHEAD = 2;

// One set for every grid (CLAUDE.md), read as a grid is built and as it allocates.
let style = null;
export function setGridStyle(next) {
    style = next;
}

// The shell's layout makes every cell a square; posters are not.
const PosterGridLayout = GObject.registerClass(
class LibraryPosterGridLayout extends IconGrid.IconGridLayout {
    vfunc_allocate() {
        if (!this._pageWidth || !this._pageHeight)
            return;

        // Every tile is the same size; this runs on each frame the overview moves.
        const first = this._pages[0]?.visibleChildren[0];
        if (!first)
            return;
        const cellW = first.get_preferred_width(-1)[0];
        const cellH = first.get_preferred_height(-1)[0];

        const rtl = Clutter.get_default_text_direction() === Clutter.TextDirection.RTL;
        const {columnsPerPage: columns, rowsPerPage: rows} = this;
        const {left, top, gapX, gapY} = placeGrid({
            pageWidth: this._pageWidth,
            pageHeight: this._pageHeight,
            columns,
            rows,
            cellW,
            cellH,
            scale: St.ThemeContext.get_for_stage(global.stage).scale_factor,
            style,
        });
        const centred = style.align === 'center';

        const box = new Clutter.ActorBox();
        this._pages.forEach((page, pageIndex) => {
            if (rtl)
                pageIndex = this._pages.length - 1 - pageIndex;
            page.visibleChildren.forEach((item, index) => {
                const column = rtl ? columns - 1 - index % columns : index % columns;
                const row = Math.floor(index / columns);
                const inRow = Math.min(columns, page.visibleChildren.length - row * columns);
                const rowOffset = centred
                    ? (rtl ? -1 : 1) * (columns - inRow) * (cellW + gapX) / 2
                    : 0;
                box.set_origin(
                    Math.floor(pageIndex * this._pageWidth + left + rowOffset +
                        column * (cellW + gapX)),
                    Math.floor(top + row * (cellH + gapY)));
                // A hovered tile wraps its title, so the cell is a floor.
                box.set_size(cellW, Math.max(cellH, item.get_preferred_height(cellW)[1]));
                item.allocate(box);
            });
        });

        this._pageSizeChanged = false;
        this._shouldEaseItems = false;
    }
});

const MediaGrid = GObject.registerClass(
class LibraryMediaGrid extends AppDisplay.AppGrid {
    constructor({rows, columns, iconSize}) {
        super({
            allow_incomplete_pages: true,
            rows_per_page: rows,
            columns_per_page: columns,
        });
        this.setGridModes([{rows, columns}]);

        // The layout IconGrid made stays alive in its constructor's closure.
        const layout = new PosterGridLayout({
            allow_incomplete_pages: true,
            orientation: Clutter.Orientation.HORIZONTAL,
            rows_per_page: rows,
            columns_per_page: columns,
            fixed_icon_size: iconSize,
        });
        layout.connect('pages-changed', () => this.emit('pages-changed'));
        this.layout_manager = layout;
    }
});

// A BaseIcon asks for a square; this one asks for its child's shape.
const PosterIcon = GObject.registerClass(
class LibraryPosterIcon extends IconGrid.BaseIcon {
    vfunc_get_preferred_width(forHeight) {
        const node = this.get_theme_node();
        const [min, nat] = this.child.get_preferred_width(node.adjust_for_height(forHeight));
        return node.adjust_preferred_width(min, nat);
    }

    vfunc_get_preferred_height(forWidth) {
        const node = this.get_theme_node();
        const [min, nat] = this.child.get_preferred_height(node.adjust_for_width(forWidth));
        return node.adjust_preferred_height(min, nat);
    }
});

const MediaItem = GObject.registerClass(
class LibraryMediaItem extends AppDisplay.AppViewItem {
    _init({item, section, order, onActivate}) {
        // The theme's margin and bottom padding would come between the cells past the spacing.
        super._init({style_class: 'overview-tile', style: 'margin: 0; padding: 0;'}, false, style.titles);
        this._id = `${section.key}/${item.id}`;
        this._name = item.title;
        this.item = item;
        this.order = order;

        this.icon = new PosterIcon(item.title, {
            setSizeManually: true,
            showLabel: style.titles,
            createIcon: size => createArtwork({
                path: item.art,
                title: item.title,
                icon: section.icon,
                width: Math.round(size / section.aspect),
                height: size,
            }),
        });
        this.icon.set_style(tileStyle(style.tilePad));
        this.set_child(this.icon);
        this.connect('clicked', () => onActivate(section.key, item, this));
    }

    get artwork() {
        return this.icon.icon;
    }
});

// _createGrid() runs in the parent's _init, before `this` can hold parameters.
let pendingGrid = null;

const MediaView = GObject.registerClass(
class LibraryMediaView extends BaseAppView {
    constructor({section, items, onActivate}) {
        super({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
            // As AppDisplay is: Clutter hands key events to reactive actors only.
            reactive: true,
        });
        this.add_child(this._box);

        // Pinning an app or a parental filter change would redisplay every tile.
        this._parentalControlsManager.disconnectObject(this);
        this._appFavorites.disconnectObject(this);

        global.focus_manager.add_group(this);
        this.connect('destroy', () => global.focus_manager.remove_group(this));

        const keys = new Clutter.KeyController();
        keys.connect('key-press', () => handleBoundKey(keys)
            ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE);
        this.add_action(keys);

        // The dots keep their room on a one-page section (.claude/rules/layout.md).
        const dots = this._pageIndicators;
        const holdRoom = () => {
            if (!dots.visible) {
                dots.visible = true;
                dots.opacity = 0;
            } else if (dots.get_n_children() > 1) {
                dots.opacity = 255;
            }
        };
        dots.connect('notify::visible', holdRoom);
        // Connected after the shell's own handler, which sets the page count.
        this._grid.connect('pages-changed', holdRoom);
        holdRoom();

        this._section = section;
        this._data = items;
        this._onActivate = onActivate;
        this._columns = pendingGrid.columns;
        this._perPage = pendingGrid.rows * this._columns;
        this._media = [];
        this._fillTo(0);
    }

    // Straight into the grid: _redisplay's diff takes seconds on a big library.
    _fillTo(page) {
        const want = Math.min(this._data.length, (page + 1 + PAGES_AHEAD) * this._perPage);
        while (this._media.length < want) {
            const order = this._media.length;
            const item = new MediaItem({
                item: this._data[order],
                section: this._section,
                order,
                onActivate: this._onActivate,
            });
            this._media.push(item);
            // Placed outright: appended, the grid keeps new apps off the first page.
            this._addItem(item, Math.floor(order / this._perPage), order % this._perPage);
        }
    }

    // The parent's _init calls this before _data is set. As the view is destroyed, its
    // tiles going change the page count after the scroll view has let go of the
    // grid's adjustment, which the shell's IconGrid.goToPage would ease in a later.
    goToPage(page, animate = true) {
        if (!this._grid.hadjustment)
            return;
        if (this._data)
            this._fillTo(page);
        super.goToPage(page, animate);
    }

    focusFirst() {
        const item = this._media[this._shownPage() * this._perPage] ?? this._media[0];
        item?.grab_key_focus();
        return !!item;
    }

    atTopRow(actor) {
        const order = this._media.indexOf(actor);
        return order >= 0 && order % this._perPage < this._columns;
    }

    // The adjustment's answer, not the grid's, which the last batch of tiles moved.
    _shownPage() {
        const {value, page_size: pageSize} = this._adjustment;
        return pageSize > 0 ? Math.round(value / pageSize) : 0;
    }

    // The shell's grid turns no page for a key; the focus goes along with it.
    pageBy(delta) {
        const page = this._shownPage() + delta;
        if (page < 0 || page * this._perPage >= this._data.length)
            return false;
        this.goToPage(page);
        this._media[page * this._perPage]?.grab_key_focus();
        return true;
    }

    _createGrid() {
        return new MediaGrid(pendingGrid);
    }

    _loadApps() {
        return [...this._media];
    }

    _compareItems(a, b) {
        return a.order - b.order;
    }
});

export function createMediaView({section, items, width, height, onActivate}) {
    pendingGrid = gridFor({
        width,
        height,
        aspect: section.aspect,
        scale: St.ThemeContext.get_for_stage(global.stage).scale_factor,
        style,
    });
    const view = new MediaView({section, items, onActivate});
    // Each batch of tiles moves the grid to the page it made.
    view.goToPage(0, false);
    return view;
}
