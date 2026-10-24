import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import {radiusStyle} from './shape.js';

// The stylesheet's .ml-row height, logical px: the row `detail-row-size` scales from.
const ROW_SIZE = 36;

// The radius must travel in the same inline style as the image to round it.
export function artworkStyle(path, part = 'art') {
    return `background-image: url("file://${encodeURI(path)}"); background-size: cover; ${radiusStyle(part)}`;
}

export function createLabel(text, styleClass, props = {}) {
    const label = new St.Label({text, style_class: styleClass, ...props});
    label.clutter_text.single_line_mode = true;
    label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return label;
}

export function createArtwork({path, title, icon, width, height, styleClass = 'ml-art', radius = 'art'}) {
    const art = new St.Widget({
        style_class: styleClass,
        width,
        height,
        layout_manager: new Clutter.BinLayout(),
        // Not clipped, for the focus ring's box-shadow. No expand, or the
        // placeholder's expanding stack would stretch the artwork.
        x_expand: false,
        y_expand: false,
    });
    if (path) {
        art.set_style(artworkStyle(path, radius));
        return art;
    }

    art.set_style(radiusStyle(radius));
    art.add_style_class_name('ml-art-placeholder');
    const stack = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
        y_expand: true,
        clip_to_allocation: true,
        style_class: 'ml-art-placeholder-content',
    });
    // `width` is physical, `icon_size` logical (as js/ui/iconGrid.js converts).
    const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
    stack.add_child(new St.Icon({
        icon_name: icon,
        icon_size: Math.max(24, Math.round(width * 0.22 / scale)),
        style_class: 'ml-art-placeholder-icon',
        x_align: Clutter.ActorAlign.CENTER,
    }));
    if (title && width >= 120 * scale) {
        const label = new St.Label({
            text: title,
            style_class: 'ml-art-placeholder-title',
            x_align: Clutter.ActorAlign.CENTER,
            width: Math.round(width * 0.8),
        });
        label.clutter_text.line_wrap = true;
        label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        label.clutter_text.x_align = Clutter.ActorAlign.CENTER;
        label.height = Math.min(64 * scale, Math.round(height * 0.3));
        stack.add_child(label);
    }
    art.add_child(stack);
    return art;
}

export function createActionButton({label, icon, styleClass = 'button default ml-action'}) {
    const content = new St.BoxLayout({style_class: 'ml-action-content', y_align: Clutter.ActorAlign.CENTER});
    if (icon)
        content.add_child(new St.Icon({icon_name: icon, icon_size: 16, y_align: Clutter.ActorAlign.CENTER}));
    const text = new St.Label({text: label, y_align: Clutter.ActorAlign.CENTER});
    content.add_child(text);
    const button = new St.Button({
        style_class: styleClass,
        can_focus: true,
        track_hover: true,
        child: content,
    });
    button.setLabel = value => {
        text.text = value;
    };
    return button;
}

// Focus landing on a tab chooses it, so a remote's arrows alone switch sections.
function createTabs(sections, active, onSwitch) {
    const actor = new St.BoxLayout({style_class: 'ml-tabs', y_align: Clutter.ActorAlign.CENTER});
    const tabs = new Map();
    const setActive = key => {
        for (const [k, tab] of tabs)
            tab.checked = k === key;
    };
    for (const section of sections) {
        const tab = new St.Button({
            style_class: 'ml-tab',
            label: section.title,
            can_focus: true,
            // Tracked: the tab paints its own `:hover`.
            track_hover: true,
        });
        const choose = () => {
            if (tab.checked)
                return;
            setActive(section.key);
            onSwitch(section.key);
        };
        tab.connect('clicked', choose);
        tab.connect('key-focus-in', choose);
        tabs.set(section.key, tab);
        actor.add_child(tab);
    }
    setActive(active);
    return {actor, setActive, lit: () => [...tabs.values()].find(tab => tab.checked) ?? null};
}

// The tabs, centred; one section alone is named instead of switched.
export function createHeader({sections, active, onSwitch}) {
    const actor = new St.Widget({
        style_class: 'ml-header',
        layout_manager: new Clutter.BinLayout(),
        x_expand: true,
    });
    if (sections.length === 1) {
        actor.add_child(createLabel(sections[0].title, 'ml-header-title', {
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        return {actor, setActive: () => {}, focusTabs: () => false};
    }
    const tabs = createTabs(sections, active, onSwitch);
    tabs.actor.x_align = Clutter.ActorAlign.CENTER;
    actor.add_child(tabs.actor);
    return {
        actor,
        setActive: tabs.setActive,
        focusTabs: () => {
            const tab = tabs.lit();
            tab?.grab_key_focus();
            return !!tab;
        },
    };
}

export function createPill(text, styleClass, style = null) {
    return new St.Label({text, style_class: styleClass, style, y_align: Clutter.ActorAlign.CENTER});
}

// `watched` null: nothing to track; true or false makes the disc a toggle.
// `height` is logical px; the row's type and icons scale with it from the
// stylesheet's 36 px, so a two-line row still fits.
export function createRow({index, title, subtitle, badges = [], size, icon = 'media-playback-start-symbolic', height, onActivate, watched = null, onWatched}) {
    const ratio = height / ROW_SIZE;
    const iconSize = Math.round(16 * ratio);
    const row = new St.Button({
        style_class: 'button flat ml-row',
        can_focus: true,
        track_hover: true,
        x_expand: true,
        style: `${radiusStyle()} height: ${height}px; min-height: ${height}px; font-size: ${ratio.toFixed(2)}em;`,
    });
    const discStyle = `width: ${height}px; height: ${height}px;`;
    const content = new St.BoxLayout({x_expand: true, y_align: Clutter.ActorAlign.CENTER});

    // A label sized in CSS draws its text at the top, so the disc is a bin.
    const number = new St.Label({
        text: String(index),
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
    if (watched === null) {
        content.add_child(new St.Bin({
            style_class: 'ml-row-index',
            y_align: Clutter.ActorAlign.CENTER,
            child: number,
            style: discStyle,
        }));
    } else {
        // Its own button, so ticking an episode off does not also play it.
        const tick = new St.Icon({icon_name: 'object-select-symbolic', icon_size: iconSize});
        const face = new St.Widget({layout_manager: new Clutter.BinLayout()});
        face.add_child(number);
        face.add_child(tick);
        const disc = new St.Button({
            style_class: 'ml-row-index ml-row-watch',
            y_align: Clutter.ActorAlign.CENTER,
            toggle_mode: true,
            checked: watched,
            track_hover: true,
            accessible_name: 'Watched',
            child: face,
            style: discStyle,
        });
        const sync = () => {
            number.visible = !disc.checked;
            tick.visible = disc.checked;
        };
        sync();
        disc.connect('clicked', () => {
            sync();
            onWatched(disc.checked);
        });
        row.setWatched = value => {
            disc.checked = value;
            sync();
        };
        // St's focus stops at the row: Mark watched reaches the disc here.
        row.toggleWatched = () => {
            disc.checked = !disc.checked;
            sync();
            onWatched(disc.checked);
        };
        content.add_child(disc);
    }

    const titleLabel = createLabel(title, 'ml-row-title', {x_expand: true, y_align: Clutter.ActorAlign.CENTER});
    if (subtitle) {
        const text = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'ml-row-text'});
        text.add_child(titleLabel);
        text.add_child(createLabel(subtitle, 'ml-row-subtitle'));
        content.add_child(text);
    } else {
        titleLabel.add_style_class_name('ml-row-text');
        content.add_child(titleLabel);
    }

    for (const badge of badges)
        content.add_child(createPill(badge, 'ml-badge', radiusStyle('badge')));
    if (size)
        content.add_child(new St.Label({text: size, style_class: 'ml-row-size', y_align: Clutter.ActorAlign.CENTER}));

    content.add_child(new St.Icon({
        icon_name: icon,
        icon_size: iconSize,
        style_class: 'ml-row-icon',
        y_align: Clutter.ActorAlign.CENTER,
    }));

    row.set_child(content);
    row.connect('clicked', () => onActivate());
    return row;
}

export function createEmptyState({icon, title, hint, actionLabel, actionIcon, onAction}) {
    const box = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'ml-empty',
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
        y_expand: true,
    });
    box.add_child(new St.Icon({icon_name: icon, icon_size: 64, style_class: 'ml-empty-icon', x_align: Clutter.ActorAlign.CENTER}));
    box.add_child(new St.Label({text: title, style_class: 'ml-empty-title', x_align: Clutter.ActorAlign.CENTER}));
    box.add_child(new St.Label({text: hint, style_class: 'ml-empty-hint', x_align: Clutter.ActorAlign.CENTER}));
    if (actionLabel) {
        const button = createActionButton({label: actionLabel, icon: actionIcon, styleClass: 'button ml-action-secondary'});
        button.x_align = Clutter.ActorAlign.CENTER;
        button.connect('clicked', () => onAction(button));
        box.add_child(button);
    }
    return box;
}
