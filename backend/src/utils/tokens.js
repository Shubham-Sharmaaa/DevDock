import jwt from 'jsonwebtoken';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Access token: short-lived, sent in the Authorization header, kept only in
// memory on the client (never localStorage). Carries just enough to identify
// the user on each request.
export function signAccessToken(user) {
  const secret = requiredEnv('ACCESS_TOKEN_SECRET');
  return jwt.sign(
    { sub: user._id.toString(), username: user.username },
    secret,
    { expiresIn: process.env.ACCESS_TOKEN_TTL || '15m' }
  );
}

export function verifyAccessToken(token) {
  const secret = requiredEnv('ACCESS_TOKEN_SECRET');
  return jwt.verify(token, secret);
}

// Refresh token: longer-lived, sent only as an httpOnly cookie. Carries the
// user's current tokenVersion so we can invalidate it server-side on logout
// without needing a token blocklist.
export function signRefreshToken(user) {
  const secret = requiredEnv('REFRESH_TOKEN_SECRET');
  return jwt.sign(
    { sub: user._id.toString(), tokenVersion: user.tokenVersion },
    secret,
    { expiresIn: process.env.REFRESH_TOKEN_TTL || '7d' }
  );
}

export function verifyRefreshToken(token) {
  const secret = requiredEnv('REFRESH_TOKEN_SECRET');
  return jwt.verify(token, secret);
}

export const REFRESH_COOKIE_NAME = 'devdock_refresh';

function baseRefreshCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd, // must be true in production (HTTPS); false so it still works on localhost http
    sameSite: isProd ? 'none' : 'lax', // 'none' needed when frontend/backend are on different domains in prod
    path: '/api/auth', // only sent to auth routes, not the whole API
  };
}

// Used when SETTING the cookie (res.cookie).
export function refreshCookieOptions() {
  return {
    ...baseRefreshCookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, keep in sync with REFRESH_TOKEN_TTL
  };
}

// Used when CLEARING the cookie (res.clearCookie). clearCookie already
// forces an immediate expiry itself, so a maxAge here is redundant --
// Express/`cookie` treat it as a mistake and log a deprecation warning
// ("the 'maxAge' option is ignored for res.clearCookie"). The other
// attributes (httpOnly/secure/sameSite/path) still have to match the
// original cookie for the browser to actually delete it.
export function clearRefreshCookieOptions() {
  return baseRefreshCookieOptions();
}
