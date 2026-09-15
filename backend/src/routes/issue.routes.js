import { Router } from 'express';
import {
  listIssues,
  createIssue,
  getIssue,
  updateIssueStatus,
  listComments,
  createComment,
} from '../controllers/issue.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { loadIssue, requireIssueWriteAccess } from '../middleware/loadIssue.js';

// mergeParams: see file.routes.js for why this is here even though no
// handler currently reaches for the parent's :ownerUsername/:repoName
// directly (everything goes through req.repository instead).
const router = Router({ mergeParams: true });

router.get('/', listIssues);
router.post('/', requireAuth, createIssue);

router.get('/:issueNumber', loadIssue, getIssue);
router.patch('/:issueNumber', requireAuth, loadIssue, requireIssueWriteAccess, updateIssueStatus);

router.get('/:issueNumber/comments', loadIssue, listComments);
router.post('/:issueNumber/comments', requireAuth, loadIssue, createComment);

export default router;
