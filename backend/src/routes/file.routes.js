import { Router } from 'express';
import { listFiles, getFileContent, getFileRevisions, createFile, updateFile } from '../controllers/file.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRepositoryOwner } from '../middleware/loadRepository.js';

// mergeParams so req.params from the parent router (ownerUsername, repoName)
// would still be visible here if a handler needed them directly -- none
// currently do, since everything goes through req.repository, but this
// keeps the router correct if that changes.
const router = Router({ mergeParams: true });

router.get('/', listFiles);
router.get('/content', getFileContent);
router.get('/revisions', getFileRevisions);

// requireAuth here is IN ADDITION TO the optionalAuth already run by the
// parent router (repository.routes.js) before req.repository was resolved.
// Without it, a fully anonymous write attempt would fall straight through
// to requireRepositoryOwner and get a 403 ("not the owner") -- technically
// not wrong, but the correct status for "you're not logged in at all" is
// 401. optionalAuth already set req.user for anyone WITH a valid token, so
// this second check only changes behavior for the anonymous/invalid-token
// case, converting it to the right status code.
router.post('/', requireAuth, requireRepositoryOwner, createFile);
router.put('/', requireAuth, requireRepositoryOwner, updateFile);

export default router;
