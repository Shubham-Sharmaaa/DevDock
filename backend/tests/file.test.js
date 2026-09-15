import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import FileModel from '../src/models/File.js';
import Revision from '../src/models/Revision.js';

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

function filesUrl(owner, repo, suffix = '') {
  return `/api/repos/${owner}/${repo}/files${suffix}`;
}

describe('POST /files -- create', () => {
  it('creates a file at version 1 with an initial revision', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);

    const res = await request(app)
      .post(filesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'README.txt', content: 'hello world' });

    expect(res.status).toBe(201);
    expect(res.body.file.version).toBe(1);
    expect(res.body.file.currentContent).toBe('hello world');

    const revisions = await Revision.find({ file: res.body.file._id });
    expect(revisions).toHaveLength(1);
    expect(revisions[0].version).toBe(1);
  });

  it('rejects a duplicate path in the same repo (409)', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);
    await request(app)
      .post(filesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'a.txt', content: '1' });

    const res = await request(app)
      .post(filesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'a.txt', content: '2' });

    expect(res.status).toBe(409);
  });

  it.each([['/leading-slash.txt'], ['trailing-slash.txt/'], ['../escape.txt'], ['bad path with spaces.txt']])(
    'rejects an invalid path: %s',
    async (badPath) => {
      const owner = await registerUser('alice');
      await createRepo(owner.accessToken);

      const res = await request(app)
        .post(filesUrl('alice', 'my-repo'))
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ path: badPath, content: 'x' });

      expect(res.status).toBe(400);
    }
  );

  it('rejects create with no auth (401)', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);

    const res = await request(app).post(filesUrl('alice', 'my-repo')).send({ path: 'a.txt', content: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('file visibility and write authorization -- inherited from the repository', () => {
  it('a public repo file is readable by an anonymous visitor', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken, { visibility: 'public' });
    await request(app)
      .post(filesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'a.txt', content: 'x' });

    const res = await request(app).get(filesUrl('alice', 'my-repo', '/content')).query({ path: 'a.txt' });
    expect(res.status).toBe(200);
  });

  it('a private repo file returns 404 to a logged-in stranger (existence hidden)', async () => {
    const owner = await registerUser('alice');
    const stranger = await registerUser('bob');
    await createRepo(owner.accessToken, { visibility: 'private' });
    await request(app)
      .post(filesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'a.txt', content: 'x' });

    const res = await request(app)
      .get(filesUrl('alice', 'my-repo', '/content'))
      .query({ path: 'a.txt' })
      .set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('a stranger gets 403 creating a file in someone else\'s PUBLIC repo (exists, no permission)', async () => {
    const owner = await registerUser('alice');
    const stranger = await registerUser('bob');
    await createRepo(owner.accessToken, { visibility: 'public' });

    const res = await request(app)
      .post(filesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ path: 'hijack.txt', content: 'x' });
    expect(res.status).toBe(403);
  });

  it('a stranger gets 404 creating a file in someone else\'s PRIVATE repo (existence hidden)', async () => {
    const owner = await registerUser('alice');
    const stranger = await registerUser('bob');
    await createRepo(owner.accessToken, { visibility: 'private' });

    const res = await request(app)
      .post(filesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ path: 'hijack.txt', content: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('PUT /files -- optimistic concurrency', () => {
  async function setupFile() {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);
    const createRes = await request(app)
      .post(filesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'notes.txt', content: 'v1 content' });
    return { owner, file: createRes.body.file };
  }

  it('a normal sequential update succeeds and bumps the version', async () => {
    const { owner, file } = await setupFile();

    const res = await request(app)
      .put(filesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'notes.txt', content: 'v2 content', version: file.version });

    expect(res.status).toBe(200);
    expect(res.body.file.version).toBe(2);
    expect(res.body.file.currentContent).toBe('v2 content');
  });

  it('the two-tabs scenario: a stale version is rejected with 409 and the server\'s current content', async () => {
    const { owner, file } = await setupFile();

    // "Tab A" and "Tab B" both loaded the file at version 1.
    const tabAVersion = file.version;
    const tabBVersion = file.version;

    // Tab B saves first -- this is the normal, successful path.
    const tabBSave = await request(app)
      .put(filesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'notes.txt', content: 'saved from tab B', version: tabBVersion });
    expect(tabBSave.status).toBe(200);
    expect(tabBSave.body.file.version).toBe(2);

    // Tab A still thinks the file is at version 1 and tries to save its
    // own (now-stale) edits. This must be rejected, not silently applied
    // on top of tab B's save.
    const tabASave = await request(app)
      .put(filesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'notes.txt', content: 'saved from tab A', version: tabAVersion });

    expect(tabASave.status).toBe(409);
    expect(tabASave.body.details.currentVersion).toBe(2);
    expect(tabASave.body.details.currentContent).toBe('saved from tab B');

    // The server's stored content must be tab B's, never overwritten by
    // tab A's rejected, stale write.
    const finalRead = await request(app).get(filesUrl('alice', 'my-repo', '/content')).query({ path: 'notes.txt' });
    expect(finalRead.body.file.currentContent).toBe('saved from tab B');
    expect(finalRead.body.file.version).toBe(2);
  });

  it('rejects an update to a nonexistent path with 404, not 409', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);

    const res = await request(app)
      .put(filesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'never-created.txt', content: 'x', version: 1 });

    expect(res.status).toBe(404);
  });

  it('a stranger cannot update someone else\'s public repo file (403)', async () => {
    const { file } = await setupFile();
    const stranger = await registerUser('bob');

    const res = await request(app)
      .put(filesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ path: 'notes.txt', content: 'hijacked', version: file.version });

    expect(res.status).toBe(403);
  });
});

describe('GET /files/revisions', () => {
  it('records one revision per write, newest first, with the editor attributed', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);
    const created = await request(app)
      .post(filesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'a.txt', content: 'first' });

    await request(app)
      .put(filesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'a.txt', content: 'second', version: created.body.file.version });

    const res = await request(app).get(filesUrl('alice', 'my-repo', '/revisions')).query({ path: 'a.txt' });

    expect(res.status).toBe(200);
    expect(res.body.revisions).toHaveLength(2);
    expect(res.body.revisions[0].version).toBe(2); // newest first
    expect(res.body.revisions[0].content).toBe('second');
    expect(res.body.revisions[0].editedBy.username).toBe('alice');
    expect(res.body.revisions[1].version).toBe(1);
  });
});

describe('DELETE /api/repos/:owner/:repo -- cascade delete', () => {
  it('deleting a repository also deletes its files and their revisions (no orphans)', async () => {
    const owner = await registerUser('alice');
    await createRepo(owner.accessToken);
    const created = await request(app)
      .post(filesUrl('alice', 'my-repo'))
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ path: 'a.txt', content: 'x' });
    const fileId = created.body.file._id;

    const del = await request(app)
      .delete('/api/repos/alice/my-repo')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(del.status).toBe(200);

    const orphanFiles = await FileModel.countDocuments({ _id: fileId });
    const orphanRevisions = await Revision.countDocuments({ file: fileId });
    expect(orphanFiles).toBe(0);
    expect(orphanRevisions).toBe(0);
  });
});
