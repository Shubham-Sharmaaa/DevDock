import ActivityEvent from '../models/ActivityEvent.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// A user's own feed -- their own recent actions across every repository
// they've touched, not a global firehose. requireAuth guarantees req.user.
export const listMyActivity = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const skip = (page - 1) * limit;

  const [events, total] = await Promise.all([
    ActivityEvent.find({ user: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ActivityEvent.countDocuments({ user: req.user._id }),
  ]);

  res.status(200).json({ events, page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) });
});
