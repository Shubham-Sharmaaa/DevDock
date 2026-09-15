import { Router } from 'express';
import { register, login, refresh, logout, me, updateProfile } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiters.js';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.patch('/me', requireAuth, updateProfile);

export default router;
