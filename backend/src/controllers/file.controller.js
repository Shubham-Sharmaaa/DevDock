import { z } from 'zod';
import File from '../models/File.js';
import Revision from '../models/Revision.js';
import { AppError } from '../middleware/errorHandler.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { recordActivity } from '../utils/activity.js';

const PATH_SEGMENT_RE = /^[a-zA-Z0-9._-]+$/;

const pathSchema = z
  .string()
  .trim()
  .min(1, 'Path is required')
  .max(255, 'Path must be at most 255 characters')
  .refine((p) => !p.startsWith('/') && !p.endsWith('/'), {
    message: 'Path must not start or end with a slash',
  })
  .refine(
    (p) => p.split('/').every((segment) => PATH_SEGMENT_RE.test(segment) && segment !== '.' && segment !== '..'),
    {
      message:
        'Each path segment may only contain letters, numbers, dots, hyphens and underscores -- "." and ".." are not allowed',
    }
  );

const contentSchema = z.string().max(200000, 'File content must be at most 200,000 characters');

const createFileSchema = z.object({
  path: pathSchema,
  content: contentSchema.optional().default(''),
});

const updateFileSchema = z.object({
  path: pathSchema,
  content: contentSchema,
  version: z.number().int('Version must be an integer').min(1, 'Version must be a positive integer'),
});

// Query-string path parsing shares the same validation as a body path --
// reused by every GET route that identifies a file via ?path=...
// (A query param rather than a URL path segment: file paths already
// contain "/", which would otherwise collide with Express's own route
// segmentation. Encoding it as ?path= sidesteps that entirely.)
function parsePathQuery(req) {
  const parsed = pathSchema.safeParse(req.query.path);
  if (!parsed.success) {
    throw new AppError('Invalid or missing "path" query parameter.', 400, parsed.error.flatten().formErrors);
  }
  return parsed.data;
}

// req.repository is already resolved, and visibility already checked, by
// the loadRepository middleware mounted ahead of this router.
export const listFiles = asyncHandler(async (req, res) => {
  const files = await File.find({ repository: req.repository._id }).select('path version updatedAt').sort({ path: 1 });

  res.status(200).json({ files });
});

export const getFileContent = asyncHandler(async (req, res) => {
  const path = parsePathQuery(req);

  const file = await File.findOne({ repository: req.repository._id, path });
  if (!file) throw new AppError('File not found.', 404);

  res.status(200).json({ file });
});

export const getFileRevisions = asyncHandler(async (req, res) => {
  const path = parsePathQuery(req);

  const file = await File.findOne({ repository: req.repository._id, path });
  if (!file) throw new AppError('File not found.', 404);

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const skip = (page - 1) * limit;

  const [revisions, total] = await Promise.all([
    Revision.find({ file: file._id }).sort({ version: -1 }).skip(skip).limit(limit).populate('editedBy', 'username'),
    Revision.countDocuments({ file: file._id }),
  ]);

  res.status(200).json({ revisions, page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) });
});

// req.repository + ownership are resolved by loadRepository /
// requireRepositoryOwner ahead of this handler.
export const createFile = asyncHandler(async (req, res) => {
  const parsed = createFileSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Invalid file data.', 400, parsed.error.flatten().fieldErrors);
  }
  const { path, content } = parsed.data;

  // The unique {repository, path} index on File is the actual guarantee
  // against two simultaneous "create" requests both succeeding for the
  // same path -- Mongoose surfaces the loser as a duplicate-key error,
  // which the shared errorHandler already turns into a 409.
  const file = await File.create({
    repository: req.repository._id,
    path,
    currentContent: content,
    version: 1,
  });

  try {
    await Revision.create({
      file: file._id,
      repository: req.repository._id,
      content,
      version: 1,
      editedBy: req.user._id,
    });
  } catch (err) {
    // A File must never exist without its version-1 Revision, or the
    // history is a lie. There's no multi-document transaction wrapping
    // this pair of writes (see the root README for that trade-off) -- so
    // on the rare chance the second write fails right after the first one
    // succeeded, roll the File create back manually rather than leave an
    // orphan.
    await File.deleteOne({ _id: file._id });
    throw err;
  }

  await recordActivity({
    userId: req.user._id,
    type: 'file_created',
    repositoryId: req.repository._id,
    repositoryOwnerUsername: req.params.ownerUsername,
    repositoryName: req.repository.name,
    detail: { path },
  });

  res.status(201).json({ file });
});

// This is the optimistic-concurrency-controlled write, and the reason the
// whole File/Revision split exists. The version check and the content
// update happen in ONE atomic findOneAndUpdate -- the expected version is
// part of the query FILTER, not a separate "read the doc, compare in JS,
// then write" sequence. That distinction is the actual safety guarantee:
// a read-then-write has a race window where two concurrent requests can
// both read version 3, both conclude "I'm allowed to save," and one
// silently overwrites the other. An atomic "update the document WHERE
// version = 3" cannot race that way -- only one request's filter can
// possibly match, because MongoDB applies the update atomically per
// document, so the second one simply fails to match and falls into the
// conflict branch below.
export const updateFile = asyncHandler(async (req, res) => {
  const parsed = updateFileSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Invalid file data.', 400, parsed.error.flatten().fieldErrors);
  }
  const { path, content, version } = parsed.data;

  const previous = await File.findOneAndUpdate(
    { repository: req.repository._id, path, version },
    { $set: { currentContent: content }, $inc: { version: 1 } },
    { new: false } // return the PRE-update doc: we need its content/version both to detect "not found vs conflict" below and as a rollback point if the Revision write fails
  );

  if (!previous) {
    // The filter didn't match on version. Disambiguate why: either there's
    // no file at this path at all (404), or there is one but its version
    // has moved on since the client last loaded it (409 -- the actual
    // conflict case, the whole reason this function exists).
    const existing = await File.findOne({ repository: req.repository._id, path });
    if (!existing) throw new AppError('File not found.', 404);

    throw new AppError(
      'This file has changed since you loaded it. Refresh to see the latest version before saving again.',
      409,
      { currentVersion: existing.version, currentContent: existing.currentContent }
    );
  }

  const newVersion = previous.version + 1;

  try {
    await Revision.create({
      file: previous._id,
      repository: req.repository._id,
      content,
      version: newVersion,
      editedBy: req.user._id,
    });
  } catch (err) {
    // Same reasoning as createFile: roll the File back to its pre-update
    // state rather than leave a version bump with no matching Revision.
    await File.updateOne(
      { _id: previous._id },
      { $set: { currentContent: previous.currentContent, version: previous.version } }
    );
    throw err;
  }

  const file = await File.findById(previous._id);

  await recordActivity({
    userId: req.user._id,
    type: 'file_revised',
    repositoryId: req.repository._id,
    repositoryOwnerUsername: req.params.ownerUsername,
    repositoryName: req.repository.name,
    detail: { path, version: newVersion },
  });

  res.status(200).json({ file });
});
