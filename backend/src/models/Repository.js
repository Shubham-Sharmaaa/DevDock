import mongoose from 'mongoose';

const { Schema } = mongoose;

const repositorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
      match: [/^[a-zA-Z0-9._-]+$/, 'Repository name can only contain letters, numbers, dots, hyphens and underscores'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: 350,
      default: '',
    },
    // Raw markdown SOURCE, not HTML. It is rendered client-side with
    // react-markdown, which converts markdown to React elements and never
    // executes embedded HTML/script unless the rehype-raw plugin is added --
    // which this app deliberately never does. That (plus this length cap)
    // is the actual safety boundary for user-authored README content; see
    // the root README's "safe handling of user content" section.
    readme: {
      type: String,
      maxlength: 20000,
      default: '',
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    // Denormalized so repo cards/lists can show a star count without a
    // separate count query against the Star collection on every render.
    // Kept in sync by the star/unstar handlers added in a later milestone.
    starCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // The last issue number assigned in this repository (GitHub-style
    // "#1", "#2", ...). Incremented atomically via $inc when an issue is
    // created (see issue.controller.js) -- that's what keeps two people
    // opening an issue at the same instant from ever getting the same
    // number, without needing a separate counters collection.
    issueCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

// One owner can't have two repositories with the same name -- mirrors
// GitHub's "username/repo-name" uniqueness, and is also what makes the
// /repos/:ownerUsername/:repoName URL scheme unambiguous.
repositorySchema.index({ owner: 1, name: 1 }, { unique: true });

const Repository = mongoose.model('Repository', repositorySchema);

export default Repository;
