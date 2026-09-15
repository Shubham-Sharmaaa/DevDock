import bcrypt from 'bcryptjs';
import { z } from 'zod';
import User from '../models/User.js';
import { AppError } from '../middleware/errorHandler.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
  clearRefreshCookieOptions,
} from '../utils/tokens.js';

const SALT_ROUNDS = 12;

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens and underscores'),
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your username or email'),
  password: z.string().min(1, 'Enter your password'),
});

const updateProfileSchema = z.object({
  bio: z.string().trim().max(280, 'Bio must be at most 280 characters'),
});

// Issues a fresh access + refresh token pair for a user and sets the
// refresh token as an httpOnly cookie. Shared by register/login/refresh so
// the token-issuing logic lives in exactly one place.
function issueSession(res, user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  return accessToken;
}

export const register = asyncHandler(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Invalid registration data.', 400, parsed.error.flatten().fieldErrors);
  }
  const { username, email, password } = parsed.data;

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ username, email, passwordHash });

  const accessToken = issueSession(res, user);
  res.status(201).json({ user, accessToken });
});

export const login = asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Invalid login data.', 400, parsed.error.flatten().fieldErrors);
  }
  const { identifier, password } = parsed.data;

  const user = await User.findOne({
    $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
  });

  // Same error for "no such user" and "wrong password" -- don't let an
  // attacker use this endpoint to enumerate which usernames/emails exist.
  const invalidCredentials = () => new AppError('Incorrect username/email or password.', 401);

  if (!user) throw invalidCredentials();

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) throw invalidCredentials();

  const accessToken = issueSession(res, user);
  res.status(200).json({ user, accessToken });
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) {
    throw new AppError('No refresh token provided.', 401);
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new AppError('Refresh token is invalid or expired.', 401);
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    throw new AppError('User for this token no longer exists.', 401);
  }

  // If tokenVersion doesn't match, this refresh token was issued before a
  // logout (or password change) and must be rejected even though its
  // signature and expiry are still valid.
  if (user.tokenVersion !== payload.tokenVersion) {
    throw new AppError('Refresh token has been revoked. Please log in again.', 401);
  }

  // Rotate: issue a brand new refresh token on every use, replacing the cookie.
  const accessToken = issueSession(res, user);
  res.status(200).json({ user, accessToken });
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];

  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      // Bump tokenVersion so this (and any other outstanding) refresh token
      // for this user is immediately invalidated, not just this cookie.
      await User.findByIdAndUpdate(payload.sub, { $inc: { tokenVersion: 1 } });
    } catch {
      // Token was already invalid/expired -- nothing to revoke, fall through
      // and clear the cookie anyway.
    }
  }

  res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions());
  res.status(200).json({ message: 'Logged out.' });
});

export const me = asyncHandler(async (req, res) => {
  // req.user is attached by the requireAuth middleware.
  res.status(200).json({ user: req.user });
});

// The only profile field that's actually editable -- see the User model
// for why (username/email changes would ripple into repo URLs and login
// identifiers respectively, which is real complexity deliberately out of
// scope here, same reasoning as repository renaming being deferred).
export const updateProfile = asyncHandler(async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Invalid profile data.', 400, parsed.error.flatten().fieldErrors);
  }

  req.user.bio = parsed.data.bio;
  await req.user.save();

  res.status(200).json({ user: req.user });
});
