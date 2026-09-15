import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';

jest.setTimeout(30000);

let mongod;
let app;

beforeAll(async () => {
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
  const collections = await mongoose.connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
});

async function registerUser(username) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username, email: `${username}@example.com`, password: 'correct-horse-battery-staple' });
  return { username, accessToken: res.body.accessToken };
}

async function createRepo(accessToken, overrides = {}) {
  const res = await request(app)
    .post('/api/repos')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'my-repo', visibility: 'public', ...overrides });
  return res.body.repository;
}

describe('GET /api/users/:username -- public profile', () => {
  it('returns username, bio and createdAt for an existing user', async () => {
    const alice = await registerUser('alice');
    await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ bio: 'I build things.' });

    const res = await request(app).get('/api/users/alice');

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('alice');
    expect(res.body.user.bio).toBe('I build things.');
    expect(res.body.user.createdAt).toEqual(expect.any(String));
  });

  it('NEVER includes email or passwordHash, no matter what', async () => {
    await registerUser('alice');

    const res = await request(app).get('/api/users/alice');

    expect(res.body.user.email).toBeUndefined();
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/@example\.com/);
  });

  it('returns 404 for a user that does not exist', async () => {
    const res = await request(app).get('/api/users/nobody-here');
    expect(res.status).toBe(404);
  });

  it("lists the user's PUBLIC repos only -- private ones never appear on their own profile page", async () => {
    const alice = await registerUser('alice');
    await createRepo(alice.accessToken, { name: 'public-one', visibility: 'public' });
    await createRepo(alice.accessToken, { name: 'private-one', visibility: 'private' });

    const res = await request(app).get('/api/users/alice');

    expect(res.body.repositories.map((r) => r.name)).toEqual(['public-one']);
  });

  it('works with no auth at all -- profiles are public', async () => {
    await registerUser('alice');
    const res = await request(app).get('/api/users/alice');
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/auth/me -- editing your own bio', () => {
  it('updates the bio and returns it', async () => {
    const alice = await registerUser('alice');

    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ bio: 'Updated bio' });

    expect(res.status).toBe(200);
    expect(res.body.user.bio).toBe('Updated bio');
  });

  it('rejects with no auth (401) -- this is always self-only, no username param involved', async () => {
    const res = await request(app).patch('/api/auth/me').send({ bio: 'x' });
    expect(res.status).toBe(401);
  });

  it('rejects a bio over 280 characters (400)', async () => {
    const alice = await registerUser('alice');

    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ bio: 'x'.repeat(281) });

    expect(res.status).toBe(400);
  });
});
