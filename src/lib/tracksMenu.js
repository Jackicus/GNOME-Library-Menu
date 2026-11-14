// The audio-and-subtitles pop-out. Picking a track leaves it open, so audio and
// subtitles can be chosen in one go.

import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {SUBTITLE_SHIFT_MS} from './playerActions.js';

// NO_DOT keeps an unpicked radio item lined up with the picked one's dot.
const PICKED = PopupMenu.Ornament.DOT;
const UNPICKED = PopupMenu.Ornament.NO_DOT;

function formatDelay(ms) {
    if (!ms)
        return '0.0 s';
    const sign = ms > 0 ? '+' : '−';
    return `${sign}${(Math.abs(ms) / 1000).toFixed(ms % 100 ? 2 : 1)} s`;
}

const ButtonRow = GObject.registerClass(class LibraryPlayerButtonRow extends PopupMenu.PopupBaseMenuItem {
    constructor(title) {
        super({activate: false, hover: false, can_focus: false, style_class: 'ml-player-menu-row'});
        this.label = new St.Label({
            text: title,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this.label);
        this.label_actor = this.label;
        this._buttons = [];
    }

    // Reading a button then also reads the value it changes.
    describeButtonsBy(label) {
        for (const button of this._buttons)
            button.get_accessible().add_relationship(Atk.RelationType.DESCRIBED_BY, label.get_accessible());
    }

    setIconSize(size) {
        for (const button of this._buttons)
            button.child.icon_size = size;
    }

    addButton(iconName, accessibleName, onClick) {
        const button = new St.Button({
            style_class: 'icon-button ml-player-menu-button',
            icon_name: iconName,
            accessible_name: accessibleName,
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        button.connect('clicked', onClick);
        this.add_child(button);
        this._buttons.push(button);
    }

    addValue() {
        const value = new St.Label({style_class: 'ml-player-menu-value', y_align: Clutter.ActorAlign.CENTER});
        this.add_child(value);
        return value;
    }
});

export class TracksMenu extends PopupMenu.PopupMenu {
    // The source is the whole panel, so the menu stands clear of the bar; the
    // arrow is aimed at `button`.
    constructor(panel, button) {
        super(panel, 0.5, St.Side.BOTTOM);
        this._button = button;
        this.actor.add_style_class_name('ml-player-tracks-menu');
        Main.uiGroup.add_child(this.actor);
        this.actor.hide();

        this._remote = null;
        this._audioItems = new Map();
        this._subtitleItems = new Map();

        this._audio = new PopupMenu.PopupMenuSection();
        this._subtitles = new PopupMenu.PopupMenuSection();
        // A section's itemActivated closes the menu too.
        this._audio.itemActivated = () => {};
        this._subtitles.itemActivated = () => {};
        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Audio'));
        this.addMenuItem(this._audio);
        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Subtitles'));
        this.addMenuItem(this._subtitles);

        this._sync = new ButtonRow('Timing');
        this._sync.addButton('list-remove-symbolic', 'Subtitles earlier',
            () => this._remote?.shiftSubtitles(-SUBTITLE_SHIFT_MS));
        this._delay = this._sync.addValue();
        this._sync.addButton('list-add-symbolic', 'Subtitles later',
            () => this._remote?.shiftSubtitles(SUBTITLE_SHIFT_MS));
        this._sync.addButton('edit-undo-symbolic', 'Reset subtitle timing',
            () => this._remote?.resetSubtitles());
        this._sync.describeButtonsBy(this._delay);
        this.addMenuItem(this._sync);

        this._chapterSeparator = new PopupMenu.PopupSeparatorMenuItem('Chapters');
        this.addMenuItem(this._chapterSeparator);
        this._chapters = new ButtonRow('');
        this._chapters.addButton('go-previous-symbolic', 'Previous chapter', () => this._chapter(-1));
        this._chapters.addButton('go-next-symbolic', 'Next chapter', () => this._chapter(1));
        this._chapters.describeButtonsBy(this._chapters.label);
        this.addMenuItem(this._chapters);
    }

    itemActivated() {
    }

    setIconSize(size) {
        this._sync.setIconSize(size);
        this._chapters.setIconSize(size);
    }

    setRemote(remote) {
        this._remote?.disconnectObject(this);
        this._remote = remote;
        // A new file's tracks are not the ones on show.
        this._remote?.connectObject(
            'changed', () => this._syncDelay(),
            'new-input', () => this.close(),
            this);
        if (!remote)
            this.close();
    }

    // With `focus`, the current audio track takes the keyboard.
    async openFresh({focus = false} = {}) {
        const remote = this._remote;
        const state = await remote.state().catch(() => null);
        if (!state || this._remote !== remote || !this.sourceActor.mapped)
            return;
        this._fill(state);
        this._aim();
        this.open();
        if (focus) {
            const current = state.audio?.find(t => t.current);
            (this._audioItems.get(current?.id) ?? [...this._audioItems.values()][0])?.grab_key_focus();
        }
    }

    _fill({audio, subtitles, chapter}) {
        const unread = 'Play for a moment: VLC lists its tracks only while playing';
        this._fillList(this._audio, this._audioItems, audio?.filter(t => t.id !== -1) ?? [],
            audio ? 'No audio tracks' : unread, id => this._remote?.setTrack('audio', id).catch(() => {}));
        this._fillList(this._subtitles, this._subtitleItems, subtitles ?? [],
            subtitles ? 'No subtitles' : unread, id => this._remote?.setTrack('subtitles', id).catch(() => {}));
        this._sync.visible = !!subtitles?.some(t => t.id !== -1);
        this._syncDelay();
        const hasChapters = chapter.count > 1;
        this._chapterSeparator.visible = hasChapters;
        this._chapters.visible = hasChapters;
        this._chapterState = chapter;
        this._syncChapter();
    }

    _fillList(section, items, tracks, empty, choose) {
        section.removeAll();
        items.clear();
        if (!tracks.length) {
            section.addMenuItem(new PopupMenu.PopupMenuItem(empty, {reactive: false}));
            return;
        }
        for (const track of tracks) {
            const item = new PopupMenu.PopupMenuItem(track.label);
            item.setOrnament(track.current ? PICKED : UNPICKED);
            item.connect('activate', () => {
                for (const other of items.values())
                    other.setOrnament(other === item ? PICKED : UNPICKED);
                choose(track.id);
            });
            section.addMenuItem(item);
            items.set(track.id, item);
        }
    }

    // As BoxPointer measures its source: a fraction of the panel's content width.
    _aim() {
        const panel = this.sourceActor;
        const [panelX] = panel.get_transformed_position();
        const [buttonX] = this._button.get_transformed_position();
        const [buttonWidth] = this._button.get_transformed_size();
        const content = panel.get_theme_node().get_content_box(panel.get_allocation_box());
        const width = content.x2 - content.x1;
        if (width > 0)
            this.setSourceAlignment(Math.clamp((buttonX + buttonWidth / 2 - panelX - content.x1) / width, 0, 1));
    }

    // BoxPointer places itself only when laid out, which the bar's rise (a
    // translation) does not cause.
    reposition() {
        if (this.isOpen)
            this.actor.queue_relayout();
    }

    _syncDelay() {
        this._delay.text = formatDelay(this._remote.subtitleDelay);
    }

    _syncChapter() {
        const {current, count} = this._chapterState;
        // VLC counts chapters from 0.
        this._chapters.label.text = 'Chapter %d of %d'.format(current + 1, count);
    }

    async _chapter(delta) {
        const chapter = await this._remote?.chapter(delta).catch(() => null);
        if (chapter) {
            this._chapterState = chapter;
            this._syncChapter();
        }
    }

    destroy() {
        this.setRemote(null);
        super.destroy();
    }
}
