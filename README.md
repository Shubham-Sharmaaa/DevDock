# DevDock

A GitHub-inspired developer collaboration platform, built from scratch on a MERN stack (MongoDB, Express, React, Node) as an independent portfolio project.

DevDock has its own backend, its own database, and its own model of repositories, files, issues and revisions — it is **not** a wrapper around GitHub's API, and it does **not** reimplement Git's storage engine or push/pull protocol. See [What this is not](#what-this-is-not) below for the exact boundary.

## Screenshots
<img width="1917" height="965" alt="image" src="https://github.com/user-attachments/assets/330f03ec-3ce1-4627-a4ce-b3ef746da141" />
<img width="1917" height="965" alt="image" src="https://github.com/user-attachments/assets/73b6b902-1517-4da6-a0cc-146e65648160" />
<img width="1917" height="956" alt="image" src="https://github.com/user-attachments/assets/aafae333-cced-4c7c-a0ab-6e177cca3b46" />


## Features

- **Accounts** — register, log in, log out, and a public profile (bio + your public repos) other people can view
- **Repositories** — create with a name, description and README; public or private; owner-only writes
- **Files** — a browsable file list per repository, owner-only create/edit, and a full **revision history** for every file
- **Issues** — titled, described, labeled, open/closed, with a threaded comment section
- **Stars** — star/unstar any repository you can see
- **Search** — find repositories by a partial word in their name or description
- **A real activity dashboard** — your own recent actions across your repos, built from actual event records, not a decorative graph

## What this is not

- Not a Git client. There's no commit graph, no branches, no merges, no push/pull. "Revisions" are a simple, append-only history of saved versions of a file — useful and real, but not Git.
- Not connected to GitHub's API. Every byte of data here lives in DevDock's own MongoDB database.
- Does not execute any user-submitted content. Files and READMEs are stored and rendered as text/markdown only.

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React + Vite | Fast dev loop, no build config needed |
| Routing | React Router v6 | Standard SPA routing |
| HTTP | axios | Interceptor-based silent token refresh (see [Design decisions](#design-decisions-worth-knowing)) |
| Markdown | react-markdown | Renders markdown to React elements directly — never `dangerouslySetInnerHTML`, so embedded HTML/scripts in a README render as inert text, not executable code |
| Backend | Node.js + Express | Matches the frontend's language; one runtime to reason about |
| Database | MongoDB + Mongoose | Document model fits repos/files/issues naturally; free Atlas tier is enough for a portfolio deployment |
| Auth | JWT (short-lived access token + rotating httpOnly refresh cookie) | Stateless, no session store; see the auth flow below |
| Validation | zod | Schema validation at every write endpoint |
| Testing | Jest + Supertest + mongodb-memory-server | Real integration tests against a real (in-memory) MongoDB, not mocks |

## Architecture

```
Browser (React + Vite SPA)
   │  HTTPS, JWT access token in Authorization header
   │  httpOnly refresh cookie (scoped to /api/auth)
   ▼
Express API  ──requireAuth/loadRepository middleware──▶  route handlers
   │  Mongoose
   ▼
MongoDB (Atlas in production, in-memory for tests)
```

**Auth flow:** the access token (15 min) lives only in frontend memory — never localStorage — so it isn't reachable by an XSS payload. The refresh token (7 days) is an httpOnly cookie, scoped to `/api/auth` only. Every refresh rotates the token. Logging out doesn't just clear the cookie — it bumps a `tokenVersion` counter on the user, so a stolen refresh token stops working immediately even if it hasn't expired.

**Visibility flow:** a single middleware (`loadRepository`) resolves `:ownerUsername/:repoName` and enforces the public/private rule *before* any route handler runs. Every nested resource — files, issues, comments, stars — is mounted under that same middleware, so the rule is enforced exactly once and inherited everywhere, rather than re-implemented per resource. A private repo returns 404 (not 403) to anyone but its owner, so its existence itself isn't leaked.

For the full request-by-request walkthrough tied to actual source files, see **[docs/WALKTHROUGH.md](docs/WALKTHROUGH.md)**.

## Getting started

### 1. MongoDB Atlas

Create a free account at [mongodb.com/cloud/atlas](https://mongodb.com/cloud/atlas), spin up a free M0 cluster, create a database user, add your IP to Network Access, and copy the connection string.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Fill in `.env`:
- `MONGO_URI` — from step 1
- `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` — two different long random strings:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
  (run twice, once per secret — the server refuses to start if they're missing, too short, or identical)

```bash
npm run dev    # http://localhost:5000
npm test       # runs the full test suite
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev    # http://localhost:5173, proxies /api to the backend
```

Open `http://localhost:5173`, register an account, and start creating repositories.

## Testing

```bash
cd backend && npm test
```

Eight integration test suites, all running against a real (in-memory) MongoDB via `mongodb-memory-server` — not mocks. Covers the full authorization matrix (public/private visibility, owner-vs-stranger writes), the optimistic-concurrency file-conflict case, cascading deletes, and boundary/validation cases for every length-capped field. See [docs/BUILD_LOG.md](docs/BUILD_LOG.md) for a per-suite breakdown of exactly what each one asserts and why.

## Deployment

Full step-by-step instructions (MongoDB Atlas, Render for the backend, Vercel for the frontend, and exactly which account/credential steps need you specifically) are in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Design decisions worth knowing

A few decisions worth understanding if you're reading this codebase or discussing it:

- **Optimistic concurrency on file writes, not a lock.** A file save is a single atomic `findOneAndUpdate` with the client's expected version *in the query filter* — not a separate read-then-compare-then-write. That closes the race window between two concurrent edits; a version field alone (checked in application code) would not. See `backend/src/controllers/file.controller.js`.
- **Atomic counters, not read-then-increment,** used three times in this codebase: the file version (compare-and-swap), the per-repository issue number (`$inc`), and the star count (`$inc`). Same underlying idea — let MongoDB's per-document atomicity do the work — applied to three different problems.
- **404 vs. 403 is a deliberate split, not an accident.** A private repo a stranger can't see returns 404 (hides its existence); a public repo they can see but can't write to returns 403 (permission denied, existence not in question). Tested explicitly for both cases everywhere the split applies.
- **No multi-document transactions.** MongoDB Atlas's free tier does support them (it's a replica set), but testing them needs `mongodb-memory-server` in replica-set mode, which is slower and adds real CI complexity. Instead: the concurrency-critical step is atomic on its own, and the second write in a two-step sequence (e.g. File then Revision) has a manual compensating rollback if it fails. The honest answer to "what would you do differently" is `session.withTransaction()`.
- **Search is a regex substring match, not a MongoDB `$text` index.** `$text` only matches whole words after stemming — it silently fails on a partial query like "weath" for "weather-app". The regex is unindexed (a real trade-off, documented in the controller), appropriate at this app's scale; a dedicated search engine would be the honest next step at real scale.
- **The activity feed is real events, not a synthetic graph.** Every dashboard entry is a genuine `ActivityEvent` document written at the moment a real action succeeded (creating a repo, saving a file, opening an issue, starring something) — never a fabricated or estimated count.

## Known limitations

- No repository renaming (would need to cascade through file paths, activity events' denormalized names, and any bookmarked URLs)
- No nested folder UI for files — a flat, sorted list of full paths, though the data model already supports nesting
- No issue/comment editing or deletion after creation
- No collaborators, pull requests, forks, notifications, or contribution graphs (the activity feed is deliberately not a graph — see above)
- No password reset or email verification flow
- Free-tier hosting caveats: Render's free web service spins down after ~15 minutes idle, so the first request after that takes 30-60 seconds to wake up; MongoDB Atlas's free M0 cluster is a shared, throttled instance — both fine for a portfolio demo, not for production traffic

## Project structure

```
backend/
  src/
    models/        Mongoose schemas
    controllers/    request handlers
    middleware/     auth, visibility, rate limiting, error handling
    routes/         Express routers
    utils/          shared helpers (token signing, activity recording)
  tests/            Jest + Supertest integration suites
frontend/
  src/
    pages/          one file per route
    api/            axios calls per resource
    context/        auth state
    components/      shared UI (route guard)
docs/
  WALKTHROUGH.md    key flows, tied to actual file paths
  DEPLOYMENT.md     step-by-step deployment guide
  BUILD_LOG.md      the milestone-by-milestone build history
  INTERVIEW_PREP.md  practice questions, exercises, resume bullets (personal study material)
```
