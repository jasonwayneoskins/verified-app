// SHA-256 hash chain for the pick ledger.
// hash = sha256(prev_hash + '|' + canonical_payload)
// canonical_payload binds every field that defines the pick, so any
// tampering with history breaks the chain. Verification recomputes
// the whole chain; a single mismatch fails loudly.
import { createHash } from 'node:crypto';

export const GENESIS_HASH = '0'.repeat(64);

export function canonicalPayload(pick) {
  // Normalize dates: pg returns timestamptz as Date objects while hashes were
  // computed from ISO strings. Without this, every chain breaks on read-back.
  const iso = (v) => (v instanceof Date ? v : new Date(v)).toISOString();
  return [
    pick.id,
    pick.user_id,
    pick.sport,
    pick.espn_game_id,
    iso(pick.game_start),
    pick.home_team,
    pick.away_team,
    pick.market,
    pick.side,
    pick.line ?? '',
    pick.odds,
    pick.units,
    iso(pick.created_at),
  ].join('|');
}

export function chainHash(prevHash, pick) {
  return createHash('sha256')
    .update(prevHash + '|' + canonicalPayload(pick))
    .digest('hex');
}

// Verify an entire ordered pick list (oldest first). Returns
// { ok: true } or { ok: false, atId } pinpointing the break.
export function verifyChain(picksOldestFirst) {
  let prev = GENESIS_HASH;
  for (const p of picksOldestFirst) {
    if (p.prev_hash !== prev) return { ok: false, atId: p.id, reason: 'prev_hash mismatch' };
    const expected = chainHash(prev, p);
    if (expected !== p.hash) return { ok: false, atId: p.id, reason: 'hash mismatch' };
    prev = p.hash;
  }
  return { ok: true, tip: prev };
}
