---
id: 21
title: ".gitignore covers .env.local but not .env"
priority: P4
area: security
effort: S
status: done
---

## Problem

`.gitignore` ignores `.env.local` but not `.env`. Meanwhile
`src/utils/auth.js:5` instructs the reader to put the Google client id in
**`.env`** — the file that is *not* ignored.

So the documentation points at the one filename that will be committed.

## Current status

Verified: **no `.env` file exists in the working tree and none is tracked in
git.** Nothing has leaked. This is a trap waiting to be stepped in, not an
incident.

## Why it matters

The next person to follow that comment — or any agent working from this backlog —
creates `.env`, and it lands in the next `git add`. Given the variable list in
issue 20, that could commit `SESSION_SECRET` (which signs every session token),
`DATABASE_URL` (full Neon credentials), `ADMIN_TOKEN`, and `CRON_SECRET`.

Secrets in git history are painful to remove properly — you have to rotate
everything regardless, since the history may already be cloned or cached by
GitHub.

## Suggested fix

Broaden the pattern in `.gitignore`:

```gitignore
.env
.env.*
!.env.example
```

This ignores every `.env` variant while keeping `.env.example` committable, which
issue 20 needs.

Then fix the comment in `src/utils/auth.js:5` to reference `.env.local`, matching
Vite's own convention: `.env.local` is the documented place for secrets and is
already ignored. Aligning docs with the ignore rules removes the trap at the
source rather than just catching it.

Also worth a quick confirmation that no secrets exist anywhere in history:

```
git log --all --full-history -- .env .env.local
```

Expected to return nothing.

## Acceptance criteria

- [x] `.gitignore` ignores `.env` and all `.env.*` variants
- [x] `.env.example` still trackable
- [x] `src/utils/auth.js` comment references `.env.local`
- [x] `git log --all --full-history -- .env .env.local` returns nothing

## Resolution

Fixed on `dawn/2026-08-22`.

`.gitignore` now carries `.env`, `.env.*`, `!.env.example` in place of the single
`.env.local` line. Verified with `git check-ignore`: `.env`, `.env.production` and
`.env.local` are ignored, `.env.example` is trackable.

Three comments in `src/utils/auth.js` pointed at `.env` (lines 5, 12 and the
user-facing error on line 73). All three now say `.env.local`, matching Vite's
convention and the ignore rules.

`git log --all --full-history -- .env .env.local` returns nothing, so no secret
has ever been committed. This stayed a trap, never an incident — no rotation needed.
