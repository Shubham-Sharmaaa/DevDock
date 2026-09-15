// AppError marks an error as "operational" -- something we anticipated
// (bad input, wrong password, missing resource) and want to show the user
// a clean message for, as opposed to a programming bug we'd rather log
// with a full stack trace.
export class AppError extends Error {
  constructor(message, statusCode, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

export function notFoundHandler(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Mongoose duplicate key error (e.g. username/email already taken).
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({
      error: `That ${field} is already taken.`,
    });
  }

  // Mongoose validation error.
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: messages.join(', ') });
  }

  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Unexpected error -- log full detail server-side, don't leak it to the client.
  console.error('[unhandled error]', err);
  return res.status(500).json({ error: 'Something went wrong on our end.' });
}
