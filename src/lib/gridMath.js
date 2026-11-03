// The grid's arithmetic, shared with the preferences' preview, so nothing of the
// shell is imported. Lengths are logical px, multiplied by `scale`.

// Logical pixels, as the theme writes them.
const MIN_ART = 96;
// Beneath the artwork with its label: the tile's spacing and a line of text.
const LABEL_CHROME = 32;
// Room for a hovered title in the bottom row to wrap to a second line.
const TITLE_LINE = 20;
// The shell's PAGE_PREVIEW_RATIO each side, for the page arrows.
export const ARROWS_SHARE = 0.2;
export const DOTS_HEIGHT = 36;

export const GRID_KEYS = [
    'columns', 'rows', 'tile-padding', 'tile-spacing', 'grid-padding', 'show-titles', 'grid-align',
];

export function readGridStyle(settings) {
    return {
        columns: settings.get_int('columns'),
        rows: settings.get_int('rows'),
        tilePad: settings.get_int('tile-padding'),
        gap: settings.get_int('tile-spacing'),
        margin: settings.get_int('grid-padding'),
        titles: settings.get_boolean('show-titles'),
        align: settings.get_string('grid-align'),
    };
}

// Decided before any item is added: the layout does not page items again when
// the mode changes. Rows and columns are capped by what fits at MIN_ART.
export function gridFor({width, height, aspect, scale, style}) {
    const gap = style.gap * scale;
    const margin = style.margin * scale;
    const pad = 2 * style.tilePad * scale;
    const chrome = pad + (style.titles ? LABEL_CHROME : 0) * scale;
    const titleLine = (style.titles ? TITLE_LINE : 0) * scale;
    const minArt = MIN_ART * scale;

    const gridW = width * (1 - ARROWS_SHARE) - 2 * margin;
    const gridH = height - DOTS_HEIGHT * scale - 2 * margin - titleLine;

    const fitColumns = Math.floor((gridW + gap) / (minArt / aspect + pad + gap));
    const columns = Math.max(1, Math.min(style.columns, fitColumns));
    const roomW = Math.floor((gridW - gap * (columns - 1)) / columns);
    const byWidth = Math.floor((roomW - pad) * aspect);

    const fitRows = Math.floor((gridH + gap) / (minArt + chrome + gap));
    const rows = Math.max(1, Math.min(style.rows, fitRows));
    const byHeight = Math.floor((gridH + gap) / rows - chrome - gap);

    const iconSize = Math.max(minArt, Math.min(byWidth, byHeight));
    return {
        rows,
        columns,
        iconSize,
        cellW: Math.round(iconSize / aspect) + pad,
        cellH: iconSize + chrome,
    };
}

// Where the block of cells sits on a page: the cells as far apart as the
// settings say, centred in the room the padding leaves.
export function placeGrid({pageWidth, pageHeight, columns, rows, cellW, cellH, scale, style}) {
    const margin = style.margin * scale;
    const gap = style.gap * scale;
    const roomW = pageWidth - 2 * margin;
    const roomH = pageHeight - 2 * margin - (style.titles ? TITLE_LINE : 0) * scale;
    const blockW = columns * cellW + (columns - 1) * gap;
    const blockH = rows * cellH + (rows - 1) * gap;
    return {
        left: margin + Math.max(0, (roomW - blockW) / 2),
        top: margin + Math.max(0, (roomH - blockH) / 2),
        gap,
    };
}
