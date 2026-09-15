import { z } from 'zod';
import Repository from '../models/Repository.js';
import File from '../models/File.js';
import Revision from '../models/Revision.js';
import Issue from '../models/Issue.js';
import Comment from '../models/Comment.js';
import Star from '../models/Star.js';
import ActivityEvent from '../models/ActivityEvent.js';
import { AppError } from '../middleware/errorHandler.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { recordActivity } from '../utils/activity.js';

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Repository name is required')
  .max(100, 'Repository name must be at most 100 characters')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Repository name can only contain letters, numbers, dots, hyphens and underscores');

const createRepositorySchema = z.object({
  name: nameSchema,
  description: z.string().trim().max(350, 'Description must be at most 350 characters').optional().default(''),
  readme: z.string().max(20000, 'README must be at most 20,000 characters').optional().default(''),
  visibility: z.enum(['public', 'private']).optional().default('public'),
});

const updateRepositorySchema = z
  .object({
    description: z.string().trim().max(350, 'Description must be at most 350 characters').optional(),
    readme: z.string().max(20000, 'README must be at most 20,000 characters').optional(),
    visibility: z.enum(['public', 'private']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update.' });

export const createRepository = asyncHandler(async (req, res) => {
  const parsed = createRepositorySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Invalid repository data.', 400, parsed.error.flatten().fieldErrors);
  }

  const repository = await Repository.create({ ...parsed.data, owner: req.user._id });
  await repository.populate('owner', 'username');

  await recordActivity({
    userId: req.user._id,
    type: 'repo_created',
    repositoryId: repository._id,
    repositoryOwnerUsername: req.user.username,
    repositoryName: repository.name,
  });

  res.status(201).json({ repository });
});

// "My repositories" -- the dashboard list. Deliberately separate from any
// future "browse a user's public repos" endpoint, since the rules differ:
// this one always includes the caller's private repos too.
export const listMyRepositories = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const skip = (page - 1) * limit;

  const [repositories, total] = await Promise.all([
    Repository.find({ owner: req.user._id })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('owner', 'username'),
    Repository.countDocuments({ owner: req.user._id }),
  ]);

  res.status(200).json({
    repositories,
    page,
    limit,
    total,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  });
});

// A single path segment ("search"), so this can never collide with the
// two-segment /:ownerUsername/:repoName route below regardless of
// registration order.
//
// Visibility follows the SAME rule as viewing a repo directly: a public
// repo is findable by anyone, a private one only shows up in the search
// results of its own owner. This is deliberately NOT "search only covers
// public repos" -- that would be simpler, but it would also mean you
// couldn't search your own private work, which isn't how GitHub's search
// (or the rest of this app's visibility model) behaves.
export const searchRepositories = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    throw new AppError('Query parameter "q" is required.', 400);
  }

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const skip = (page - 1) * limit;

  const visibilityFilter = req.user
    ? { $or: [{ visibility: 'public' }, { visibility: 'private', owner: req.user._id }] }
    : { visibility: 'public' };

  // Case-insensitive SUBSTRING match on name/description -- deliberately
  // not MongoDB's $text operator, which only matches whole words (after
  // stemming): typing "weath" would never match "weather-app" with $text,
  // which was exactly the reported bug. A regex here is an unindexed
  // collection scan, so it loses the free relevance ranking and index
  // performance $text would have given -- a reasonable trade-off at this
  // app's scale (hundreds/thousands of repos, not millions). If this ever
  // needed to scale further, the honest next step is a dedicated search
  // engine (Atlas Search, Elasticsearch), not a bigger regex.
  const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escapedQuery, 'i');
  const matchFilter = { $or: [{ name: pattern }, { description: pattern }] };

  // matchFilter and visibilityFilter each use their own top-level "$or" --
  // spreading both into one object would let the second silently overwrite
  // the first (object keys are unique, so only one "$or" could survive).
  // $and keeps both constraints in force together.
  const filter = { $and: [matchFilter, visibilityFilter] };

  const [repositories, total] = await Promise.all([
    Repository.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).populate('owner', 'username'),
    Repository.countDocuments(filter),
  ]);

  res.status(200).json({
    repositories,
    page,
    limit,
    total,
    totalPages: Math.max(Math.ceil(total / limit), 1),
    query: q,
  });
});

// req.repository is attached by the loadRepository middleware, which has
// already enforced the visibility rule -- by the time we're here, the
// requester is allowed to see this repo.
export const getRepository = asyncHandler(async (req, res) => {
  await req.repository.populate('owner', 'username');
  const isStarred = req.user
    ? Boolean(await Star.exists({ repository: req.repository._id, user: req.user._id }))
    : false;
  res.status(200).json({ repository: req.repository, isOwner: req.isRepositoryOwner, isStarred });
});

// req.repository + owner check are handled by loadRepository +
// requireRepositoryOwner. Renaming is deliberately not supported in v1 --
// it would need to cascade through file paths and any links pointing at
// the old owner/name URL, which is real complexity better tackled as its
// own follow-up rather than folded into this milestone.
export const updateRepository = asyncHandler(async (req, res) => {
  const parsed = updateRepositorySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Invalid update data.', 400, parsed.error.flatten().fieldErrors);
  }

  Object.assign(req.repository, parsed.data);
  await req.repository.save();
  await req.repository.populate('owner', 'username');

  res.status(200).json({ repository: req.repository });
});

export const deleteRepository = asyncHandler(async (req, res) => {
  const repositoryId = req.repository._id;

  // Cascade: any document pointing at a repository that no longer exists
  // is an orphan, not just untidy data -- delete everything that
  // references this repository alongside the repository itself. This is
  // now every model in the app that has a `repository` field.
  await File.deleteMany({ repository: repositoryId });
  await Revision.deleteMany({ repository: repositoryId });
  await Issue.deleteMany({ repository: repositoryId });
  await Comment.deleteMany({ repository: repositoryId });
  await Star.deleteMany({ repository: repositoryId });
  await ActivityEvent.deleteMany({ repository: repositoryId });
  await req.repository.deleteOne();

  res.status(200).json({ message: 'Repository deleted.' });
});
