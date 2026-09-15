import { validateEnv } from '../src/config/validateEnv.js';

// process.env is a real, shared Node.js object -- Jest does NOT reset it
// between test files when run with --runInBand (all files share one
// process). Every test here saves the exact prior value of each key it
// touches and restores it afterward, so this file can't leak state into
// (or inherit stale state from) any other test file, regardless of run
// order.
const KEYS = ['MONGO_URI', 'ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET'];
let saved;

beforeEach(() => {
  saved = {};
  for (const key of KEYS) saved[key] = process.env[key];
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function setValidEnv() {
  process.env.MONGO_URI = 'mongodb://localhost:27017/test';
  process.env.ACCESS_TOKEN_SECRET = 'a'.repeat(32);
  process.env.REFRESH_TOKEN_SECRET = 'b'.repeat(32);
}

describe('validateEnv', () => {
  it('passes when everything is present, long enough, and distinct', () => {
    setValidEnv();
    expect(() => validateEnv()).not.toThrow();
  });

  it('throws naming the missing variable', () => {
    setValidEnv();
    delete process.env.MONGO_URI;
    expect(() => validateEnv()).toThrow(/MONGO_URI/);
  });

  it('throws when ACCESS_TOKEN_SECRET is too short', () => {
    setValidEnv();
    process.env.ACCESS_TOKEN_SECRET = 'short';
    expect(() => validateEnv()).toThrow(/too short/);
  });

  it('throws when REFRESH_TOKEN_SECRET is too short', () => {
    setValidEnv();
    process.env.REFRESH_TOKEN_SECRET = 'short';
    expect(() => validateEnv()).toThrow(/too short/);
  });

  it('throws when the two secrets are identical, even if both are long enough', () => {
    setValidEnv();
    const same = 'c'.repeat(32);
    process.env.ACCESS_TOKEN_SECRET = same;
    process.env.REFRESH_TOKEN_SECRET = same;
    expect(() => validateEnv()).toThrow(/must be different/);
  });
});
