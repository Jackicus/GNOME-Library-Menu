---
name: simplify-pass
description: Bring a GNOME Shell extension's code down to its simplicity standard - comments cut to the why, no code for unclaimed shell versions, no defensive try or checks, no speculative abstraction - area by area, each change proven to keep behaviour and speed, landed as small pull requests. Use when asked to simplify an extension, make it read as hand-written, get it ready for extensions.gnome.org review, or when dev.sh size warns about comments.
argument-hint: "[area or file; nothing for a map of the whole repository]"
---

Target: $ARGUMENTS (nothing: the whole repository, starting with a map)

The standard is `.claude/rules/simplicity.md`. Simplifying never changes what the
extension does: same features, same settings, same look, same speed. There is no line count
to reach: a line goes because the rule says it is not needed, and the numbers from
`./scripts/dev.sh size` only show what the pass removed.

## 0. The map

- Read the repository's CLAUDE.md and rules, `docs/private-api.md` and `docs/notes.md` (or
  where it keeps measurements), and `./scripts/dev.sh size` for the starting numbers.
- Use `<scratchpad>/<repo>/simplify-map.md` if it exists (a `ego-review` run
  writes one); otherwise make it: per file, its lines, comment share and `try` count, and
  what is to go, in four kinds: **comments**, **version fallbacks**, **defensive code**,
  **structure** (single-use helpers, duplication, dead code, options nobody sets, a
  reimplemented shell component). Note anything that is really a feature to remove; that
  list goes to the owner, never into a pull request.
- Work in that order: comments first (least risk), then version fallbacks, then defensive
  code, then structure. One pull request per area: a module, or one kind across a few
  small files. A reviewer should read it in one sitting.

## 1. Before changing an area

- `./scripts/nested.sh start --clean --stand-in --headless` and shoot the UI the area
  draws (`nested-shell`; the repository's drive-extension skill says where it
  is). Keep the shots in `<scratchpad>/<repo>/before/`. Save `./scripts/nested.sh logs`.
- If the area is on a performance path (a list's bind, a page's first build, an animation,
  anything a measurement in the docs is about), take the repository's measurement too
  (its stall or timing command; the drive skill names it). Three runs, the median.

## 2. Simplify

- **Comments**: delete narration and restated names; cut a reason to one or two plain
  lines; move design reasoning to `docs/` if it is worth keeping, with a one-line pointer.
- **Version fallbacks**: keep only the path `shell-version`'s versions take.
- **Defensive code**: drop `try` around calls that cannot throw, `?.` and type checks on
  what exists, `_destroyed` flags (destroy and null instead). A `try` that guards a
  private reach or a monkey-patch restore stays.
- **Structure**: inline a helper used once, merge duplicates, delete dead code and unused
  exports and keys (a settings key is user-visible: removing one is the owner's call).
  Keep a speed-up the docs measure; drop one nobody measured, and re-measure.
- No behaviour change hides in a simplification. If one is needed, it is an issue and a
  pull request of its own.

## 3. After

- `make check`, then the same nested start, the same shots into `after/`: look at each
  pair with the Read tool; they must match. No new lines in the logs. A reload after an
  edit still works. The measurement, if taken, is no worse beyond the noise.
- `./scripts/nested.sh stop`; nothing left behind.

## 4. Land it

Issue, branch `simplify/<area>`, pull request "Fixes #N". The body states, before and
after: `src/` lines, comment share and `try` count (`./scripts/dev.sh size`), the area's
own lines, and how behaviour was checked (shots compared, logs, measurement). CI green,
`gh pr merge --squash --delete-branch`, pull main.

## 5. Report

Per pull request: link, lines and comment share before and after, `try` count before and
after. Then: features or settings the owner might drop (with what each costs to keep), any
measurement that moved, and what is left on the map.
