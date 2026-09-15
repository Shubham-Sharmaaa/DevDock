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

describe('POST /star', () => {
  it('stars a repo and increments its starCount', async () => {
    const owner = await registerUser('alice');
    const fan = await registerUser('bob');
    await createRepo(owner.accessToken);

    const res = await request(app)
      .post('/api/repos/alice/my-repo/star')
      .set('Authorization', `Bearer ${fan.accessToken}`);

    expect(res.status).toBe(201);
    expect(res.body.starred).toBe(true);
    expect(res.body.starCount).toBe(1);
  });

  it('rejects a duplicate star from the same user with a clear 409', async () => {
    const owner = await registerUser('alice');
    const fan = await registerUser('bob');
    await createRepo(owner.accessToken);

    await request(app).post('/api/repos/alice/my-repo/star').set('Authorization', `Bearer ${fan.accessToken}`);
    const res = await request(app)
      .post('/api/repos/alice/my-repo/star')
      .set('Authorization', `Bearer ${fan.accessToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already starred/i);
  });

  it('two different users can each star the same repo, and the count reflects both', async () => {
    const owner = await registerUser('alice');
    const fan1 = await registerUser('bob');
    const fan2 = await registerUser('carol');
    await createRepo(owner.accessToken);

    await request(app).post('/api/repos/alice/my-repo/star').set('Authorization', `Bearer ${fan1.accessToken}`);
    const res = await request(app)
      .post('/api/repos/alice/my-repo/star')
      .set('Authorization', `Bearer ${fan2.accessToken}`);

    expect(res.body.starCount).toBe(2);
  });

  it('a stranger cannot star a private repo they cannot see (404)', async () => {
    const owner = await registerUser('alice');
    const stranger = await registerUser('bob');
    await createRepo(owner.accessToken, { visibility: 'private' });

    const res = await request(app)
      .post('/api/repos/alice/my-repo/star')
      .set('Authorization', `Bearer ${stranger.accessToken}`);

    expect(res.status).toBe(404);
  });

  it('rejects starring with no auth (401)', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);

    const res = await request(app).post('/api/repos/alice/my-repo/star');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /star', () => {
  it('unstars and decrements the count', async () => {
    const owner = await registerUser('alice');
    const fan = await registerUser('bob');
    await createRepo(owner.accessToken);
    await request(app).post('/api/repos/alice/my-repo/star').set('Authorization', `Bearer ${fan.accessToken}`);

    const res = await request(app)
      .delete('/api/repos/alice/my-repo/star')
      .set('Authorization', `Bearer ${fan.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.starred).toBe(false);
    expect(res.body.starCount).toBe(0);
  });

  it('unstarring something never starred is a harmless no-op, not an error', async () => {
    const owner = await registerUser('alice');
    const notAFan = await registerUser('bob');
    await createRepo(owner.accessToken);

    const res = await request(app)
      .delete('/api/repos/alice/my-repo/star')
      .set('Authorization', `Bearer ${notAFan.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.starCount).toBe(0);
  });

  it('double-unstarring never drives the count negative', async () => {
    const owner = await registerUser('alice');
    const fan = await registerUser('bob');
    await createRepo(owner.accessToken);
    await request(app).post('/api/repos/alice/my-repo/star').set('Authorization', `Bearer ${fan.accessToken}`);

    await request(app).delete('/api/repos/alice/my-repo/star').set('Authorization', `Bearer ${fan.accessToken}`);
    const res = await request(app)
      .delete('/api/repos/alice/my-repo/star')
      .set('Authorization', `Bearer ${fan.accessToken}`);

    expect(res.body.starCount).toBe(0);
  });
});

describe('GET /api/repos/:owner/:repo -- isStarred', () => {
  it('reflects whether the requester has starred this repo', async () => {
    const owner = await registerUser('alice');
    const fan = await registerUser('bob');
    await createRepo(owner.accessToken);
    await request(app).post('/api/repos/alice/my-repo/star').set('Authorization', `Bearer ${fan.accessToken}`);

    const asFan = await request(app)
      .get('/api/repos/alice/my-repo')
      .set('Authorization', `Bearer ${fan.accessToken}`);
    expect(asFan.body.isStarred).toBe(true);

    const asOwner = await request(app)
      .get('/api/repos/alice/my-repo')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(asOwner.body.isStarred).toBe(false);

    const anon = await request(app).get('/api/repos/alice/my-repo');
    expect(anon.body.isStarred).toBe(false);
  });
});

describe('GET /api/repos/search', () => {
  it('finds a public repo by a word in its name or description', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken, { name: 'weather-app', description: 'Tracks rainfall patterns' });
    await createRepo(owner.accessToken, { name: 'unrelated', description: 'Nothing to do with this' });

    const res = await request(app).get('/api/repos/search').query({ q: 'rainfall' });

    expect(res.status).toBe(200);
    expect(res.body.repositories).toHaveLength(1);
    expect(res.body.repositories[0].name).toBe('weather-app');
  });

  it('matches a PARTIAL word, not just a complete one -- e.g. "weath" matches "weather-app"', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken, { name: 'weather-app', description: 'Tracks rainfall patterns' });

    const res = await request(app).get('/api/repos/search').query({ q: 'weath' });

    expect(res.status).toBe(200);
    expect(res.body.repositories).toHaveLength(1);
    expect(res.body.repositories[0].name).toBe('weather-app');
  });

  it('matches case-insensitively', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken, { name: 'weather-app' });

    const res = await request(app).get('/api/repos/search').query({ q: 'WEATHER' });

    expect(res.body.repositories).toHaveLength(1);
  });

  it('treats regex special characters in the query as literal text, not regex syntax', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken, { name: 'c-plus-plus', description: 'notes on c++ (and friends)' });

    // If these characters weren't escaped, "c++" would be an invalid regex
    // quantifier with nothing to repeat, and the request would 500 instead
    // of just... matching the literal text "c++".
    const res = await request(app).get('/api/repos/search').query({ q: 'c++' });

    expect(res.status).toBe(200);
    expect(res.body.repositories).toHaveLength(1);
    expect(res.body.repositories[0].name).toBe('c-plus-plus');
  });

  it('never returns a private repo to someone who is not its owner', async () => {
    const owner = await registerUser('alice');
    const stranger = await registerUser('bob');
    await createRepo(owner.accessToken, {
      name: 'secret-project',
      description: 'top secret rainfall data',
      visibility: 'private',
    });

    const anonRes = await request(app).get('/api/repos/search').query({ q: 'rainfall' });
    expect(anonRes.body.repositories).toHaveLength(0);

    const strangerRes = await request(app)
      .get('/api/repos/search')
      .query({ q: 'rainfall' })
      .set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(strangerRes.body.repositories).toHaveLength(0);
  });

  it("DOES return the searching user's own private repo", async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken, {
      name: 'secret-project',
      description: 'top secret rainfall data',
      visibility: 'private',
    });

    const res = await request(app)
      .get('/api/repos/search')
      .query({ q: 'rainfall' })
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.body.repositories).toHaveLength(1);
    expect(res.body.repositories[0].name).toBe('secret-project');
  });

  it('requires a non-empty query (400)', async () => {
    const res = await request(app).get('/api/repos/search').query({ q: '' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/activity -- the real activity feed', () => {
  it('records repo_created, file_created, file_revised, issue_opened and repo_starred as real events', async () => {
    const owner = await registerUser('alice');
    const fan = await registerUser('bob');

    await createRepo(owner.accessToken); // repo_created

    const created = await request(app)
      .post('/api/repos/alice/my-repo/files')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'a.txt', content: 'v1' }); // file_created

    await request(app)
      .put('/api/repos/alice/my-repo/files')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'a.txt', content: 'v2', version: created.body.file.version }); // file_revised

    await request(app)
      .post('/api/repos/alice/my-repo/issues')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'an issue' }); // issue_opened

    await request(app).post('/api/repos/alice/my-repo/star').set('Authorization', `Bearer ${fan.accessToken}`); // repo_starred (bob's feed, not alice's)

    const aliceFeed = await request(app).get('/api/activity').set('Authorization', `Bearer ${owner.accessToken}`);
    const types = aliceFeed.body.events.map((e) => e.type);

    expect(types).toEqual(expect.arrayContaining(['repo_created', 'file_created', 'file_revised', 'issue_opened']));
    // bob's star is BOB's activity, not alice's, even though it's on alice's repo
    expect(types).not.toContain('repo_starred');

    const bobFeed = await request(app).get('/api/activity').set('Authorization', `Bearer ${fan.accessToken}`);
    expect(bobFeed.body.events.map((e) => e.type)).toEqual(['repo_starred']);
  });

  it('newest event first', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken, { name: 'first' });
    await createRepo(owner.accessToken, { name: 'second' });

    const res = await request(app).get('/api/activity').set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.body.events[0].repositoryName).toBe('second');
    expect(res.body.events[1].repositoryName).toBe('first');
  });

  it('rejects with no auth (401) -- this is always a private, personal feed', async () => {
    const res = await request(app).get('/api/activity');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/repos/:owner/:repo -- cascade delete extended to Star and ActivityEvent', () => {
  it('deleting a repository removes its stars and activity events too', async () => {
    const owner = await registerUser('alice');
    const fan = await registerUser('bob');
    await createRepo(owner.accessToken);
    await request(app).post('/api/repos/alice/my-repo/star').set('Authorization', `Bearer ${fan.accessToken}`);

    await request(app).delete('/api/repos/alice/my-repo').set('Authorization', `Bearer ${owner.accessToken}`);

    const aliceFeed = await request(app).get('/api/activity').set('Authorization', `Bearer ${owner.accessToken}`);
    expect(aliceFeed.body.events).toHaveLength(0);

    const bobFeed = await request(app).get('/api/activity').set('Authorization', `Bearer ${fan.accessToken}`);
    expect(bobFeed.body.events).toHaveLength(0);
  });
});
