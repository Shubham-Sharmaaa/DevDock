import mongoose from 'mongoose';

const { Schema } = mongoose;

const LABEL_RE = /^[a-zA-Z0-9-]{1,30}$/;

const issueSchema = new Schema(
  {
    repository: {
      type: Schema.Types.ObjectId,
      ref: 'Repository',
      required: true,
      index: true,
    },
    // GitHub-style sequential number, unique per repository ("#1", "#2",
    // ...). Assigned atomically via Repository.issueCount at creation time
    // -- see issue.controller.js.
    number: {
      type: Number,
      required: true,
      min: 1,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 10000,
      default: '',
    },
    labels: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 10 && arr.every((label) => LABEL_RE.test(label)),
        message: 'Labels must be 1-30 characters (letters, numbers, hyphens), up to 10 per issue',
      },
    },
    status: {
      type: String,
      enum: ['open', 'closed'],
      default: 'open',
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// Powers both "list open issues" (the default view) and "list closed ones."
issueSchema.index({ repository: 1, status: 1 });

// Makes {repository, number} a safe, collision-free way to address a
// single issue, and guarantees the atomic $inc counter never produces a
// duplicate even under a bug -- the DB itself would reject it.
issueSchema.index({ repository: 1, number: 1 }, { unique: true });

const Issue = mongoose.model('Issue', issueSchema);

export default Issue;
