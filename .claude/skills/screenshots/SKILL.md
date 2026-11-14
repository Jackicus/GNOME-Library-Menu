---
name: screenshots
description: Take, check and commit the screenshots a GNOME Shell extension publishes - the README's docs/screenshots/ and the images for extensions.gnome.org - in the nested shell over stand-in data only, in both colour schemes, shrunk, stripped and checked for anything personal before they go into a public repository. Use whenever published screenshots are retaken, added or asked for, or a visible change makes the existing ones out of date.
argument-hint: "[which shots: all, or names such as pop-up, preferences]"
---

Shots: $ARGUMENTS (nothing given: every image the README and docs link)

The repositories are public and a screenshot is the easiest place to leak: a shot script
that uses the real `HOME`, `PATH` and logins puts the owner's live account figures and
home path in the picture. A published shot shows **stand-in data
only**: no real home path, user name, e-mail, account, token, live figure, library,
wallpaper or file of the user's, and nothing fetched from the network.

## 1. Where the stand-ins come from

Read the repository's drive-extension skill (its "Screenshots" section) and CLAUDE.md
first. They name the stand-ins and the formats; what the repositories use today:

Every repository shoots under `./scripts/nested.sh start --stand-in`: a scratch `HOME`
holding a copy of the checkout's `src/`, fresh settings in GNOME's stock look (none of the
owner's fonts, theme or accent; the dash shows the system schema's favourites), the
system's `PATH`, `XDG_DATA_DIRS` and `XDG_CONFIG_DIRS` (none of the owner's Flatpak apps in
the dash, the app grid or search), and what the repository's `nested_stand_in` hook (in
`./scripts/nested.d/`) puts there once per start; commands named in `EXT_STAND_IN_BINS`
are stand-ins on `/usr/bin` in a namespace of the session's own, and neither variables
named in `EXT_STAND_IN_UNSET` nor any whose value is a path in the real home are in its
environment. A variable the extension reads that could point it at real data elsewhere
(a provider's config directory outside the home, a key) belongs in `EXT_STAND_IN_UNSET`.

What the stand-in data is, and how to drive a shot over it, is in the repository's own
drive skill: an invented library or set of logins its hooks write, a demo clip it builds,
a stand-in command it overlays.

If the repository has no stand-in for what a shot needs, make one (invented data,
committed beside the others) before shooting; never shoot the real thing and blur it.

## 2. Shoot

With `nested-shell`, `start --stand-in` always: fresh settings, the stock look,
the default wallpaper, the repository's own size (1600x900 unless its drive skill says otherwise), no other
extensions. Dark first, then light where the README shows both. Work in progress goes to
the repository's own folder in the scratchpad (`<scratchpad>/<repository>/`: sessions and
agents share the scratchpad, and a generic name gets overwritten); only the final files go to `docs/screenshots/`, under the names the README
already links (renaming one breaks the links on extensions.gnome.org's copy of the README
too). Crop the screencast indicator out of every kept shot.

## 3. Check every file before it is committed

1. **Look at it** with the Read tool: the change is there, nothing clipped, overlapping
   or ellipsized, covers and icons rather than placeholders, both schemes right.
2. **Personal data in the picture**: no path under `/home/`, no user or host name, no
   e-mail, no account or plan name that is the owner's, no real titles, figures or
   files. Read every line of text in the shot.
3. **Shrink and strip**: `oxipng --opt 4 --strip safe docs/screenshots/*.png`; a JPEG is
   written from the PNG with `magick in.png -strip -quality 90 out.jpg`.
4. **Metadata and bytes**: after stripping, `grep -c -a -E 'tEXt|iTXt|zTXt|eXIf|Exif'
   docs/screenshots/*` prints 0 for each, and this prints nothing:

   ```bash
   pat="/home/$(id -un)/"; e="$(git config user.email)"
   n="$(getent passwd "$(id -un)" | cut -d: -f5 | cut -d, -f1)"
   [ -n "$e" ] && pat="$pat|$e"; [ "${#n}" -ge 5 ] && pat="$pat|$n"
   grep -l -a -E "$pat" docs/screenshots/*
   ```

   Never grep a short word on its own (the bare user name, a two-letter account name): it
   matches compressed image bytes by chance, so the check fires on every file and stops
   meaning anything. Text drawn in the picture is not in its bytes at all: step 2 is
   where that is caught.
5. **Alt text and captions**: the README's alt text says what the shot shows, with the
   same stand-in values (a path in the shot is the path in the alt text), and no personal
   detail. If what a shot shows changed, its caption changes with it.

## 4. Fix the tooling, not just the picture

A leak found in a shot is a bug in how shots are taken: fix the script or the stand-ins
so the next retake cannot repeat it, and say how in the drive skill. Old shots stay in
git history; tell the owner, who decides whether to rewrite it.

## 5. Land

Through the repository's loop (issue, branch, `make check`, pull request with the shots
listed, green CI, squash merge). Never commit a shot of the real session, and never a
work-in-progress shot.
