// Fails fast at startup if critical config is missing, or if the two JWT
// secrets are too short to be meaningfully random or identical to each
// other. A short/guessable/shared secret quietly defeats the entire point
// of signing tokens -- better to refuse to start than to run insecurely
// without any indication anything is wrong.
//
// Deliberately NOT called from app.js/createApp() -- only from server.js's
// actual boot path. Tests only ever import createApp() and set their own
// short, fixed test secrets directly on process.env; wiring this into
// createApp() would make every test suite fail this check.
const MIN_SECRET_LENGTH = 32;

export function validateEnv() {
  const required = ['MONGO_URI', 'ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. Copy .env.example to .env and fill them in.`
    );
  }

  if (process.env.ACCESS_TOKEN_SECRET.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `ACCESS_TOKEN_SECRET is too short (${process.env.ACCESS_TOKEN_SECRET.length} chars) -- use at least ${MIN_SECRET_LENGTH} random characters. See .env.example for how to generate one.`
    );
  }
  if (process.env.REFRESH_TOKEN_SECRET.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `REFRESH_TOKEN_SECRET is too short (${process.env.REFRESH_TOKEN_SECRET.length} chars) -- use at least ${MIN_SECRET_LENGTH} random characters. See .env.example for how to generate one.`
    );
  }
  if (process.env.ACCESS_TOKEN_SECRET === process.env.REFRESH_TOKEN_SECRET) {
    throw new Error(
      'ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must be different -- otherwise a leaked access-token secret would also let an attacker forge refresh tokens.'
    );
  }
}
