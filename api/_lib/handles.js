/**
 * One name, one owner — the uniqueness rule behind the public board.
 *
 * Two players choosing the same name used to produce two identical rows, which
 * is confusing on a ranking whose whole job is telling runs apart. This makes
 * the name a claimed thing: the first owner to post under it keeps it, and
 * anyone arriving later is disambiguated on the way in.
 *
 * ## Why the server decides, and not the client
 *
 * The obvious design is to check availability while the player types. It does
 * not fit this game. Sigil is offline-first — runs queue locally and post when
 * they can, `/api/runs` being unreachable is an expected state, and nothing in
 * the client may block on the network. A player naming themselves on a plane
 * has to be able to finish that thought.
 *
 * So naming stays local and instant, and uniqueness is settled here, on the way
 * into storage. The cost is that the player does not have final say over their
 * exact string; the response reports what was actually stored so the UI can
 * tell them. That trade only works because a name here is a label on a
 * leaderboard row. If names ever become addresses — used to find, invite or
 * link to a player — this should become a reservation flow instead.
 *
 * ## Why a claim is never released
 *
 * A record stores the name it was posted under, so releasing a name would let a
 * second owner claim it while the first owner's older rows still carry it, and
 * the board would show the duplicate this exists to prevent. Keeping every
 * claim forever makes the invariant hold without the board needing to know
 * anything: **a given string on the board belongs to exactly one owner, always.**
 *
 * Squatting is the accepted cost. At this scale a player accumulating a handful
 * of retired names is not worth the machinery of expiry.
 *
 * ## Who an owner is
 *
 * A signed-in player is their `account_id`. A guest is their `deviceId`, which
 * is the same identity the board partitions guests on. A client too old to send
 * one claims nothing and is stored as-is — it cannot be told apart from any
 * other guest anyway, so there is nothing to protect.
 */

import { MAX_HANDLE_LENGTH } from '../../src/games/scoundrel/handle.js'

// Bounded so a heavily contested name cannot turn one insert into a long walk.
// Exhausting it stores the name as-is: a duplicate row is a cosmetic failure,
// and losing the run would not be.
const MAX_ATTEMPTS = 30

let ready = null

/**
 * Created on demand and cached per warm instance, like every other table here.
 * `name_key` is the lowercased name so "Rookwarden" and "rookwarden" cannot be
 * claimed separately and then read as two different players.
 */
export function ensureHandlesTable(sql) {
  if (!ready) {
    ready = sql`
      create table if not exists handles (
        name_key   text primary key,
        name       text not null,
        owner_id   text not null,
        claimed_at timestamptz not null default now()
      )
    `
  }
  return ready
}

/**
 * The names to try, in order, for a player who wants `name`.
 *
 * A name already ending in a number counts up from it — an assigned name like
 * "LostAlmoner3016" becomes "LostAlmoner3017", and a typed "Ashen Vagrant 47"
 * becomes "Ashen Vagrant 48" — which keeps the register and the length rather
 * than reading as a suffixed duplicate. The number keeps its width, so a padded
 * "Almoner0099" goes to "Almoner0100". Anything else gets a counter appended,
 * with the base trimmed when there is no room for it.
 *
 * Assigned names carry no space before the number (assignedName.js), so the
 * space is optional here. Requiring it is what stored a second
 * "LostAlmoner3016" as "LostAlmoner3016 2" in production (issue 43).
 *
 * Exported for tests: the ordering is the whole user-visible behaviour here.
 *
 * @param {string} name - the sanitized name the player asked for
 * @returns {string[]} candidates, most-wanted first
 */
export function candidatesFor(name) {
  const out = [name]
  // Lazy base, greedy digits: the whole trailing run of digits is the number,
  // and any space before it stays in the base.
  const numbered = /^(.*?)(\d+)$/.exec(name)
  if (numbered) {
    const [, base, digits] = numbered
    const start = Number.parseInt(digits, 10)
    for (let i = 1; out.length <= MAX_ATTEMPTS; i++) {
      const next = `${base}${String(start + i).padStart(digits.length, '0')}`
      if (next.length > MAX_HANDLE_LENGTH) break
      out.push(next)
    }
  }
  for (let n = 2; out.length <= MAX_ATTEMPTS; n++) {
    const suffix = ` ${n}`
    const base = name.slice(0, MAX_HANDLE_LENGTH - suffix.length).trimEnd()
    if (!base) break
    const next = `${base}${suffix}`
    if (!out.includes(next)) out.push(next)
  }
  return out.slice(0, MAX_ATTEMPTS)
}

/**
 * Settle what a run is actually stored under.
 *
 * Returns the requested name when it is free or already this owner's, and the
 * first free alternative otherwise. Null in, null out: a run with no name needs
 * no claim and stays listed as Anonymous.
 *
 * Never throws. A registry that is unreachable or mid-migration must not stop a
 * run being recorded, so any failure falls back to storing the requested name —
 * which is exactly the behaviour that existed before this table.
 *
 * @param {object} sql - the neon client
 * @param {string|null} name - the sanitized, denylist-checked name
 * @param {string} ownerId - account_id, or a guest's deviceId
 * @returns {Promise<string|null>} the name to store
 */
export async function resolveHandle(sql, name, ownerId) {
  const wanted = typeof name === 'string' ? name.trim() : ''
  if (!wanted) return null
  // Nothing to own the claim with. Storing as-is keeps the old behaviour rather
  // than handing this player a disambiguated name they can never hold onto.
  if (!ownerId) return wanted

  try {
    await ensureHandlesTable(sql)
    for (const candidate of candidatesFor(wanted)) {
      const key = candidate.toLowerCase()
      // Atomic: whoever's insert lands first owns it, with no read-then-write
      // window for two concurrent posts to both pass.
      const claimed = await sql`
        insert into handles (name_key, name, owner_id)
        values (${key}, ${candidate}, ${ownerId})
        on conflict (name_key) do nothing
        returning name
      `
      if (claimed.length > 0) return candidate
      const held = await sql`select owner_id from handles where name_key = ${key}`
      if (held[0]?.owner_id === ownerId) return candidate
    }
    return wanted
  } catch {
    return wanted
  }
}

/**
 * The owner a record claims names as.
 *
 * @param {object} record - a run record
 * @returns {string} the owner id, or '' when the record can own nothing
 */
export function ownerOf(record) {
  const account = record?.accountId
  if (account && account !== 'guest') return account
  return typeof record?.deviceId === 'string' ? record.deviceId : ''
}
