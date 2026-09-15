import ActivityEvent from '../models/ActivityEvent.js';

// Records a "this user did X" event for the dashboard's activity feed.
//
// Deliberately swallows its own errors (logged, never thrown): failing to
// record an activity event must never fail the actual action it's
// describing -- creating a repo, saving a file, opening an issue all
// succeed or fail on their own merits. The feed is a view built on top of
// real data, not something anything else depends on.
export async function recordActivity({ userId, type, repositoryId, repositoryOwnerUsername, repositoryName, detail = {} }) {
  try {
    await ActivityEvent.create({
      user: userId,
      type,
      repository: repositoryId,
      repositoryOwnerUsername,
      repositoryName,
      detail,
    });
  } catch (err) {
    console.error('[activity] failed to record event:', err.message);
  }
}
