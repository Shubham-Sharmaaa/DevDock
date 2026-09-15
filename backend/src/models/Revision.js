import mongoose from 'mongoose';

const { Schema } = mongoose;

const revisionSchema = new Schema(
  {
    file: {
      type: Schema.Types.ObjectId,
      ref: 'File',
      required: true,
      index: true,
    },
    // Denormalized copy of the file's repository. Lets deleteRepository
    // cascade-clean every revision for a repo with one query (`{repository}`)
    // instead of first loading every File just to collect their ids.
    repository: {
      type: Schema.Types.ObjectId,
      ref: 'Repository',
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 200000,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
    },
    editedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  // Revisions are append-only history -- there's no "updatedAt" because a
  // revision, once written, is never modified.
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Revision history for one file, newest first -- the access pattern for
// both "show me the history" and "what's the latest revision."
revisionSchema.index({ file: 1, version: -1 });

const Revision = mongoose.model('Revision', revisionSchema);

export default Revision;
