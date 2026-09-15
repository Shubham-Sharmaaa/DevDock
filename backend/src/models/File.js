import mongoose from 'mongoose';

const { Schema } = mongoose;

const fileSchema = new Schema(
  {
    repository: {
      type: Schema.Types.ObjectId,
      ref: 'Repository',
      required: true,
      index: true,
    },
    // Forward-slash-delimited, e.g. "src/index.js". Validated in the
    // controller (zod) to reject leading/trailing slashes and "." / ".."
    // segments. This app never touches a real filesystem with it -- there's
    // nothing to "traverse" -- but rejecting those patterns avoids
    // confusing, duplicate-looking paths and matches how a real VCS would.
    path: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    // Bounded text only. This is a "file" in the sense of a stored text
    // blob with a revision history, not an arbitrary upload -- nothing in
    // this app ever executes file content.
    currentContent: {
      type: String,
      default: '',
      maxlength: 200000,
    },
    // Bumped on every successful write. This is the field the optimistic
    // concurrency check in file.controller.js compares against.
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  { timestamps: true }
);

// One repository can't have two files at the same path -- also what makes
// {repository, path} a safe, collision-free way to address a file without
// needing a separate id lookup first.
fileSchema.index({ repository: 1, path: 1 }, { unique: true });

const File = mongoose.model('File', fileSchema);

export default File;
