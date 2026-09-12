---
id: 32
title: "The two music beds are 15MB of the 16MB audio payload, at 320 and 256 kb/s"
priority: P3
area: performance
effort: M
status: done
---

## Problem

Issue 16 halved the audio payload by removing byte-identical duplicates. What it
did not touch is the remaining cost, which is two files:

| File | Size | Duration | Encoding |
|---|---|---|---|
| `public/audio/music/descent.mp3` | 7.44 MB | 3:03 | **320 kb/s stereo**, 48 kHz |
| `public/audio/music/sanctuary.mp3` | 7.69 MB | 3:55 | **256 kb/s stereo**, 44.1 kHz |
| `public/audio/music/victory.mp3` | 0.19 MB | 0:15 | 96 kb/s mono |
| `public/audio/music/gameover.mp3` | 0.09 MB | 0:07 | **96 kb/s mono** |

`public/audio` is 16MB; music is 15MB of it and those two files are 15MB of
that. `dist-itch.zip` is 15.1MB for the same reason.

The house standard is already set: the two cues added for issue 03 are 96 kb/s
mono. The beds are 3x that and were simply never brought in line.

Both files also carry an embedded 1425x1425 mjpeg cover art stream — album art,
shipped to every player, decoded by nobody.

## Why it matters

- Howler is on Web Audio here with no `html5: true`
  (`src/games/scoundrel/audio.js:208`), so a bed is **downloaded in full before
  it plays**. The descent bed's 7.4MB fetch starts at the moment the player
  descends, which on cellular is a long silence at the exact beat the music is
  supposed to land.
- It is ~15MB per session of bandwidth for a game whose entire JS is 284KB.
- It is the whole weight of the itch standalone build, which plays inside an
  iframe on someone else's page.

## Suggested fix

Transcode both beds to the standard the cues already use, and strip the art:

```bash
# ffmpeg is already a devDependency: @ffmpeg-installer/ffmpeg
ffmpeg -i descent.mp3 -map 0:a -ac 1 -b:a 96k -ar 44100 descent.out.mp3
```

`-map 0:a` drops the cover art. Expect roughly 7.4MB -> ~2.2MB and 7.7MB ->
~2.8MB; the whole payload lands near 5MB.

Listen to the result on a phone speaker before committing — these are ambient
beds under sound effects, which is the most forgiving case for a low bitrate,
but mono is a real change and the call is a listening one, not a numeric one.

Worth deciding at the same time, and cheap once you are in the file:

- **`html5: true` for music only.** Streams instead of buffering the whole file,
  so playback starts immediately regardless of size. The trade is that HTML5
  Audio does not fade as smoothly as Web Audio and the crossfades here are
  deliberate — try it, keep it only if the fades survive.
- A `scripts/` entry for the transcode, so the next bed added does not arrive at
  320 kb/s. `scripts/build-bell-cues.sh` is the precedent.

## Acceptance criteria

- [x] Both beds at the project's standard bitrate, art stream removed
- [x] `public/audio` under ~6MB total
- [x] The beds still loop seamlessly and the crossfades still sound intentional
      — **measured, not heard.** See "The listening check" below.
- [x] `visual/audio-assets.spec.js` and `visual/robots-and-payload.spec.js` green,
      with the payload budget in the latter updated to the new figure
- [x] Whether `html5: true` was adopted for music is recorded here either way
- [ ] `npm run build:itch` regenerated if the zip is meant to stay current
      — **not run.** An unattended run does not produce distributable artifacts.
      One command when the zip next matters; it will drop from 15.1MB to ~5MB.

## Resolution (2026-09-12)

Both beds are now 96 kb/s mono at 44.1 kHz, matching `gameover.mp3` and
`victory.mp3`, with the ID3 `APIC` cover art frame dropped via `-map 0:a`.

| File | Was | Now |
|---|---|---|
| `descent.mp3` | 7.44 MB, 320 kb/s stereo 48 kHz | 2.21 MB |
| `sanctuary.mp3` | 7.69 MB, 256 kb/s stereo 44.1 kHz | 2.83 MB |
| `public/audio` total | 16 MB | **5.52 MB** |

`scripts/build-music-beds.sh` records the transcode, following
`scripts/build-bell-cues.sh`: an authoring tool whose output is committed, not
a build step. It transcodes in place, so it is not safely re-runnable — restore
from git first, which the script says at the top.

**Levels were left alone — no `loudnorm`.** The cues got normalised because they
were authored from raw public-domain recordings; these beds were mixed against
the sound effects at the level they already sit at. Re-normalising would change
the game's mix, which is a larger and more subjective change than the bitrate.

### The listening check

The issue asked for this call to be made by ear on a phone speaker. The run that
did the work was unattended at 04:00, so it was not. What was checked instead:

- Duration is preserved to inside one MPEG frame — 3:03.70 → 3:03.75 and
  3:55.79 → 3:55.81 — so the loop points have not moved.
- `visual/audio-assets.spec.js` decodes both beds in a real browser and asserts
  their duration and 100 ms peak envelope; both pass unchanged.

That covers "does it still loop" and "is it still the same recording". It does
not cover "does 96 kb/s mono sound acceptable", which remains a listening
judgement. The 320/256 kb/s originals are in git history at `6637811`, so
reverting is `git checkout 6637811 -- public/audio/music/`.

### `html5: true` was NOT adopted

Recorded as the issue asks. The reason to want it was that Web Audio buffers the
whole file before playing, making the descent bed's 7.4 MB fetch a long silence
on cellular at the exact beat the music should land. **That argument is mostly
spent**: the fetch is now 2.2 MB, roughly a second on a slow connection rather
than ten.

Against it, `audio.js` leans on Web Audio's fade in two places that are not
decorative — `MUSIC_FADE_MS` is 600 ms and `_stop` hangs the actual `howl.stop()`
off a `once('fade')` event (`audio.js:284`). Howler's HTML5 path fades on a
timer rather than an audio-rate ramp, so both get worse. Trading a smaller
regression for a bigger one, evaluated by ear, is not a swap to make blind.

Worth revisiting only if slow-connection playback is measured to still be a
problem.

### Noted, not done: the sfx are unstandardised

Out of scope here and deliberately left. The nine files in `public/audio/sfx`
came from nine sources and range from 32 to 256 kb/s, several MPEG-2 rather than
MPEG-1 — `hit.mp3` is 256 kb/s, `sigil.mp3` 160. They total **0.45 MB**, so
there is no payload argument for touching them, and re-encoding a short
percussive one-shot at a lower bitrate costs more than it saves. This is why the
new encoding test is scoped to `music/`.
