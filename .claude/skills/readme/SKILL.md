---
name: readme
description: Write or bring up to date a GNOME Shell extension's README and its GitHub page - one skeleton (what it is, a hero screenshot, what it does, requirements, privacy, install, preferences, troubleshooting, development, licence), every claim checked against the code, then the repository's description, homepage and topics. Use when asked to write, tidy or check a README, or to set up a repository's GitHub page.
argument-hint: "[path to the extension repository; default the current one]"
---

Repository: $ARGUMENTS (nothing given: the current one)

A README is for people who want to use the extension, not for whoever is developing it:
what it does, whether it suits them, how to get it running, what to do when it does not.
The design notes are CLAUDE.md's; the contributor's notes are CONTRIBUTING.md's.

## The skeleton

In this order. A section with nothing true to say is left out, never padded.

1. **`# Name`**, then one or two sentences: what it is and where it shows up ("A control
   bar for fullscreen video on GNOME"). The same sentence opens `metadata.json`'s
   `description`.
2. **The hero shot**: one image of the extension doing its main job, with alt text that
   describes what is in it. Taken with `screenshots`, never by hand.
3. **What it does**: a short list, one bold lead-in each, five or six at most. Features a
   person would choose it for, not implementation.
4. **The extension's own sections**: what this extension needs explained before it is
   installed or used (the services it reads, where its data comes from, the effects it
   offers). Each earns its place.
5. **Requirements**: "GNOME Shell 51" as `shell-version` lists it (never a machine's point
   release), and every runtime need outside GNOME (a player, a CLI signed in, Python 3
   for a scanner). The build needs for a source install go in Install.
6. **Privacy and network**: required when the extension reads a login, stores a key or
   goes online. What it reads, what it sends where, what it stores and how (a key in
   dconf is plain text: say so). The data sources' attribution and licences, and any
   "not endorsed by" line their terms ask for, go here.
7. **Install**: extensions.gnome.org first once it is published (the link, then "or from
   source"). From source: the `git clone` URL, `make install`, **log out and back in**
   (Wayland cannot load a new extension into a running session), then
   `gnome-extensions enable <uuid>`; first-run steps (a Rescan, a switch). Updating
   (`git pull && make install`, log out and in) and removing (`make uninstall`) in two
   lines.
8. **Preferences**: what each page is for, with its shots (a table of two or three, alt
   text on each) or a list. `gnome-extensions prefs <uuid>` opens them.
9. **Troubleshooting**: for someone who installed from extensions.gnome.org and has no
   clone, the journal itself:
   `journalctl -f -o cat /usr/bin/gnome-shell | grep -i '<prefix>'`, and for the
   preferences window (its own process)
   `journalctl -f -o cat SYSLOG_IDENTIFIER=org.gnome.Shell.Extensions`. Then the clone's
   `make status` and `make logs`. Known causes, by symptom, where there are any.
10. **Development**: two or three lines and a link to CONTRIBUTING.md
    (`make link`, `make reload`, `make check`); what `docs/` covers.
11. **Licence**: "GPL-2.0-or-later. See [LICENSE](LICENSE)."
12. **Credits and marks**, only where needed: third-party media in the shots, a
    trademark line (Steam, PlayStation, VLC), invented demo data ("None of the shows are
    real").

## Rules

- GNOME's voice: plain, short, second person, no marketing words ("powerful",
  "seamless", "blazing"), no emoji. Sentences say what is true now.
- **Every claim is checked against the code**: make targets, commands and flags,
  settings and their defaults, the UUID, `shell-version`, the providers and players named,
  what is stored where. A feature that is not there is not described.
- **Nothing personal**: no home paths, usernames, accounts, tokens or real usage figures,
  in text or in images. Shots come from `screenshots` with invented data.
- Every image has alt text that says what it shows; shots live in `docs/screenshots/`.
- Support is claimed per major version ("GNOME Shell 51").
- A badge only if it carries information the text does not; at most one row.

## The GitHub page

```bash
R=OWNER/<repository>
gh repo edit $R --description "<one sentence: what it is, where, for whom>"
gh repo edit $R --homepage "https://extensions.gnome.org/extension/<id>/<slug>/"
gh repo edit $R --add-topic gnome-shell-extension --add-topic gnome \
    --add-topic gnome-shell --add-topic gjs --add-topic <what-it-is-about>
gh repo view $R --json description,homepageUrl,repositoryTopics
```

- The description matches the README's opening sentence; under 120 characters reads best.
- The homepage is the extensions.gnome.org page once there is one; until then, leave it
  empty rather than pointing at the repository itself.
- Topics: the four above, plus two
  or three for what it is about (`mpris`, `glsl`, `clipboard`), lowercase, hyphenated,
  no more than eight in all.
- The **social preview** (the card a shared link shows) can only be uploaded in the web
  UI: Settings › General › Social preview. Make a 1280×640 PNG with
  `screenshots` (the hero, cropped or padded to 2:1 on the shell's own
  background), save it in the repository's folder of the scratch directory as `<repository>-social-preview.png` (a
name of its own: several repositories' previews may be made in one session) and hand the
owner its path.

## Land it

The repository's loop: an issue, a branch (`docs/readme`), `make check`, a pull request
with what changed and why, green CI, squash merge. The GitHub page is not in git: report
its before and after in the pull request.
