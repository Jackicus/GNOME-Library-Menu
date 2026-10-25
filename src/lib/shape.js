// St CSS has no variables: every rounded surface takes its radius from here.

const MAX = 40;
const DEFAULT_RADIUS = 18;

// The width of the panel's inset ring (the theme's app-folder-dialog box-shadow),
// which the pane sits inside: logical pixels, into a CSS string.
export const PANE_INSET = 1;

const PART = {
    art: r => r,
    hero: r => r + 4,
    pane: r => r + 12,
    // Inside the panel's frame: the outer curve less the frame keeps them concentric.
    paneInner: r => r + 12 - PANE_INSET,
    badge: r => Math.round(r / 2),
};

let styles = {};
let base = DEFAULT_RADIUS;

export function setCornerRadius(px) {
    base = Math.max(0, Math.min(MAX, Math.round(px) || 0));
    styles = {};
    for (const [part, scale] of Object.entries(PART))
        styles[part] = `border-radius: ${scale(base)}px;`;
}
setCornerRadius(DEFAULT_RADIUS);

export function radiusStyle(part = 'art') {
    return styles[part];
}

// The tile around a poster: its padding, and the radius concentric with the art's.
export function tileStyle(padding) {
    return `padding: ${padding}px; border-radius: ${base + padding}px;`;
}
