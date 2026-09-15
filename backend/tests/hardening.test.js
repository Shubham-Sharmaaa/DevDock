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

describe('PATCH /api/repos/:owner/:repo -- renaming is silently ignored, not applied or errored', () => {
  it('sending a "name" field in the update body does not change the actual name', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);

    const res = await request(app)
      .patch('/api/repos/alice/my-repo')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'sneaky-new-name', description: 'still allowed to change this' });

    expect(res.status).toBe(200);
    expect(res.body.repository.name).toBe('my-repo'); // unchanged
    expect(res.body.repository.description).toBe('still allowed to change this'); // this DID apply

    // and the repo is still reachable at its original URL, not the attempted new one
    const stillThere = await request(app).get('/api/repos/alice/my-repo');
    expect(stillThere.status).toBe(200);
  });
});

describe('boundary validation -- oversized or malformed content is rejected everywhere it is accepted', () => {
  it('repository description over 350 characters is rejected (400)', async () => {
    const owner = await registerUser('alice');
    const res = await request(app)
      .post('/api/repos')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'x', description: 'a'.repeat(351) });
    expect(res.status).toBe(400);
  });

  it('repository readme over 20,000 characters is rejected (400)', async () => {
    const owner = await registerUser('alice');
    const res = await request(app)
      .post('/api/repos')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'x', readme: 'a'.repeat(20001) });
    expect(res.status).toBe(400);
  });

  it('file content over 200,000 characters is rejected on create (400)', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);
    const res = await request(app)
      .post('/api/repos/alice/my-repo/files')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'big.txt', content: 'a'.repeat(200001) });
    expect(res.status).toBe(400);
  });

  it('file content over 200,000 characters is rejected on update (400)', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);
    const created = await request(app)
      .post('/api/repos/alice/my-repo/files')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'a.txt', content: 'small' });

    const res = await request(app)
      .put('/api/repos/alice/my-repo/files')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'a.txt', content: 'a'.repeat(200001), version: created.body.file.version });
    expect(res.status).toBe(400);
  });

  it('issue title over 200 characters is rejected (400)', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);
    const res = await request(app)
      .post('/api/repos/alice/my-repo/issues')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'x'.repeat(201) });
    expect(res.status).toBe(400);
  });

  it('issue description over 10,000 characters is rejected (400)', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);
    const res = await request(app)
      .post('/api/repos/alice/my-repo/issues')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'x', description: 'a'.repeat(10001) });
    expect(res.status).toBe(400);
  });

  it('more than 10 labels on an issue is rejected (400)', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);
    const res = await request(app)
      .post('/api/repos/alice/my-repo/issues')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'x', labels: Array.from({ length: 11 }, (_, i) => `label-${i}`) });
    expect(res.status).toBe(400);
  });

  it('a label containing invalid characters is rejected (400)', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);
    const res = await request(app)
      .post('/api/repos/alice/my-repo/issues')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'x', labels: ['not a valid label!'] });
    expect(res.status).toBe(400);
  });

  it('an invalid issue status value is rejected (400), not silently accepted', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);
    const issue = await request(app)
      .post('/api/repos/alice/my-repo/issues')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'x' });

    const res = await request(app)
      .patch(`/api/repos/alice/my-repo/issues/${issue.body.issue.number}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ status: 'archived' }); // not a real status
    expect(res.status).toBe(400);
  });

  it('a comment body over 5,000 characters is rejected (400)', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);
    const issue = await request(app)
      .post('/api/repos/alice/my-repo/issues')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'x' });

    const res = await request(app)
      .post(`/api/repos/alice/my-repo/issues/${issue.body.issue.number}/comments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ body: 'a'.repeat(5001) });
    expect(res.status).toBe(400);
  });
});

describe('self-starring is allowed (matches GitHub, not restricted like write access is)', () => {
  it('the owner can star their own repository', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);

    const res = await request(app)
      .post('/api/repos/alice/my-repo/star')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(201);
    expect(res.body.starCount).toBe(1);
  });
});

describe('private-repo visibility sweep: every nested READ route inherits the same 404, not just the ones exercised in earlier milestones', () => {
  async function setupPrivateRepoWithContent() {
    const owner = await registerUser('alice');
    const stranger = await registerUser('bob');
    await createRepo(owner.accessToken, { visibility: 'private' });
    await request(app)
      .post('/api/repos/alice/my-repo/files')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'a.txt', content: 'secret content' });
    const issue = await request(app)
      .post('/api/repos/alice/my-repo/issues')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'secret issue' });
    return { owner, stranger, issueNumber: issue.body.issue.number };
  }

  it('GET /files (list) 404s for a stranger', async () => {
    const { stranger } = await setupPrivateRepoWithContent();
    const res = await request(app)
      .get('/api/repos/alice/my-repo/files')
      .set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /files/revisions 404s for a stranger', async () => {
    const { stranger } = await setupPrivateRepoWithContent();
    const res = await request(app)
      .get('/api/repos/alice/my-repo/files/revisions')
      .query({ path: 'a.txt' })
      .set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /issues (list) 404s for a stranger', async () => {
    const { stranger } = await setupPrivateRepoWithContent();
    const res = await request(app)
      .get('/api/repos/alice/my-repo/issues')
      .set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /issues/:number (detail) 404s for a stranger', async () => {
    const { stranger, issueNumber } = await setupPrivateRepoWithContent();
    const res = await request(app)
      .get(`/api/repos/alice/my-repo/issues/${issueNumber}`)
      .set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /issues/:number/comments 404s for a stranger', async () => {
    const { stranger, issueNumber } = await setupPrivateRepoWithContent();
    const res = await request(app)
      .get(`/api/repos/alice/my-repo/issues/${issueNumber}/comments`)
      .set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('every one of the above succeeds for the owner -- this is a visibility sweep, not a "nothing works" bug', async () => {
    const { owner, issueNumber } = await setupPrivateRepoWithContent();
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const results = await Promise.all([
      request(app).get('/api/repos/alice/my-repo/files').set(auth),
      request(app).get('/api/repos/alice/my-repo/files/revisions').query({ path: 'a.txt' }).set(auth),
      request(app).get('/api/repos/alice/my-repo/issues').set(auth),
      request(app).get(`/api/repos/alice/my-repo/issues/${issueNumber}`).set(auth),
      request(app).get(`/api/repos/alice/my-repo/issues/${issueNumber}/comments`).set(auth),
    ]);

    for (const res of results) {
      expect(res.status).toBe(200);
    }
  });
});
