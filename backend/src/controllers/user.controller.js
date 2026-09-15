import User from '../models/User.js';
import Repository from '../models/Repository.js';
import { AppError } from '../middleware/errorHandler.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// This is a PUBLIC, unauthenticated route -- no visibility rule to enforce
// on the profile itself (usernames aren't secret), but the response must
// never include the user's email or password hash.
//
// Deliberately explicit here rather than relying solely on User's toJSON
// transform (which strips passwordHash but NOT email, since /api/auth/me
// legitimately needs to return your own email to you). A public endpoint
// gets its own explicit field allow-list via .select() -- defense in
// depth, so a future change to what /me returns can't silently leak
// through here too.
export const getPublicProfile = asyncHandler(async (req, res) => {
  const user = await User.findOne({ username: req.params.username }).select('username bio createdAt');
  if (!user) throw new AppError('User not found.', 404);

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const skip = (page - 1) * limit;

  // Only ever this user's PUBLIC repos -- a profile page is, by
  // definition, visible to people who aren't the account owner, so this
  // follows the same visibility rule as everywhere else in the app rather
  // than a separate one-off check.
  const filter = { owner: user._id, visibility: 'public' };
  const [repositories, total] = await Promise.all([
    Repository.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).select('name description starCount updatedAt'),
    Repository.countDocuments(filter),
  ]);

  res.status(200).json({
    user,
    repositories,
    page,
    limit,
    total,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  });
});
