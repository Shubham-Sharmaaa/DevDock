import Repository from '../models/Repository.js';
import Star from '../models/Star.js';
import { AppError } from '../middleware/errorHandler.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { recordActivity } from '../utils/activity.js';

// req.repository / req.user are resolved by loadRepository + requireAuth
// ahead of this handler.
export const createStar = asyncHandler(async (req, res) => {
  try {
    await Star.create({ repository: req.repository._id, user: req.user._id });
  } catch (err) {
    if (err.code === 11000) {
      // The unique {repository, user} index on Star is what actually
      // prevents a double star under a race (a double-click, two tabs) --
      // this just turns that into a clear, specific 409 instead of the
      // generic "duplicate field" message the shared error handler would
      // otherwise produce.
      throw new AppError('You already starred this repository.', 409);
    }
    throw err;
  }

  const repo = await Repository.findOneAndUpdate(
    { _id: req.repository._id },
    { $inc: { starCount: 1 } },
    { new: true }
  );

  await recordActivity({
    userId: req.user._id,
    type: 'repo_starred',
    repositoryId: repo._id,
    repositoryOwnerUsername: req.params.ownerUsername,
    repositoryName: repo.name,
  });

  res.status(201).json({ starCount: repo.starCount, starred: true });
});

// Unstarring something you never starred is treated as a no-op success,
// not an error -- idempotent, matching how a toggle button behaves from
// the user's perspective, and avoiding a spurious 404 for a double-click.
export const deleteStar = asyncHandler(async (req, res) => {
  const deleted = await Star.findOneAndDelete({ repository: req.repository._id, user: req.user._id });

  let starCount = req.repository.starCount;
  if (deleted) {
    const repo = await Repository.findOneAndUpdate(
      { _id: req.repository._id },
      { $inc: { starCount: -1 } },
      { new: true }
    );
    starCount = repo.starCount;
  }

  res.status(200).json({ starCount, starred: false });
});
