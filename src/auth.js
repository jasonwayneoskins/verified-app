// Auth: Supabase Auth in production mode; a single demo seller in
// local demo mode. Sessions are httpOnly signed cookies (no JWT lib).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { getProfileById, createProfile } from './db/index.js';

const COOKIE = 'v_sess';
const isProd = () => config.useSupabase;

let supabase = null;
if (isProd()) {
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
}
export const getSupabase = () => supabase;

function sign(userId) {
  return createHmac('sha256', config.sessionSecret).update(userId).digest('hex');
}
function makeCookie(userId) {
  const b64 = Buffer.from(userId, 'utf8').toString('base64url');
  return `${b64}.${sign(userId)}`;
}
function readCookie(value) {
  if (!value) return null;
  const [b64, sig] = value.split('.');
  if (!b64 || !sig) return null;
  const userId = Buffer.from(b64, 'base64url').toString('utf8');
  const expected = sign(userId);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}

export function setSession(res, userId) {
  res.cookie(COOKIE, makeCookie(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 30,
    path: '/',
  });
}
export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

// Attach req.user (profile) or null. Never throws.
export async function attachUser(req, _res, next) {
  try {
    const userId = readCookie(req.cookies?.[COOKIE]);
    req.user = userId ? await getProfileById(userId) : null;
  } catch {
    req.user = null;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}

// --- Supabase email/password flows (production only) ---
export async function supabaseSignUp({ email, password, username, displayName }) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  let user = data.user;
  if (!data.session) {
    // Email confirmation is on — try an immediate sign-in (works when
    // "Confirm email" is disabled, which the README instructs).
    const { data: s2, error: e2 } = await supabase.auth.signInWithPassword({ email, password });
    if (e2) throw new Error('Check your email to confirm your account, then log in.');
    user = s2.user;
  }
  // Create the Verified profile row bound to the auth user.
  const existing = await getProfileById(user.id);
  if (!existing) {
    await createProfile({ id: user.id, username, display_name: displayName });
  }
  return user.id;
}

export async function supabaseSignIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  const profile = await getProfileById(data.user.id);
  if (!profile) throw new Error('Profile missing — please sign up again.');
  return data.user.id;
}
