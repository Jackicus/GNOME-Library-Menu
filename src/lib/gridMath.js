// The grid's arithmetic, shared with the preferences' preview, so nothing of the
// shell is imported. Lengths are logical px, multiplied by `scale`.

// Logical pixels, as the theme writes them.
const MIN_ART = 96;
// An overview-tile's padding, and with its label beneath the artwork.
export const TILE_PADDING = 24;
const TILE_CHROME = 56;
// Room for a hovered title in the bottom row to wrap to a second line.
const TITLE_LINE = 20;
// The shell's PAGE_PREVIEW_RATIO each side, for the page arrows.
export const ARROWS_SHARE = 0.2;
export const DOTS_HEIGHT = 36;
// How far the spacing may widen: the theme's max-column-spacing for .icon-grid.
const MAX_SPREAD = 36;

export const GRID_KEYS = [
    'columns', 'rows', 'tile-spacing-horizontal', 'tile-spacing-vertical',
    'grid-padding-horizontal', 'grid-padding-vertical', 'show-titles', 'grid-align',
];

export function readGridStyle(settings) {
    return {
        columns: settings.get_int('columns'),
        rows: settings.get_int('rows'),
        gapX: settings.get_int('tile-spacing-horizontal'),
        gapY: settings.get_int('tile-spacing-vertical'),
        padX: settings.get_int('grid-padding-horizontal'),
        padY: settings.get_int('grid-padding-vertical'),
        titles: settings.get_boolean('show-titles'),
        align: settings.get_string('grid-align'),
    };
}

// Decided before any item is added: the layout does not page items again when
// the mode changes. Rows and columns are capped by what fits at MIN_ART.
export function gridFor({width, height, aspect, scale, style}) {
    const gapX = style.gapX * scale;
    const gapY = style.gapY * scale;
    const pad = TILE_PADDING * scale;
    const chrome = (style.titles ? TILE_CHROME : TILE_PADDING) * scale;
    const titleLine = (style.titles ? TITLE_LINE : 0) * scale;
    const minArt = MIN_ART * scale;

    const gridW = width * (1 - ARROWS_SHARE) - 2 * style.padX * scale;
    const gridH = height - (DOTS_HEIGHT + 2 * style.padY) * scale - titleLine;

    const fitColumns = Math.floor((gridW + gapX) / (minArt / aspect + pad + gapX));
    const columns = Math.max(1, Math.min(style.columns, fitColumns));
    const roomW = Math.floor((gridW - gapX * (columns - 1)) / columns);
    const byWidth = Math.floor((roomW - pad) * aspect);

    const fitRows = Math.floor((gridH + gapY) / (minArt + chrome + gapY));
    const rows = Math.max(1, Math.min(style.rows, fitRows));
    const byHeight = Math.floor((gridH + gapY) / rows - chrome - gapY);

    const iconSize = Math.max(minArt, Math.min(byWidth, byHeight));
    return {
        rows,
        columns,
        iconSize,
        cellW: Math.round(iconSize / aspect) + pad,
        cellH: iconSize + chrome,
    };
}

// Where the block of cells sits on a page: the spacing is a floor, and the room
// the covers cannot take widens it, as far as the shell lets its icons spread.
export function placeGrid({pageWidth, pageHeight, columns, rows, cellW, cellH, scale, style}) {
    const padX = style.padX * scale;
    const padY = style.padY * scale;
    const roomW = pageWidth - 2 * padX;
    const roomH = pageHeight - 2 * padY - (style.titles ? TITLE_LINE : 0) * scale;
    const spread = (least, room, count) => count > 1
        ? Math.min(Math.max(least, room / (count - 1)), Math.max(least, MAX_SPREAD * scale)) : 0;
    const gapX = spread(style.gapX * scale, roomW - columns * cellW, columns);
    const gapY = spread(style.gapY * scale, roomH - rows * cellH, rows);
    const blockW = columns * cellW + (columns - 1) * gapX;
    const blockH = rows * cellH + (rows - 1) * gapY;
    return {
        left: padX + Math.max(0, (roomW - blockW) / 2),
        top: padY + Math.max(0, (roomH - blockH) / 2),
        gapX,
        gapY,
    };
}
