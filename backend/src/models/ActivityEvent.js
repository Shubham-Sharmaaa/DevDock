import mongoose from 'mongoose';

const { Schema } = mongoose;

// Every kind of action this app can attribute to a user on their own
// dashboard feed. Deliberately NOT a generic "contribution graph" -- each
// event here corresponds to one real, verifiable action, not a synthetic
// count. See recordActivity() in utils/activity.js for where these get
// written.
const ACTIVITY_EVENT_TYPES = [
  'repo_created',
  'file_created',
  'file_revised',
  'issue_opened',
  'issue_status_changed',
  'repo_starred',
];

const activityEventSchema = new Schema(
  {
    // Whose feed this event appears in -- the user who performed the action.
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ACTIVITY_EVENT_TYPES,
      required: true,
    },
    repository: {
      type: Schema.Types.ObjectId,
      ref: 'Repository',
      required: true,
    },
    // Denormalized so the feed can render every row (with a working link)
    // without a populate/lookup per event on every dashboard load. If the
    // repository is later deleted, its events are cascade-deleted
    // alongside it (see repository.controller.js) rather than left
    // pointing at nothing.
    repositoryOwnerUsername: {
      type: String,
      required: true,
    },
    repositoryName: {
      type: String,
      required: true,
    },
    // Event-specific extra context -- e.g. { path: 'a.txt' } for a file
    // event, or { issueNumber: 3, title: '...' } for an issue event.
    detail: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  // Append-only, like Revision -- an activity event is never edited after
  // the fact, so there's no "updatedAt."
  { timestamps: { createdAt: true, updatedAt: false } }
);

// The dashboard's one and only query against this collection: "this
// user's events, newest first."
activityEventSchema.index({ user: 1, createdAt: -1 });

const ActivityEvent = mongoose.model('ActivityEvent', activityEventSchema);

export default ActivityEvent;
