import { Router } from 'express';
import { listMyActivity } from '../controllers/activity.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, listMyActivity);

export default router;
