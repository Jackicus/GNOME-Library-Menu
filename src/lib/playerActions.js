// The bar's actions and buttons. Pure data, also imported by prefs.js.

export const ACTIONS = [
    {id: 'none', title: 'Nothing'},
    {id: 'play-pause', title: 'Play or pause'},
    {id: 'seek-back', title: 'Skip back', repeats: true},
    {id: 'seek-forward', title: 'Skip forward', repeats: true},
    {id: 'previous', title: 'Previous'},
    {id: 'next', title: 'Next'},
    {id: 'volume-up', title: 'Volume up', repeats: true},
    {id: 'volume-down', title: 'Volume down', repeats: true},
    {id: 'mute', title: 'Mute'},
    {id: 'slower', title: 'Slower'},
    {id: 'faster', title: 'Faster'},
    {id: 'show-bar', title: 'Show the bar'},
    {id: 'hide-bar', title: 'Hide the bar'},
    {id: 'toggle-length', title: 'Time left or length'},
    {id: 'navigate', title: 'Move around the bar'},
    {id: 'tracks', title: 'Audio and subtitles'},
    {id: 'cycle-audio', title: 'Next audio track'},
    {id: 'cycle-subtitles', title: 'Next subtitle track'},
    {id: 'subtitles-earlier', title: 'Subtitles earlier', repeats: true},
    {id: 'subtitles-later', title: 'Subtitles later', repeats: true},
    {id: 'sleep-timer', title: 'Sleep timer'},
    {id: 'quit', title: 'Close the player'},
];

export const repeats = action => !!ACTIONS.find(a => a.id === action)?.repeats;

// While the bar holds the focus, these buttons press keys instead of their actions.
export const NAVIGATION = {
    'dpad-up': 'Up',
    'dpad-down': 'Down',
    'dpad-left': 'Left',
    'dpad-right': 'Right',
    'south': 'Return',
    'east': 'Escape',
};

export const BAR_BUTTONS = [
    {id: 'skip', title: 'Skip back and forward'},
    {id: 'volume', title: 'Volume'},
    {id: 'rate', title: 'Speed'},
    {id: 'close', title: 'Close the player'},
];

export const SLEEP_MINUTES = [15, 30, 45, 60, 90, 120, 'end'];
export const SLEEP_EPISODES = [1, 2, 3, 4, 5];

export const SUBTITLE_SHIFT_MS = 100;

// The kernel's standard gamepad codes, named by position: the letters on the
// face buttons differ between makers.
export const BUTTONS = [
    {id: 'south', code: 0x130, title: 'Bottom face button', hint: 'A · Cross · B on Nintendo'},
    {id: 'east', code: 0x131, title: 'Right face button', hint: 'B · Circle · A on Nintendo'},
    {id: 'west', code: 0x134, title: 'Left face button', hint: 'X · Square · Y on Nintendo'},
    {id: 'north', code: 0x133, title: 'Top face button', hint: 'Y · Triangle · X on Nintendo'},
    {id: 'dpad-left', code: 0x222, title: 'D-pad left'},
    {id: 'dpad-right', code: 0x223, title: 'D-pad right'},
    {id: 'dpad-up', code: 0x220, title: 'D-pad up'},
    {id: 'dpad-down', code: 0x221, title: 'D-pad down'},
    {id: 'left-shoulder', code: 0x136, title: 'Left shoulder', hint: 'LB · L1 · L'},
    {id: 'right-shoulder', code: 0x137, title: 'Right shoulder', hint: 'RB · R1 · R'},
    {id: 'left-trigger', code: 0x138, title: 'Left trigger', hint: 'LT · L2 · ZL'},
    {id: 'right-trigger', code: 0x139, title: 'Right trigger', hint: 'RT · R2 · ZR'},
    {id: 'select', code: 0x13a, title: 'Select', hint: 'Back · View · Share · Minus'},
    {id: 'start', code: 0x13b, title: 'Start', hint: 'Menu · Options · Plus'},
    {id: 'mode', code: 0x13c, title: 'Guide', hint: 'Xbox · PS · Home'},
    {id: 'left-stick', code: 0x13d, title: 'Left stick press'},
    {id: 'right-stick', code: 0x13e, title: 'Right stick press'},
];

export const buttonForCode = code => BUTTONS.find(b => b.code === code) ?? null;

export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

// The step nearest `rate` moved `by` steps, within what the player accepts.
export function stepRate(rate, by, min, max, refused) {
    const allowed = RATES.filter(r => r >= min && r <= max && !refused.has(r));
    if (!allowed.length)
        return rate;
    let at = 0;
    allowed.forEach((r, i) => {
        if (Math.abs(r - rate) < Math.abs(allowed[at] - rate))
            at = i;
    });
    const to = Math.max(0, Math.min(allowed.length - 1, at + by));
    return allowed[to];
}

// "1:05:09" or "4:02"; a time that is not a number is 0:00.
export function formatTime(seconds) {
    seconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = String(seconds % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export const normaliseName = name => (name ?? '').toLowerCase().replace(/\.desktop$/, '');

// Its desktop entry, its identity, and its bus name without the per-instance part.
export function playerNames({desktopEntry, identity, busName}) {
    const suffix = (busName ?? '').replace(/^org\.mpris\.MediaPlayer2\./, '').replace(/\.instance[\w-]*$/, '');
    return [...new Set([desktopEntry, identity, suffix].filter(Boolean).map(normaliseName))];
}
