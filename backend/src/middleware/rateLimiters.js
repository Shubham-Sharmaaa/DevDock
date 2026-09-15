import rateLimit from 'express-rate-limit';

// Applied only to /register and /login. Deliberately looser than a
// production-grade limiter (which might also track by IP+username and use
// a shared store like Redis across instances) -- this is the honest,
// single-instance version appropriate for a portfolio deployment.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // The store is in-memory and created once per process, so in a test run
  // (many requests, all from the same IP, all against one long-lived app
  // instance) it accumulates across every test in the file -- unrelated
  // later tests start getting 429s instead of the 401/403/404 they're
  // actually testing for. `skip` is re-evaluated per request, so this is
  // safe even though the limiter object itself is constructed at import
  // time, before NODE_ENV=test is set in the test file's beforeAll.
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});

// A much looser ceiling applied to the whole API (mounted in app.js before
// any route), on top of the stricter authLimiter above. This exists purely
// as basic abuse/DoS defense-in-depth -- 300 requests/15min from one IP
// comfortably covers real usage of this app (browsing repos, saving files,
// posting comments) while still meaning a script hammering the API gets
// cut off rather than hitting the database on every single request.
// Same test-mode skip, for the same reason as authLimiter above.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many requests. Please slow down.' },
});
