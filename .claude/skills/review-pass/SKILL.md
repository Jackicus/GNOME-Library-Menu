---
name: review-pass
description: Review a set of changes to a GNOME Shell extension (a branch, a commit range, a pull request, or the working tree) against the repository's rules, fix the clear-cut findings and list the rest. Use when asked to review, audit or check an extension's changes before a merge or a release.
argument-hint: "[branch, commit range, PR number, or nothing for this branch against main]"
---

Review pass over: $ARGUMENTS
(Nothing given: this branch's changes against `main`, or the working tree if there are
none. A PR number: `gh pr checkout N` first.)

1. Read the repository's CLAUDE.md, then the `.claude/rules/` file for every area the diff
   touches. Start from `git diff --stat main...`, then read each changed file whole, not
   only its hunks.
2. Look for:
   - **the two processes mixed**: St, Clutter, Meta, Shell or `resource:///org/gnome/shell/`
     reached from `prefs.js` or from a module it imports;
   - **the compositor blocked**: synchronous file or network I/O (`load_contents`,
     `query_info`, `file_test` on a path that can be a share), `GLib.spawn_sync`, a loop
     that builds an actor per item owned, work started on a frame that animates;
   - **`disable()` incomplete**: a signal, source, timeout, keybinding, monkey-patch, actor
     or file monitor that `enable()` makes and `disable()` does not undo; an undo that
     can throw for an outside reason (private API, a monkey-patch put back) left unguarded,
     so it abandons the rest; or the opposite, `try`/`catch` around `destroy()`,
     `disconnect()` or `GLib.Source.remove()`, or a `_destroyed` flag;
   - **shared-shell hygiene**: an unprefixed GObject type name, CSS class, effect name or
     settings path; a monkey-patch that does not chain, or that is removed while another
     extension's wrapper sits over it;
   - **reload traps**: a `GTypeName` set on a class (GJS names it after its module's
     path, which a reload changes; a set one fails "already registered"), a path
     derived from `import.meta.url` or hard-coded to the repository;
   - **St CSS**: web CSS St ignores, px font sizes or px lengths other than a hairline or a
     shadow, hard-coded hues, a CSS length scaled by `scale_factor` or an allocation that
     is not;
   - **private shell API** reached without being listed where the repository lists it;
   - **settings**: a key read that the schema lacks, a schema change that breaks
     `glib-compile-schemas --strict`, a prefs row that binds no key;
   - **logging**: anything logged on success in shipped code, a secret or token in a log
     line, an error swallowed without one;
   - **real data**: a library title, account name, user path or real screenshot in a
     fixture, a doc, a test or `docs/screenshots/`;
   - **docs**: a line in CLAUDE.md, `.claude/rules/`, a skill or `docs/` the change made
     untrue; comments that narrate history instead of describing the code;
   - **simplicity** (`.claude/rules/simplicity.md`): comments that narrate, restate or
     argue a design; code for a shell version outside `shell-version`; `try`, `?.` or a
     null check that nothing outside can make fail; a helper used once, an option nobody
     sets, dead code; speed-ups with no measurement behind them; lines the change adds
     that its feature does not need.
3. Run `make check`. For anything visible, look at it in the nested shell
   (`nested-shell`).
4. Fix what is clear-cut, one logical fix per commit, each with `make check` green, on the
   branch under review (or a branch of its own, through the usual pull request).
5. Report: what you fixed (commits), what needs a decision (`file:line`, the options and
   their cost), and what you could not verify.
