import Issue from '../models/Issue.js';
import { AppError } from './errorHandler.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Resolves :issueNumber into req.issue, scoped to req.repository (already
// resolved -- and visibility-checked -- by loadRepository, one layer up).
// Unlike a repository, an issue has no separate "hide vs show" distinction
// of its own: if you're allowed to see the repository at all, you're
// allowed to see all of its issues, so there's nothing further to check
// here beyond "does this number exist."
export const loadIssue = asyncHandler(async (req, res, next) => {
  const issueNumber = Number(req.params.issueNumber);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    throw new AppError('Invalid issue number.', 400);
  }

  const issue = await Issue.findOne({ repository: req.repository._id, number: issueNumber });
  if (!issue) throw new AppError('Issue not found.', 404);

  req.issue = issue;
  next();
});

// Only the repository owner OR the issue's original author may toggle its
// status. Must run after requireAuth + loadIssue.
//
// This is deliberately narrower than "anyone who can comment" -- and worth
// defending directly if asked: GitHub itself allows both the repo
// maintainer and the person who opened the issue to close it, on the
// reasoning that whoever reported something should be able to withdraw
// it, while the maintainer still needs the final say regardless of who
// opened it. A stranger who's neither gets a flat 403 here; there's no
// 404-for-hiding-existence case the way there is for repos, since by this
// point the issue's existence is already visible to them.
export function requireIssueWriteAccess(req, res, next) {
  const isRepoOwner = req.isRepositoryOwner;
  const isIssueAuthor = Boolean(req.user && req.issue.author.equals(req.user._id));

  if (!isRepoOwner && !isIssueAuthor) {
    throw new AppError('Only the repository owner or the issue author can do this.', 403);
  }
  next();
}
