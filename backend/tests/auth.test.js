import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';

jest.setTimeout(30000);

let mongod;
let app;

beforeAll(async () => {
  // Secrets must exist before any route touches jsonwebtoken.
  process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
  process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';
  process.env.NODE_ENV = 'test';

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  // Keep each test isolated: wipe all collections between tests.
  const collections = await mongoose.connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
});

// Pulls the refresh cookie out of a Set-Cookie response header so it can be
// replayed on a subsequent request, the way a real browser would.
function extractRefreshCookie(res) {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return null;
  const cookieLine = setCookie.find((c) => c.startsWith('devdock_refresh='));
  return cookieLine ? cookieLine.split(';')[0] : null;
}

const validUser = {
  username: 'octocat',
  email: 'octocat@example.com',
  password: 'correct-horse-battery-staple',
};

describe('POST /api/auth/register', () => {
  it('creates a user and returns an access token + refresh cookie', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.username).toBe('octocat');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(extractRefreshCookie(res)).toMatch(/^devdock_refresh=/);
  });

  it('rejects a duplicate username with 409', async () => {
    await request(app).post('/api/auth/register').send(validUser);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'different@example.com' });

    expect(res.status).toBe(409);
  });

  it('rejects a weak password with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, password: 'short' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(validUser);
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'octocat', password: validUser.password });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('rejects an incorrect password with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'octocat', password: 'wrong-password' });

    expect(res.status).toBe(401);
  });

  it('rejects a nonexistent identifier with 401 (not 404 -- avoid user enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'nobody-here', password: 'whatever12345' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed/garbage token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid access token', async () => {
    const registerRes = await request(app).post('/api/auth/register').send(validUser);
    const { accessToken } = registerRes.body;

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('octocat');
  });
});

describe('POST /api/auth/refresh and logout', () => {
  it('issues a new access token from a valid refresh cookie', async () => {
    const registerRes = await request(app).post('/api/auth/register').send(validUser);
    const refreshCookie = extractRefreshCookie(registerRes);

    const res = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('rejects refresh with no cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('invalidates the refresh token after logout, even though it has not expired', async () => {
    const registerRes = await request(app).post('/api/auth/register').send(validUser);
    const refreshCookie = extractRefreshCookie(registerRes);

    const logoutRes = await request(app).post('/api/auth/logout').set('Cookie', refreshCookie);
    expect(logoutRes.status).toBe(200);

    // Replay the SAME (now-stale) refresh cookie -- this is the whole point
    // of the tokenVersion check, since the JWT itself is still
    // cryptographically valid and unexpired.
    const reuseRes = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie);
    expect(reuseRes.status).toBe(401);
  });
});
