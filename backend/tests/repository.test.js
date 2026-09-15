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

// Registers a fresh user and returns their access token + username, so
// each test can build its own two-user (owner vs. stranger) scenario.
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
    .send({ name: 'my-repo', description: 'A test repo', ...overrides });
  return res;
}

describe('POST /api/repos', () => {
  it('creates a repository owned by the authenticated user', async () => {
    const owner = await registerUser('alice');

    const res = await createRepo(owner.accessToken, { visibility: 'public' });

    expect(res.status).toBe(201);
    expect(res.body.repository.name).toBe('my-repo');
    expect(res.body.repository.owner.username).toBe('alice');
    expect(res.body.repository.visibility).toBe('public');
  });

  it('rejects a second repo with the same name from the same owner (409)', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);

    const res = await createRepo(owner.accessToken);
    expect(res.status).toBe(409);
  });

  it('allows two different owners to use the same repo name', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');

    const aliceRes = await createRepo(alice.accessToken);
    const bobRes = await createRepo(bob.accessToken);

    expect(aliceRes.status).toBe(201);
    expect(bobRes.status).toBe(201);
  });

  it('rejects requests with no auth', async () => {
    const res = await request(app).post('/api/repos').send({ name: 'my-repo' });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid repository name', async () => {
    const owner = await registerUser('alice');
    const res = await createRepo(owner.accessToken, { name: 'has spaces/slashes' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/repos/:ownerUsername/:repoName -- visibility rules', () => {
  it('a public repo is visible to an anonymous visitor', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken, { visibility: 'public' });

    const res = await request(app).get('/api/repos/alice/my-repo');
    expect(res.status).toBe(200);
    expect(res.body.repository.name).toBe('my-repo');
    expect(res.body.isOwner).toBe(false);
  });

  it('a public repo is visible to a logged-in stranger, with isOwner=false', async () => {
    const owner = await registerUser('alice');
    const stranger = await registerUser('bob');
    await createRepo(owner.accessToken, { visibility: 'public' });

    const res = await request(app)
      .get('/api/repos/alice/my-repo')
      .set('Authorization', `Bearer ${stranger.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.isOwner).toBe(false);
  });

  it('a private repo returns 404 to an anonymous visitor', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken, { visibility: 'private' });

    const res = await request(app).get('/api/repos/alice/my-repo');
    expect(res.status).toBe(404);
  });

  it('a private repo returns 404 to a logged-in stranger (not 403 -- existence is hidden)', async () => {
    const owner = await registerUser('alice');
    const stranger = await registerUser('bob');
    await createRepo(owner.accessToken, { visibility: 'private' });

    const res = await request(app)
      .get('/api/repos/alice/my-repo')
      .set('Authorization', `Bearer ${stranger.accessToken}`);

    expect(res.status).toBe(404);
  });

  it('a private repo IS visible to its owner, with isOwner=true', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken, { visibility: 'private' });

    const res = await request(app)
      .get('/api/repos/alice/my-repo')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.isOwner).toBe(true);
  });

  it('returns 404 for a nonexistent owner or repo name', async () => {
    const res = await request(app).get('/api/repos/nobody/nothing');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/repos/:ownerUsername/:repoName -- write authorization', () => {
  it('the owner can update description, readme and visibility', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken, { visibility: 'public' });

    const res = await request(app)
      .patch('/api/repos/alice/my-repo')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ description: 'Updated description', visibility: 'private' });

    expect(res.status).toBe(200);
    expect(res.body.repository.description).toBe('Updated description');
    expect(res.body.repository.visibility).toBe('private');
  });

  it('a logged-in stranger gets 403 on a PUBLIC repo (exists, but no permission)', async () => {
    const owner = await registerUser('alice');
    const stranger = await registerUser('bob');
    await createRepo(owner.accessToken, { visibility: 'public' });

    const res = await request(app)
      .patch('/api/repos/alice/my-repo')
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ description: 'Hijacked' });

    expect(res.status).toBe(403);
  });

  it('a logged-in stranger gets 404 on a PRIVATE repo (existence hidden, not just permission denied)', async () => {
    const owner = await registerUser('alice');
    const stranger = await registerUser('bob');
    await createRepo(owner.accessToken, { visibility: 'private' });

    const res = await request(app)
      .patch('/api/repos/alice/my-repo')
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ description: 'Hijacked' });

    expect(res.status).toBe(404);
  });

  it('rejects an update with no valid fields', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);

    const res = await request(app)
      .patch('/api/repos/alice/my-repo')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/repos/:ownerUsername/:repoName', () => {
  it('the owner can delete their repository', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);

    const del = await request(app)
      .delete('/api/repos/alice/my-repo')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(del.status).toBe(200);

    const getAfter = await request(app).get('/api/repos/alice/my-repo');
    expect(getAfter.status).toBe(404);
  });

  it('a stranger cannot delete someone else\'s public repo (403)', async () => {
    const owner = await registerUser('alice');
    const stranger = await registerUser('bob');
    await createRepo(owner.accessToken, { visibility: 'public' });

    const res = await request(app)
      .delete('/api/repos/alice/my-repo')
      .set('Authorization', `Bearer ${stranger.accessToken}`);

    expect(res.status).toBe(403);

    // and it must still exist afterwards
    const stillThere = await request(app).get('/api/repos/alice/my-repo');
    expect(stillThere.status).toBe(200);
  });
});

describe('GET /api/repos -- "my repositories"', () => {
  it('only returns the authenticated user\'s own repos, including their private ones', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');

    await createRepo(alice.accessToken, { name: 'alice-public', visibility: 'public' });
    await createRepo(alice.accessToken, { name: 'alice-private', visibility: 'private' });
    await createRepo(bob.accessToken, { name: 'bobs-repo', visibility: 'public' });

    const res = await request(app).get('/api/repos').set('Authorization', `Bearer ${alice.accessToken}`);

    expect(res.status).toBe(200);
    const names = res.body.repositories.map((r) => r.name).sort();
    expect(names).toEqual(['alice-private', 'alice-public']);
  });
});
