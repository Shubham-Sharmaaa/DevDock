import mongoose from 'mongoose';

const { Schema } = mongoose;

const commentSchema = new Schema(
  {
    issue: {
      type: Schema.Types.ObjectId,
      ref: 'Issue',
      required: true,
      index: true,
    },
    // Denormalized, same reasoning as Revision.repository: lets a
    // repository delete cascade-clean every comment across all of its
    // issues with one query, instead of first loading every Issue just to
    // collect their ids.
    repository: {
      type: Schema.Types.ObjectId,
      ref: 'Repository',
      required: true,
      index: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 5000,
    },
  },
  { timestamps: true }
);

// A comment thread for one issue, oldest first -- the natural reading order.
commentSchema.index({ issue: 1, createdAt: 1 });

const Comment = mongoose.model('Comment', commentSchema);

export default Comment;
