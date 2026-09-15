import { Router } from 'express';
import {
  createRepository,
  listMyRepositories,
  searchRepositories,
  getRepository,
  updateRepository,
  deleteRepository,
} from '../controllers/repository.controller.js';
import { createStar, deleteStar } from '../controllers/star.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { optionalAuth } from '../middleware/optionalAuth.js';
import { loadRepository, requireRepositoryOwner } from '../middleware/loadRepository.js';
import fileRoutes from './file.routes.js';
import issueRoutes from './issue.routes.js';

const router = Router();

router.post('/', requireAuth, createRepository);
router.get('/', requireAuth, listMyRepositories);

// A single path segment -- can't collide with the two-segment
// /:ownerUsername/:repoName route below no matter the order.
router.get('/search', optionalAuth, searchRepositories);

// optionalAuth (not requireAuth) here: anonymous visitors can view public
// repos. loadRepository decides, per-request, whether this particular repo
// is visible to whoever (or no one) is making the request.
router.get('/:ownerUsername/:repoName', optionalAuth, loadRepository, getRepository);

router.patch('/:ownerUsername/:repoName', requireAuth, loadRepository, requireRepositoryOwner, updateRepository);
router.delete('/:ownerUsername/:repoName', requireAuth, loadRepository, requireRepositoryOwner, deleteRepository);

router.post('/:ownerUsername/:repoName/star', requireAuth, loadRepository, createStar);
router.delete('/:ownerUsername/:repoName/star', requireAuth, loadRepository, deleteStar);

// Files live under a repo and inherit its visibility rule. optionalAuth +
// loadRepository run ONCE here (so anonymous read of a public repo's files
// works, and a private repo already 404s before reaching any file route) --
// every route inside fileRoutes sees req.repository / req.isRepositoryOwner
// already resolved.
router.use('/:ownerUsername/:repoName/files', optionalAuth, loadRepository, fileRoutes);

// Same pattern as files: visibility resolved once here, every issue/comment
// route inherits it automatically.
router.use('/:ownerUsername/:repoName/issues', optionalAuth, loadRepository, issueRoutes);

export default router;
