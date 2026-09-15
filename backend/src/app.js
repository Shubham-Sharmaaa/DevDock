import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes.js';
import repositoryRoutes from './routes/repository.routes.js';
import activityRoutes from './routes/activity.routes.js';
import userRoutes from './routes/user.routes.js';
import { apiLimiter } from './middleware/rateLimiters.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
      credentials: true, // required so the browser will send/receive the refresh cookie
    })
  );
  app.use(express.json({ limit: '256kb' })); // small limit: this API doesn't accept file uploads
  app.use(cookieParser());

  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', time: new Date().toISOString() });
  });

  // Applied to everything below this line, not /api/health above it --
  // uptime monitors and load balancers poll health checks frequently and
  // that traffic carries no risk worth rate-limiting.
  app.use('/api', apiLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/repos', repositoryRoutes);
  app.use('/api/activity', activityRoutes);
  app.use('/api/users', userRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
