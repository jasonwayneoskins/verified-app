// Whop subscription gating.
// Sellers must hold an ACTIVE $39/mo "Verified" Whop membership to use the
// dashboard and log picks. Public pages (landing, /v/<user>, badges,
// waitlist) stay open — they are the marketing.
//
// How the check works (server-side only, WHOP_API_KEY never leaves the server):
//   GET https://api.whop.com/api/v1/memberships
//     ?product_ids=<WHOP_PRODUCT_ID>&statuses=active&statuses=trialing&statuses=past_due
//     Authorization: Bearer <WHOP_API_KEY>
// The endpoint has no email filter, so we page the product's memberships and
// match membership.user.email (case-insensitive) against the email the seller
// linked on /subscribe. Results are cached on profiles (whop_status +
// whop_verified_at) for WHOP_CACHE_HOURS (default 6) to avoid hammering Whop.
//
// Fail closed: API unreachable / misconfigured / no match => not verified.
// Demo mode (local SQLite) bypasses gating entirely.
import { config } from './config.js';
import { getProfileById, setWhopEmail, updateWhopCache } from './db/index.js';

const WHOP_API = 'https://api.whop.com/api/v1/memberships';
// Statuses that still entitle the buyer to access (dunning keeps working).
const VALID_STATUSES = ['active', 'trialing', 'past_due'];
const MAX_PAGES = 5;

// Raw Whop API call. Returns { ok: true, active: bool } or { ok: false, error }.
// Never throws.
export async function checkWhopMembership(email) {
  if (!config.whopApiKey || !config.whopProductId) {
    return { ok: false, error: 'Whop access is not connected yet.' };
  }
  const want = String(email || '').trim().toLowerCase();
  if (!want) return { ok: false, error: 'No purchase email linked.' };
  try {
    const params = new URLSearchParams();
    params.append('product_ids', config.whopProductId);
    for (const s of VALID_STATUSES) params.append('statuses', s);
    params.append('first', '100');
    if (config.whopCompanyId) params.append('account_id', config.whopCompanyId);
    let after = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `${WHOP_API}?${params.toString()}${after ? `&after=${encodeURIComponent(after)}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${config.whopApiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { ok: false, error: `Whop API returned ${res.status}.` };
      const body = await res.json();
      const data = Array.isArray(body?.data) ? body.data : [];
      for (const m of data) {
        const memEmail = String(m?.user?.email || '').toLowerCase();
        if (memEmail && memEmail === want) {
          return { ok: true, active: true, membershipId: m.id };
        }
      }
      const pi = body?.page_info;
      if (!pi?.has_next_page || !pi?.end_cursor) break;
      after = pi.end_cursor;
    }
    return { ok: true, active: false };
  } catch (err) {
    return { ok: false, error: 'Could not reach Whop.' };
  }
}

// Cached subscription state for a profile row.
// Returns { active: bool, demo?, cached?, needsEmail?, needsSetup?, error?, checkedEmail? }.
// Never throws — on unexpected failure, fails closed.
export async function getSubscriptionState(profile) {
  try {
    if (!config.useSupabase) return { active: true, demo: true };
    if (!config.whopApiKey || !config.whopProductId) {
      return { active: false, needsSetup: true, error: 'Whop access is not connected yet.' };
    }
    if (!profile?.whop_email) return { active: false, needsEmail: true };
    const verifiedAt = profile.whop_verified_at ? new Date(profile.whop_verified_at).getTime() : 0;
    const cacheMs = config.whopCacheHours * 3600 * 1000;
    if (profile.whop_status === 'active' && Date.now() - verifiedAt < cacheMs) {
      return { active: true, cached: true };
    }
    const result = await checkWhopMembership(profile.whop_email);
    if (!result.ok) {
      return { active: false, error: 'Could not reach Whop — try again in a minute.', checkedEmail: profile.whop_email };
    }
    await updateWhopCache(profile.id, result.active ? 'active' : 'inactive');
    if (result.active) return { active: true };
    return { active: false, checkedEmail: profile.whop_email };
  } catch {
    return { active: false, error: 'Subscription check failed — try again.' };
  }
}

// One-time link step: store the purchase email, verify live, refresh cache.
// Throws with a user-friendly message when verification fails.
export async function linkWhopEmail(userId, email) {
  const clean = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new Error('Enter a valid email address.');
  await setWhopEmail(userId, clean);
  const result = await checkWhopMembership(clean);
  if (!result.ok) throw new Error('Could not reach Whop to verify — try again in a minute.');
  await updateWhopCache(userId, result.active ? 'active' : 'inactive');
  if (!result.active) {
    throw new Error('No active Verified subscription found for that email. Double-check the email you used at Whop checkout, or subscribe below.');
  }
  return true;
}

// Manual "recheck" — forces a live check even when the cache is fresh.
export async function recheckSubscription(userId) {
  const profile = await getProfileById(userId);
  if (!profile?.whop_email) throw new Error('Link your Whop purchase email first.');
  const result = await checkWhopMembership(profile.whop_email);
  if (!result.ok) throw new Error('Could not reach Whop — try again in a minute.');
  await updateWhopCache(userId, result.active ? 'active' : 'inactive');
  if (!result.active) throw new Error(`Still no active subscription for ${profile.whop_email}.`);
  return true;
}

// Route middleware: dashboard + pick logging require an active subscription.
export async function requireSubscription(req, res, next) {
  const state = await getSubscriptionState(req.user);
  if (state.active) return next();
  const q = state.error ? '?error=' + encodeURIComponent(state.error) : '';
  return res.redirect('/subscribe' + q);
}
