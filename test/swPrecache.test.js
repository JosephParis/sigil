import { describe, it, expect } from 'vitest'
import { precacheUrls } from '../scripts/sw-precache.mjs'

// What the service worker fetches on install (issue 35).
describe('precacheUrls', () => {
  const build = [
    'index.html',
    'assets/index-abc123.js',
    'assets/index-def456.css',
    'assets/cinzel-700.woff2',
    'icon-192.png',
    'manifest.webmanifest',
    'audio/music/descent.mp3',
    'audio/cues/bell.mp3',
    'sw.js',
    'assets/index-abc123.js.map',
    'og-image.png',
    'robots.txt',
  ]

  it('keeps the shell: html, bundles, fonts, icons, manifest', () => {
    expect(precacheUrls(build)).toEqual([
      '/assets/cinzel-700.woff2',
      '/assets/index-abc123.js',
      '/assets/index-def456.css',
      '/icon-192.png',
      '/index.html',
      '/manifest.webmanifest',
    ])
  })

  it('never precaches the audio directory', () => {
    expect(precacheUrls(build).some(u => u.startsWith('/audio/'))).toBe(false)
  })

  it('normalizes Windows separators from readdir', () => {
    expect(precacheUrls(['assets\\index-abc123.js'])).toEqual(['/assets/index-abc123.js'])
  })
})
