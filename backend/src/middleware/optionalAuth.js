import { verifyAccessToken } from '../utils/tokens.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Like requireAuth, but never rejects the request -- it just leaves
// req.user undefined if there's no token, or it's invalid/expired. Used on
// routes that serve different data to anonymous vs. authenticated users:
// a public repo is visible to anyone, a private one only to its owner, and
// the route handler needs to know "is there a logged-in user, and who."
export const optionalAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme === 'Bearer' && token) {
    try {
      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub);
      if (user) req.user = user;
    } catch {
      // Invalid/expired token on an optional-auth route -- proceed anonymously
      // rather than rejecting, since auth isn't required here.
    }
  }

  next();
});
