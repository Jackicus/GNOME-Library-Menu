---
name: release
description: Release this GNOME Shell extension - extensions.gnome.org review, the version, a release pull request setting version-name, then a v* tag on the merged main that the Release workflow turns into a GitHub release with the zip - and hand the zip to the owner for the extensions.gnome.org upload. Only when the owner has said to release.
disable-model-invocation: true
argument-hint: "[version-name, e.g. 1.1; or nothing to propose one]"
---

Release: $ARGUMENTS

A release is a pushed tag. The `Release` workflow (`.github/workflows/release.yml`) checks
the tag against `version-name`, runs `make check`, packs the zip with
`./scripts/dev.sh pack` and publishes the GitHub release with notes from the merged pull
requests. Nothing is packed or uploaded by hand. The GitHub releases are the changelog.

**The tag is irreversible.** Release tags are protected by a repository ruleset: once
pushed, a `v*` tag cannot be moved or deleted, by anyone. A mistake is fixed by the next
version, never by retagging. The upload to extensions.gnome.org is the owner's: it needs
their account there, and its review can take days.

## First

Where it stands: `version-name` in `src/metadata.json`, the last tag
(`git describe --tags --abbrev=0 --match 'v*'`), the pull requests merged since it
(`gh pr list --state merged --search "merged:>DATE"`, DATE the tag's), main's CI
(`gh run list --branch main -L 1`) and the last Release run (`gh run list -w Release -L 1`).
Stop if main's CI is not green or nothing is unreleased. Show the owner that and the
proposed version: a patch for fixes alone, minor when a `feat/` pull request was merged,
major for a break; the first release keeps the current version-name.

## Then

1. `main` checked out, clean and pulled. **Run `ego-review`** and stop on any blocker it
   leaves: a release that extensions.gnome.org would reject is not cut.
2. **The version.** `version-name` is what people read; extensions.gnome.org numbers
   uploads itself (`version`, never set in `metadata.json`). It may hold only letters,
   digits, dots and spaces, at most 16. Take the one given, else the one proposed above,
   and **confirm it with the owner** unless they gave it. A prerelease keeps the
   version-name and adds a suffix only to the tag (`v1.1-beta.1` releases version-name
   `1.1` as a prerelease).
3. **Shell versions.** `shell-version` lists only versions the extension has been booted
   on; a release never adds one that has not been (`port-shell-version`).
4. A branch `release/<version-name>`: set `version-name` in `src/metadata.json`; update
   the README or `docs/` where they name the version; retake screenshots only if what
   they show changed (`screenshots`). `make check`. Pull request "Release
   <version-name>", CI green, `gh pr merge --squash --delete-branch`, then
   `git checkout main && git pull --ff-only`.
5. Tag the merged `main` and push the tag:
   `git tag -a v<version-name> -m "<Name> <version-name>"` and
   `git push origin v<version-name>`.
6. Watch it: `gh run list -w Release -L 1` for the run, then `gh run watch <id>
   --exit-status`. On failure, read the log (`gh run view <id> --log-failed`); fix the
   cause through a pull request and re-run the workflow for the same tag
   (`gh workflow run release.yml -f tag=v<version-name>`). A wrong `version-name` in the
   tagged commit cannot be fixed under that tag: release the next version.
7. Verify: `gh release view v<version-name>` shows the notes and one
   `<uuid>.shell-extension.zip`; `gh release download v<version-name> -D <scratch>/<repository>` and
   `unzip -l` it: `metadata.json` with that version-name, the files `src/` ships, nothing
   else.
8. Hand over: the release URL, the zip's local path from step 7, the `ego-review`
   findings that were not blockers, and the upload step for the owner
   (https://extensions.gnome.org/upload/, signed in as the extension's owner).
