---
id: 43
title: "A second owner of an assigned name gets \" 2\" added instead of the next number"
priority: P3
area: api
effort: S
status: done
branch: issue-43-46-prod-findings
---

## Problem

Found in the production check on 2026-11-11 (issue 13). A second device typed
the name `LostAlmoner3016`, which another device already held as its assigned
name. The server stored it as `LostAlmoner3016 2`.

`candidatesFor` (`api/_lib/handles.js`) is meant to count up from a name that
already ends in a number, so a taken assigned name becomes the next one rather
than a suffixed duplicate. But it matched only a space then digits
(`Ashen Vagrant 47`), and `assignedNameFor` writes names with no space
(`LostAlmoner3016`, `assignedName.js`). The tests used the old spaced shape, so
they passed.

Low stakes: there are 19 million assigned names, so two devices drawing the
same one is rare. It is still a promise in issue 13's checklist that failed.

## Fix

Count up from any trailing run of digits, space or not, keeping the number's
width (`Almoner0099` → `Almoner0100`). Names without a trailing number still
get ` 2`, ` 3`, ...

## Acceptance criteria

- [x] `candidatesFor('LostAlmoner3016')` proposes `LostAlmoner3017` next, and
      the same holds for names `assignedNameFor` actually produces.
- [x] A padded number keeps its width.
- [x] `resolveHandle` stores a second owner of `LostAlmoner3016` as
      `LostAlmoner3017`.
- [x] The new tests fail on the old code (checked: 3 fail).
- [x] Production: re-run the issue 13 box "a second device asking for an
      assigned name lands one number up". -- a third device asking for
      `LostAlmoner3016` was stored as `LostAlmoner3017`, 2026-11-11, on the
      deploy of `30225df`

## Done (2026-11-11)

`candidatesFor` matches `/^(.*?)(\d+)$/` and pads the next number to the old
width. +3 unit tests in `test/handles.test.js`. A typed name that ends in a
digit (`Rook2`) now counts up too (`Rook3`), which reads better than
`Rook2 2`. GAME_VERSION unchanged: no balance.
