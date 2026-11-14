---
name: fix-bug
description: Reproduce, find the cause of, and fix a bug in a GNOME Shell extension, then land it through the issue, branch, pull request and CI loop. Use when the user reports something broken in an extension (a throw in the logs, a widget drawn wrong, a setting that does nothing, a freeze, a preferences window that will not open) or pastes a journal excerpt.
argument-hint: "[what happens; what should happen; steps; logs]"
---

Bug report: $ARGUMENTS

1. Read the repository's CLAUDE.md and the `.claude/rules/` file for the area the bug is
   in. If the report does not say what should happen or how to get there, ask one
   question, or state your assumption and go on.
2. Open an issue for it (`gh issue create`), unless one exists, and a branch named for it
   (`fix/<short-name>`). A second bug found on the way is a second issue.
3. Reproduce it in the cheapest place that shows it:
   - `make check` and what it runs: a parser over a fixture, the imports walk, a shader
     compile, a schema `--strict` compile;
   - plain `gjs -m` over a pure module (one with no St, Clutter or Shell import), as
     `./scripts/` tools do;
   - the journal: `make logs` for the real session (read-only), `./scripts/nested.sh logs`
     for the nested one;
   - the nested shell, with the `nested-shell` skill and the repository's
     `drive-extension` skill: `start --clean`, reproduce, `shot` the state.
   Never reproduce in the user's real session by reloading or reconfiguring it.
4. Find the cause, not the symptom: name the line and why it is wrong. Then look for the
   same pattern elsewhere in the repository, and ask whether the sibling extensions share
   it; note a shared one for the
   user rather than editing another repository on this branch.
5. Fix it. Where the repository has a check that could have caught it (a fixture, a
   parser case, an imports rule), add the case. A visible fix gets before and after shots
   in the nested shell, and an enable-path fix a `stop` + `start`.
6. `make check`, then fix any line in CLAUDE.md, `.claude/rules/`, a skill or `docs/` the
   fix made wrong.
7. Commit with a subject that says what is now true and a body that names the cause. Push,
   open the pull request with "Fixes #N" and how it was verified, wait for CI, then
   `gh pr merge --squash --delete-branch`, and check main's run.
8. `./scripts/nested.sh stop` if you started one. Report the cause, the fix, the PR, and
   anything you could not verify.
