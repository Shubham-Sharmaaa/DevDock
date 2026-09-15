import { z } from 'zod';
import Repository from '../models/Repository.js';
import Issue from '../models/Issue.js';
import Comment from '../models/Comment.js';
import { AppError } from '../middleware/errorHandler.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { recordActivity } from '../utils/activity.js';

const labelSchema = z
  .string()
  .regex(/^[a-zA-Z0-9-]{1,30}$/, 'Labels may only contain letters, numbers and hyphens (max 30 characters each)');

const createIssueSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be at most 200 characters'),
  description: z.string().trim().max(10000, 'Description must be at most 10,000 characters').optional().default(''),
  labels: z.array(labelSchema).max(10, 'Up to 10 labels per issue').optional().default([]),
});

const updateIssueStatusSchema = z.object({
  status: z.enum(['open', 'closed']),
});

const createCommentSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(5000, 'Comment must be at most 5,000 characters'),
});

function paginationParams(req) {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
}

// req.repository is already resolved + visibility-checked by loadRepository.
export const listIssues = asyncHandler(async (req, res) => {
  const statusFilter = ['open', 'closed'].includes(req.query.status) ? req.query.status : undefined;
  const { page, limit, skip } = paginationParams(req);

  const filter = { repository: req.repository._id, ...(statusFilter ? { status: statusFilter } : {}) };

  const [issues, total] = await Promise.all([
    Issue.find(filter).sort({ number: -1 }).skip(skip).limit(limit).populate('author', 'username'),
    Issue.countDocuments(filter),
  ]);

  res.status(200).json({ issues, page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) });
});

// Any authenticated user who can view this repository may open an issue on
// it -- not owner-only. loadRepository already turned "can't view" into a
// 404 one layer up, so simply being authenticated here is sufficient.
export const createIssue = asyncHandler(async (req, res) => {
  const parsed = createIssueSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Invalid issue data.', 400, parsed.error.flatten().fieldErrors);
  }
  const { title, description, labels } = parsed.data;

  // Atomically reserve the next issue number for this repository. Same
  // idea as the file-version compare-and-swap in M3, just with $inc
  // instead: MongoDB applies the increment to a single document
  // atomically, so two people opening an issue on the same repo at the
  // same instant cannot both walk away with issue #5.
  const repo = await Repository.findOneAndUpdate(
    { _id: req.repository._id },
    { $inc: { issueCount: 1 } },
    { new: true }
  );

  const issue = await Issue.create({
    repository: req.repository._id,
    number: repo.issueCount,
    title,
    description,
    labels,
    author: req.user._id,
  });
  await issue.populate('author', 'username');

  await recordActivity({
    userId: req.user._id,
    type: 'issue_opened',
    repositoryId: req.repository._id,
    repositoryOwnerUsername: req.params.ownerUsername,
    repositoryName: req.repository.name,
    detail: { issueNumber: issue.number, title: issue.title },
  });

  res.status(201).json({ issue });
});

// req.issue is resolved by loadIssue.
export const getIssue = asyncHandler(async (req, res) => {
  await req.issue.populate('author', 'username');
  res.status(200).json({ issue: req.issue });
});

// Gated by requireIssueWriteAccess: repo owner or the issue's own author.
export const updateIssueStatus = asyncHandler(async (req, res) => {
  const parsed = updateIssueStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Invalid status.', 400, parsed.error.flatten().fieldErrors);
  }

  req.issue.status = parsed.data.status;
  await req.issue.save();
  await req.issue.populate('author', 'username');

  await recordActivity({
    userId: req.user._id,
    type: 'issue_status_changed',
    repositoryId: req.repository._id,
    repositoryOwnerUsername: req.params.ownerUsername,
    repositoryName: req.repository.name,
    detail: { issueNumber: req.issue.number, title: req.issue.title, status: parsed.data.status },
  });

  res.status(200).json({ issue: req.issue });
});

export const listComments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginationParams(req);

  const [comments, total] = await Promise.all([
    Comment.find({ issue: req.issue._id }).sort({ createdAt: 1 }).skip(skip).limit(limit).populate('author', 'username'),
    Comment.countDocuments({ issue: req.issue._id }),
  ]);

  res.status(200).json({ comments, page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) });
});

// Any authenticated user who can view the repo may comment -- same rule as
// creating an issue, not owner-only.
export const createComment = asyncHandler(async (req, res) => {
  const parsed = createCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Invalid comment.', 400, parsed.error.flatten().fieldErrors);
  }

  const comment = await Comment.create({
    issue: req.issue._id,
    repository: req.repository._id,
    author: req.user._id,
    body: parsed.data.body,
  });
  await comment.populate('author', 'username');

  res.status(201).json({ comment });
});
