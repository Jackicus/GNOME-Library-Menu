// The detail pane in a folder's panel: it zooms out of the tile poster-shaped,
// then widens (.claude/rules/places.md). The panel is adapted from GNOME Shell's
// AppFolderDialog (js/ui/appDisplay.js), without the folder's grid and name entry.

import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Mtk from 'gi://Mtk';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as GrabHelper from 'resource:///org/gnome/shell/ui/grabHelper.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Duration, Ease, easeProps, ensureStyleDeep, rectIn} from './anim.js';
import {NAVIGATION_KEYS, handleBoundKey} from './controls.js';
import {DetailView} from './detailView.js';
import {PANE_INSET, radiusStyle} from './shape.js';

// Logical pixels. A folder's panel is 720px square; this is one poster wider.
const MARGIN = 48;
const MAX_WIDTH = 1180;
const MAX_HEIGHT = 760;
// The shade behind the panel: the shell's DIALOG_SHADE_NORMAL, not exported.
const SHADE = new Cogl.Color({red: 0, green: 0, blue: 0, alpha: 204});
const CLEAR = new Cogl.Color({red: 0, green: 0, blue: 0, alpha: 0});
const BLUR = 'library-panel-blur';

// The blur and classes a folder's dialog carries (Blur my Shell sets both), to
// match; private, see docs/private-api.md.
function folderLook() {
    const icons = Main.overview._overview?.controls?._appDisplay?._folderIcons ?? [];
    for (const icon of icons) {
        const dialog = icon._dialog;
        if (!dialog)
            continue;
        const blur = dialog.get_effects().find(e => e instanceof Shell.BlurEffect);
        const classes = (dialog._viewBox?.get_style_class_name() ?? '')
            .split(/\s+/).filter(c => c && c !== 'app-folder-dialog');
        if (blur || classes.length) {
            return {
                blur: blur ? {radius: blur.radius, brightness: blur.brightness} : null,
                classes,
            };
        }
    }
    return null;
}

export const DetailDialog = GObject.registerClass(
class LibraryDetailDialog extends St.Bin {
    constructor({onOpen, tracker, width, height, rowSize}) {
        super({
            visible: false,
            x_expand: true,
            y_expand: true,
            reactive: true,
            accessible_role: Atk.Role.PANEL,
        });

        this._constraint = new Layout.MonitorConstraint({index: Main.layoutManager.primaryIndex});
        this.add_constraint(this._constraint);
        this._width = width;
        this._height = height;

        this._addClickAway();

        this._panel = new St.BoxLayout({
            style_class: 'app-folder-dialog',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            orientation: Clutter.Orientation.VERTICAL,
            // St scales a CSS length itself, so the inset goes in unmultiplied.
            style: `${radiusStyle('pane')} padding: ${PANE_INSET}px;`,
        });
        this._panel.set_pivot_point(0, 0);

        this.child = new St.Bin({
            child: this._panel,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });

        // Laid out once at the open width, so widening reveals rather than reflows.
        this._clip = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            x_expand: true,
            y_expand: true,
            clip_to_allocation: true,
        });
        this._panel.add_child(this._clip);

        this._detail = new DetailView({onOpen, tracker, rowSize});
        this._detail.actor.set_position(0, 0);
        this._clip.add_child(this._detail.actor);

        global.focus_manager.add_group(this);

        this._grabHelper = new GrabHelper.GrabHelper(this, {
            actionMode: Shell.ActionMode.POPUP,
        });

        this._source = null;
        this._item = null;
        this._section = null;
        this._isOpen = false;
        this._needsZoomAndFade = false;
        this._blur = null;
        this._classes = [];
        this._blurTimeline = null;
        this._closingLead = 0;
        this._narrowWidth = 320;
        this._wideWidth = 320;
        this._restSize = [320, 320];

        // A focused child destroyed under the panel drops key focus to the stage.
        global.stage.connectObject('notify::key-focus', () => {
            if (this._isOpen && !global.stage.get_key_focus())
                this.grab_key_focus();
        }, this);

        this.connect('destroy', () => this._onDestroy());
        Main.layoutManager.overviewGroup.add_child(this);
    }

    _addClickAway() {
        const clickGesture = new Clutter.ClickGesture();
        clickGesture.connect('may-recognize', () => {
            const coords = clickGesture.get_coords_abs();
            const [, x, y] = this.child.transform_stage_point(coords.x, coords.y);
            return !this._panel.allocation.contains(x, y);
        });
        clickGesture.connect('recognize', () => this.popdown());
        this.add_action(clickGesture);
    }

    get isOpen() {
        return this._isOpen;
    }

    _onDestroy() {
        if (this._isOpen) {
            this._isOpen = false;
            this._grabHelper.ungrab({actor: this});
            this._grabHelper = null;
        }
        this._blurTimeline?.stop();
        this._blurTimeline = null;
        this._source?.disconnectObject(this);
        this._source = null;
        global.stage.disconnectObject(this);
        global.focus_manager.remove_group(this);
        this._detail.destroy();
    }

    // The container fills the monitor; the work area's insets are its padding.
    _budget() {
        const monitor = Main.layoutManager.monitors[this._constraint.index] ??
            Main.layoutManager.primaryMonitor;
        const area = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const top = (area.y - monitor.y) / scale;
        const left = (area.x - monitor.x) / scale;
        const right = (monitor.x + monitor.width - area.x - area.width) / scale;
        const bottom = (monitor.y + monitor.height - area.y - area.height) / scale;
        this.child.set_style(`padding: ${top}px ${right}px ${bottom}px ${left}px;`);

        // `maxHeight` is for content that does not fit in the `detail-height` share.
        const room = {
            width: Math.min(MAX_WIDTH * scale, area.width - 2 * MARGIN * scale),
            height: Math.min(MAX_HEIGHT * scale, area.height - 2 * MARGIN * scale),
        };
        return {
            width: Math.round(room.width * this._width),
            height: Math.round(room.height * this._height),
            maxHeight: Math.round(room.height),
        };
    }

    // The panel opens at the side column's width and height, then widens.
    _sizePanel(budget) {
        const frame = 2 * PANE_INSET * St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._detail.setSize(budget.width - frame, budget.height - frame);
        this._detail.populate(this._item, this._section);

        // Unstyled, the column measures short and the clip cuts the corners square.
        ensureStyleDeep(this._detail.actor);

        const pad = 2 * this._detail.padding;
        const [, sideWidth] = this._detail.side.get_preferred_width(-1);
        const [, sideHeight] = this._detail.side.get_preferred_height(sideWidth);

        // Never shorter than the column, which HERO_MIN can make outgrow `detail-height`.
        const paneWidth = budget.width - frame;
        const paneHeight = Math.min(Math.ceil(sideHeight) + pad, budget.maxHeight - frame);
        this._wideWidth = budget.width;
        this._narrowWidth = Math.min(budget.width, Math.ceil(sideWidth) + pad + frame);

        this._detail.setSize(paneWidth, paneHeight);
        this._detail.actor.set_size(paneWidth, paneHeight);
        this._panel.remove_all_transitions();
        this._panel.set_size(this._narrowWidth, paneHeight + frame);
        this._restSize = [this._narrowWidth, paneHeight + frame];
    }

    _setSource(source) {
        this._source?.disconnectObject(this);
        this._source = source;
        // Gone the moment the tile unmaps, as a folder's dialog is with the overview.
        source.connectObject(
            'notify::mapped', () => {
                if (!source.mapped)
                    this.popdown();
            },
            'destroy', () => {
                this._source = null;
                this.popdown();
            },
            this);
    }

    // The tile fades out as the panel zooms out of it, and back as it returns.
    _fadeSource(isOpen) {
        const source = this._source;
        if (!source)
            return;
        const duration = Duration.NORMAL / 2;
        source.ease({
            opacity: isOpen ? 0 : 255,
            duration,
            mode: isOpen ? Ease.OUT : Ease.IN,
            delay: isOpen ? 0 : this._closingLead + Duration.NORMAL - duration,
        });
    }

    _easeBackdrop(on) {
        this._blurTimeline?.stop();
        this._blurTimeline = null;

        if (on) {
            const look = folderLook();
            this._blur = look?.blur ?? null;
            this._classes = look?.classes ?? [];
            for (const c of this._classes)
                this._panel.add_style_class_name(c);
        } else {
            for (const c of this._classes)
                this._panel.remove_style_class_name(c);
            this._classes = [];
        }

        if (!this._blur) {
            this.remove_effect_by_name(BLUR);
            this.ease({
                background_color: on ? SHADE : CLEAR,
                duration: Duration.NORMAL,
                mode: Ease.OUT,
            });
            return;
        }

        let blur = this.get_effect(BLUR);
        if (!blur) {
            blur = new Shell.BlurEffect({
                name: BLUR,
                radius: 0,
                brightness: 1,
                mode: Shell.BlurMode.BACKGROUND,
            });
            this.add_effect(blur);
        }
        this._blurTimeline = easeProps(blur, {
            radius: on ? this._blur.radius : 0,
            brightness: on ? this._blur.brightness : 1,
        }, {duration: Duration.NORMAL, mode: Ease.OUT});
    }

    _zoomAndFadeIn() {
        // The panel is untransformed here, so the artwork's rectangle in it is
        // the translation.
        const {x, y, width, height} = rectIn(this._source.artwork, this._panel);

        this._panel.set({
            translation_x: x,
            translation_y: y,
            scale_x: width / this._panel.width,
            scale_y: height / this._panel.height,
            opacity: 0,
        });

        this._easeBackdrop(true);
        this._panel.ease({
            translation_x: 0,
            translation_y: 0,
            scale_x: 1,
            scale_y: 1,
            opacity: 255,
            duration: Duration.NORMAL,
            mode: Ease.OUT_EXPO,
            onComplete: () => this._widen(),
        });

        this._needsZoomAndFade = false;
    }

    // Widens after the zoom, never during it: its scale is a ratio of the panel's width.
    _widen() {
        if (!this._isOpen)
            return;
        this._detail.revealMain({delay: Duration.NORMAL / 4});
        if (this._wideWidth <= this._narrowWidth)
            return;
        this._panel.ease({
            width: this._wideWidth,
            duration: Duration.NORMAL,
            mode: Ease.OUT_EXPO,
        });
    }

    _narrowAndZoomOut() {
        this._panel.remove_transition('width');
        this._closingLead = 0;
        if (!this._source?.mapped || this._panel.width <= this._narrowWidth) {
            this._zoomAndFadeOut();
            return;
        }
        this._detail.hideMain();
        this._closingLead = Duration.FAST;
        this._panel.ease({
            width: this._narrowWidth,
            duration: Duration.FAST,
            mode: Ease.OUT,
            onComplete: () => this._zoomAndFadeOut(),
        });
    }

    _zoomAndFadeOut() {
        if (!this._source?.mapped) {
            this._fadeOut();
            return;
        }

        const {x, y, width, height} = rectIn(this._source.artwork, this._panel);

        this._easeBackdrop(false);
        this._panel.ease({
            opacity: 0,
            duration: Duration.NORMAL,
            mode: Ease.OUT,
        });
        this._panel.ease({
            translation_x: x,
            translation_y: y,
            scale_x: width / this._panel.width,
            scale_y: height / this._panel.height,
            duration: Duration.NORMAL,
            mode: Ease.OUT_EXPO,
            onComplete: () => this._settle(),
        });
    }

    _fadeOut() {
        this._easeBackdrop(false);
        this._panel.ease({
            opacity: 0,
            duration: Duration.NORMAL,
            mode: Ease.OUT,
            onComplete: () => this._settle(),
        });
    }

    _settle() {
        this.remove_all_transitions();
        this._blurTimeline?.stop();
        this._blurTimeline = null;
        this.remove_effect_by_name(BLUR);
        this._panel.remove_all_transitions();
        this._panel.set_pivot_point(0, 0);
        this._panel.set_size(...this._restSize);
        this._panel.set({
            translation_x: 0,
            translation_y: 0,
            scale_x: 1,
            scale_y: 1,
            opacity: 255,
        });
        this.background_color = CLEAR;
        this.hide();
    }

    vfunc_allocate(box) {
        super.vfunc_allocate(box);

        if (this._needsZoomAndFade)
            this._zoomAndFadeIn();
    }

    vfunc_key_press_event(event) {
        if (handleBoundKey(event))
            return Clutter.EVENT_STOP;

        if (global.focus_manager.navigate_from_event(event))
            return Clutter.EVENT_STOP;

        // An arrow from the panel itself has nowhere to go; land where Tab would.
        if (global.stage.get_key_focus() === this &&
            NAVIGATION_KEYS.includes(event.get_key_symbol()) &&
            this.navigate_focus(null, St.DirectionType.TAB_FORWARD, false))
            return Clutter.EVENT_STOP;

        return Clutter.EVENT_PROPAGATE;
    }

    popup(source, item, section) {
        if (this._isOpen)
            return;

        this.accessible_name = item.title;
        this._item = item;
        this._section = section;

        const [x, y] = source.artwork.get_transformed_position();
        const [width, height] = source.artwork.get_transformed_size();
        this._constraint.index = global.display.get_monitor_index_for_rect(
            new Mtk.Rectangle({
                x: Math.floor(x),
                y: Math.floor(y),
                width: Math.max(1, Math.ceil(width)),
                height: Math.max(1, Math.ceil(height)),
            }));

        this._isOpen = this._grabHelper.grab({
            actor: this,
            focus: this,
            onUngrab: () => this.popdown(),
        });
        if (!this._isOpen)
            return;

        this.get_parent().set_child_above_sibling(this, null);
        this._setSource(source);
        this._sizePanel(this._budget());
        this._needsZoomAndFade = true;
        this.show();
        this._fadeSource(true);
    }

    popdown() {
        if (!this._isOpen)
            return;

        this._isOpen = false;
        this._detail.cancelDeferred();
        this._narrowAndZoomOut();
        this._grabHelper.ungrab({actor: this});
        this._fadeSource(false);
    }
});
