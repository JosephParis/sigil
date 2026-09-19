/**
 * What the service worker precaches (issue 35).
 *
 * Kept apart from vite.config.js so the rule is unit-testable without a build.
 * Takes the build output's paths, relative to the output directory with forward
 * slashes, and returns the root-absolute URLs the worker fetches on install.
 *
 * Left out on purpose:
 *   - audio/        15MB of beds and cues a player may never hear (issue 32).
 *                   They stream from the network as before.
 *   - sw.js         a worker never caches itself; the browser owns its updates.
 *   - *.map         debugging only.
 *   - og-image.png, robots.txt   read by scrapers, never by the game.
 */
const SKIP = [/^audio\//, /^sw\.js$/, /\.map$/, /^og-image\.png$/, /^robots\.txt$/]

export function precacheUrls(files) {
  return files
    .map(f => f.split('\\').join('/').replace(/^\/+/, ''))
    .filter(f => !SKIP.some(re => re.test(f)))
    .map(f => '/' + f)
    .sort()
}
