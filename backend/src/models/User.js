import mongoose from 'mongoose';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 32,
      unique: true,
      match: [/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens and underscores'],
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    passwordHash: {
      type: String,
      required: true,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 280,
      default: '',
    },
    // Bumped on logout / password change to invalidate any refresh tokens
    // that were issued before the bump, even if they haven't expired yet.
    tokenVersion: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// toJSON transform so we never accidentally leak the hash to the client.
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

const User = mongoose.model('User', userSchema);

export default User;
