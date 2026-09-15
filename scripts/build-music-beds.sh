#!/usr/bin/env bash
#
# Bring the two long music beds down to the payload standard the one-shot cues
# already use (issue 32).
#
#   public/audio/music/descent.mp3    the descent loop
#   public/audio/music/sanctuary.mp3  the sanctuary loop
#
#   bash scripts/build-music-beds.sh
#
# Like scripts/build-bell-cues.sh this is an authoring tool, not a build step:
# the results are committed. It exists so the next bed added does not arrive at
# 320 kb/s stereo with album art attached, which is how these two arrived.
#
# It transcodes IN PLACE from the committed files, so it is not idempotent in
# the useful sense -- running it twice re-encodes an already-encoded bed and
# loses a little more each time. Restore from git before re-running:
#
#   git checkout -- public/audio/music/descent.mp3 public/audio/music/sanctuary.mp3
#
set -euo pipefail

cd "$(dirname "$0")/.."

FF="node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe"
[ -x "$FF" ] || FF="$(command -v ffmpeg)"
OUT="public/audio/music"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 96 kb/s mono at 44.1 kHz, matching gameover.mp3 and victory.mp3.
#
# -map 0:a is the load-bearing flag: both beds carry a 1425x1425 mjpeg cover art
# stream as a second stream, shipped to every player and decoded by none of
# them. Without it ffmpeg would carry the art through.
#
# Levels are deliberately left alone -- no loudnorm. The cues were normalised
# when they were authored from raw public-domain recordings; these beds were
# mixed against the sound effects at the level they already sit at, and
# re-normalising them would change the game's mix, which is a much larger change
# than the bitrate and not the one this issue asked for.
#
# Mono is a real change and the beds are ambient pads under effects, which is
# the most forgiving case for it. It is also reversible: the 320/256 kb/s
# originals stay in git history.
for bed in descent sanctuary; do
  echo "transcoding $bed"
  "$FF" -y -loglevel error -i "$OUT/$bed.mp3" \
    -map 0:a -ac 1 -ar 44100 -codec:a libmp3lame -b:a 96k \
    "$WORK/$bed.mp3"
  mv "$WORK/$bed.mp3" "$OUT/$bed.mp3"
done

ls -la "$OUT"
