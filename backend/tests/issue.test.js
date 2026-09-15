import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import Issue from '../src/models/Issue.js';
import Comment from '../src/models/Comment.js';

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

function issuesUrl(owner, repo, suffix = '') {
  return `/api/repos/${owner}/${repo}/issues${suffix}`;
}

describe('POST /issues -- create', () => {
  it('creates an issue at #1 for the first one opened in a repo', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);

    const res = await request(app)
      .post(issuesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Something is broken', description: 'Details here', labels: ['bug'] });

    expect(res.status).toBe(201);
    expect(res.body.issue.number).toBe(1);
    expect(res.body.issue.status).toBe('open');
    expect(res.body.issue.author.username).toBe('alice');
  });

  it('assigns strictly increasing, non-colliding numbers across multiple issues', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);

    const numbers = [];
    for (let i = 0; i < 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post(issuesUrl('alice', 'my-repo'))
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ title: `Issue ${i}` });
      numbers.push(res.body.issue.number);
    }

    expect(numbers).toEqual([1, 2, 3, 4]);
  });

  it('lets a non-owner open an issue on a PUBLIC repo (not owner-only)', async () => {
    const owner = await registerUser('alice');
    const stranger = await registerUser('bob');
    await createRepo(owner.accessToken, { visibility: 'public' });

    const res = await request(app)
      .post(issuesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ title: 'Found a bug' });

    expect(res.status).toBe(201);
    expect(res.body.issue.author.username).toBe('bob');
  });

  it('a stranger gets 404 opening an issue on a PRIVATE repo (existence hidden)', async () => {
    const owner = await registerUser('alice');
    const stranger = await registerUser('bob');
    await createRepo(owner.accessToken, { visibility: 'private' });

    const res = await request(app)
      .post(issuesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ title: 'Cannot even see this repo' });

    expect(res.status).toBe(404);
  });

  it('rejects an issue with no title (400)', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);

    const res = await request(app)
      .post(issuesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: '' });

    expect(res.status).toBe(400);
  });

  it('rejects create with no auth (401)', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);

    const res = await request(app).post(issuesUrl('alice', 'my-repo')).send({ title: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('GET /issues -- list and filter', () => {
  it('defaults to returning issues, and filters by status', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);
    const open1 = await request(app)
      .post(issuesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'stays open' });
    const toClose = await request(app)
      .post(issuesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'gets closed' });

    await request(app)
      .patch(issuesUrl('alice', 'my-repo', `/${toClose.body.issue.number}`))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ status: 'closed' });

    const openList = await request(app).get(issuesUrl('alice', 'my-repo')).query({ status: 'open' });
    expect(openList.body.issues.map((i) => i.number)).toEqual([open1.body.issue.number]);

    const closedList = await request(app).get(issuesUrl('alice', 'my-repo')).query({ status: 'closed' });
    expect(closedList.body.issues.map((i) => i.number)).toEqual([toClose.body.issue.number]);
  });
});

describe('PATCH /issues/:number -- status changes', () => {
  it('the repository owner can close an issue opened by someone else', async () => {
    const owner = await registerUser('alice');
    const stranger = await registerUser('bob');
    await createRepo(owner.accessToken);
    const issue = await request(app)
      .post(issuesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ title: 'reported by bob' });

    const res = await request(app)
      .patch(issuesUrl('alice', 'my-repo', `/${issue.body.issue.number}`))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ status: 'closed' });

    expect(res.status).toBe(200);
    expect(res.body.issue.status).toBe('closed');
  });

  it('the issue author can close their own issue even though they don\'t own the repo', async () => {
    const owner = await registerUser('alice');
    const author = await registerUser('bob');
    await createRepo(owner.accessToken);
    const issue = await request(app)
      .post(issuesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ title: 'my own issue' });

    const res = await request(app)
      .patch(issuesUrl('alice', 'my-repo', `/${issue.body.issue.number}`))
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ status: 'closed' });

    expect(res.status).toBe(200);
    expect(res.body.issue.status).toBe('closed');
  });

  it('a third party who is neither the owner nor the author gets 403', async () => {
    const owner = await registerUser('alice');
    const author = await registerUser('bob');
    const outsider = await registerUser('carol');
    await createRepo(owner.accessToken);
    const issue = await request(app)
      .post(issuesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({ title: 'bob\'s issue' });

    const res = await request(app)
      .patch(issuesUrl('alice', 'my-repo', `/${issue.body.issue.number}`))
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .send({ status: 'closed' });

    expect(res.status).toBe(403);
  });

  it('rejects a status change with no auth (401)', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);
    const issue = await request(app)
      .post(issuesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'x' });

    const res = await request(app)
      .patch(issuesUrl('alice', 'my-repo', `/${issue.body.issue.number}`))
      .send({ status: 'closed' });

    expect(res.status).toBe(401);
  });

  it('returns 404 for a nonexistent issue number', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);

    const res = await request(app)
      .patch(issuesUrl('alice', 'my-repo', '/999'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ status: 'closed' });

    expect(res.status).toBe(404);
  });
});

describe('comments', () => {
  it('any authenticated viewer can comment, in order, and the author is attributed', async () => {
    const owner = await registerUser('alice');
    const commenter = await registerUser('bob');
    await createRepo(owner.accessToken);
    const issue = await request(app)
      .post(issuesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'discuss this' });
    const issueNumber = issue.body.issue.number;

    await request(app)
      .post(issuesUrl('alice', 'my-repo', `/${issueNumber}/comments`))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ body: 'first comment' });
    await request(app)
      .post(issuesUrl('alice', 'my-repo', `/${issueNumber}/comments`))
      .set('Authorization', `Bearer ${commenter.accessToken}`)
      .send({ body: 'second comment' });

    const res = await request(app).get(issuesUrl('alice', 'my-repo', `/${issueNumber}/comments`));

    expect(res.status).toBe(200);
    expect(res.body.comments).toHaveLength(2);
    expect(res.body.comments[0].body).toBe('first comment');
    expect(res.body.comments[0].author.username).toBe('alice');
    expect(res.body.comments[1].author.username).toBe('bob');
  });

  it('a stranger cannot comment on a private repo\'s issue (404, existence hidden)', async () => {
    const owner = await registerUser('alice');
    const stranger = await registerUser('bob');
    await createRepo(owner.accessToken, { visibility: 'private' });
    const issue = await request(app)
      .post(issuesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'private issue' });

    const res = await request(app)
      .post(issuesUrl('alice', 'my-repo', `/${issue.body.issue.number}/comments`))
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ body: 'trying to comment' });

    expect(res.status).toBe(404);
  });

  it('rejects an empty comment (400)', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);
    const issue = await request(app)
      .post(issuesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'x' });

    const res = await request(app)
      .post(issuesUrl('alice', 'my-repo', `/${issue.body.issue.number}/comments`))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ body: '   ' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/repos/:owner/:repo -- cascade delete', () => {
  it('deleting a repository also deletes its issues and comments (no orphans)', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);
    const issue = await request(app)
      .post(issuesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'will be cascaded' });
    const issueId = issue.body.issue._id;
    await request(app)
      .post(issuesUrl('alice', 'my-repo', `/${issue.body.issue.number}/comments`))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ body: 'also cascaded' });

    const del = await request(app)
      .delete('/api/repos/alice/my-repo')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(del.status).toBe(200);

    expect(await Issue.countDocuments({ _id: issueId })).toBe(0);
    expect(await Comment.countDocuments({ issue: issueId })).toBe(0);
  });
});
