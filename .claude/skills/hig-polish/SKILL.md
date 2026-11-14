---
name: hig-polish
description: GNOME HIG and polish pass on a GNOME Shell extension's UI - its top-bar button, pop-up, panel, overlay or overview pages and its preferences window - shot in both colour schemes, with high contrast and large text, walked with the keyboard, compared with GNOME Shell's own surfaces and the HIG, then fixed. Use when asked to polish something, make it look native, tidy spacing or states, check accessibility or keyboard use, or check it against the HIG.
argument-hint: "[what to polish: the pop-up, the preferences, the bar, …]"
---

Target: $ARGUMENTS

The extension should read as part of GNOME Shell. `.claude/rules/gjs-st.md` ("Looking like
GNOME" and the St traps) is the standard; this is how to check a surface against it.

## 1. Shoot it in every state that matters

With `nested-shell` under `--clean` (and the repository's stand-in data, as in
`screenshots`), crop each shot to the surface:

- dark and light (`run gsettings set org.gnome.desktop.interface color-scheme
  prefer-light` inside the nested shell);
- high contrast (`org.gnome.desktop.a11y.interface high-contrast true`) and large text
  (`org.gnome.desktop.interface text-scaling-factor 1.25`), then put both back;
- the states it has: empty, loading, error or unavailable, one item and many, long names,
  focused and hovered, and on the narrowest monitor it supports;
- the same moment in the shell's own surfaces to compare against: the Quick Settings
  menu, a popup menu, the calendar, a notification, an app folder, the overview.

## 2. Compare

Read every PNG. Against the shell's own surfaces and https://developer.gnome.org/hig/:

- **Widgets**: the shell's own (`PopupMenu` items and sections, `QuickToggle`, the
  `Slider`, `icon-button`, `overview-tile`) and its style classes before custom CSS;
  custom CSS only for what GNOME has no equivalent for, scoped by the extension's prefix.
- **Spacing and type**: aligned to one margin, the shell's paddings, sizes in em; a px
  is a stated exception or a bug. Ellipsize rather than clip; nothing overflows its box
  at large text.
- **Colour**: the accent and the shell's neutrals, right in light, dark and high
  contrast; state shown by more than colour alone.
- **Icons**: symbolic, `St.Icon`, at the theme's sizes; no emoji as icons.
- **Motion**: through `ease()`, inside the range `gjs-st.md` gives, and still correct with
  animations off (`org.gnome.desktop.interface enable-animations false`).
- **The preferences**: libadwaita throughout: `Adw.PreferencesPage` and `Group`,
  `Adw.SwitchRow`, `ComboRow`, `SpinRow`, `EntryRow`, `ActionRow` with subtitles; group
  descriptions rather than loose labels; no custom styling; usable at 360 px wide.

## 3. Walk it with the keyboard

In one `do` run of `key` steps (the nested-shell skill says why): every control is
reachable with Tab or the arrows in a sensible order, shows the shell's focus ring, acts
on Return or Space, and Escape closes the surface and gives focus back where it came
from. Icon-only buttons have an accessible name and a tooltip where the shell's own have
one. A shortcut the extension adds does not take one GNOME uses.

## 4. Fix and land

Fix the biggest gap first, `reload`, reshoot the same states and look again. Before and
after shots go in the pull request description (from the repository's folder in the scratchpad; kept shots only via
`screenshots`). `make check`, `stop` + `start` once, then the repository's
loop. Report what changed, what was left and why.
