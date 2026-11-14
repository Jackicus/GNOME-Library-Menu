# Simplicity

extensions.gnome.org rejects "large amounts of unnecessary code, inconsistent code style,
imaginary API usage, comments serving as LLM prompts, or other indications of AI-generated
output", and the author must be able to explain every line
(https://gjs.guide/extensions/review-guidelines/review-guidelines.html and
https://gjs.guide/extensions/review-guidelines/best-practices.html, read 2026-10-02). Code
here is written to pass that reading. `simplify-pass` brings existing code to it.

## Comments

- A comment says only what the code cannot: a non-obvious constraint, a shell quirk, the
  reason for a number. One or two plain lines. The guidelines reject comments that
  "describe trivial operations, or translate code line-by-line".
- No essays, no narration of the next line, no restating a name, no section banners, no
  history. Design reasoning goes in `docs/`; the code may point there in one line.
- Plain sentences: no chains of dashes and semicolons, no rhetorical setups.
- Doc comments only on an export whose contract its name and parameters don't make clear.
- Comment lines stay well under 10% of `src/` (`./scripts/dev.sh size`).

## Only the code that is needed

- No code for a shell version outside `metadata.json`'s `shell-version`: no feature
  detection, no "whichever this shell has". Adding a version is `port-shell-version`'s
  job, and it adds what that version needs.
- `try` only where a step can fail for an outside reason: I/O, the network, a subprocess,
  parsing outside data, a private shell API reach, a monkey-patch restore. Never around
  `destroy()`, `connect()`, `disconnect()` or `GLib.Source.remove()`.
- No `_destroyed` or `_enabled` flags, no `?.` or `typeof … === 'function'` on methods that
  exist, no null checks for values that cannot be null. After `destroy()`, drop the reference.
- No single-use helpers or abstractions, no option nobody sets, no settings key nothing
  reads, no unused export, no dead or commented-out code.
- Performance code stays when a measurement justifies it. The measurement lives in
  `docs/notes.md` (or where the repo keeps them); the code carries at most a one-line pointer.

## The shell's way first

- Public shell API, stock widgets and the theme's style classes before reimplementing a
  shell component. Every private reach is listed in `docs/private-api.md` with why.
- One way to do a thing within a repository. ESLint (`make lint`) is the floor, not the
  standard.

## Size

There is no line cap: an extension grows by what its features need. What keeps it small is
the rules above, applied to every change, and `simplify-pass` before a release.
`./scripts/dev.sh size` (run by `make check`) prints the lines of JavaScript under `src/`,
the comment share and the `try` count, to compare before and after a change; it warns only
when comments reach 10%.
