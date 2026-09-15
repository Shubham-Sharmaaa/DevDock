import Repository from '../models/Repository.js';
import User from '../models/User.js';
import { AppError } from './errorHandler.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Resolves the :ownerUsername/:repoName route params into an actual
// Repository document (req.repository) and enforces visibility *before*
// any route handler runs -- so a private repo's data is never even loaded
// into a response for someone who shouldn't see it.
//
// Must run after either requireAuth or optionalAuth so req.user is
// populated if the caller is logged in. Works fine with either.
//
// A private repo returns 404, not 403, to anyone but its owner. This
// matches GitHub: a 403 would confirm "this repo exists, you're just not
// allowed to see it" -- itself information the owner may not want to leak.
// A 404 makes "doesn't exist" and "exists but is private" indistinguishable
// from the outside.
export const loadRepository = asyncHandler(async (req, res, next) => {
  const { ownerUsername, repoName } = req.params;

  const owner = await User.findOne({ username: ownerUsername });
  if (!owner) throw new AppError('Repository not found.', 404);

  const repository = await Repository.findOne({ owner: owner._id, name: repoName });
  if (!repository) throw new AppError('Repository not found.', 404);

  const isOwner = Boolean(req.user && repository.owner.equals(req.user._id));
  if (repository.visibility === 'private' && !isOwner) {
    throw new AppError('Repository not found.', 404);
  }

  req.repository = repository;
  req.isRepositoryOwner = isOwner;
  next();
});

// Must run after loadRepository. Blocks write operations by anyone but the
// owner. By the time a request reaches here, loadRepository has already
// turned "private + not owner" into a 404 -- so a non-owner arriving here
// is looking at a *public* repo they can see but not write to. That's a
// real 403 (the resource's existence isn't in question, only permission).
export function requireRepositoryOwner(req, res, next) {
  if (!req.isRepositoryOwner) {
    throw new AppError('You do not have permission to modify this repository.', 403);
  }
  next();
}
