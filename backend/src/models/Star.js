import mongoose from 'mongoose';

const { Schema } = mongoose;

const starSchema = new Schema(
  {
    repository: {
      type: Schema.Types.ObjectId,
      ref: 'Repository',
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// The actual guarantee against double-starring, even under a race (a
// double-click, or two tabs) -- enforced by MongoDB itself, not just a
// "check, then insert" sequence in application code. See star.controller.js
// for how the duplicate-key error this produces gets turned into a clear
// 409 instead of a generic one.
starSchema.index({ repository: 1, user: 1 }, { unique: true });

const Star = mongoose.model('Star', starSchema);

export default Star;
