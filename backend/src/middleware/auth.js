import { verifyAccessToken } from '../utils/tokens.js';
import { AppError } from './errorHandler.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Verifies the access token and attaches the full user document to req.user.
// This runs on every protected route -- it's the one place that decides
// "is there a valid, currently-logged-in user making this request."
export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new AppError('Missing or malformed Authorization header.', 401);
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new AppError('Access token is invalid or expired.', 401);
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    throw new AppError('User for this token no longer exists.', 401);
  }

  req.user = user;
  next();
});
